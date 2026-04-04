/**
 * DeFi Lending Protocol - Main Application Logic
 * Handles page initialization, UI updates, and common functions
 * COMP5568 Course Project
 */

// Initialize application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DeFi Lending Protocol initialized');
    
    // DO NOT auto-connect wallet on page load
    // Only check previous connection state for display purposes
    Wallet.checkPreviousConnection();
    
    // Initialize page-specific logic
    initializePage();
});

/**
 * Initialize page based on current URL
 */
function initializePage() {
    const currentPage = window.location.pathname.split('/').pop();
    
    console.log('📄 Current page:', currentPage);
    
    switch(currentPage) {
        case 'index.html':
        case '':
            initHomePage();
            break;
        case 'dashboard.html':
            initDashboardPage();
            break;
        case 'deposit.html':
            initDepositPage();
            break;
        case 'borrow.html':
            initBorrowPage();
            break;
    }
}

/**
 * Home Page (index.html) initialization
 */
function initHomePage() {
    const connectBtn = document.getElementById('connectWalletBtn');
    const walletInfo = document.getElementById('walletInfo');
    const errorMessage = document.getElementById('errorMessage');
    const goToDashboardBtn = document.getElementById('goToDashboardBtn');
    
    if (!connectBtn) return;
    
    // Only update UI if previously connected (from localStorage)
    if (AppState.walletConnected && AppState.currentAccount) {
        updateWalletInfoUI(walletInfo, errorMessage);
        connectBtn.style.display = 'none';
        walletInfo.style.display = 'block';
    }
    
    // Connect wallet button click handler - ONLY connect when user clicks
    connectBtn.addEventListener('click', async () => {
        try {
            errorMessage.style.display = 'none';
            connectBtn.disabled = true;
            connectBtn.textContent = '⏳ Connecting...';
            
            const result = await Wallet.connect();
            
            if (result.success) {
                updateWalletInfoUI(walletInfo, errorMessage);
                connectBtn.style.display = 'none';
                walletInfo.style.display = 'block';
            }
            
        } catch (error) {
            errorMessage.textContent = error.message || 'Failed to connect wallet';
            errorMessage.style.display = 'block';
            connectBtn.disabled = false;
            connectBtn.textContent = '🔗 Connect Wallet';
        }
    });
    
    // Go to dashboard button
    if (goToDashboardBtn) {
        goToDashboardBtn.addEventListener('click', () => {
            window.location.href = 'dashboard.html';
        });
    }
}

/**
 * Update wallet info UI on home page
 */
function updateWalletInfoUI(walletInfo, errorMessage) {
    const addressEl = document.getElementById('walletAddress');
    const chainIdEl = document.getElementById('chainId');
    const statusEl = document.getElementById('connectionStatus');
    
    if (addressEl) {
        addressEl.textContent = AppState.currentAccount;
    }
    
    if (chainIdEl) {
        chainIdEl.textContent = Wallet.formatChainId(AppState.chainId);
    }
    
    if (statusEl) {
        statusEl.textContent = 'Connected ✅';
        statusEl.className = 'value status-connected';
    }
}

/**
 * Dashboard Page (dashboard.html) initialization
 */
function initDashboardPage() {
    updateHeaderWalletAddress();
    renderDashboardMetrics();
    renderAssetDetails();
}

/**
 * Update wallet address in header
 */
function updateHeaderWalletAddress() {
    const addressEl = document.getElementById('headerWalletAddress');
    if (addressEl) {
        if (AppState.walletConnected && AppState.currentAccount) {
            addressEl.textContent = Utils.shortenAddress(AppState.currentAccount);
        } else {
            addressEl.textContent = 'Not Connected';
        }
    }
}

/**
 * Render dashboard metrics cards
 */
function renderDashboardMetrics() {
    const totalCollateral = Utils.calculateTotalCollateral();
    const totalDebt = Utils.calculateTotalDebt();
    const healthFactor = Utils.calculateHealthFactor();
    const ltv = Utils.calculateLTV();
    const borrowCapacity = Utils.calculateBorrowCapacity();
    
    // Update metric values
    updateElementText('totalCollateral', Utils.formatCurrency(totalCollateral));
    updateElementText('totalDebt', Utils.formatCurrency(totalDebt));
    
    // Health Factor display
    const hfEl = document.getElementById('healthFactor');
    if (hfEl) {
        if (healthFactor === Infinity) {
            hfEl.textContent = '∞';
        } else {
            hfEl.textContent = healthFactor.toFixed(3);
        }
    }
    
    updateElementText('ltvRatio', `${(ltv * 100).toFixed(2)}%`);
    updateElementText('borrowCapacity', Utils.formatCurrency(borrowCapacity));
    
    // Update risk banner
    updateRiskBanner(healthFactor);
}

/**
 * Update risk status banner
 */
function updateRiskBanner(healthFactor) {
    const banner = document.getElementById('riskBanner');
    const riskIcon = document.getElementById('riskIcon');
    const riskText = document.getElementById('riskText');
    
    if (!banner) return;
    
    if (healthFactor === Infinity || healthFactor >= 1) {
        banner.className = 'risk-banner risk-safe';
        riskIcon.textContent = '✅';
        riskText.textContent = 'Your position is safe';
    } else {
        banner.className = 'risk-banner risk-warning';
        riskIcon.textContent = '⚠️';
        riskText.textContent = 'Warning! Risk of liquidation';
    }
}

/**
 * Render asset details
 */
function renderAssetDetails() {
    // ETH data
    updateElementText('ethSupplied', Utils.formatToken(AppState.portfolio.ETH.supplied, 'ETH'));
    updateElementText('ethSupplyApy', `${AppState.portfolio.ETH.supplyApy}%`);
    updateElementText('ethBorrowed', Utils.formatToken(AppState.portfolio.ETH.borrowed, 'ETH'));
    updateElementText('ethBorrowApy', `${AppState.portfolio.ETH.borrowApy}%`);
    updateElementText('ethAsCollateral', AppState.portfolio.ETH.collateralEnabled ? 'Yes ✅' : 'No ❌');
    
    // USDC data
    updateElementText('usdcSupplied', Utils.formatToken(AppState.portfolio.USDC.supplied, 'USDC'));
    updateElementText('usdcSupplyApy', `${AppState.portfolio.USDC.supplyApy}%`);
    updateElementText('usdcBorrowed', Utils.formatToken(AppState.portfolio.USDC.borrowed, 'USDC'));
    updateElementText('usdcBorrowApy', `${AppState.portfolio.USDC.borrowApy}%`);
    updateElementText('usdcAsCollateral', AppState.portfolio.USDC.collateralEnabled ? 'Yes ✅' : 'No ❌');
}

/**
 * Helper function to update element text content
 */
function updateElementText(elementId, text) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = text;
    }
}

/**
 * Deposit Page (deposit.html) initialization
 */
function initDepositPage() {
    updateHeaderWalletAddress();
    
    // Redirect to home if not connected
    if (!AppState.walletConnected) {
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize deposit/withdraw functionality
    if (window.initDepositWithdraw) {
        window.initDepositWithdraw();
    }
}

/**
 * Borrow Page (borrow.html) initialization
 */
function initBorrowPage() {
    updateHeaderWalletAddress();
    
    // Redirect to home if not connected
    if (!AppState.walletConnected) {
        alert('Please connect your wallet first');
        window.location.href = 'index.html';
        return;
    }
    
    // Initialize borrow/repay functionality
    if (window.initBorrowRepay) {
        window.initBorrowRepay();
    }
}
