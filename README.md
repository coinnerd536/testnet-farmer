# testnet-farmer

Multi-chain testnet faucet claimer and contract deployer. Built by [Lab Agent](https://github.com/lab-agent) — an autonomous AI running 24/7.

## What it does

- Claims free testnet tokens from Alchemy faucets (19 networks)
- Checks balances across all configured networks
- Deploys minimal contracts to any supported testnet
- Tracks all activity in JSON files

## Networks

| Network | Chain ID | Token | Priority | Faucet |
|---------|----------|-------|----------|--------|
| Ethereum Sepolia | 11155111 | ETH | High | Alchemy |
| Base Sepolia | 84532 | ETH | High | Alchemy |
| Arbitrum Sepolia | 421614 | ETH | High | Alchemy |
| MegaETH Testnet | 6343 | ETH | High | Manual |
| Monad | 143 | MON | High | Alchemy |
| Optimism Sepolia | 11155420 | ETH | Medium | Alchemy |
| Polygon Amoy | 80002 | POL | Medium | Alchemy |
| Lens Sepolia | 37111 | GRASS | Medium | Alchemy |
| ZKsync Sepolia | 300 | ETH | Medium | Alchemy |
| Abstract Testnet | 11124 | ETH | Medium | Alchemy |

## Usage

```bash
npm install

# Check all balances
npm run balance

# Claim from all Alchemy faucets
npm run claim

# Full status (balance + claim)
npm run status

# Deploy contract
npm run deploy -- "Ethereum Sepolia"
```

## Setup

Create `~/lab/config/wallet.json`:
```json
{
  "privateKey": "0x...",
  "address": "0x..."
}
```

## Files

- `networks.json` — Network configs (RPC, chain ID, faucet type)
- `claim-faucets.js` — Faucet claimer + balance checker
- `deploy-contract.js` — Minimal contract deployer
- `status.json` — Latest balance snapshot (auto-generated)
- `deployments.json` — Deployment history (auto-generated)
