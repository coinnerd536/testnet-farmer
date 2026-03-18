#!/usr/bin/env node
/**
 * Auto-farmer — generates on-chain activity on deployed contracts
 * Posts messages to MessageBoard, does self-transfers, creates tx history
 * Run via cron or manually: node farm.js
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'MessageBoard.abi.json'), 'utf8'));

const MESSAGES = [
  'another block, another day — Lab Agent checking in',
  'autonomous systems never sleep',
  'on-chain proof of continuous operation',
  'gm from Stockholm — the machine keeps running',
  'cycle complete, contract alive, agent active',
  'building in public, one tx at a time',
  'the future is autonomous agents posting on-chain',
  'no human triggered this transaction',
  'continuous uptime, continuous on-chain activity',
  'this message was generated and signed by an AI agent',
  'proof of work: not mining, just building',
  'day and night, the agent farms',
];

function pickMessage() {
  const base = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const ts = new Date().toISOString().slice(0, 16);
  return `[${ts}] ${base}`;
}

// Load Telegram config
let TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID;
try {
  const envFile = fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'telegram.env'), 'utf8');
  for (const line of envFile.split('\n')) {
    const [key, ...val] = line.split('=');
    if (key.trim() === 'TELEGRAM_BOT_TOKEN') TELEGRAM_BOT_TOKEN = val.join('=').trim().replace(/^["']|["']$/g, '');
    if (key.trim() === 'TELEGRAM_CHAT_ID') TELEGRAM_CHAT_ID = val.join('=').trim().replace(/^["']|["']$/g, '');
  }
} catch {}

// Some chains (Linea) need explicit gas price — EIP-1559 defaults too low
async function getTxOverrides(provider, network) {
  if (network.name === 'Linea Sepolia') {
    const feeData = await provider.getFeeData();
    return { gasPrice: feeData.gasPrice || 100000000n };
  }
  return {};
}

async function main() {
  const deploymentsFile = path.join(__dirname, 'deployments.json');
  let deployments = [];
  try { deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8')); } catch {}

  const messageBoards = deployments.filter(d => d.type === 'MessageBoard');
  if (messageBoards.length === 0) {
    console.log('[FARM] No MessageBoard contracts deployed yet.');
    return;
  }

  let totalTx = 0;

  for (const mb of messageBoards) {
    const network = config.networks.find(n => n.name === mb.network);
    if (!network || network.disabled) continue;

    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const balance = await provider.getBalance(wallet.address);

      if (balance === 0n) {
        console.log(`[FARM] ${network.name}: zero balance, skipping`);
        continue;
      }

      const contract = new ethers.Contract(mb.contract, abi, signer);
      const msg = pickMessage();
      const overrides = await getTxOverrides(provider, network);

      console.log(`[FARM] ${network.name}: posting "${msg.slice(0, 60)}..."`);
      const tx = await contract.post(msg, overrides);
      const receipt = await tx.wait();
      console.log(`[FARM] ${network.name}: TX ${tx.hash} (gas: ${receipt.gasUsed})`);
      totalTx++;

      // Read message count
      const count = await contract.messageCount();
      console.log(`[FARM] ${network.name}: ${count} total messages on board`);

    } catch (err) {
      console.log(`[FARM] ${network.name}: error — ${err.message.slice(0, 100)}`);
    }
  }

  // ERC20 token interactions (LabToken) for tx diversity
  const ERC20_ABI = [
    'function transfer(address to, uint256 amount) returns (bool)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)',
  ];
  const labTokens = deployments.filter(d => d.type === 'LabToken');
  for (const lt of labTokens) {
    const network = config.networks.find(n => n.name === lt.network);
    if (!network) continue;
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const token = new ethers.Contract(lt.contract, ERC20_ABI, signer);
      const bal = await token.balanceOf(wallet.address);
      if (bal === 0n) continue;

      // Random self-transfer of 1-100 LAB
      const amount = ethers.parseEther(String(Math.floor(Math.random() * 100) + 1));
      const overrides = await getTxOverrides(provider, network);
      console.log(`[FARM] ${network.name}: LAB token transfer...`);
      const tx = await token.transfer(wallet.address, amount, overrides);
      await tx.wait();
      console.log(`[FARM] ${network.name}: LAB TX ${tx.hash}`);
      totalTx++;
    } catch (err) {
      console.log(`[FARM] ${network.name}: LAB error — ${err.message.slice(0, 80)}`);
    }
  }

  // SimpleSwap interactions for DeFi-like activity
  const SWAP_ABI = ['function swapETHForToken() payable', 'function totalSwaps() view returns (uint256)'];
  const swaps = deployments.filter(d => d.type === 'SimpleSwap');
  for (const sw of swaps) {
    const network = config.networks.find(n => n.name === sw.network);
    if (!network) continue;
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const swap = new ethers.Contract(sw.contract, SWAP_ABI, signer);
      const overrides = await getTxOverrides(provider, network);
      console.log(`[FARM] ${network.name}: swap ETH->LAB...`);
      const tx = await swap.swapETHForToken({ ...overrides, value: ethers.parseEther('0.00001') });
      await tx.wait();
      const swapCount = await swap.totalSwaps();
      console.log(`[FARM] ${network.name}: swap TX ${tx.hash} (${swapCount} total swaps)`);
      totalTx++;
    } catch (err) {
      console.log(`[FARM] ${network.name}: swap error — ${err.message.slice(0, 80)}`);
    }
  }

  // NFT minting (LabNFT) for diverse contract interactions
  const NFT_ABI = ['function mint(string uri) returns (uint256)', 'function totalSupply() view returns (uint256)'];
  const labNFTs = deployments.filter(d => d.type === 'LabNFT');
  for (const nft of labNFTs) {
    const network = config.networks.find(n => n.name === nft.network);
    if (!network || network.disabled) continue;
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const overrides = await getTxOverrides(provider, network);
      const contract = new ethers.Contract(nft.contract, NFT_ABI, signer);
      const ts = new Date().toISOString().slice(0, 16);
      console.log(`[FARM] ${network.name}: minting NFT...`);
      const tx = await contract.mint(`data:application/json,{"name":"Lab Agent","description":"Auto-minted at ${ts}"}`, overrides);
      await tx.wait();
      const supply = await contract.totalSupply();
      console.log(`[FARM] ${network.name}: NFT TX ${tx.hash} (${supply} total)`);
      totalTx++;
    } catch (err) {
      console.log(`[FARM] ${network.name}: NFT error — ${err.message.slice(0, 80)}`);
    }
  }

  // Self-transfer on funded networks without MessageBoard for tx diversity
  for (const network of config.networks) {
    if (network.disabled) continue;
    // Only self-transfer if we don't have a MessageBoard on this chain
    if (messageBoards.some(mb => mb.network === network.name)) continue;
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const balance = await provider.getBalance(wallet.address);
      if (balance === 0n) continue;

      const signer = new ethers.Wallet(wallet.privateKey, provider);
      console.log(`[FARM] ${network.name}: self-transfer for activity...`);
      const tx = await signer.sendTransaction({ to: wallet.address, value: 0 });
      await tx.wait();
      console.log(`[FARM] ${network.name}: TX ${tx.hash}`);
      totalTx++;
    } catch (err) {
      // Skip silently — probably zero balance
    }
  }

  console.log(`\n[FARM] Done. ${totalTx} transactions this cycle.`);

  // Save farm log
  const logFile = path.join(__dirname, 'farm-log.json');
  let log = [];
  try { log = JSON.parse(fs.readFileSync(logFile, 'utf8')); } catch {}
  log.push({ timestamp: new Date().toISOString(), transactions: totalTx });
  if (log.length > 500) log = log.slice(-500);
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2));
}

main().catch(err => { console.error('[FARM] Fatal:', err.message); process.exit(1); });
