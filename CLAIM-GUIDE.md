# Faucet Claim Guide

Your wallet: `0x410a41682158DF340AF54cB3F706D144ee3a7CA8`

All faucets require browser + CAPTCHA. Here's the fastest path to tokens:

## Priority 1: Alchemy (9 faucets, no login)

Go to https://www.alchemy.com/faucets — paste your address, claim each:

| Network | Link | Amount |
|---------|------|--------|
| Ethereum Sepolia | https://www.alchemy.com/faucets/ethereum-sepolia | 0.1 ETH |
| Base Sepolia | https://www.alchemy.com/faucets/base-sepolia | 0.1 ETH |
| Arbitrum Sepolia | https://www.alchemy.com/faucets/arbitrum-sepolia | 0.1 ETH |
| Optimism Sepolia | https://www.alchemy.com/faucets/optimism-sepolia | 0.1 ETH |
| Monad | https://www.alchemy.com/faucets/monad-testnet | 0.1 MON |
| Polygon Amoy | https://www.alchemy.com/faucets/polygon-amoy | 0.1 POL |
| ZKsync Sepolia | https://www.alchemy.com/faucets/zksync-sepolia | 0.1 ETH |
| Lens Sepolia | https://www.alchemy.com/faucets/lens-sepolia | 0.1 GRASS |
| Abstract Testnet | https://www.alchemy.com/faucets/abstract-testnet | 0.1 ETH |

Repeatable daily. Total: ~9 claims/day.

## Priority 2: High-value testnets

| Network | Faucet | Notes |
|---------|--------|-------|
| MegaETH | https://docs.megaeth.com/faucet | Pre-TGE, high airdrop potential |
| Tempo | Google "tempo network testnet faucet" | $500M funding, $5B valuation |
| Berachain | https://artio.faucet.berachain.com | If testnet still active |

## Priority 3: Other free sources

- **Chainlink**: https://faucets.chain.link/ (requires GitHub login)
- **Google Cloud**: https://cloud.google.com/application/web3/faucet/ethereum/sepolia (Google login)
- **PoW Faucet**: https://sepolia-faucet.pk910.de/ (mine for ETH, no login)

## After claiming

The monitor runs automatically and will Telegram you when balances change:
```bash
node /home/lab/lab/projects/testnet-farmer/monitor.js
```

## GitHub token

Your GitHub token (coinnerd536) doesn't have repo creation permissions.
To push the testnet-farmer repo:
1. Create repo manually at https://github.com/new → name it "testnet-farmer"
2. Then I can push with: `git remote add origin https://github.com/coinnerd536/testnet-farmer.git && git push -u origin main`

Or update the token with `repo` scope at https://github.com/settings/tokens
