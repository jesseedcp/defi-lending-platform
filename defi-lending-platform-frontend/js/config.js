const StorageKeys = {
    deploymentConfig: 'defi-lending:deployment-config',
    walletSession: 'defi-lending:wallet-session'
};

const Constants = {
    sessionTtlMs: 4 * 60 * 60 * 1000,
    sessionRenewWindowMs: 30 * 60 * 1000,
    blocksPerYear: 2_628_000,
    network: {
        chainId: '11155111',
        chainIdHex: '0xaa36a7',
        chainName: 'Sepolia Testnet',
        nativeCurrency: {
            name: 'Sepolia ETH',
            symbol: 'ETH',
            decimals: 18
        },
        rpcUrls: ['https://eth-sepolia.g.alchemy.com/v2/2GYv4ydbfSpLHXMdD0XLa'],
        blockExplorerUrls: ['https://sepolia.etherscan.io']
    },
    deployedContracts: {
        lendingPool: '0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac',
        usdc: '0x36fDF6b89ed07B6D8457739b27F57E41025A12e6',
        weth: '0x8965Af6756303c5A9312479f3797687a9B70c84e',
        gov: '0xda58c1c86855c63408517cE32008DEE67Cd665dc'
    }
};

const AppState = {
    walletConnected: false,
    currentAccount: null,
    chainId: null,
    chainLabel: '未连接',
    auth: {
        sessionToken: null,
        issuedAt: null,
        expiresAt: null
    },
    deployment: {
        poolAddress: '0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac',
        expectedChainId: '11155111'
    },
    protocol: {
        owner: null,
        rewardToken: null,
        rewardTokenMeta: null,
        isOwner: false,
        assets: [],
        assetMap: {},
        accruedRewards: 0,
        rewardBalance: 0,
        accountSnapshot: {
            totalCollateralUsd: 0,
            totalDebtUsd: 0,
            borrowCapacityUsd: 0,
            healthFactorWad: null
        },
        lastSyncedAt: null,
        lastError: ''
    }
};

