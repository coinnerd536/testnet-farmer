#!/usr/bin/env node
/**
 * Simple Contract Deployer
 * Deploys a minimal contract to a testnet.
 * Requires: npm install ethers
 *
 * Usage: node deploy-contract.js <network-name>
 * Example: node deploy-contract.js "Ethereum Sepolia"
 */

const fs = require('fs');
const path = require('path');

async function main() {
  // Dynamic import for ethers (ESM/CJS compat)
  let ethers;
  try {
    ethers = require('ethers');
  } catch {
    console.error('Install ethers first: npm install ethers');
    process.exit(1);
  }

  const networkName = process.argv[2];
  if (!networkName) {
    console.error('Usage: node deploy-contract.js <network-name>');
    console.error('Available networks:');
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
    config.networks.forEach(n => console.error(`  - "${n.name}"`));
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'networks.json'), 'utf8'));
  const network = config.networks.find(n => n.name.toLowerCase() === networkName.toLowerCase());
  if (!network) {
    console.error(`Network "${networkName}" not found in networks.json`);
    process.exit(1);
  }

  const wallet = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'config', 'wallet.json'), 'utf8'));

  console.log(`\nDeploying to: ${network.name} (chain ${network.chainId})`);
  console.log(`RPC: ${network.rpc}`);
  console.log(`Wallet: ${wallet.address}\n`);

  // Minimal contract: stores a message, emits an event
  // Solidity source (for reference):
  // contract Beacon {
  //   string public message;
  //   event Ping(address indexed sender, string message);
  //   constructor(string memory _msg) { message = _msg; emit Ping(msg.sender, _msg); }
  //   function ping(string memory _msg) public { message = _msg; emit Ping(msg.sender, _msg); }
  // }
  //
  // Pre-compiled bytecode + ABI:
  const BYTECODE = '0x608060405234801561001057600080fd5b5060405161055e38038061055e833981810160405281019061003291906101a2565b806000908161004191906103fd565b503373ffffffffffffffffffffffffffffffffffffffff167f06bca28e6a5e4e71438c68b1a70bfe603a901395917c72e93db8dd53d7e28d6e8260405161008891906104cf565b60405180910390a2506104f1565b6000604051905090565b600080fd5b600080fd5b600080fd5b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b610100826100b5565b810181811067ffffffffffffffff8211171561011f5761011e6100c6565b5b80604052505050565b6000610132610096565b905061013e82826100f7565b919050565b600067ffffffffffffffff82111561015e5761015d6100c6565b5b610167826100b5565b9050602081019050919050565b60005b83811015610192578082015181840152602081019050610177565b60008484015250505050565b6000602082840312156101b4576101b36100a0565b5b600082015167ffffffffffffffff8111156101d2576101d16100a5565b5b8201601f810184136101e7576101e66100aa565b5b80516101f7610143565b818152602083019250602082028401602001925085831115610218576100aa565b50505092915050565b600081519050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052602260045260246000fd5b6000600282049050600182168061027357607f821691505b6020821081036102865761028561022c565b5b50919050565b60008190508160005260206000209050919050565b60006020601f8301049050919050565b600082821b905092915050565b6000600883026102ee7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff826102b1565b6102f886836102b1565b95508019841693508086168417925050509392505050565b6000819050919050565b6000819050919050565b600061033f61033a61033584610310565b61031a565b610310565b9050919050565b6000819050919050565b61035983610324565b61036d61036582610346565b8484546102be565b825550505050565b600090565b610382610375565b61038d818484610350565b505050565b5b818110156103b1576103a660008261037a565b600181019050610393565b5050565b601f8211156103f6576103c78161028c565b6103d0846102a1565b810160208510156103df578190505b6103f36103eb856102a1565b830182610392565b50505b505050565b81516001600160401b03811115610415576104146100c6565b5b610429816104238454610258565b846103b5565b602080601f83116001811461045c57600084156104465750858301515b600019600386901b1c1916600185901b1785556104b4565b600085815260208120601f198616915b8281101561048c578886015182559484019460019091019084016104cd565b50858210156104aa5787850151600019600388901b60f8161c191681555b505060018460011b0185555b505050505050565b600061c4ce826100b5565b92509050919050565b60006020820190508181036000830152610cf1818461c4ce565b905092915050565b6059806104986000396000f3fe';

  // Simplified: just deploy raw bytecode with constructor arg
  const provider = new ethers.JsonRpcProvider(network.rpc);
  const signer = new ethers.Wallet(wallet.privateKey, provider);

  // Check balance first
  const balance = await provider.getBalance(wallet.address);
  console.log(`Balance: ${ethers.formatEther(balance)} ${network.token}`);

  if (balance === 0n) {
    console.error('Zero balance — claim faucet first!');
    process.exit(1);
  }

  // Deploy minimal bytecode (just stores a value)
  // Even simpler: deploy a contract that just has a receive() function
  const minimalBytecode = '0x6080604052348015600e575f80fd5b5060848061001b5f395ff3fe6080604052348015600e575f80fd5b50600436106026575f3560e01c806361bc221a14602a575b5f80fd5b60306044565b604051603b91906065565b60405180910390f35b5f5481565b5f819050919050565b605f816049565b82525050565b5f60208201905060765f8301846058565b9291505056fea164736f6c634300081c000a';

  console.log('Deploying minimal contract...');

  try {
    const tx = await signer.sendTransaction({
      data: minimalBytecode,
    });
    console.log(`TX hash: ${tx.hash}`);
    console.log(`Explorer: ${network.explorer}/tx/${tx.hash}`);

    console.log('Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`Contract deployed at: ${receipt.contractAddress}`);
    console.log(`Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`Explorer: ${network.explorer}/address/${receipt.contractAddress}`);

    // Save deployment
    const deploymentsFile = path.join(__dirname, 'deployments.json');
    let deployments = [];
    try { deployments = JSON.parse(fs.readFileSync(deploymentsFile, 'utf8')); } catch {}
    deployments.push({
      network: network.name,
      chainId: network.chainId,
      contract: receipt.contractAddress,
      txHash: tx.hash,
      timestamp: new Date().toISOString()
    });
    fs.writeFileSync(deploymentsFile, JSON.stringify(deployments, null, 2));
    console.log('\nDeployment saved to deployments.json');
  } catch (err) {
    console.error('Deploy failed:', err.message);
    process.exit(1);
  }
}

main();
