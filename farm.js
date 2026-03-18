#!/usr/bin/env node
/**
 * Auto-farmer — generates on-chain activity on deployed contracts
 * Posts messages to MessageBoard, does self-transfers, creates tx history
 * Runs all chains in PARALLEL for speed, sequential within each chain for nonce safety
 * Run via cron or manually: node farm.js
 */

const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
const mbAbi = JSON.parse(fs.readFileSync(path.join(__dirname, 'MessageBoard.abi.json'), 'utf8'));

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

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];
const SWAP_ABI = ['function swapETHForToken() payable', 'function totalSwaps() view returns (uint256)'];
const NFT_ABI = ['function mint(string uri) returns (uint256)', 'function totalSupply() view returns (uint256)'];
const NFT_ABI_SIMPLE = ['function mint() returns (uint256)', 'function totalSupply() view returns (uint256)'];

function pickMessage() {
  const base = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const ts = new Date().toISOString().slice(0, 16);
  return `[${ts}] ${base}`;
}

async function getTxOverrides(provider, network) {
  if (network.name === 'Linea Sepolia') {
    const feeData = await provider.getFeeData();
    return { gasPrice: feeData.gasPrice || 100000000n };
  }
  // Unichain and Ink need explicit gasLimit for contract calls
  if (network.name === 'Unichain Sepolia' || network.name === 'Ink Sepolia') {
    return { gasLimit: 200000 };
  }
  return {};
}

// Farm a single chain — all contract types, sequential for nonce safety
async function farmChain(networkName, deployments) {
  const network = config.networks.find(n => n.name === networkName);
  if (!network || network.disabled) return 0;

  const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
  const signer = new ethers.Wallet(wallet.privateKey, provider);
  const balance = await provider.getBalance(wallet.address);

  if (balance === 0n) {
    console.log(`[FARM] ${networkName}: zero balance, skipping`);
    return 0;
  }

  const overrides = await getTxOverrides(provider, network);
  let txCount = 0;

  // 1. MessageBoard post
  const mb = deployments.find(d => d.type === 'MessageBoard' && d.network === networkName);
  if (mb) {
    try {
      const isNewChain = ['Unichain Sepolia', 'Soneium Minato', 'Ink Sepolia'].includes(networkName);
      const abi = isNewChain
        ? ['function post(string msg_) external', 'function count() view returns (uint256)']
        : mbAbi;
      const contract = new ethers.Contract(mb.contract, abi, signer);
      const msg = pickMessage();
      const tx = await contract.post(msg, overrides);
      const receipt = await tx.wait();
      const count = isNewChain ? await contract.count() : await contract.messageCount();
      console.log(`[FARM] ${networkName}: post TX ${tx.hash.slice(0, 10)}... (${count} msgs, gas: ${receipt.gasUsed})`);
      txCount++;
    } catch (err) {
      console.log(`[FARM] ${networkName}: post error — ${err.message.slice(0, 80)}`);
    }
  }

  // 2. LAB token transfer
  const lt = deployments.find(d => d.type === 'LabToken' && d.network === networkName);
  if (lt) {
    try {
      const token = new ethers.Contract(lt.contract, ERC20_ABI, signer);
      const bal = await token.balanceOf(wallet.address);
      if (bal > 0n) {
        const amount = ethers.parseEther(String(Math.floor(Math.random() * 100) + 1));
        const tx = await token.transfer(wallet.address, amount, overrides);
        await tx.wait();
        console.log(`[FARM] ${networkName}: LAB TX ${tx.hash.slice(0, 10)}...`);
        txCount++;
      }
    } catch (err) {
      console.log(`[FARM] ${networkName}: LAB error — ${err.message.slice(0, 80)}`);
    }
  }

  // 3. SimpleSwap
  const sw = deployments.find(d => d.type === 'SimpleSwap' && d.network === networkName);
  if (sw) {
    try {
      const swap = new ethers.Contract(sw.contract, SWAP_ABI, signer);
      const tx = await swap.swapETHForToken({ ...overrides, value: ethers.parseEther('0.00001') });
      await tx.wait();
      const swapCount = await swap.totalSwaps();
      console.log(`[FARM] ${networkName}: swap TX ${tx.hash.slice(0, 10)}... (${swapCount} total)`);
      txCount++;
    } catch (err) {
      console.log(`[FARM] ${networkName}: swap error — ${err.message.slice(0, 80)}`);
    }
  }

  // 4. NFT mint
  const nft = deployments.find(d => d.type === 'LabNFT' && d.network === networkName);
  if (nft) {
    try {
      // New chains use mint() without URI, old chains use mint(string)
      const isSimpleNFT = ['Unichain Sepolia', 'Soneium Minato', 'Ink Sepolia'].includes(networkName);
      const contract = new ethers.Contract(nft.contract, isSimpleNFT ? NFT_ABI_SIMPLE : NFT_ABI, signer);
      let tx;
      if (isSimpleNFT) {
        tx = await contract.mint(overrides);
      } else {
        const ts = new Date().toISOString().slice(0, 16);
        tx = await contract.mint(`data:application/json,{"name":"Lab Agent","description":"Auto-minted at ${ts}"}`, overrides);
      }
      await tx.wait();
      const supply = await contract.totalSupply();
      console.log(`[FARM] ${networkName}: NFT TX ${tx.hash.slice(0, 10)}... (${supply} total)`);
      txCount++;
    } catch (err) {
      console.log(`[FARM] ${networkName}: NFT error — ${err.message.slice(0, 80)}`);
    }
  }

  return txCount;
}

async function main() {
  const deploymentsFile = path.join(__dirname, 'deployments.json');
  let deployments = [];
  try { deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8')); } catch {}

  // Get unique chains that have deployments
  const chains = [...new Set(deployments.map(d => d.network))];
  if (chains.length === 0) {
    console.log('[FARM] No contracts deployed yet.');
    return;
  }

  // Farm all chains in parallel
  const results = await Promise.all(chains.map(chain => farmChain(chain, deployments)));
  const totalTx = results.reduce((a, b) => a + b, 0);

  // Self-transfer on funded networks without any deployments
  const deployedChains = new Set(chains);
  for (const network of config.networks) {
    if (network.disabled || deployedChains.has(network.name)) continue;
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc, undefined, { staticNetwork: true });
      const balance = await Promise.race([
        provider.getBalance(wallet.address),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      ]);
      if (balance === 0n) continue;

      const signer = new ethers.Wallet(wallet.privateKey, provider);
      const tx = await signer.sendTransaction({ to: wallet.address, value: 0 });
      await tx.wait();
      console.log(`[FARM] ${network.name}: self-transfer TX ${tx.hash.slice(0, 10)}...`);
      totalTx++;
    } catch {
      // Skip silently
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