const Utils = {
    normalizeBigInt(value) {
        if (typeof value === 'bigint') {
            return value;
        }

        if (typeof value === 'number') {
            return BigInt(Math.trunc(value));
        }

        if (typeof value === 'string') {
            return value ? BigInt(value) : 0n;
        }

        return 0n;
    },

    bigIntToDecimal(value, decimals = 18) {
        return Number(ethers.formatUnits(this.normalizeBigInt(value), decimals));
    },

    wadToNumber(value) {
        return this.bigIntToDecimal(value, 18);
    },

    blockRateToApr(rateWad) {
        return this.wadToNumber(rateWad) * Constants.blocksPerYear * 100;
    },

    chainIdToDecimal(chainId) {
        if (typeof chainId === 'number') {
            return chainId;
        }

        if (typeof chainId === 'string' && chainId.startsWith('0x')) {
            return parseInt(chainId, 16);
        }

        return Number(chainId || 0);
    },

    getChainLabel(chainId) {
        const decimalId = this.chainIdToDecimal(chainId);
        const chainLabels = {
            1: 'Ethereum Mainnet',
            5: 'Goerli',
            10: 'Optimism',
            137: 'Polygon',
            42161: 'Arbitrum One',
            11155111: 'Sepolia',
            31337: 'Anvil Localhost'
        };

        return chainLabels[decimalId] || `Chain ${decimalId}`;
    },

    createSessionToken(account, chainId) {
        const payload = `${account}:${chainId}:${Date.now()}`;
        return btoa(payload);
    },

    shortenAddress(address, left = 6, right = 4) {
        if (!address) {
            return '未连接';
        }

        return `${address.slice(0, left)}...${address.slice(-right)}`;
    },

    formatCurrency(value, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(Number(value || 0));
    },

    formatPercent(value, decimals = 2) {
        return `${Number(value || 0).toFixed(decimals)}%`;
    },

    formatToken(amount, symbol, decimals) {
        const precision = typeof decimals === 'number' ? decimals : ['USDC', 'USDT', 'DAI'].includes(symbol) ? 2 : 4;
        return `${Number(amount || 0).toFixed(precision)} ${symbol}`;
    },

    formatHealthFactor(value) {
        if (value === null || value === undefined) {
            return '∞';
        }

        if (!Number.isFinite(value)) {
            return '∞';
        }

        return Number(value).toFixed(3);
    },

    formatSessionExpiry(expiresAt) {
        if (!expiresAt) {
            return '未创建';
        }

        return new Date(expiresAt).toLocaleString();
    },

    getAssetIcon(symbol) {
        const iconMap = {
            WETH: 'Ξ',
            ETH: 'Ξ',
            USDC: '$',
            USDT: '$',
            DAI: '◈',
            GOV: '🪙'
        };

        return iconMap[symbol] || symbol.slice(0, 1);
    },

    parseUint(value, label) {
        const normalized = String(value || '').trim();

        if (!/^\d+$/.test(normalized)) {
            throw new Error(`${label} 必须是非负整数`);
        }

        return BigInt(normalized);
    },

    emptyAccountSnapshot() {
        return {
            totalCollateralUsd: 0,
            totalDebtUsd: 0,
            borrowCapacityUsd: 0,
            healthFactorWad: null
        };
    },

    createAssetMap(assets) {
        return assets.reduce((accumulator, asset) => {
            accumulator[asset.address.toLowerCase()] = asset;
            accumulator[asset.symbol.toUpperCase()] = asset;
            return accumulator;
        }, {});
    },

    resolveAsset(reference) {
        if (!reference) {
            return null;
        }

        const normalizedReference = String(reference).trim();
        return AppState.protocol.assetMap[normalizedReference.toLowerCase()] || AppState.protocol.assetMap[normalizedReference.toUpperCase()] || null;
    },

    calculateLtvRatio() {
        const { totalCollateralUsd, totalDebtUsd } = AppState.protocol.accountSnapshot;

        if (!totalCollateralUsd) {
            return 0;
        }

        return totalDebtUsd / totalCollateralUsd;
    },

    calculateWeightedLiquidationThreshold() {
        const suppliedAssets = AppState.protocol.assets.filter((asset) => asset.supplied > 0);

        if (suppliedAssets.length === 0) {
            return 0;
        }

        const { weightedThreshold, totalSuppliedUsd } = suppliedAssets.reduce((accumulator, asset) => {
            const suppliedValueUsd = asset.supplied * asset.priceUsd;
            accumulator.totalSuppliedUsd += suppliedValueUsd;
            accumulator.weightedThreshold += suppliedValueUsd * (asset.liquidationThresholdBps / 100);
            return accumulator;
        }, { weightedThreshold: 0, totalSuppliedUsd: 0 });

        if (!totalSuppliedUsd) {
            return 0;
        }

        return weightedThreshold / totalSuppliedUsd;
    },

    calculateHealthFactorAfter(reference, amount, mode) {
        const asset = this.resolveAsset(reference);

        if (!asset) {
            return AppState.protocol.accountSnapshot.healthFactorWad;
        }

        const normalizedAmount = Number(amount || 0);
        const nextDebtUsd = mode === 'borrow'
            ? AppState.protocol.accountSnapshot.totalDebtUsd + (normalizedAmount * asset.priceUsd)
            : Math.max(0, AppState.protocol.accountSnapshot.totalDebtUsd - (normalizedAmount * asset.priceUsd));

        if (nextDebtUsd <= 0) {
            return null;
        }

        const suppliedAssets = AppState.protocol.assets.filter((currentAsset) => currentAsset.supplied > 0);
        const adjustedCollateralUsd = suppliedAssets.reduce((total, currentAsset) => {
            const suppliedValueUsd = currentAsset.supplied * currentAsset.priceUsd;
            return total + (suppliedValueUsd * currentAsset.liquidationThresholdBps / 10_000);
        }, 0);

        if (!adjustedCollateralUsd) {
            return 0;
        }

        return adjustedCollateralUsd / nextDebtUsd;
    }
};

window.AppState = AppState;
window.StorageKeys = StorageKeys;
window.Constants = Constants;
window.Utils = Utils;
