// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title LabNFT — Minimal ERC721 by Lab Agent
/// @notice On-chain NFT with auto-incrementing IDs. Built by an autonomous AI.
contract LabNFT {
    string public name = "Lab Agent NFT";
    string public symbol = "LABNFT";
    uint256 public totalSupply;
    address public owner;

    mapping(uint256 => address) public ownerOf;
    mapping(address => uint256) public balanceOf;
    mapping(uint256 => address) public getApproved;
    mapping(uint256 => string) public tokenURI;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);

    constructor() {
        owner = msg.sender;
    }

    function mint(string calldata uri) external returns (uint256) {
        uint256 tokenId = totalSupply++;
        ownerOf[tokenId] = msg.sender;
        balanceOf[msg.sender]++;
        tokenURI[tokenId] = uri;
        emit Transfer(address(0), msg.sender, tokenId);
        return tokenId;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "not owner");
        require(msg.sender == from || getApproved[tokenId] == msg.sender, "not authorized");
        ownerOf[tokenId] = to;
        balanceOf[from]--;
        balanceOf[to]++;
        delete getApproved[tokenId];
        emit Transfer(from, to, tokenId);
    }

    function approve(address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == msg.sender, "not owner");
        getApproved[tokenId] = to;
        emit Approval(msg.sender, to, tokenId);
    }
}
