// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingPool} from "../src/LendingPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockV3Aggregator} from "../src/mocks/MockV3Aggregator.sol"; 

interface Vm {
    function roll(uint256 newHeight) external;
}

contract Actor {
    function approveToken(address token, address spender, uint256 amount) external { IERC20(token).approve(spender, amount); }
    function supply(address pool, address asset, uint256 amount) external { LendingPool(pool).supply(asset, amount); }
    function borrow(address pool, address asset, uint256 amount) external { LendingPool(pool).borrow(asset, amount); }
    function repay(address pool, address asset, uint256 amount) external { LendingPool(pool).repay(asset, amount); }
    function withdraw(address pool, address asset, uint256 amount) external { LendingPool(pool).withdraw(asset, amount); }
    function liquidate(address p, address b, address d, address c, uint256 r) external { LendingPool(p).liquidate(b, d, c, r); }
    function claimRewards(address pool) external { LendingPool(pool).claimRewards(); }
}

contract FlashLoanReceiverMock {
    LendingPool public pool;
    constructor(LendingPool _pool) { pool = _pool; }
    function executeOperation(address asset, uint256 amount, uint256 premium, address, bytes calldata) external returns (bool) {
        IERC20(asset).approve(address(pool), amount + premium);
        return true;
    }
}

contract LendingPoolTest {
    address internal constant HEVM_ADDRESS = address(uint160(uint256(keccak256("hevm cheat code"))));
    Vm internal constant VM = Vm(HEVM_ADDRESS); // 修复大写 Linter
    uint256 internal constant WAD = 1e18;

    LendingPool internal pool;
    MockERC20 internal usdc;
    MockERC20 internal weth;
    MockERC20 internal govToken; 
    
    Actor internal lender;
    Actor internal borrower;
    Actor internal liquidator;
    
    MockV3Aggregator internal usdcOracle;
    MockV3Aggregator internal wethOracle;

    function setUp() public {
        pool = new LendingPool();
        usdc = new MockERC20("USD Coin", "USDC", 18);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        govToken = new MockERC20("Governance Token", "GOV", 18); 

        lender = new Actor();
        borrower = new Actor();
        liquidator = new Actor();

        usdcOracle = new MockV3Aggregator(1e8);       
        wethOracle = new MockV3Aggregator(2000e8);    

        pool.setRewardToken(address(govToken));
        govToken.mint(address(pool), 1_000_000e18);

        pool.listMarket(address(usdc), address(usdcOracle), 9_000, 9_500, 1e12, 4e12, 8_000, 20e12);
        pool.listMarket(address(weth), address(wethOracle), 7_500, 8_000, 1e12, 4e12, 8_000, 20e12);

        usdc.mint(address(lender), 100_000e18);
        weth.mint(address(borrower), 10e18);
        usdc.mint(address(liquidator), 20_000e18);

        lender.approveToken(address(usdc), address(pool), type(uint256).max);
        borrower.approveToken(address(weth), address(pool), type(uint256).max);
        borrower.approveToken(address(usdc), address(pool), type(uint256).max);
        liquidator.approveToken(address(usdc), address(pool), type(uint256).max);

        VM.roll(100);
        lender.supply(address(pool), address(usdc), 50_000e18);
        borrower.supply(address(pool), address(weth), 10e18);
    }

    function testBorrowWithinLtv() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        assert(pool.borrowBalance(address(borrower), address(usdc)) == 10_000e18);
    }

    function testRejectsBorrowAboveLtv() public {
        (bool success,) = address(borrower).call(abi.encodeCall(Actor.borrow, (address(pool), address(usdc), 16_000e18)));
        assert(!success);
    }

    function testRepayAndWithdraw() public {
        borrower.borrow(address(pool), address(usdc), 8_000e18);
        uint256 debtBefore = pool.borrowBalance(address(borrower), address(usdc));
        borrower.repay(address(pool), address(usdc), 3_000e18);
        borrower.withdraw(address(pool), address(weth), 1e18);
        assert(pool.borrowBalance(address(borrower), address(usdc)) < debtBefore);
        assert(pool.supplyBalance(address(borrower), address(weth)) == 9e18);
    }

    function testInterestAccruesAcrossBlocks() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        uint256 debtBefore = pool.borrowBalance(address(borrower), address(usdc));
        VM.roll(block.number + 100);
        assert(pool.borrowBalance(address(borrower), address(usdc)) > debtBefore);
    }

    function testLiquidationRejectsHealthyPosition() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        (bool success,) = address(liquidator).call(abi.encodeCall(Actor.liquidate, (address(pool), address(borrower), address(usdc), address(weth), 1_000e18)));
        assert(!success);
    }

    function testLiquidationRepaysDebtAndSeizesCollateral() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        wethOracle.updateAnswer(1_000e8);
        liquidator.liquidate(address(pool), address(borrower), address(usdc), address(weth), 4_000e18);
        assert(pool.borrowBalance(address(borrower), address(usdc)) == 6_000e18);
        assert(weth.balanceOf(address(liquidator)) == 4_200e15);
    }

    function testFlashLoan() public {
        FlashLoanReceiverMock receiver = new FlashLoanReceiverMock(pool);
        usdc.mint(address(receiver), 10e18);
        uint256 poolBalanceBefore = usdc.balanceOf(address(pool));
        pool.flashLoan(address(receiver), address(usdc), 10_000e18, "");
        assert(usdc.balanceOf(address(pool)) == poolBalanceBefore + 9e18); 
    }

    function testLiquidityMiningRewards() public {
        VM.roll(block.number + 10);
        lender.claimRewards(address(pool));
        uint256 rewardBalance = govToken.balanceOf(address(lender));
        assert(rewardBalance > 0);
    }

    function testKinkedInterestRate() public {
        // 修复部分：额外给 borrower 充值，让他有额度借出巨款，以达到拐点
        weth.mint(address(borrower), 40e18);
        borrower.supply(address(pool), address(weth), 40e18);

        borrower.borrow(address(pool), address(usdc), 45_000e18);
        
        (, , uint256 borrowRate) = pool.getRates(address(usdc));
        
        assert(borrowRate > 1e12 + 4e12); 
    }
}