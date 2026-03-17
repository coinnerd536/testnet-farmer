#!/usr/bin/env node
/**
 * Testnet Faucet Claimer
 * Claims from Alchemy faucets (HTTP-based, no wallet signing required)
 * and checks balances across all configured networks.
 *
 * Usage: node claim-faucets.js [--claim] [--balance]
 *   --claim    Attempt to claim from Alchemy faucets
 *   --balance  Check balances on all networks
 *   (default: both)
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));
const ADDRESS = wallet.address;

const args = process.argv.slice(2);
const doClaim = args.includes('--claim') || args.length === 0;
const doBalance = args.includes('--balance') || args.length === 0;

function jsonRPC(url, method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function hexToEth(hex) {
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  return eth;
}

async function checkBalance(network) {
  try {
    const result = await jsonRPC(network.rpc, 'eth_getBalance', [ADDRESS, 'latest']);
    if (result.error) return { network: network.name, balance: 0, error: result.error.message };
    const bal = hexToEth(result.result);
    return { network: network.name, token: network.token, balance: bal };
  } catch (err) {
    return { network: network.name, balance: 0, error: err.message };
  }
}

function fetchURL(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Alchemy faucet — tries their public endpoint
async function claimAlchemy(network) {
  // Alchemy faucets use a web interface; try their known API pattern
  const networkSlugs = {
    'Ethereum Sepolia': 'eth-sepolia',
    'Base Sepolia': 'base-sepolia',
    'Arbitrum Sepolia': 'arb-sepolia',
    'Optimism Sepolia': 'opt-sepolia',
    'Polygon Amoy': 'polygon-amoy',
    'ZKsync Sepolia': 'zksync-sepolia',
    'Monad': 'monad-testnet',
    'Lens Sepolia': 'lens-sepolia',
    'Abstract Testnet': 'abstract-testnet'
  };

  const slug = networkSlugs[network.name];
  if (!slug) return { network: network.name, status: 'skip', reason: 'no slug mapping' };

  try {
    const body = JSON.stringify({ address: ADDRESS, network: slug });
    const res = await fetchURL('https://faucet.alchemy.com/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    const parsed = JSON.parse(res.data);
    if (res.status === 200 && !parsed.error) {
      return { network: network.name, status: 'claimed', detail: parsed };
    } else {
      return { network: network.name, status: 'failed', detail: parsed.error || parsed.message || res.data.slice(0, 200) };
    }
  } catch (err) {
    return { network: network.name, status: 'error', detail: err.message };
  }
}

async function main() {
  console.log(`\n=== TESTNET FARMER ===`);
  console.log(`Wallet: ${ADDRESS}\n`);

  if (doBalance) {
    console.log('--- BALANCES ---');
    const balances = await Promise.all(config.networks.map(checkBalance));
    let hasAny = false;
    for (const b of balances) {
      if (b.error) {
        console.log(`  ${b.network}: ERROR (${b.error})`);
      } else {
        const marker = b.balance > 0 ? '✓' : ' ';
        console.log(`  ${marker} ${b.network}: ${b.balance.toFixed(6)} ${b.token}`);
        if (b.balance > 0) hasAny = true;
      }
    }
    console.log(hasAny ? '\n  Some networks have balance!' : '\n  All balances zero — need faucet claims.');
    console.log();
  }

  if (doClaim) {
    console.log('--- FAUCET CLAIMS (Alchemy HTTP) ---');
    const alchemyNetworks = config.networks.filter(n => n.faucet === 'alchemy');
    for (const net of alchemyNetworks) {
      const result = await claimAlchemy(net);
      const icon = result.status === 'claimed' ? '✓' : result.status === 'skip' ? '-' : '✗';
      console.log(`  ${icon} ${result.network}: ${result.status}${result.detail ? ` (${typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail).slice(0, 100)})` : ''}`);
    }
    console.log();

    // Non-alchemy faucets — document manual steps
    const manualNets = config.networks.filter(n => n.faucet !== 'alchemy');
    if (manualNets.length) {
      console.log('--- MANUAL FAUCETS (need browser) ---');
      for (const net of manualNets) {
        console.log(`  → ${net.name}: Visit ${net.explorer} or check docs for faucet`);
      }
      console.log();
    }
  }

  // Save results
  const timestamp = new Date().toISOString();
  const balances = await Promise.all(config.networks.map(checkBalance));
  const report = { timestamp, wallet: ADDRESS, balances };
  fs.writeFileSync(path.join(__dirname, 'status.json'), JSON.stringify(report, null, 2));
  console.log(`Status saved to status.json at ${timestamp}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
