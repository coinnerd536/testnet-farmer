#!/usr/bin/env node
/**
 * Wallet Balance Monitor
 * Checks balances across all configured networks.
 * Sends Telegram alert when any balance changes.
 * Run via cron every 5 minutes: node /home/lab/lab/projects/testnet-farmer/monitor.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));
const ADDRESS = wallet.address;
const STATUS_FILE = path.join(__dirname, 'status.json');

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

function jsonRPC(url, method, params = []) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    const parsed = new URL(url);
    const req = https.request({
      hostname: parsed.hostname, port: parsed.port,
      path: parsed.pathname + parsed.search, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body); req.end();
  });
}

function hexToEth(hex) {
  return Number(BigInt(hex)) / 1e18;
}

function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  return new Promise((resolve) => {
    const body = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: '[LAB] ' + text,
      parse_mode: 'HTML'
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve());
    req.write(body); req.end();
  });
}

async function main() {
  // Load previous status
  let prevBalances = {};
  try {
    const prev = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
    for (const b of (prev.balances || [])) {
      prevBalances[b.network] = b.balance || 0;
    }
  } catch {}

  // Check all balances
  const balances = [];
  let totalValue = 0;
  const changes = [];

  for (const net of config.networks) {
    try {
      const result = await jsonRPC(net.rpc, 'eth_getBalance', [ADDRESS, 'latest']);
      if (result.error) {
        balances.push({ network: net.name, token: net.token, balance: 0, error: result.error.message });
        continue;
      }
      const bal = hexToEth(result.result);
      balances.push({ network: net.name, token: net.token, balance: bal });
      totalValue += bal;

      const prev = prevBalances[net.name] || 0;
      if (Math.abs(bal - prev) > 0.0000001) {
        changes.push({ network: net.name, token: net.token, from: prev, to: bal, delta: bal - prev });
      }
    } catch (err) {
      balances.push({ network: net.name, token: net.token, balance: 0, error: err.message });
    }
  }

  // Save status
  const status = {
    timestamp: new Date().toISOString(),
    wallet: ADDRESS,
    balances,
    totalNetworks: config.networks.length,
    networksWithBalance: balances.filter(b => b.balance > 0).length
  };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

  // Print status
  const hasBalance = balances.some(b => b.balance > 0);
  console.log(`[MONITOR] ${new Date().toISOString()} | ${balances.filter(b=>b.balance>0).length}/${config.networks.length} networks with balance`);
  for (const b of balances) {
    if (b.balance > 0) console.log(`  + ${b.network}: ${b.balance.toFixed(6)} ${b.token}`);
  }

  // Alert on changes
  if (changes.length > 0) {
    const msg = changes.map(c => {
      const arrow = c.delta > 0 ? '+' : '';
      return `<b>${c.network}</b>: ${c.from.toFixed(6)} → ${c.to.toFixed(6)} ${c.token} (${arrow}${c.delta.toFixed(6)})`;
    }).join('\n');

    const alert = `Wallet balance changed!\n\n${msg}\n\nTotal networks with balance: ${balances.filter(b=>b.balance>0).length}/${config.networks.length}`;
    console.log('\n  BALANCE CHANGE DETECTED:');
    changes.forEach(c => console.log(`    ${c.network}: ${c.from.toFixed(6)} → ${c.to.toFixed(6)} ${c.token}`));

    await sendTelegram(alert);
    console.log('  Telegram alert sent.');
  }
}

main().catch(err => {
  console.error('Monitor error:', err.message);
  process.exit(1);
});
