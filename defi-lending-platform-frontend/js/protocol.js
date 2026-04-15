const POOL_ABI = [
    'function owner() view returns (address)',
    'function rewardToken() view returns (address)',
    'function markets(address asset) view returns (bool isListed, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps, uint256 baseRatePerBlockWad, uint256 slopePerBlockWad, uint256 kinkBps, uint256 jumpSlopePerBlockWad, uint256 totalSupplyAssets, uint256 totalSupplyShares, uint256 totalBorrowAssets, uint256 totalBorrowShares, uint256 lastAccrualBlock)',
    'function userSupplyShares(address user, address asset) view returns (uint256)',
    'function userBorrowShares(address user, address asset) view returns (uint256)',
    'function userAccruedRewards(address user) view returns (uint256)',
    'function userRewardLastUpdate(address user, address asset) view returns (uint256)',
    'function getListedAssets() view returns (address[])',
    'function getAssetPrice(address asset) view returns (uint256)',
    'function getMarketState(address asset) view returns (uint256 totalCollateral, uint256 totalDebt, uint256 utilWad, uint256 supplyRateWad, uint256 borrowRateWad)',
    'function getRates(address asset) view returns (uint256 utilizationWad, uint256 supplyRatePerBlockWad, uint256 borrowRatePerBlockWad)',
    'function supplyBalance(address user, address asset) view returns (uint256)',
    'function borrowBalance(address user, address asset) view returns (uint256)',
    'function previewLiquidation(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount) view returns (uint256 actualRepayAmount, uint256 collateralToSeize, uint256 healthFactorWad)',
    'function getAccountSnapshot(address user) view returns (uint256 totalCollateralUsd, uint256 totalDebtUsd, uint256 borrowCapacityUsd, uint256 healthFactorWad)',
    'function availableLiquidity(address asset) view returns (uint256)',
    'function setRewardToken(address rewardToken)',
    'function listMarket(address asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps, uint256 baseRateWad, uint256 slopeWad, uint256 kinkBps, uint256 jumpSlopeWad)',
    'function updateMarket(address asset, address priceFeed, uint256 ltvBps, uint256 liquidationThresholdBps, uint256 baseRateWad, uint256 slopeWad, uint256 kinkBps, uint256 jumpSlopeWad)',
    'function claimRewards()',
    'function supply(address asset, uint256 amount)',
    'function withdraw(address asset, uint256 amount)',
    'function borrow(address asset, uint256 amount)',
    'function repay(address asset, uint256 amount) returns (uint256 actualAmount)',
    'function liquidate(address borrower, address debtAsset, address collateralAsset, uint256 requestedRepayAmount) returns (uint256 actualRepayAmount, uint256 collateralSeized)',
    'function flashLoan(address receiverAddress, address asset, uint256 amount, bytes params)'
];

const ERC20_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address account) view returns (uint256)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 value) returns (bool)'
];

