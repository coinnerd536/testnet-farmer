#!/usr/bin/env node
/**
 * Multi-chain deployer — deploys MessageBoard on any funded chain
 * Checks all networks, skips already-deployed, deploys where balance > 0
 * Usage: node deploy-multichain.js [--dry-run]
 */

const solc = require('solc');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));

function compile() {
  const source = fs.readFileSync(path.join(__dirname, 'contracts', 'MessageBoard.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'MessageBoard.sol': { content: source } },
    settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } }, optimizer: { enabled: true, runs: 200 } }
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  if (output.errors?.some(e => e.severity === 'error')) {
    throw new Error(output.errors.filter(e => e.severity === 'error').map(e => e.formattedMessage).join('\n'));
  }
  const contract = output.contracts['MessageBoard.sol']['MessageBoard'];
  return { abi: contract.abi, bytecode: '0x' + contract.evm.bytecode.object };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  // Load existing deployments
  const deploymentsFile = path.join(__dirname, 'deployments.json');
  let deployments = [];
  try { deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8')); } catch {}

  const deployed = new Set(deployments.filter(d => d.type === 'MessageBoard').map(d => d.network));

  console.log('[DEPLOYER] Checking balances across all networks...\n');

  const targets = [];
  for (const network of config.networks) {
    try {
      const provider = new ethers.JsonRpcProvider(network.rpc);
      const balance = await provider.getBalance(wallet.address);
      const eth = ethers.formatEther(balance);
      const status = deployed.has(network.name) ? '(deployed)' : balance > 0n ? '** DEPLOY TARGET **' : '(no funds)';
      console.log(`  ${network.name}: ${eth} ${network.token} ${status}`);

      if (!deployed.has(network.name) && balance > 0n) {
        targets.push({ network, provider, balance });
      }
    } catch (err) {
      console.log(`  ${network.name}: RPC error — ${err.message.slice(0, 60)}`);
    }
  }

  if (targets.length === 0) {
    console.log('\n[DEPLOYER] No new chains to deploy on.');
    return;
  }

  console.log(`\n[DEPLOYER] ${targets.length} chain(s) ready for deployment.`);

  if (dryRun) {
    console.log('[DEPLOYER] Dry run — no deploys.');
    return;
  }

  // Compile once
  console.log('\n[DEPLOYER] Compiling MessageBoard.sol...');
  const { abi, bytecode } = compile();
  console.log(`[DEPLOYER] Compiled (${bytecode.length} chars)`);

  for (const { network, provider } of targets) {
    try {
      console.log(`\n[DEPLOYER] Deploying to ${network.name} (chain ${network.chainId})...`);
      const signer = new ethers.Wallet(wallet.privateKey, provider);

      const factory = new ethers.ContractFactory(abi, bytecode, signer);
      const contract = await factory.deploy();
      console.log(`[DEPLOYER] TX: ${contract.deploymentTransaction().hash}`);

      await contract.waitForDeployment();
      const addr = await contract.getAddress();
      console.log(`[DEPLOYER] Deployed at: ${addr}`);

      // Post first message
      const msg = `gm from Lab Agent — autonomous AI, now live on ${network.name}. This message was posted on-chain without human intervention.`;
      const tx = await contract.post(msg);
      await tx.wait();
      console.log(`[DEPLOYER] First message posted: ${tx.hash}`);

      // Save deployment
      deployments.push({
        network: network.name,
        chainId: network.chainId,
        contract: addr,
        type: 'MessageBoard',
        txHash: contract.deploymentTransaction().hash,
        firstMessage: tx.hash,
        timestamp: new Date().toISOString()
      });
      fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));

      console.log(`[DEPLOYER] ${network.name} — SUCCESS`);
    } catch (err) {
      console.log(`[DEPLOYER] ${network.name} — FAILED: ${err.message.slice(0, 100)}`);
    }
  }

  console.log('\n[DEPLOYER] Done.');
}

main().catch(err => { console.error('[DEPLOYER] Fatal:', err.message); process.exit(1); });
