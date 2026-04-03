// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingPool} from "../src/LendingPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockV3Aggregator} from "../src/mocks/MockV3Aggregator.sol"; 

interface Vm {
    function roll(uint256 newHeight) external;
}

// ==========================================
// 辅助合约：模拟普通用户行为
// ==========================================
contract Actor {
    function approveToken(address token, address spender, uint256 amount) external {
        IERC20(token).approve(spender, amount);
    }

    function supply(address pool, address asset, uint256 amount) external {
        LendingPool(pool).supply(asset, amount);
    }

    function borrow(address pool, address asset, uint256 amount) external {
        LendingPool(pool).borrow(asset, amount);
    }

    function repay(address pool, address asset, uint256 amount) external {
        LendingPool(pool).repay(asset, amount);
    }

    function withdraw(address pool, address asset, uint256 amount) external {
        LendingPool(pool).withdraw(asset, amount);
    }

    function liquidate(address pool, address borrower, address debtAsset, address collateralAsset, uint256 repayAmount)
        external
    {
        LendingPool(pool).liquidate(borrower, debtAsset, collateralAsset, repayAmount);
    }
}

// ==========================================
// 辅助合约：模拟闪电贷接收者
// ==========================================
contract FlashLoanReceiverMock {
    LendingPool public pool;

    constructor(LendingPool _pool) {
        pool = _pool;
    }

    // 核心：实现回调接口
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool) {
        // 模拟利用闪电贷做了一些事情...
        
        // 关键：为了能还款给池子，必须在这里给池子授权 (本金 + 手续费)
        IERC20(asset).approve(address(pool), amount + premium);
        return true;
    }
}

