/**
 * DeFi Lending Protocol - Configuration
 * Global constants and mock data configuration
 * COMP5568 Course Project
 */

// Global application state
const AppState = {
    walletConnected: false,
    currentAccount: null,
    chainId: null,
    
    // Mock user portfolio data
    portfolio: {
        ETH: {
            supplied: 2.5,          // ETH supplied
            borrowed: 0,            // ETH borrowed
            supplyApy: 2.5,         // Supply APY %
            borrowApy: 3.8,         // Borrow APY %
            price: 3200,            // Price in USD
            collateralEnabled: true, // Used as collateral
            balance: 5.0            // User wallet balance
        },
        USDC: {
            supplied: 5000,         // USDC supplied
            borrowed: 2000,         // USDC borrowed
            supplyApy: 5.2,         // Supply APY %
            borrowApy: 6.5,         // Borrow APY %
            price: 1.0,             // Price in USD
            collateralEnabled: false,
            balance: 10000          // User wallet balance
        }
    },
    
    // Protocol parameters
    protocolParams: {
        maxLTV: 0.75,               // Maximum Loan-to-Value ratio (75%)
        liquidationThreshold: 0.80, // Liquidation threshold (80%)
        ethCollateralFactor: 0.85,  // ETH collateral factor
        usdcCollateralFactor: 0.90  // USDC collateral factor
    }
};

// Utility functions for calculations
const Utils = {
    /**
     * Calculate total collateral value in USD
     */
    calculateTotalCollateral() {
        let total = 0;
        for (const [asset, data] of Object.entries(AppState.portfolio)) {
            if (data.collateralEnabled) {
                total += data.supplied * data.price;
            }
        }
        return total;
    },
    
    /**
     * Calculate total debt value in USD
     */
    calculateTotalDebt() {
        let total = 0;
        for (const [asset, data] of Object.entries(AppState.portfolio)) {
            total += data.borrowed * data.price;
        }
        return total;
    },
    
    /**
     * Calculate Health Factor (HF)
     * HF = (Total Collateral × Collateral Factor) / Total Debt
     * HF ≥ 1 is safe, HF < 1 can be liquidated
     */
    calculateHealthFactor() {
        const totalCollateral = this.calculateTotalCollateral();
        const totalDebt = this.calculateTotalDebt();
        
        if (totalDebt === 0) return Infinity; // No debt = infinite HF
        
        // Calculate weighted collateral value
        let weightedCollateral = 0;
        for (const [asset, data] of Object.entries(AppState.portfolio)) {
            if (data.collateralEnabled) {
                const factor = asset === 'ETH' ? 
                    AppState.protocolParams.ethCollateralFactor : 
                    AppState.protocolParams.usdcCollateralFactor;
                weightedCollateral += data.supplied * data.price * factor;
            }
        }
        
        return weightedCollateral / totalDebt;
    },
    
    /**
     * Calculate LTV (Loan-to-Value) ratio
     * LTV = Total Debt / Total Collateral
     */
    calculateLTV() {
        const totalCollateral = this.calculateTotalCollateral();
        const totalDebt = this.calculateTotalDebt();
        
        if (totalCollateral === 0) return 0;
        return totalDebt / totalCollateral;
    },
    
    /**
     * Calculate borrow capacity
     * Available to borrow = (Total Collateral × Max LTV) - Current Debt
     */
    calculateBorrowCapacity() {
        const totalCollateral = this.calculateTotalCollateral();
        const totalDebt = this.calculateTotalDebt();
        const maxLTV = AppState.protocolParams.maxLTV;
        
        const maxBorrow = totalCollateral * maxLTV;
        const available = maxBorrow - totalDebt;
        
        return Math.max(0, available);
    },
    
    /**
     * Format currency value
     */
    formatCurrency(value, decimals = 2) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value);
    },
    
    /**
     * Format token amount
     */
    formatToken(amount, symbol) {
        const decimals = symbol === 'ETH' ? 4 : 2;
        return `${amount.toFixed(decimals)} ${symbol}`;
    },
    
    /**
     * Shorten wallet address for display
     */
    shortenAddress(address) {
        if (!address) return 'Not Connected';
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
    },
    
    /**
     * Check if position is safe
     */
    isPositionSafe() {
        const hf = this.calculateHealthFactor();
        return hf >= 1 || hf === Infinity;
    }
};