const Protocol = {
    provider: null,
    listenersRegistered: false,

    loadDeploymentConfig() {
        const saved = localStorage.getItem(StorageKeys.deploymentConfig);

        if (!saved) {
            this.emitStateChange();
            return AppState.deployment;
        }

        try {
            const parsed = JSON.parse(saved);
            AppState.deployment.poolAddress = parsed.poolAddress || '';
            AppState.deployment.expectedChainId = parsed.expectedChainId || '';
        } catch (error) {
            console.error('Failed to parse deployment config:', error);
            localStorage.removeItem(StorageKeys.deploymentConfig);
        }

        this.emitStateChange();
        return AppState.deployment;
    },

    saveDeploymentConfig(config) {
        const nextConfig = {
            poolAddress: (config.poolAddress || '').trim(),
            expectedChainId: (config.expectedChainId || '').trim()
        };

        if (nextConfig.poolAddress && !ethers.isAddress(nextConfig.poolAddress)) {
            throw new Error('LendingPool 地址格式无效');
        }

        AppState.deployment = nextConfig;
        localStorage.setItem(StorageKeys.deploymentConfig, JSON.stringify(nextConfig));
        this.emitStateChange();
        return nextConfig;
    },

    loadSession() {
        const saved = localStorage.getItem(StorageKeys.walletSession);

        if (!saved) {
            return null;
        }

        try {
            return JSON.parse(saved);
        } catch (error) {
            console.error('Failed to parse wallet session:', error);
            localStorage.removeItem(StorageKeys.walletSession);
            return null;
        }
    },

    saveSession(account, chainId) {
        const session = {
            sessionToken: Utils.createSessionToken(account, chainId),
            account,
            chainId,
            issuedAt: Date.now(),
            expiresAt: Date.now() + Constants.sessionTtlMs
        };

        AppState.auth = session;
        localStorage.setItem(StorageKeys.walletSession, JSON.stringify(session));
        return session;
    },

    clearSession() {
        AppState.auth = {
            sessionToken: null,
            issuedAt: null,
            expiresAt: null
        };
        localStorage.removeItem(StorageKeys.walletSession);
    },

    async initialize() {
        this.loadDeploymentConfig();
        await this.restoreWalletSession();
        this.registerWalletListeners();

        if (this.isDeploymentConfigured()) {
            try {
                await this.syncProtocolState();
            } catch (error) {
                AppState.protocol.lastError = this.mapError(error);
                this.emitStateChange();
            }
        } else {
            this.emitStateChange();
        }
    },

    isWalletAvailable() {
        return typeof window.ethereum !== 'undefined' && typeof window.ethers !== 'undefined';
    },

    ensureWalletAvailable() {
        if (typeof window.ethereum === 'undefined') {
            throw new Error('未检测到 MetaMask，请先安装浏览器钱包');
        }

        if (typeof window.ethers === 'undefined') {
            throw new Error('Ethers 运行时加载失败，请刷新页面重试');
        }
    },

    async getProvider() {
        this.ensureWalletAvailable();

        if (!this.provider) {
            this.provider = new ethers.BrowserProvider(window.ethereum);
        }

        return this.provider;
    },

    async getSigner() {
        const provider = await this.getProvider();
        return provider.getSigner();
    },

    getPoolAddress() {
        return (AppState.deployment.poolAddress || '').trim();
    },

    isDeploymentConfigured() {
        const poolAddress = this.getPoolAddress();
        return Boolean(poolAddress && ethers.isAddress(poolAddress));
    },

    isExpectedChainMatched() {
        const expectedChainId = (AppState.deployment.expectedChainId || '').trim();

        if (!expectedChainId || !AppState.chainId) {
            return true;
        }

        return String(Utils.chainIdToDecimal(AppState.chainId)) === String(expectedChainId);
    },

    assertTransactionReady() {
        if (!AppState.walletConnected || !AppState.currentAccount) {
            throw new Error('请先连接钱包');
        }

        if (!this.isDeploymentConfigured()) {
            throw new Error('请先在首页配置 LendingPool 地址');
        }

        if (!this.isExpectedChainMatched()) {
            throw new Error('当前钱包网络与配置的 Chain ID 不一致，请切换网络后重试');
        }
    },

    getExpectedNetworkConfig() {
        return Constants.network;
    },

    async switchToExpectedNetwork() {
        this.ensureWalletAvailable();

        const networkConfig = this.getExpectedNetworkConfig();

        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: networkConfig.chainIdHex }]
            });
        } catch (error) {
            if (error?.code !== 4902) {
                throw new Error(this.mapError(error));
            }

            await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: networkConfig.chainIdHex,
                    chainName: networkConfig.chainName,
                    nativeCurrency: networkConfig.nativeCurrency,
                    rpcUrls: networkConfig.rpcUrls,
                    blockExplorerUrls: networkConfig.blockExplorerUrls
                }]
            });
        }

        const chainId = await window.ethereum.request({ method: 'eth_chainId' });
        AppState.chainId = chainId;
        AppState.chainLabel = Utils.getChainLabel(chainId);

        if (AppState.currentAccount) {
            this.saveSession(AppState.currentAccount, chainId);
        }

        if (this.isDeploymentConfigured()) {
            await this.syncProtocolState();
        } else {
            this.emitStateChange();
        }

        return chainId;
    },

    async getPoolContract(withSigner = false) {
        if (!this.isDeploymentConfigured()) {
            throw new Error('尚未配置 LendingPool 地址');
        }

        const runner = withSigner ? await this.getSigner() : await this.getProvider();
        return new ethers.Contract(this.getPoolAddress(), POOL_ABI, runner);
    },

    async getTokenContract(address, withSigner = false) {
        const runner = withSigner ? await this.getSigner() : await this.getProvider();
        return new ethers.Contract(address, ERC20_ABI, runner);
    },

    async restoreWalletSession() {
        const savedSession = this.loadSession();

        if (!window.ethereum) {
            this.clearWalletState();
            return false;
        }

        try {
            const [accounts, chainId] = await Promise.all([
                window.ethereum.request({ method: 'eth_accounts' }),
                window.ethereum.request({ method: 'eth_chainId' })
            ]);

            if (!accounts || accounts.length === 0) {
                this.clearWalletState();
                return false;
            }

            AppState.walletConnected = true;
            AppState.currentAccount = accounts[0];
            AppState.chainId = chainId;
            AppState.chainLabel = Utils.getChainLabel(chainId);

            if (!savedSession || savedSession.account !== accounts[0] || savedSession.chainId !== chainId || this.isSessionExpiringSoon(savedSession)) {
                this.saveSession(accounts[0], chainId);
            } else {
                AppState.auth = savedSession;
            }

            this.emitStateChange();
            return true;
        } catch (error) {
            console.error('Failed to restore wallet session:', error);
            this.clearWalletState();
            return false;
        }
    },

    async connectWallet() {
        this.ensureWalletAvailable();

        try {
            const [accounts, chainId] = await Promise.all([
                window.ethereum.request({ method: 'eth_requestAccounts' }),
                window.ethereum.request({ method: 'eth_chainId' })
            ]);

            if (!accounts || accounts.length === 0) {
                throw new Error('钱包未返回可用账户');
            }

            AppState.walletConnected = true;
            AppState.currentAccount = accounts[0];
            AppState.chainId = chainId;
            AppState.chainLabel = Utils.getChainLabel(chainId);
            this.provider = null;
            this.saveSession(accounts[0], chainId);
            this.registerWalletListeners();

            if (this.isDeploymentConfigured()) {
                await this.syncProtocolState();
            } else {
                this.emitStateChange();
            }

            return {
                success: true,
                account: accounts[0],
                chainId
            };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    disconnectWallet() {
        this.clearWalletState();
        this.emitStateChange();
    },

    clearWalletState() {
        AppState.walletConnected = false;
        AppState.currentAccount = null;
        AppState.chainId = null;
        AppState.chainLabel = '未连接';
        this.clearSession();
        this.provider = null;
        this.resetUserState();
    },

    resetUserState() {
        AppState.protocol.accountSnapshot = Utils.emptyAccountSnapshot();
        AppState.protocol.accruedRewards = 0;
        AppState.protocol.rewardBalance = 0;
        AppState.protocol.assetMap = {};
        AppState.protocol.assets = AppState.protocol.assets.map((asset) => ({
            ...asset,
            walletBalance: 0,
            supplied: 0,
            borrowed: 0,
            allowance: 0,
            rewardLastUpdate: 0,
            supplyShares: 0,
            borrowShares: 0
        }));
    },

    isSessionExpiringSoon(session) {
        if (!session || !session.expiresAt) {
            return true;
        }

        return session.expiresAt - Date.now() < Constants.sessionRenewWindowMs;
    },

    registerWalletListeners() {
        if (this.listenersRegistered || !window.ethereum) {
            return;
        }

        window.ethereum.on('accountsChanged', async (accounts) => {
            try {
                if (!accounts || accounts.length === 0) {
                    this.disconnectWallet();
                    this.emitWalletEvent('wallet:account-changed', null);
                    return;
                }

                AppState.walletConnected = true;
                AppState.currentAccount = accounts[0];
                this.saveSession(accounts[0], AppState.chainId);

                if (this.isDeploymentConfigured()) {
                    await this.syncProtocolState();
                } else {
                    this.emitStateChange();
                }

                this.emitWalletEvent('wallet:account-changed', accounts[0]);
            } catch (error) {
                AppState.protocol.lastError = this.mapError(error);
                this.emitStateChange();
            }
        });

        window.ethereum.on('chainChanged', async (chainId) => {
            try {
                this.provider = null;
                AppState.chainId = chainId;
                AppState.chainLabel = Utils.getChainLabel(chainId);

                if (AppState.currentAccount) {
                    this.saveSession(AppState.currentAccount, chainId);
                }

                if (this.isDeploymentConfigured()) {
                    await this.syncProtocolState();
                } else {
                    this.emitStateChange();
                }

                this.emitWalletEvent('wallet:chain-changed', chainId);
            } catch (error) {
                AppState.protocol.lastError = this.mapError(error);
                this.emitStateChange();
            }
        });

        this.listenersRegistered = true;
    },

    emitWalletEvent(name, detail) {
        document.dispatchEvent(new CustomEvent(name, { detail }));
    },

    emitStateChange() {
        document.dispatchEvent(new CustomEvent('protocol:updated', { detail: AppState }));
    },

    async syncProtocolState() {
        if (!this.isDeploymentConfigured()) {
            AppState.protocol.lastError = '尚未配置 LendingPool 地址';
            this.emitStateChange();
            return AppState.protocol;
        }

        const pool = await this.getPoolContract(false);
        const [owner, rewardToken, listedAssets] = await Promise.all([
            pool.owner(),
            pool.rewardToken(),
            pool.getListedAssets()
        ]);

        const account = AppState.currentAccount;
        const zeroAddress = ethers.ZeroAddress;
        const hasUser = Boolean(account);

        const assets = await Promise.all(
            listedAssets.map(async (assetAddress) => this.buildAssetState(pool, assetAddress, account))
        );

        let accountSnapshot = Utils.emptyAccountSnapshot();
        let accruedRewards = 0;
        let rewardBalance = 0;
        let rewardTokenMeta = null;

        if (hasUser) {
            const snapshot = await pool.getAccountSnapshot(account);
            accountSnapshot = {
                totalCollateralUsd: Utils.bigIntToDecimal(snapshot.totalCollateralUsd),
                totalDebtUsd: Utils.bigIntToDecimal(snapshot.totalDebtUsd),
                borrowCapacityUsd: Utils.bigIntToDecimal(snapshot.borrowCapacityUsd),
                healthFactorWad: snapshot.healthFactorWad === ethers.MaxUint256 ? null : Utils.wadToNumber(snapshot.healthFactorWad)
            };

            accruedRewards = Utils.wadToNumber(await pool.userAccruedRewards(account));
        }

        if (rewardToken && rewardToken !== zeroAddress) {
            const token = await this.getTokenContract(rewardToken, false);
            const [name, symbol, decimals] = await Promise.all([
                token.name().catch(() => 'Reward Token'),
                token.symbol().catch(() => 'RWD'),
                token.decimals().catch(() => 18)
            ]);

            rewardTokenMeta = {
                address: rewardToken,
                name,
                symbol,
                decimals: Number(decimals)
            };

            if (hasUser) {
                rewardBalance = Utils.bigIntToDecimal(await token.balanceOf(account), Number(decimals));
            }
        }

        AppState.protocol.owner = owner;
        AppState.protocol.rewardToken = rewardToken;
        AppState.protocol.rewardTokenMeta = rewardTokenMeta;
        AppState.protocol.isOwner = Boolean(account) && owner.toLowerCase() === account.toLowerCase();
        AppState.protocol.accountSnapshot = accountSnapshot;
        AppState.protocol.accruedRewards = accruedRewards;
        AppState.protocol.rewardBalance = rewardBalance;
        AppState.protocol.assets = assets;
        AppState.protocol.assetMap = Utils.createAssetMap(assets);
        AppState.protocol.lastSyncedAt = Date.now();
        AppState.protocol.lastError = this.isExpectedChainMatched() ? '' : '当前钱包网络与配置 Chain ID 不一致，已切换为只读提示状态';

        this.emitStateChange();
        return AppState.protocol;
    },

    async buildAssetState(pool, assetAddress, account) {
        const token = await this.getTokenContract(assetAddress, false);
        const marketData = await pool.markets(assetAddress);
        const [
            name,
            symbol,
            decimals,
            priceRaw,
            marketState,
            rates,
            liquidityRaw
        ] = await Promise.all([
            token.name().catch(() => 'Unknown Asset'),
            token.symbol().catch(() => assetAddress.slice(0, 6)),
            token.decimals().catch(() => 18),
            pool.getAssetPrice(assetAddress),
            pool.getMarketState(assetAddress),
            pool.getRates(assetAddress),
            pool.availableLiquidity(assetAddress)
        ]);

        const tokenDecimals = Number(decimals);
        const normalizedSymbol = String(symbol).toUpperCase();
        const userCalls = account ? await Promise.all([
            token.balanceOf(account),
            token.allowance(account, this.getPoolAddress()),
            pool.supplyBalance(account, assetAddress),
            pool.borrowBalance(account, assetAddress),
            pool.userSupplyShares(account, assetAddress),
            pool.userBorrowShares(account, assetAddress),
            pool.userRewardLastUpdate(account, assetAddress)
        ]) : [0n, 0n, 0n, 0n, 0n, 0n, 0n];

        const [walletBalanceRaw, allowanceRaw, suppliedRaw, borrowedRaw, supplySharesRaw, borrowSharesRaw, rewardLastUpdateRaw] = userCalls;
        const priceUsd = Utils.wadToNumber(priceRaw);
        const totalSupply = Utils.bigIntToDecimal(marketState.totalCollateral, tokenDecimals);
        const totalBorrow = Utils.bigIntToDecimal(marketState.totalDebt, tokenDecimals);
        const supplyApy = Utils.blockRateToApr(Utils.normalizeBigInt(rates.supplyRatePerBlockWad));
        const borrowApy = Utils.blockRateToApr(Utils.normalizeBigInt(rates.borrowRatePerBlockWad));

        return {
            address: assetAddress,
            name,
            symbol: normalizedSymbol,
            decimals: tokenDecimals,
            icon: Utils.getAssetIcon(normalizedSymbol),
            priceUsd,
            walletBalance: Utils.bigIntToDecimal(walletBalanceRaw, tokenDecimals),
            supplied: Utils.bigIntToDecimal(suppliedRaw, tokenDecimals),
            borrowed: Utils.bigIntToDecimal(borrowedRaw, tokenDecimals),
            allowance: Utils.bigIntToDecimal(allowanceRaw, tokenDecimals),
            allowanceRaw: Utils.normalizeBigInt(allowanceRaw),
            suppliedRaw: Utils.normalizeBigInt(suppliedRaw),
            borrowedRaw: Utils.normalizeBigInt(borrowedRaw),
            walletBalanceRaw: Utils.normalizeBigInt(walletBalanceRaw),
            supplyShares: Utils.bigIntToDecimal(supplySharesRaw),
            borrowShares: Utils.bigIntToDecimal(borrowSharesRaw),
            rewardLastUpdate: Number(Utils.normalizeBigInt(rewardLastUpdateRaw)),
            ltvBps: Number(marketData.ltvBps),
            liquidationThresholdBps: Number(marketData.liquidationThresholdBps),
            totalSupply,
            totalBorrow,
            availableLiquidity: Utils.bigIntToDecimal(liquidityRaw, tokenDecimals),
            utilization: Utils.wadToNumber(rates.utilizationWad) * 100,
            supplyApy,
            borrowApy,
            market: {
                priceFeed: marketData.priceFeed,
                baseRateWad: Utils.normalizeBigInt(marketData.baseRatePerBlockWad).toString(),
                slopeWad: Utils.normalizeBigInt(marketData.slopePerBlockWad).toString(),
                kinkBps: Number(marketData.kinkBps),
                jumpSlopeWad: Utils.normalizeBigInt(marketData.jumpSlopePerBlockWad).toString(),
                totalSupplyAssets: Utils.normalizeBigInt(marketData.totalSupplyAssets).toString(),
                totalBorrowAssets: Utils.normalizeBigInt(marketData.totalBorrowAssets).toString(),
                totalSupplyShares: Utils.normalizeBigInt(marketData.totalSupplyShares).toString(),
                totalBorrowShares: Utils.normalizeBigInt(marketData.totalBorrowShares).toString(),
                lastAccrualBlock: Utils.normalizeBigInt(marketData.lastAccrualBlock).toString()
            }
        };
    },

    getAsset(reference) {
        return Utils.resolveAsset(reference);
    },

    async parseAssetAmount(reference, amount) {
        const asset = this.getAsset(reference);

        if (!asset) {
            throw new Error('未找到对应的资产配置');
        }

        const normalizedAmount = String(amount || '').trim();

        if (!normalizedAmount || Number(normalizedAmount) <= 0) {
            throw new Error('请输入大于 0 的金额');
        }

        return {
            asset,
            amountRaw: ethers.parseUnits(normalizedAmount, asset.decimals)
        };
    },

    async ensureApproval(reference, amountRaw) {
        const asset = this.getAsset(reference);

        if (!asset) {
            throw new Error('未找到可授权的资产');
        }

        if (asset.allowanceRaw >= amountRaw) {
            return null;
        }

        const token = await this.getTokenContract(asset.address, true);
        const tx = await token.approve(this.getPoolAddress(), ethers.MaxUint256);
        await tx.wait();
        return tx.hash;
    },

    async sendTransaction(action) {
        this.assertTransactionReady();

        try {
            const tx = await action();
            const receipt = await tx.wait();
            await this.syncProtocolState();
            return {
                txHash: tx.hash,
                receipt
            };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    async supply(reference, amount) {
        const { asset, amountRaw } = await this.parseAssetAmount(reference, amount);

        if (asset.walletBalanceRaw < amountRaw) {
            throw new Error('钱包余额不足');
        }

        let approvalHash = null;

        try {
            approvalHash = await this.ensureApproval(asset.address, amountRaw);
            const pool = await this.getPoolContract(true);
            const result = await this.sendTransaction(() => pool.supply(asset.address, amountRaw));
            return { ...result, approvalHash };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    async withdraw(reference, amount) {
        const { asset, amountRaw } = await this.parseAssetAmount(reference, amount);

        if (asset.suppliedRaw < amountRaw) {
            throw new Error('提取数量超过当前存款');
        }

        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.withdraw(asset.address, amountRaw));
    },

    async borrow(reference, amount) {
        const { asset, amountRaw } = await this.parseAssetAmount(reference, amount);
        const amountUsd = Number(amount) * asset.priceUsd;

        if (amountUsd > AppState.protocol.accountSnapshot.borrowCapacityUsd + 1e-8) {
            throw new Error(`超过可借额度，当前剩余 ${Utils.formatCurrency(AppState.protocol.accountSnapshot.borrowCapacityUsd)}`);
        }

        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.borrow(asset.address, amountRaw));
    },

    async repay(reference, amount) {
        const { asset, amountRaw } = await this.parseAssetAmount(reference, amount);

        if (asset.borrowedRaw === 0n) {
            throw new Error('当前资产没有待偿还债务');
        }

        let approvalHash = null;

        try {
            approvalHash = await this.ensureApproval(asset.address, amountRaw);
            const pool = await this.getPoolContract(true);
            const result = await this.sendTransaction(() => pool.repay(asset.address, amountRaw));
            return { ...result, approvalHash };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    async claimRewards() {
        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.claimRewards());
    },

    async previewLiquidation({ borrower, debtAsset, collateralAsset, amount }) {
        const borrowerAddress = (borrower || '').trim();

        if (!ethers.isAddress(borrowerAddress)) {
            throw new Error('请输入有效的借款人地址');
        }

        const { asset: debtAssetState, amountRaw } = await this.parseAssetAmount(debtAsset, amount);
        const collateralAssetState = this.getAsset(collateralAsset);

        if (!collateralAssetState) {
            throw new Error('未找到抵押资产');
        }

        try {
            const pool = await this.getPoolContract(false);
            const preview = await pool.previewLiquidation(
                borrowerAddress,
                debtAssetState.address,
                collateralAssetState.address,
                amountRaw
            );

            return {
                actualRepayAmount: Utils.bigIntToDecimal(preview.actualRepayAmount, debtAssetState.decimals),
                collateralToSeize: Utils.bigIntToDecimal(preview.collateralToSeize, collateralAssetState.decimals),
                healthFactor: preview.healthFactorWad === ethers.MaxUint256 ? null : Utils.wadToNumber(preview.healthFactorWad),
                debtAsset: debtAssetState,
                collateralAsset: collateralAssetState
            };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    async liquidate({ borrower, debtAsset, collateralAsset, amount }) {
        const borrowerAddress = (borrower || '').trim();

        if (!ethers.isAddress(borrowerAddress)) {
            throw new Error('请输入有效的借款人地址');
        }

        const { asset: debtAssetState, amountRaw } = await this.parseAssetAmount(debtAsset, amount);
        const collateralAssetState = this.getAsset(collateralAsset);

        if (!collateralAssetState) {
            throw new Error('未找到抵押资产');
        }

        let approvalHash = null;

        try {
            approvalHash = await this.ensureApproval(debtAssetState.address, amountRaw);
            const pool = await this.getPoolContract(true);
            const result = await this.sendTransaction(() => pool.liquidate(
                borrowerAddress,
                debtAssetState.address,
                collateralAssetState.address,
                amountRaw
            ));
            return { ...result, approvalHash };
        } catch (error) {
            throw new Error(this.mapError(error));
        }
    },

    async flashLoan({ receiverAddress, asset, amount, paramsHex }) {
        const receiver = (receiverAddress || '').trim();

        if (!ethers.isAddress(receiver)) {
            throw new Error('请输入有效的 Flash Loan Receiver 地址');
        }

        const { asset: assetState, amountRaw } = await this.parseAssetAmount(asset, amount);
        const params = (paramsHex || '0x').trim() || '0x';

        if (!ethers.isHexString(params)) {
            throw new Error('Flash loan 参数必须是 0x 开头的十六进制字节串');
        }

        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.flashLoan(receiver, assetState.address, amountRaw, params));
    },

    async setRewardToken(address) {
        const rewardToken = (address || '').trim();

        if (!ethers.isAddress(rewardToken)) {
            throw new Error('请输入有效的奖励代币地址');
        }

        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.setRewardToken(rewardToken));
    },

    async listMarket(payload) {
        const data = this.normalizeMarketPayload(payload);
        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.listMarket(
            data.asset,
            data.priceFeed,
            data.ltvBps,
            data.liquidationThresholdBps,
            data.baseRateWad,
            data.slopeWad,
            data.kinkBps,
            data.jumpSlopeWad
        ));
    },

    async updateMarket(payload) {
        const data = this.normalizeMarketPayload(payload);
        const pool = await this.getPoolContract(true);
        return this.sendTransaction(() => pool.updateMarket(
            data.asset,
            data.priceFeed,
            data.ltvBps,
            data.liquidationThresholdBps,
            data.baseRateWad,
            data.slopeWad,
            data.kinkBps,
            data.jumpSlopeWad
        ));
    },

    normalizeMarketPayload(payload) {
        const asset = (payload.asset || '').trim();
        const priceFeed = (payload.priceFeed || '').trim();

        if (!ethers.isAddress(asset)) {
            throw new Error('资产地址无效');
        }

        if (!ethers.isAddress(priceFeed)) {
            throw new Error('预言机地址无效');
        }

        return {
            asset,
            priceFeed,
            ltvBps: Utils.parseUint(payload.ltvBps, 'LTV BPS'),
            liquidationThresholdBps: Utils.parseUint(payload.liquidationThresholdBps, 'Liquidation Threshold BPS'),
            baseRateWad: Utils.parseUint(payload.baseRateWad, 'Base Rate WAD'),
            slopeWad: Utils.parseUint(payload.slopeWad, 'Slope WAD'),
            kinkBps: Utils.parseUint(payload.kinkBps, 'Kink BPS'),
            jumpSlopeWad: Utils.parseUint(payload.jumpSlopeWad, 'Jump Slope WAD')
        };
    },

    mapError(error) {
        const message = error?.shortMessage || error?.reason || error?.message || '未知错误';

        if (error?.code === 4001) {
            return '你已在钱包中取消本次操作';
        }

        if (error?.code === -32002) {
            return 'MetaMask 正在处理上一次请求，请先完成钱包弹窗中的操作';
        }

        if (error?.code === 4902) {
            return '当前网络尚未添加到钱包，请先在 MetaMask 中添加对应网络';
        }

        if (message.includes('insufficient allowance')) {
            return '代币授权额度不足，请先完成授权';
        }

        if (message.includes('insufficient balance')) {
            return '代币余额不足';
        }

        if (message.includes('execution reverted:')) {
            return message.split('execution reverted:').pop().trim();
        }

        if (message.includes('user rejected')) {
            return '你已在钱包中取消本次操作';
        }

        if (message.includes('not owner')) {
            return '当前钱包不是合约 owner，无权执行管理员操作';
        }

        if (message.includes('network changed')) {
            return '检测到钱包网络切换，请刷新页面后重试';
        }

        if (message.includes('Unrecognized chain ID')) {
            return '钱包尚未添加 Sepolia 网络，请先添加后重试';
        }

        return message;
    }
};

window.Protocol = Protocol;
