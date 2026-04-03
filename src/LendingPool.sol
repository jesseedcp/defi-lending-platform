// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";

interface AggregatorV3Interface {
  function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

interface IFlashLoanReceiver {
    function executeOperation(address asset, uint256 amount, uint256 premium, address initiator, bytes calldata params) external returns (bool);
}

contract LendingPool {
    uint256 public constant WAD = 1e18;
    uint256 public constant BPS = 10_000;
    uint256 public constant LIQUIDATION_BONUS_BPS = 10_500;
    uint256 public constant FLASHLOAN_PREMIUM_BPS = 9;

    // ==========================================
    // 加分项：流动性挖矿 (每区块奖励 1 个代币)
    // ==========================================
    address public rewardToken;
    uint256 public constant REWARD_PER_BLOCK_WAD = 1e18; 
    mapping(address => mapping(address => uint256)) public userRewardLastUpdate;
    mapping(address => uint256) public userAccruedRewards;

    struct Market {
        bool isListed;
        address priceFeed; 
        uint256 ltvBps;
        uint256 liquidationThresholdBps;
        
        // ==========================================
        // 加分项：拐点利率模型 (Kinked Rate Model)
        // ==========================================
        uint256 baseRatePerBlockWad;
        uint256 slopePerBlockWad;     // 拐点前的平缓斜率
        uint256 kinkBps;              // 拐点 (例如 8000 = 80% 利用率)
        uint256 jumpSlopePerBlockWad; // 拐点后的陡峭斜率 (防止资金池被抽干)

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

    event MarketListed(address indexed asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps);
    event MarketUpdated(address indexed asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps);
    event InterestAccrued(address indexed asset, uint256 interestAccrued);
    event Supplied(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Withdrawn(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Borrowed(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Repaid(address indexed user, address indexed asset, uint256 amount, uint256 shares);
    event Liquidated(address indexed liquidator, address indexed borrower, address indexed debtAsset, address collateralAsset, uint256 repaidAmount, uint256 collateralSeized);
    event FlashLoan(address indexed receiver, address indexed asset, uint256 amount, uint256 premium);
    event RewardsClaimed(address indexed user, uint256 amount); 

    modifier onlyOwner() {
        _onlyOwner();
        _;
    }

    function _onlyOwner() internal view {
        require(msg.sender == owner, "not owner");
    }

    constructor() {
        owner = msg.sender;
    }

    // 设置流动性挖矿的奖励代币
    function setRewardToken(address _rewardToken) external onlyOwner {
        rewardToken = _rewardToken;
    }

    function getAssetPrice(address asset) public view returns (uint256) {
        _requireListed(asset);
        address feed = markets[asset].priceFeed;
        require(feed != address(0), "price feed not set");
        
        (, int256 price, , , ) = AggregatorV3Interface(feed).latestRoundData();
        require(price > 0, "invalid oracle price");
        
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint256(price) * 1e10;
    }

    function listMarket(
        address asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps,
        uint256 baseRateWad, uint256 slopeWad, uint256 kinkBps, uint256 jumpSlopeWad
    ) external onlyOwner {
        require(asset != address(0), "zero asset");
        require(!markets[asset].isListed, "market exists");
        require(priceFeed != address(0), "zero feed"); 
        _validateRiskParams(ltvBps, liquidationThresholdBps);

        markets[asset] = Market({
            isListed: true, priceFeed: priceFeed, ltvBps: ltvBps, liquidationThresholdBps: liquidationThresholdBps,
            baseRatePerBlockWad: baseRateWad, slopePerBlockWad: slopeWad, kinkBps: kinkBps, jumpSlopePerBlockWad: jumpSlopeWad,
            totalSupplyAssets: 0, totalSupplyShares: 0, totalBorrowAssets: 0, totalBorrowShares: 0, lastAccrualBlock: block.number
        });
        listedAssets.push(asset);
        emit MarketListed(asset, priceFeed, ltvBps, liquidationThresholdBps);
    }

    function updateMarket(
        address asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps,
        uint256 baseRateWad, uint256 slopeWad, uint256 kinkBps, uint256 jumpSlopeWad
    ) external onlyOwner {
        _requireListed(asset);
        require(priceFeed != address(0), "zero feed");
        _validateRiskParams(ltvBps, liquidationThresholdBps);
        _accrue(asset);

        Market storage market = markets[asset];
        market.priceFeed = priceFeed; market.ltvBps = ltvBps; market.liquidationThresholdBps = liquidationThresholdBps;
        market.baseRatePerBlockWad = baseRateWad; market.slopePerBlockWad = slopeWad;
        market.kinkBps = kinkBps; market.jumpSlopePerBlockWad = jumpSlopeWad;
        emit MarketUpdated(asset, priceFeed, ltvBps, liquidationThresholdBps);
    }

    // ==========================================
    // 流动性挖矿核心逻辑
    // ==========================================
    function _updateRewards(address user, address asset) internal {
        Market storage market = markets[asset];
        uint256 lastUpdate = userRewardLastUpdate[user][asset];

        if (lastUpdate == 0) {
            userRewardLastUpdate[user][asset] = block.number;
            return;
        }

        uint256 userShares = userSupplyShares[user][asset] + userBorrowShares[user][asset];
        uint256 totalShares = market.totalSupplyShares + market.totalBorrowShares;

        if (userShares > 0 && totalShares > 0) {
            uint256 blockDelta = block.number - lastUpdate;
            uint256 reward = (userShares * blockDelta * REWARD_PER_BLOCK_WAD) / totalShares;
            userAccruedRewards[user] += reward;
        }
        userRewardLastUpdate[user][asset] = block.number;
    }

    function claimRewards() external {
        for (uint256 i = 0; i < listedAssets.length; i++) {
            _updateRewards(msg.sender, listedAssets[i]);
        }
        uint256 rewardToClaim = userAccruedRewards[msg.sender];
        require(rewardToClaim > 0, "no rewards");
        require(rewardToken != address(0), "reward token not set");

        userAccruedRewards[msg.sender] = 0;
        require(IERC20(rewardToken).transfer(msg.sender, rewardToClaim), "transfer failed");
        emit RewardsClaimed(msg.sender, rewardToClaim);
    }

    function supply(address asset, uint256 amount) external {
        require(amount > 0, "amount=0");
        _accrue(asset);
        _updateRewards(msg.sender, asset);

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
        _updateRewards(msg.sender, asset); 

        Market storage market = markets[asset];
        uint256 userAssets = _supplyBalanceStored(msg.sender, asset);
        require(userAssets >= amount, "insufficient supply");
        require(IERC20(asset).balanceOf(address(this)) >= amount, "insufficient liquidity");

        uint256 shares = amount == userAssets ? userSupplyShares[msg.sender][asset] : _toSharesUp(amount, market.totalSupplyAssets, market.totalSupplyShares);
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
        _updateRewards(msg.sender, asset); 

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
        _updateRewards(msg.sender, asset); 

        Market storage market = markets[asset];
        uint256 debt = _borrowBalanceStored(msg.sender, asset);
        require(debt > 0, "no debt");

        actualAmount = amount > debt ? debt : amount;
        uint256 shares = actualAmount == debt ? userBorrowShares[msg.sender][asset] : _toSharesUp(actualAmount, market.totalBorrowAssets, market.totalBorrowShares);
        require(shares > 0, "zero shares");

        require(IERC20(asset).transferFrom(msg.sender, address(this), actualAmount), "transfer failed");

        userBorrowShares[msg.sender][asset] -= shares;
        market.totalBorrowShares -= shares;
        market.totalBorrowAssets -= actualAmount;
        emit Repaid(msg.sender, asset, actualAmount, shares);
    }

    function liquidate(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount)
        external returns (uint256 actualRepayAmount, uint256 collateralSeized)
    {
        require(borrower != address(0), "zero borrower");
        require(borrower != msg.sender, "self liquidation");
        require(requestedRepayAmount > 0, "amount=0");

        _accrue(debtAsset);
        if (collateralAsset != debtAsset) _accrue(collateralAsset); else _requireListed(collateralAsset);

        _updateRewards(borrower, debtAsset);
        if (collateralAsset != debtAsset) _updateRewards(borrower, collateralAsset);

        (, , , uint256 healthFactorWad) = getAccountSnapshot(borrower);
        require(healthFactorWad < WAD, "position healthy");

        (actualRepayAmount, collateralSeized,) = previewLiquidation(borrower, debtAsset, collateralAsset, requestedRepayAmount);
        require(actualRepayAmount > 0 && collateralSeized > 0, "liquidation failed");
        require(IERC20(collateralAsset).balanceOf(address(this)) >= collateralSeized, "insufficient liquidity");

        Market storage debtMarket = markets[debtAsset];
        Market storage collateralMarket = markets[collateralAsset];

        uint256 borrowerDebt = _borrowBalanceStored(borrower, debtAsset);
        uint256 debtShares = actualRepayAmount == borrowerDebt ? userBorrowShares[borrower][debtAsset] : _toSharesUp(actualRepayAmount, debtMarket.totalBorrowAssets, debtMarket.totalBorrowShares);
        uint256 borrowerCollateral = _supplyBalanceStored(borrower, collateralAsset);
        uint256 collateralShares = collateralSeized == borrowerCollateral ? userSupplyShares[borrower][collateralAsset] : _toSharesUp(collateralSeized, collateralMarket.totalSupplyAssets, collateralMarket.totalSupplyShares);

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

    function flashLoan(address receiverAddress, address asset, uint256 amount, bytes calldata params) external {
        require(amount > 0, "amount=0");
        _requireListed(asset);
        _accrue(asset); 

        uint256 currentLiquidity = IERC20(asset).balanceOf(address(this));
        require(currentLiquidity >= amount, "insufficient liquidity");

        uint256 premium = (amount * FLASHLOAN_PREMIUM_BPS) / BPS;
        require(IERC20(asset).transfer(receiverAddress, amount), "transfer failed");
        require(IFlashLoanReceiver(receiverAddress).executeOperation(asset, amount, premium, msg.sender, params), "flashloan failed");

        require(IERC20(asset).transferFrom(receiverAddress, address(this), amount + premium), "repayment failed");
        markets[asset].totalSupplyAssets += premium;
        emit FlashLoan(receiverAddress, asset, amount, premium);
    }

    function getListedAssets() external view returns (address[] memory) { return listedAssets; }

    // ==========================================
    // 加分项：前端图表超级 API (Historical Analytics Support)
    // ==========================================
    function getMarketState(address asset) external view returns (
        uint256 totalCollateral, uint256 totalDebt, uint256 utilWad, uint256 supplyRateWad, uint256 borrowRateWad
    ) {
        _requireListed(asset);
        (totalCollateral, totalDebt) = _previewTotals(asset);
        (utilWad, supplyRateWad, borrowRateWad) = this.getRates(asset);
    }

    function getRates(address asset) external view returns (uint256 utilizationWad, uint256 supplyRatePerBlockWad, uint256 borrowRatePerBlockWad) {
        _requireListed(asset);
        (uint256 totalSupplyAssets, uint256 totalBorrowAssets) = _previewTotals(asset);
        if (totalSupplyAssets == 0) return (0, 0, markets[asset].baseRatePerBlockWad);

        utilizationWad = (totalBorrowAssets * WAD) / totalSupplyAssets;
        uint256 kinkWad = (markets[asset].kinkBps * WAD) / BPS;
        
        if (utilizationWad <= kinkWad) {
            borrowRatePerBlockWad = markets[asset].baseRatePerBlockWad + (utilizationWad * markets[asset].slopePerBlockWad) / WAD;
        } else {
            uint256 normalRate = markets[asset].baseRatePerBlockWad + (kinkWad * markets[asset].slopePerBlockWad) / WAD;
            uint256 excessUtil = utilizationWad - kinkWad;
            borrowRatePerBlockWad = normalRate + (excessUtil * markets[asset].jumpSlopePerBlockWad) / WAD;
        }
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

    function previewLiquidation(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount) public view returns (uint256 actualRepayAmount, uint256 collateralToSeize, uint256 healthFactorWad) {
        _requireListed(debtAsset); _requireListed(collateralAsset);
        (, , , healthFactorWad) = getAccountSnapshot(borrower);
        if (healthFactorWad >= WAD) return (0, 0, healthFactorWad);

        uint256 debtBalance = borrowBalance(borrower, debtAsset);
        uint256 collateralBalance = supplyBalance(borrower, collateralAsset);
        if (debtBalance == 0 || collateralBalance == 0 || requestedRepayAmount == 0) return (0, 0, healthFactorWad);

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

    function getAccountSnapshot(address user) public view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 borrowCapacityUsd, uint256 healthFactorWad) {
        uint256 adjustedCollateralUsd;
        for (uint256 i = 0; i < listedAssets.length; i++) {
            address asset = listedAssets[i];
            Market storage market = markets[asset];
            uint256 currentPrice = getAssetPrice(asset);

            uint256 supplied = supplyBalance(user, asset);
            if (supplied > 0) {
                uint256 suppliedValueUsd = (supplied * currentPrice) / WAD;
                totalCollateralUsd += suppliedValueUsd;
                borrowCapacityUsd += (suppliedValueUsd * market.ltvBps) / BPS;
                adjustedCollateralUsd += (suppliedValueUsd * market.liquidationThresholdBps) / BPS;
            }
            uint256 borrowed = borrowBalance(user, asset);
            if (borrowed > 0) totalDebtUsd += (borrowed * currentPrice) / WAD;
        }
        healthFactorWad = totalDebtUsd == 0 ? type(uint256).max : (adjustedCollateralUsd * WAD) / totalDebtUsd;
    }

    function availableLiquidity(address asset) external view returns (uint256) {
        _requireListed(asset); return IERC20(asset).balanceOf(address(this));
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
        (, , uint256 borrowRatePerBlockWad) = this.getRates(asset);
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
        uint256 kinkWad = (market.kinkBps * WAD) / BPS;
        uint256 borrowRatePerBlockWad;
        
        if (utilizationWad <= kinkWad) {
            borrowRatePerBlockWad = market.baseRatePerBlockWad + (utilizationWad * market.slopePerBlockWad) / WAD;
        } else {
            uint256 normalRate = market.baseRatePerBlockWad + (kinkWad * market.slopePerBlockWad) / WAD;
            uint256 excessUtil = utilizationWad - kinkWad;
            borrowRatePerBlockWad = normalRate + (excessUtil * market.jumpSlopePerBlockWad) / WAD;
        }
        
        uint256 interest = (totalBorrowAssets * borrowRatePerBlockWad * blockDelta) / WAD;
        totalBorrowAssets += interest;
        totalSupplyAssets += interest;
    }

    function _supplyBalanceStored(address user, address asset) internal view returns (uint256) {
        return _toAssetsDown(userSupplyShares[user][asset], markets[asset].totalSupplyAssets, markets[asset].totalSupplyShares);
    }
    function _borrowBalanceStored(address user, address asset) internal view returns (uint256) {
        return _toAssetsUp(userBorrowShares[user][asset], markets[asset].totalBorrowAssets, markets[asset].totalBorrowShares);
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
    function _requireListed(address asset) internal view { require(markets[asset].isListed, "market not listed"); }
    function _toSharesDown(uint256 a, uint256 ta, uint256 ts) internal pure returns (uint256) { if(a==0) return 0; if(ta==0||ts==0) return a; return (a*ts)/ta; }
    function _toSharesUp(uint256 a, uint256 ta, uint256 ts) internal pure returns (uint256) { if(a==0) return 0; if(ta==0||ts==0) return a; return ((a*ts)+ta-1)/ta; }
    function _toAssetsDown(uint256 s, uint256 ta, uint256 ts) internal pure returns (uint256) { if(s==0||ta==0||ts==0) return 0; return (s*ta)/ts; }
    function _toAssetsUp(uint256 s, uint256 ta, uint256 ts) internal pure returns (uint256) { if(s==0||ta==0||ts==0) return 0; return ((s*ta)+ts-1)/ts; }
}