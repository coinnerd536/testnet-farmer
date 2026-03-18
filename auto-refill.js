#!/usr/bin/env node
/**
 * Auto-refill — monitors L2 balances and bridges from Sepolia when low
 * Run via cron or manually: node auto-refill.js
 *
 * Checks all L2 chains, bridges ETH from Sepolia if balance < threshold
 * Keeps L2s funded for continuous farming
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));

// Minimum balance before triggering a refill (in ETH)
const MIN_BALANCE = '0.002';
// Amount to bridge per refill
const REFILL_AMOUNT = '0.005';
// Minimum Sepolia balance to keep (don't drain L1)
const MIN_L1_RESERVE = '0.5';

const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com';

// Bridge configs (same as bridge-to-l2.js)
const BRIDGES = {
  'Base Sepolia': {
    rpc: 'https://sepolia.base.org',
    type: 'opstack',
    l1StandardBridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120',
  },
  'Optimism Sepolia': {
    rpc: 'https://sepolia.optimism.io',
    type: 'opstack',
    l1StandardBridge: '0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1',
  },
  'Arbitrum Sepolia': {
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    type: 'arbitrum',
    inbox: '0xaAe29B0366299461418F5324a79Afc425BE5ae21',
  },
  'Scroll Sepolia': {
    rpc: 'https://sepolia-rpc.scroll.io',
    type: 'scroll',
    gatewayRouter: '0x13FBE0D0e5552b8c9c4AE9e2435F38f37355998a',
  },
  'Linea Sepolia': {
    rpc: 'https://rpc.sepolia.linea.build',
    type: 'linea',
    messageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
  },
};

const BRIDGE_ABI = ['function depositETH(uint32 _minGasLimit, bytes _extraData) payable'];
const INBOX_ABI = ['function depositEth() payable returns (uint256)'];
const SCROLL_ABI = ['function depositETH(uint256 _amount, uint256 _gasLimit) payable'];
const LINEA_ABI = ['function sendMessage(address _to, uint256 _fee, bytes _calldata) payable'];

async function getBalance(rpc, address) {
  const provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
  return Promise.race([
    provider.getBalance(address),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000))
  ]);
}

async function bridge(name, config, signer, value) {
  switch (config.type) {
    case 'opstack': {
      const bridge = new ethers.Contract(config.l1StandardBridge, BRIDGE_ABI, signer);
      return bridge.depositETH(200000, '0x', { value });
    }
    case 'arbitrum': {
      const inbox = new ethers.Contract(config.inbox, INBOX_ABI, signer);
      return inbox.depositEth({ value });
    }
    case 'scroll': {
      const router = new ethers.Contract(config.gatewayRouter, SCROLL_ABI, signer);
      // Scroll needs msg.value > _amount to cover L2 gas fee
      const extra = ethers.parseEther('0.0005');
      return router.depositETH(value, 200000, { value: value + extra });
    }
    case 'linea': {
      const msgService = new ethers.Contract(config.messageService, LINEA_ABI, signer);
      return msgService.sendMessage(signer.address, 0, '0x', { value });
    }
    default:
      throw new Error(`Unknown bridge type: ${config.type}`);
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const minBalance = ethers.parseEther(MIN_BALANCE);
  const refillAmount = ethers.parseEther(REFILL_AMOUNT);
  const minReserve = ethers.parseEther(MIN_L1_RESERVE);

  // Check L1 balance first
  const l1Balance = await getBalance(SEPOLIA_RPC, wallet.address);
  console.log(`[REFILL] Sepolia L1: ${ethers.formatEther(l1Balance)} ETH (reserve: ${MIN_L1_RESERVE})`);

  if (l1Balance < minReserve) {
    console.log('[REFILL] L1 balance below reserve — skipping all refills');
    return;
  }

  let refills = 0;
  const sepoliaProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC, undefined, { staticNetwork: true });
  const signer = new ethers.Wallet(wallet.privateKey, sepoliaProvider);

  for (const [name, cfg] of Object.entries(BRIDGES)) {
    try {
      const bal = await getBalance(cfg.rpc, wallet.address);
      const ethBal = ethers.formatEther(bal);

      if (bal >= minBalance) {
        console.log(`[REFILL] ${name}: ${ethBal} ETH — OK`);
        continue;
      }

      console.log(`[REFILL] ${name}: ${ethBal} ETH — LOW (< ${MIN_BALANCE})`);

      // Check if we still have enough L1
      const currentL1 = await sepoliaProvider.getBalance(wallet.address);
      if (currentL1 < minReserve + refillAmount) {
        console.log(`[REFILL] ${name}: would drop L1 below reserve, skipping`);
        continue;
      }

      if (dryRun) {
        console.log(`[REFILL] ${name}: would bridge ${REFILL_AMOUNT} ETH (dry run)`);
        continue;
      }

      console.log(`[REFILL] ${name}: bridging ${REFILL_AMOUNT} ETH...`);
      const tx = await bridge(name, cfg, signer, refillAmount);
      console.log(`[REFILL] ${name}: TX ${tx.hash}`);
      await tx.wait();
      console.log(`[REFILL] ${name}: confirmed, funds arriving in 5-20 min`);
      refills++;

    } catch (err) {
      console.log(`[REFILL] ${name}: error — ${err.message.slice(0, 80)}`);
    }
  }

  console.log(`\n[REFILL] Done. ${refills} bridge(s) initiated.`);

  // Log result
  const logFile = path.join(__dirname, 'refill-log.json');
  let log = [];
  try { log = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
  log.push({ timestamp: new Date().toISOString(), refills, l1Balance: ethers.formatEther(l1Balance) });
  if (log.length > 200) log = log.slice(-200);
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

main().catch(err => { console.error('[REFILL] Fatal:', err.message); process.exit(1); });