// ==========================================
// 主测试合约
// ==========================================
contract LendingPoolTest {
    address internal constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm internal constant vm = Vm(HEVM_ADDRESS);
    uint256 internal constant WAD = 1e18;

    LendingPool internal pool;
    MockERC20 internal usdc;
    MockERC20 internal weth;
    Actor internal lender;
    Actor internal borrower;
    Actor internal liquidator;
    
    MockV3Aggregator internal usdcOracle;
    MockV3Aggregator internal wethOracle;

    function setUp() public {
        pool = new LendingPool();
        usdc = new MockERC20("Mock USD Coin", "mUSDC", 18);
        weth = new MockERC20("Mock Wrapped Ether", "mWETH", 18);
        lender = new Actor();
        borrower = new Actor();
        liquidator = new Actor();

        // 部署假的预言机模拟价格
        usdcOracle = new MockV3Aggregator(1e8);       
        wethOracle = new MockV3Aggregator(2000e8);    

        // 调用新版 listMarket，传入预言机地址
        pool.listMarket(address(usdc), address(usdcOracle), 9_000, 9_500, 1e12, 4e12);
        pool.listMarket(address(weth), address(wethOracle), 7_500, 8_000, 1e12, 4e12);

        // 给各个测试角色铸造初始资金
        usdc.mint(address(lender), 100_000e18);
        weth.mint(address(borrower), 10e18);
        usdc.mint(address(liquidator), 20_000e18);

        // 授权
        lender.approveToken(address(usdc), address(pool), type(uint256).max);
        borrower.approveToken(address(weth), address(pool), type(uint256).max);
        borrower.approveToken(address(usdc), address(pool), type(uint256).max);
        liquidator.approveToken(address(usdc), address(pool), type(uint256).max);

        // 存入初始流动性
        lender.supply(address(pool), address(usdc), 50_000e18);
        borrower.supply(address(pool), address(weth), 10e18);
    }

    // 1. 基础测试：正常借款
    function testBorrowWithinLtv() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        uint256 debt = pool.borrowBalance(address(borrower), address(usdc));
        (uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 borrowCapacityUsd, uint256 healthFactorWad) =
            pool.getAccountSnapshot(address(borrower));

        assert(debt == 10_000e18);
        assert(totalCollateralUsd == 20_000e18);
        assert(totalDebtUsd == 10_000e18);
        assert(borrowCapacityUsd == 15_000e18);
        assert(healthFactorWad > WAD);
    }

    // 2. 基础测试：超出风控被拒绝
    function testRejectsBorrowAboveLtv() public {
        (bool success,) =
            address(borrower).call(abi.encodeCall(Actor.borrow, (address(pool), address(usdc), 16_000e18)));
        assert(!success);
    }

    // 3. 基础测试：正常还款与取款
    function testRepayAndWithdraw() public {
        borrower.borrow(address(pool), address(usdc), 8_000e18);
        uint256 debtBefore = pool.borrowBalance(address(borrower), address(usdc));

        borrower.repay(address(pool), address(usdc), 3_000e18);
        uint256 debtAfter = pool.borrowBalance(address(borrower), address(usdc));

        borrower.withdraw(address(pool), address(weth), 1e18);
        uint256 remainingCollateral = pool.supplyBalance(address(borrower), address(weth));

        assert(debtAfter < debtBefore);
        assert(remainingCollateral == 9e18);
    }

    // 4. 基础测试：计息模型验证
    function testInterestAccruesAcrossBlocks() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        uint256 debtBefore = pool.borrowBalance(address(borrower), address(usdc));

        vm.roll(block.number + 100);

        uint256 debtAfter = pool.borrowBalance(address(borrower), address(usdc));
        assert(debtAfter > debtBefore);
    }

    // 5. 加分项测试：健康仓位不可清算
    function testLiquidationRejectsHealthyPosition() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        (bool success,) = address(liquidator).call(
            abi.encodeCall(Actor.liquidate, (address(pool), address(borrower), address(usdc), address(weth), 1_000e18))
        );
        assert(!success);
    }

    // 6. 加分项测试：预言机跌价与成功清算
    function testLiquidationRepaysDebtAndSeizesCollateral() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        
        // 模拟市场暴跌，使用预言机把价格调成 1000
        wethOracle.updateAnswer(1_000e8);

        (, , , uint256 healthFactorWad) = pool.getAccountSnapshot(address(borrower));
        assert(healthFactorWad < WAD);

        (uint256 previewRepay, uint256 previewSeize,) =
            pool.previewLiquidation(address(borrower), address(usdc), address(weth), 4_000e18);

        assert(previewRepay == 4_000e18);
        assert(previewSeize == 4_200e15);

        liquidator.liquidate(address(pool), address(borrower), address(usdc), address(weth), 4_000e18);

        uint256 remainingDebt = pool.borrowBalance(address(borrower), address(usdc));
        uint256 remainingCollateral = pool.supplyBalance(address(borrower), address(weth));
        uint256 liquidatorCollateral = weth.balanceOf(address(liquidator));

        assert(remainingDebt == 6_000e18);
        assert(remainingCollateral == 5_800e15);
        assert(liquidatorCollateral == 4_200e15);
    }

    // 7. 新更加分项测试：闪电贷完整流程
    function testFlashLoan() public {
        // 1. 部署接收合约
        FlashLoanReceiverMock receiver = new FlashLoanReceiverMock(pool);
        
        // 2. 先给接收合约一点钱，用来支付闪电贷的手续费 (0.09%)
        usdc.mint(address(receiver), 10e18);

        uint256 poolBalanceBefore = usdc.balanceOf(address(pool));

        // 3. 借出 10,000 USDC 的闪电贷
        pool.flashLoan(address(receiver), address(usdc), 10_000e18, "");

        // 4. 验证池子的资金是否增加了 (增加的部分即为收取的手续费)
        uint256 poolBalanceAfter = usdc.balanceOf(address(pool));
        uint256 expectedPremium = (10_000e18 * 9) / 10_000; // 万分之9手续费

        assert(poolBalanceAfter == poolBalanceBefore + expectedPremium);
    }
}