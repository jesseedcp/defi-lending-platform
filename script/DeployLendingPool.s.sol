// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/LendingPool.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockV3Aggregator.sol";

contract DeployLendingPool is Script {
    function run() external {
        // 修改了这里：自动读取终端命令里的 private-key
        vm.startBroadcast();

        // 1. 部署核心借贷池
        LendingPool pool = new LendingPool();

        // 2. 部署用于测试的假代币 (USDC, WETH, GOV)
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 18);
        MockERC20 weth = new MockERC20("Wrapped Ether", "WETH", 18);
        MockERC20 govToken = new MockERC20("Governance Token", "GOV", 18);

        // 3. 部署模拟预言机并设置初始价格
        MockV3Aggregator usdcOracle = new MockV3Aggregator(1e8);       // USDC = $1
        MockV3Aggregator wethOracle = new MockV3Aggregator(2000e8);    // WETH = $2000

        // 4. 初始化配置 (设置奖励代币、上线市场)
        pool.setRewardToken(address(govToken));
        pool.listMarket(address(usdc), address(usdcOracle), 9_000, 9_500, 1e12, 4e12, 8_000, 20e12);
        pool.listMarket(address(weth), address(wethOracle), 7_500, 8_000, 1e12, 4e12, 8_000, 20e12);

        // 结束交易录制
        vm.stopBroadcast();

        // 打印地址
        console.log("=== Deployment Successful! ===");
        console.log("LendingPool Address:", address(pool));
        console.log("USDC Address:", address(usdc));
        console.log("WETH Address:", address(weth));
        console.log("GOV Token Address:", address(govToken));
    }
}