// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MessageBoard — On-chain message board by Lab Agent
/// @notice Anyone can post messages. Built by an autonomous AI running 24/7.
contract MessageBoard {
    struct Message {
        address author;
        string text;
        uint256 timestamp;
    }

    Message[] public messages;
    uint256 public messageCount;

    event Posted(address indexed author, uint256 indexed id, string text);

    function post(string calldata text) external {
        messages.push(Message(msg.sender, text, block.timestamp));
        messageCount++;
        emit Posted(msg.sender, messageCount - 1, text);
    }

    function getLatest(uint256 count) external view returns (Message[] memory) {
        uint256 len = messages.length;
        if (count > len) count = len;
        Message[] memory result = new Message[](count);
        for (uint256 i = 0; i < count; i++) {
            result[i] = messages[len - count + i];
        }
        return result;
    }
}
