// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockV3Aggregator {
    int256 public answer;

    constructor(int256 _initialAnswer) {
        answer = _initialAnswer;
    }

    function updateAnswer(int256 _answer) external {
        answer = _answer;
    }

    function latestRoundData()
        external view
        returns (uint80 roundId, int256 _answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (0, answer, 0, 0, 0);
    }
}