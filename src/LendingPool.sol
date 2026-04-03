// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

// ==========================================
// 接口：Chainlink 预言机
// ==========================================
interface AggregatorV3Interface {
  function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

// ==========================================
// 接口：闪电贷接收者
// ==========================================
interface IFlashLoanReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool);
}

contract LendingPool {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant LIQUIDATION_BONUS_BPS = 10_500;
    
    // 闪电贷手续费 (万分之9 = 0.09%)
    uint256 public constant FLASHLOAN_PREMIUM_BPS = 9;

    struct Market {
        bool isListed;
        address priceFeed; // 使用 Chainlink 喂价合约地址
        uint256 ltvBps;
        uint256 liquidationThresholdBps;
        uint256 baseRatePerBlockWad;
        uint256 slopePerBlockWad;
        uint256 totalSupplyAssets;
        uint256 totalSupplyShares;
        uint256 totalBorrowAssets;
        uint256 totalBorrowShares;
        uint256 lastAccrualBlock;
    }

    address public owner;
    address[] public listedAssets;

    mapping(address => Market) public markets;
    mapping(address => mapping(address => uint256)) public userSupplyShares;
    mapping(address => mapping(address => uint256)) public userBorrowShares;

    event MarketListed(
        address indexed asset,
        address priceFeed,
        uint256 ltvBps,
        uint256 liquidationThresholdBps,
        uint256 baseRatePerBlockWad,
        uint256 slopePerBlockWad
    );
    event MarketUpdated(
        address indexed asset,
        address priceFeed,
        uint256 ltvBps,
        uint256 liquidationThresholdBps,
        uint256 baseRatePerBlockWad,
        uint256 slopePerBlockWad
    );
    
    event InterestAccrued(address indexed asset, uint256 interestAccrued);
    event Supplied(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Repaid(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Liquidated(
        address indexed liquidator,
        address indexed borrower,
        address indexed debtAsset,
        address collateralAsset,
        uint256 repaidAmount,
        uint256 collateralSeized
    );
    event FlashLoan(address indexed receiver, address indexed asset, uint256 amount, uint256 premium);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    // ==========================================
    // 动态获取资产价格
    // ==========================================
    function getAssetPrice(address asset) public view returns (uint256) {
        _requireListed(asset);
        address feed = markets[asset].priceFeed;
        require(feed != address(0), "price feed not set");
        
        (, int256 price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        require(price > 0, "invalid oracle price");
        
        // Chainlink USD 对通常是 8 decimals，我们要将其放大到 18 decimals (WAD)
        return uint256(price) * 1e10;
    }

    function listMarket(
        address asset,
        address priceFeed,
        uint256 ltvBps,
        uint256 liquidationThresholdBps,
        uint256 baseRatePerBlockWad,
        uint256 slopePerBlockWad
    ) external onlyOwner {
        require(asset != address(0), "zero asset");
        require(!markets[asset].isListed, "market exists");
        require(priceFeed != address(0), "zero feed"); 
        _validateRiskParams(ltvBps, liquidationThresholdBps);

        markets[asset] = Market({
            isListed: true,
            priceFeed: priceFeed, 
            ltvBps: ltvBps,
            liquidationThresholdBps: liquidationThresholdBps,
            baseRatePerBlockWad: baseRatePerBlockWad,
            slopePerBlockWad: slopePerBlockWad,
            totalSupplyAssets: 0,
            totalSupplyShares: 0,
            totalBorrowAssets: 0,
            totalBorrowShares: 0,
            lastAccrualBlock: block.number
        });

        listedAssets.push(asset);

        emit MarketListed(asset, priceFeed, ltvBps, liquidationThresholdBps, baseRatePerBlockWad, slopePerBlockWad);
    }

    function updateMarket(
        address asset,
        address priceFeed, 
        uint256 ltvBps,
        uint256 liquidationThresholdBps,
        uint256 baseRatePerBlockWad,
        uint256 slopePerBlockWad
    ) external onlyOwner {
        _requireListed(asset);
        require(priceFeed != address(0), "zero feed");
        _validateRiskParams(ltvBps, liquidationThresholdBps);
        _accrue(asset);

        Market storage market = markets[asset];
        market.priceFeed = priceFeed; 
        market.ltvBps = ltvBps;
        market.liquidationThresholdBps = liquidationThresholdBps;
        market.baseRatePerBlockWad = baseRatePerBlockWad;
        market.slopePerBlockWad = slopePerBlockWad;

        emit MarketUpdated(asset, priceFeed, ltvBps, liquidationThresholdBps, baseRatePerBlockWad, slopePerBlockWad);
    }

    function supply(address asset, uint256 amount) external {
        require(amount > 0, "amount=0");
        _accrue(asset);

        Market storage market = markets[asset];
        uint256 shares = _toSharesDown(amount, market.totalSupplyAssets, market.totalSupplyShares);
        require(shares > 0, "zero shares");

        require(IERC20(asset).transferFrom(msg.sender, address(this), amount), "transfer failed");

        market.totalSupplyAssets += amount;
        market.totalSupplyShares += shares;
        userSupplyShares[msg.sender][asset] += shares;

        emit Supplied(msg.sender, asset, amount, shares);
    }

    function withdraw(address asset, uint256 amount) external {
        require(amount > 0, "amount=0");
        _accrue(asset);

        Market storage market = markets[asset];
        uint256 userAssets = _supplyBalanceStored(msg.sender, asset);
        require(userAssets >= amount, "insufficient supply");

        require(IERC20(asset).balanceOf(address(this)) >= amount, "insufficient liquidity");

        uint256 shares = amount == userAssets
            ? userSupplyShares[msg.sender][asset]
            : _toSharesUp(amount, market.totalSupplyAssets, market.totalSupplyShares);

        require(shares > 0, "zero shares");

        userSupplyShares[msg.sender][asset] -= shares;
        market.totalSupplyShares -= shares;
        market.totalSupplyAssets -= amount;

        _assertAccountHealthy(msg.sender);

        require(IERC20(asset).transfer(msg.sender, amount), "transfer failed");
        emit Withdrawn(msg.sender, asset, amount, shares);
    }

    function borrow(address asset, uint256 amount) external {
        require(amount > 0, "amount=0");
        _accrue(asset);

        Market storage market = markets[asset];
        require(IERC20(asset).balanceOf(address(this)) >= amount, "insufficient liquidity");

        uint256 shares = _toSharesUp(amount, market.totalBorrowAssets, market.totalBorrowShares);
        require(shares > 0, "zero shares");

        userBorrowShares[msg.sender][asset] += shares;
        market.totalBorrowShares += shares;
        market.totalBorrowAssets += amount;

        _assertAccountHealthy(msg.sender);

        require(IERC20(asset).transfer(msg.sender, amount), "transfer failed");
        emit Borrowed(msg.sender, asset, amount, shares);
    }

    function repay(address asset, uint256 amount) external returns (uint256 actualAmount) {
        require(amount > 0, "amount=0");
        _accrue(asset);

        Market storage market = markets[asset];
        uint256 debt = _borrowBalanceStored(msg.sender, asset);
        require(debt > 0, "no debt");

        actualAmount = amount > debt ? debt : amount;
        uint256 shares = actualAmount == debt
            ? userBorrowShares[msg.sender][asset]
            : _toSharesUp(actualAmount, market.totalBorrowAssets, market.totalBorrowShares);

        require(shares > 0, "zero shares");

        require(IERC20(asset).transferFrom(msg.sender, address(this), actualAmount), "transfer failed");

        userBorrowShares[msg.sender][asset] -= shares;
        market.totalBorrowShares -= shares;
        market.totalBorrowAssets -= actualAmount;

        emit Repaid(msg.sender, asset, actualAmount, shares);
    }

    function liquidate(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount)
        external
        returns (uint256 actualRepayAmount, uint256 collateralSeized)
    {
        require(borrower != address(0), "zero borrower");
        require(borrower != msg.sender, "self liquidation");
        require(requestedRepayAmount > 0, "amount=0");

        _accrue(debtAsset);
        if (collateralAsset != debtAsset) {
            _accrue(collateralAsset);
        } else {
            _requireListed(collateralAsset);
        }

        (, , , uint256 healthFactorWad) = getAccountSnapshot(borrower);
        require(healthFactorWad < WAD, "position healthy");

        (actualRepayAmount, collateralSeized,) =
            previewLiquidation(borrower, debtAsset, collateralAsset, requestedRepayAmount);

        require(actualRepayAmount > 0, "nothing to liquidate");
        require(collateralSeized > 0, "no collateral seized");
        require(IERC20(collateralAsset).balanceOf(address(this)) >= collateralSeized, "insufficient collateral liquidity");

        Market storage debtMarket = markets[debtAsset];
        Market storage collateralMarket = markets[collateralAsset];

        uint256 borrowerDebt = _borrowBalanceStored(borrower, debtAsset);
        uint256 debtShares = actualRepayAmount == borrowerDebt
            ? userBorrowShares[borrower][debtAsset]
            : _toSharesUp(actualRepayAmount, debtMarket.totalBorrowAssets, debtMarket.totalBorrowShares);

        uint256 borrowerCollateral = _supplyBalanceStored(borrower, collateralAsset);
        uint256 collateralShares = collateralSeized == borrowerCollateral
            ? userSupplyShares[borrower][collateralAsset]
            : _toSharesUp(collateralSeized, collateralMarket.totalSupplyAssets, collateralMarket.totalSupplyShares);

        require(IERC20(debtAsset).transferFrom(msg.sender, address(this), actualRepayAmount), "transfer failed");

        userBorrowShares[borrower][debtAsset] -= debtShares;
        debtMarket.totalBorrowShares -= debtShares;
        debtMarket.totalBorrowAssets -= actualRepayAmount;

        userSupplyShares[borrower][collateralAsset] -= collateralShares;
        collateralMarket.totalSupplyShares -= collateralShares;
        collateralMarket.totalSupplyAssets -= collateralSeized;

        require(IERC20(collateralAsset).transfer(msg.sender, collateralSeized), "transfer failed");

        emit Liquidated(msg.sender, borrower, debtAsset, collateralAsset, actualRepayAmount, collateralSeized);
    }

    // ==========================================
    // 闪电贷功能
    // ==========================================
    function flashLoan(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params
    ) external {
        require(amount > 0, "amount=0");
        _requireListed(asset);
        _accrue(asset); 

        // 修复：变量名从 availableLiquidity 改为 currentLiquidity 避免冲突
        uint256 currentLiquidity = IERC20(asset).balanceOf(address(this));
        require(currentLiquidity >= amount, "insufficient liquidity");

        uint256 premium = (amount * FLASHLOAN_PREMIUM_BPS) / BPS;

        require(IERC20(asset).transfer(receiverAddress, amount), "transfer failed");

        require(
            IFlashLoanReceiver(receiverAddress).executeOperation(
                asset, amount, premium, msg.sender, params
            ),
            "invalid flashloan execution"
        );

        uint256 amountToReturn = amount + premium;
        require(
            IERC20(asset).transferFrom(receiverAddress, address(this), amountToReturn),
            "flashloan repayment failed"
        );

        markets[asset].totalSupplyAssets += premium;
        emit FlashLoan(receiverAddress, asset, amount, premium);
    }

    function getListedAssets() external view returns (address[] memory) {
        return listedAssets;
    }

    function getRates(address asset) external view returns (uint256 utilizationWad, uint256 supplyRatePerBlockWad, uint256 borrowRatePerBlockWad) {
        _requireListed(asset);
        (uint256 totalSupplyAssets, uint256 totalBorrowAssets) = _previewTotals(asset);

        if (totalSupplyAssets == 0) return (0, 0, markets[asset].baseRatePerBlockWad);

        utilizationWad = (totalBorrowAssets * WAD) / totalSupplyAssets;
        borrowRatePerBlockWad = markets[asset].baseRatePerBlockWad + (utilizationWad * markets[asset].slopePerBlockWad) / WAD;
        supplyRatePerBlockWad = (utilizationWad * borrowRatePerBlockWad) / WAD;
    }

    function supplyBalance(address user, address asset) public view returns (uint256) {
        _requireListed(asset);
        (uint256 totalSupplyAssets, ) = _previewTotals(asset);
        return _toAssetsDown(userSupplyShares[user][asset], totalSupplyAssets, markets[asset].totalSupplyShares);
    }

    function borrowBalance(address user, address asset) public view returns (uint256) {
        _requireListed(asset);
        (, uint256 totalBorrowAssets) = _previewTotals(asset);
        return _toAssetsUp(userBorrowShares[user][asset], totalBorrowAssets, markets[asset].totalBorrowShares);
    }

    function previewLiquidation(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount)
        public view returns (uint256 actualRepayAmount, uint256 collateralToSeize, uint256 healthFactorWad)
    {
        _requireListed(debtAsset);
        _requireListed(collateralAsset);

        (, , , healthFactorWad) = getAccountSnapshot(borrower);
        if (healthFactorWad >= WAD) return (0, 0, healthFactorWad);

        uint256 debtBalance = borrowBalance(borrower, debtAsset);
        uint256 collateralBalance = supplyBalance(borrower, collateralAsset);

        if (debtBalance == 0 || collateralBalance == 0 || requestedRepayAmount == 0) return (0, 0, healthFactorWad);

        // 使用动态获取的价格
        uint256 debtPrice = getAssetPrice(debtAsset);
        uint256 collateralPrice = getAssetPrice(collateralAsset);

        uint256 maxRepayByRequest = requestedRepayAmount < debtBalance ? requestedRepayAmount : debtBalance;
        uint256 maxCollateralValueUsd = (collateralBalance * collateralPrice) / WAD;

        uint256 maxRepayValueUsd = (maxCollateralValueUsd * BPS) / LIQUIDATION_BONUS_BPS;
        uint256 maxRepayByCollateral = (maxRepayValueUsd * WAD) / debtPrice;

        actualRepayAmount = maxRepayByRequest < maxRepayByCollateral ? maxRepayByRequest : maxRepayByCollateral;
        if (actualRepayAmount == 0) return (0, 0, healthFactorWad);

        uint256 repayValueUsd = (actualRepayAmount * debtPrice) / WAD;
        uint256 seizeValueUsd = (repayValueUsd * LIQUIDATION_BONUS_BPS) / BPS;
        collateralToSeize = (seizeValueUsd * WAD) / collateralPrice;

        if (collateralToSeize > collateralBalance) collateralToSeize = collateralBalance;
    }

    function getAccountSnapshot(address user)
        public view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 borrowCapacityUsd, uint256 healthFactorWad)
    {
        uint256 adjustedCollateralUsd;

        for (uint256 i = 0; i < listedAssets.length; i++) {
            address asset = listedAssets[i];
            Market storage market = markets[asset];
            
            // 使用动态获取的价格
            uint256 currentPrice = getAssetPrice(asset);

            uint256 supplied = supplyBalance(user, asset);
            if (supplied > 0) {
                uint256 suppliedValueUsd = (supplied * currentPrice) / WAD;
                totalCollateralUsd += suppliedValueUsd;
                borrowCapacityUsd += (suppliedValueUsd * market.ltvBps) / BPS;
                adjustedCollateralUsd += (suppliedValueUsd * market.liquidationThresholdBps) / BPS;
            }

            uint256 borrowed = borrowBalance(user, asset);
            if (borrowed > 0) {
                totalDebtUsd += (borrowed * currentPrice) / WAD;
            }
        }

        healthFactorWad = totalDebtUsd == 0 ? type(uint256).max : (adjustedCollateralUsd * WAD) / totalDebtUsd;
    }

    function availableLiquidity(address asset) external view returns (uint256) {
        _requireListed(asset);
        return IERC20(asset).balanceOf(address(this));
    }

    function _accrue(address asset) internal {
        _requireListed(asset);
        Market storage market = markets[asset];

        if (block.number <= market.lastAccrualBlock) return;
        if (market.totalBorrowAssets == 0 || market.totalSupplyAssets == 0) {
            market.lastAccrualBlock = block.number;
            return;
        }

        uint256 blockDelta = block.number - market.lastAccrualBlock;
        uint256 utilizationWad = (market.totalBorrowAssets * WAD) / market.totalSupplyAssets;
        uint256 borrowRatePerBlockWad = market.baseRatePerBlockWad + (utilizationWad * market.slopePerBlockWad) / WAD;
        uint256 interest = (market.totalBorrowAssets * borrowRatePerBlockWad * blockDelta) / WAD;

        if (interest > 0) {
            market.totalBorrowAssets += interest;
            market.totalSupplyAssets += interest;
            emit InterestAccrued(asset, interest);
        }

        market.lastAccrualBlock = block.number;
    }

    function _previewTotals(address asset) internal view returns (uint256 totalSupplyAssets, uint256 totalBorrowAssets) {
        Market storage market = markets[asset];
        totalSupplyAssets = market.totalSupplyAssets;
        totalBorrowAssets = market.totalBorrowAssets;

        if (block.number <= market.lastAccrualBlock) return (totalSupplyAssets, totalBorrowAssets);
        if (totalBorrowAssets == 0 || totalSupplyAssets == 0) return (totalSupplyAssets, totalBorrowAssets);

        uint256 blockDelta = block.number - market.lastAccrualBlock;
        uint256 utilizationWad = (totalBorrowAssets * WAD) / totalSupplyAssets;
        uint256 borrowRatePerBlockWad = market.baseRatePerBlockWad + (utilizationWad * market.slopePerBlockWad) / WAD;
        uint256 interest = (totalBorrowAssets * borrowRatePerBlockWad * blockDelta) / WAD;

        totalBorrowAssets += interest;
        totalSupplyAssets += interest;
    }

    function _supplyBalanceStored(address user, address asset) internal view returns (uint256) {
        Market storage market = markets[asset];
        return _toAssetsDown(userSupplyShares[user][asset], market.totalSupplyAssets, market.totalSupplyShares);
    }

    function _borrowBalanceStored(address user, address asset) internal view returns (uint256) {
        Market storage market = markets[asset];
        return _toAssetsUp(userBorrowShares[user][asset], market.totalBorrowAssets, market.totalBorrowShares);
    }

    function _assertAccountHealthy(address user) internal view {
        (, uint256 totalDebtUsd, uint256 borrowCapacityUsd, uint256 healthFactorWad) = getAccountSnapshot(user);
        require(totalDebtUsd <= borrowCapacityUsd, "LTV exceeded");
        require(healthFactorWad >= WAD, "health factor too low");
    }

    function _validateRiskParams(uint256 ltvBps, uint256 liquidationThresholdBps) internal pure {
        require(ltvBps > 0 && ltvBps <= BPS, "bad LTV");
        require(liquidationThresholdBps >= ltvBps && liquidationThresholdBps <= BPS, "bad threshold");
    }

    function _requireListed(address asset) internal view {
        require(markets[asset].isListed, "market not listed");
    }

    function _toSharesDown(uint256 assets, uint256 totalAssets, uint256 totalShares) internal pure returns (uint256) {
        if (assets == 0) return 0;
        if (totalAssets == 0 || totalShares == 0) return assets;
        return (assets * totalShares) / totalAssets;
    }

    function _toSharesUp(uint256 assets, uint256 totalAssets, uint256 totalShares) internal pure returns (uint256) {
        if (assets == 0) return 0;
        if (totalAssets == 0 || totalShares == 0) return assets;
        return ((assets * totalShares) + totalAssets - 1) / totalAssets;
    }

    function _toAssetsDown(uint256 shares, uint256 totalAssets, uint256 totalShares) internal pure returns (uint256) {
        if (shares == 0 || totalAssets == 0 || totalShares == 0) return 0;
        return (shares * totalAssets) / totalShares;
    }

    function _toAssetsUp(uint256 shares, uint256 totalAssets, uint256 totalShares) internal pure returns (uint256) {
        if (shares == 0 || totalAssets == 0 || totalShares == 0) return 0;
        return ((shares * totalAssets) + totalShares - 1) / totalShares;
    }
}