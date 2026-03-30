// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {LendingPool} from "../src/LendingPool.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

interface Vm {
    function roll(uint256 newHeight) external;
}

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

    function setUp() public {
        pool = new LendingPool();
        usdc = new MockERC20("Mock USD Coin", "mUSDC", 18);
        weth = new MockERC20("Mock Wrapped Ether", "mWETH", 18);
        lender = new Actor();
        borrower = new Actor();
        liquidator = new Actor();

        pool.listMarket(address(usdc), 1e18, 9_000, 9_500, 1e12, 4e12);
        pool.listMarket(address(weth), 2_000e18, 7_500, 8_000, 1e12, 4e12);

        usdc.mint(address(lender), 100_000e18);
        weth.mint(address(borrower), 10e18);
        usdc.mint(address(liquidator), 20_000e18);

        lender.approveToken(address(usdc), address(pool), type(uint256).max);
        borrower.approveToken(address(weth), address(pool), type(uint256).max);
        borrower.approveToken(address(usdc), address(pool), type(uint256).max);
        liquidator.approveToken(address(usdc), address(pool), type(uint256).max);

        lender.supply(address(pool), address(usdc), 50_000e18);
        borrower.supply(address(pool), address(weth), 10e18);
    }

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

    function testRejectsBorrowAboveLtv() public {
        (bool success,) =
            address(borrower).call(abi.encodeCall(Actor.borrow, (address(pool), address(usdc), 16_000e18)));

        assert(!success);
    }

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

    function testInterestAccruesAcrossBlocks() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        uint256 debtBefore = pool.borrowBalance(address(borrower), address(usdc));

        vm.roll(block.number + 100);

        uint256 debtAfter = pool.borrowBalance(address(borrower), address(usdc));
        assert(debtAfter > debtBefore);
    }

    function testLiquidationRejectsHealthyPosition() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);

        (bool success,) = address(liquidator).call(
            abi.encodeCall(Actor.liquidate, (address(pool), address(borrower), address(usdc), address(weth), 1_000e18))
        );

        assert(!success);
    }

    function testLiquidationRepaysDebtAndSeizesCollateral() public {
        borrower.borrow(address(pool), address(usdc), 10_000e18);
        pool.setPrice(address(weth), 1_000e18);

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
}
