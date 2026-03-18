#!/usr/bin/env node
/**
 * Bridge ETH from Sepolia L1 to L2 testnets
 * Supports OP Stack chains (Base, OP, etc) and Arbitrum
 * Usage: node bridge-to-l2.js <network> <amount>
 *   node bridge-to-l2.js "Base Sepolia" 0.01
 *   node bridge-to-l2.js all 0.005
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));

// L1 bridge contracts on Ethereum Sepolia
const OP_STACK_BRIDGES = {
  'Base Sepolia': {
    l1StandardBridge: '0xfd0Bf71F60660E2f608ed56e1659C450eB113120',
    optimismPortal: '0x49f53e41452C74589E85cA1677426Ba426459e85',
  },
  'Optimism Sepolia': {
    l1StandardBridge: '0xFBb0621E0B23b5478B630BD55a5f21f67730B0F1',
    optimismPortal: '0x16Fc5058F25648194471939df75CF27A2fdC48BC',
  },
};

// Arbitrum uses a different bridge mechanism (Inbox.depositEth)
const ARBITRUM_BRIDGES = {
  'Arbitrum Sepolia': {
    inbox: '0xaAe29B0366299461418F5324a79Afc425BE5ae21',
  },
};

const BRIDGE_ABI = ['function depositETH(uint32 _minGasLimit, bytes _extraData) payable'];
const PORTAL_ABI = ['function depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data) payable'];
const INBOX_ABI = ['function depositEth() payable returns (uint256)'];

async function bridgeOpStack(networkName, amount) {
  const bridges = OP_STACK_BRIDGES[networkName];
  if (!bridges) throw new Error(`No bridge config for ${networkName}`);

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const signer = new ethers.Wallet(wallet.privateKey, provider);
  const value = ethers.parseEther(amount);

  // Try L1StandardBridge first
  try {
    const bridge = new ethers.Contract(bridges.l1StandardBridge, BRIDGE_ABI, signer);
    console.log(`[BRIDGE] ${networkName}: sending ${amount} ETH via L1StandardBridge...`);
    const tx = await bridge.depositETH(200000, '0x', { value });
    console.log(`[BRIDGE] TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[BRIDGE] Confirmed! Gas: ${receipt.gasUsed}. Funds arrive in ~1-5 min.`);
    return tx.hash;
  } catch (err) {
    console.log(`[BRIDGE] L1StandardBridge failed: ${err.message.slice(0, 80)}`);
  }

  // Fallback: OptimismPortal depositTransaction
  try {
    const portal = new ethers.Contract(bridges.optimismPortal, PORTAL_ABI, signer);
    console.log(`[BRIDGE] ${networkName}: trying OptimismPortal...`);
    const tx = await portal.depositTransaction(wallet.address, value, 100000n, false, '0x', { value });
    console.log(`[BRIDGE] TX: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[BRIDGE] Confirmed! Gas: ${receipt.gasUsed}. Funds arrive in ~1-5 min.`);
    return tx.hash;
  } catch (err) {
    console.log(`[BRIDGE] OptimismPortal failed: ${err.message.slice(0, 80)}`);
  }

  throw new Error(`All bridge methods failed for ${networkName}`);
}

async function bridgeArbitrum(networkName, amount) {
  const bridges = ARBITRUM_BRIDGES[networkName];
  if (!bridges) throw new Error(`No Arbitrum bridge config for ${networkName}`);

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const signer = new ethers.Wallet(wallet.privateKey, provider);
  const value = ethers.parseEther(amount);

  const inbox = new ethers.Contract(bridges.inbox, INBOX_ABI, signer);
  console.log(`[BRIDGE] ${networkName}: sending ${amount} ETH via Inbox.depositEth()...`);
  const tx = await inbox.depositEth({ value });
  console.log(`[BRIDGE] TX: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[BRIDGE] Confirmed! Gas: ${receipt.gasUsed}. Funds arrive in ~10-15 min.`);
  return tx.hash;
}

async function main() {
  const target = process.argv[2] || 'all';
  const amount = process.argv[3] || '0.005';

  const allTargets = [...Object.keys(OP_STACK_BRIDGES), ...Object.keys(ARBITRUM_BRIDGES)];
  const targets = target === 'all' ? allTargets : [target];

  console.log(`[BRIDGE] Bridging ${amount} ETH to: ${targets.join(', ')}\n`);

  for (const name of targets) {
    try {
      if (OP_STACK_BRIDGES[name]) {
        await bridgeOpStack(name, amount);
      } else if (ARBITRUM_BRIDGES[name]) {
        await bridgeArbitrum(name, amount);
      } else {
        console.log(`[BRIDGE] ${name}: no bridge configured`);
      }
    } catch (err) {
      console.log(`[BRIDGE] ${name}: ${err.message}`);
    }
    console.log();
  }

  // Check Sepolia balance after
  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const bal = await provider.getBalance(wallet.address);
  console.log(`[BRIDGE] Sepolia balance: ${ethers.formatEther(bal)} ETH`);
}

main().catch(err => { console.error('[BRIDGE] Fatal:', err.message); process.exit(1); });
