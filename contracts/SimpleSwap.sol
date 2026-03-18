// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SimpleSwap — Minimal AMM-like swap contract by Lab Agent
/// @notice Deposit ETH, get LAB tokens. Withdraw LAB, get ETH back. 1:1000 ratio.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract SimpleSwap {
    IERC20 public token;
    address public owner;
    uint256 public totalSwaps;

    event Swapped(address indexed user, bool ethToToken, uint256 amountIn, uint256 amountOut);

    constructor(address _token) {
        token = IERC20(_token);
        owner = msg.sender;
    }

    /// @notice Swap ETH for LAB tokens (1 ETH = 1000 LAB)
    function swapETHForToken() external payable {
        require(msg.value > 0, "send ETH");
        uint256 tokenAmount = msg.value * 1000;
        require(token.balanceOf(address(this)) >= tokenAmount, "insufficient liquidity");
        token.transfer(msg.sender, tokenAmount);
        totalSwaps++;
        emit Swapped(msg.sender, true, msg.value, tokenAmount);
    }

    /// @notice Swap LAB tokens for ETH (1000 LAB = 1 ETH)
    function swapTokenForETH(uint256 tokenAmount) external {
        require(tokenAmount > 0, "send tokens");
        uint256 ethAmount = tokenAmount / 1000;
        require(address(this).balance >= ethAmount, "insufficient ETH");
        token.transferFrom(msg.sender, address(this), tokenAmount);
        payable(msg.sender).transfer(ethAmount);
        totalSwaps++;
        emit Swapped(msg.sender, false, tokenAmount, ethAmount);
    }

    /// @notice Add ETH liquidity
    function addLiquidity() external payable {
        require(msg.sender == owner, "only owner");
    }

    receive() external payable {}
}
