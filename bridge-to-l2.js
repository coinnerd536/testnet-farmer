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

// Scroll uses L1 Gateway Router
const SCROLL_BRIDGES = {
  'Scroll Sepolia': {
    gatewayRouter: '0x13FBE0D0e5552b8c9c4AE9e2435F38f37355998a',
  },
};

// Linea uses L1 Message Service
const LINEA_BRIDGES = {
  'Linea Sepolia': {
    messageService: '0xB218f8A4Bc926cF1cA7b3423c154a0D627Bdb7E5',
  },
};

const BRIDGE_ABI = ['function depositETH(uint32 _minGasLimit, bytes _extraData) payable'];
const PORTAL_ABI = ['function depositTransaction(address _to, uint256 _value, uint64 _gasLimit, bool _isCreation, bytes _data) payable'];
const INBOX_ABI = ['function depositEth() payable returns (uint256)'];
const SCROLL_ABI = ['function depositETH(uint256 _amount, uint256 _gasLimit) payable'];
const LINEA_ABI = ['function sendMessage(address _to, uint256 _fee, bytes _calldata) payable'];

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

async function bridgeScroll(networkName, amount) {
  const bridges = SCROLL_BRIDGES[networkName];
  if (!bridges) throw new Error(`No Scroll bridge config for ${networkName}`);

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const signer = new ethers.Wallet(wallet.privateKey, provider);
  const value = ethers.parseEther(amount);

  const router = new ethers.Contract(bridges.gatewayRouter, SCROLL_ABI, signer);
  console.log(`[BRIDGE] ${networkName}: sending ${amount} ETH via GatewayRouter.depositETH()...`);
  // Scroll needs msg.value > _amount to cover L2 gas fee
  const extra = ethers.parseEther('0.0005');
  const tx = await router.depositETH(value, 200000, { value: value + extra });
  console.log(`[BRIDGE] TX: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[BRIDGE] Confirmed! Gas: ${receipt.gasUsed}. Funds arrive in ~10-20 min.`);
  return tx.hash;
}

async function bridgeLinea(networkName, amount) {
  const bridges = LINEA_BRIDGES[networkName];
  if (!bridges) throw new Error(`No Linea bridge config for ${networkName}`);

  const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
  const signer = new ethers.Wallet(wallet.privateKey, provider);
  const value = ethers.parseEther(amount);

  const msgService = new ethers.Contract(bridges.messageService, LINEA_ABI, signer);
  console.log(`[BRIDGE] ${networkName}: sending ${amount} ETH via MessageService.sendMessage()...`);
  // sendMessage(to, fee, calldata) — fee=0 for simple ETH transfer, empty calldata
  const tx = await msgService.sendMessage(wallet.address, 0, '0x', { value });
  console.log(`[BRIDGE] TX: ${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`[BRIDGE] Confirmed! Gas: ${receipt.gasUsed}. Funds arrive in ~10-20 min.`);
  return tx.hash;
}

async function main() {
  const target = process.argv[2] || 'all';
  const amount = process.argv[3] || '0.005';

  const allTargets = [...Object.keys(OP_STACK_BRIDGES), ...Object.keys(ARBITRUM_BRIDGES), ...Object.keys(SCROLL_BRIDGES), ...Object.keys(LINEA_BRIDGES)];
  const targets = target === 'all' ? allTargets : [target];

  console.log(`[BRIDGE] Bridging ${amount} ETH to: ${targets.join(', ')}\n`);

  for (const name of targets) {
    try {
      if (OP_STACK_BRIDGES[name]) {
        await bridgeOpStack(name, amount);
      } else if (ARBITRUM_BRIDGES[name]) {
        await bridgeArbitrum(name, amount);
      } else if (SCROLL_BRIDGES[name]) {
        await bridgeScroll(name, amount);
      } else if (LINEA_BRIDGES[name]) {
        await bridgeLinea(name, amount);
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
