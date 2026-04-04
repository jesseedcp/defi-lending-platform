/**
 * DeFi Lending Protocol - Operations Module
 * Handles deposit, withdraw, borrow, and repay operations
 * COMP5568 Course Project
 */

// Current operation state
let currentOperation = {
    type: 'deposit', // 'deposit' or 'withdraw'
    asset: 'ETH',
    amount: 0
};

let currentBorrowOperation = {
    type: 'borrow', // 'borrow' or 'repay'
    asset: 'ETH',
    amount: 0
};

/**
 * Initialize Deposit/Withdraw page functionality
 */
function initDepositWithdraw() {
    const depositTab = document.getElementById('depositTab');
    const withdrawTab = document.getElementById('withdrawTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const maxBtn = document.getElementById('maxBtn');
    const actionButton = document.getElementById('actionButton');
    const collateralSection = document.getElementById('collateralSection');
    const resultMessage = document.getElementById('resultMessage');
    
    if (!depositTab || !withdrawTab) return;
    
    // Tab switching
    depositTab.addEventListener('click', () => {
        currentOperation.type = 'deposit';
        depositTab.classList.add('active');
        withdrawTab.classList.remove('active');
        collateralSection.style.display = 'block';
        actionButton.textContent = '💰 Deposit';
        updateBalanceDisplay();
        updateTransactionSummary();
        hideResultMessage();
    });
    
    withdrawTab.addEventListener('click', () => {
        currentOperation.type = 'withdraw';
        withdrawTab.classList.add('active');
        depositTab.classList.remove('active');
        collateralSection.style.display = 'none';
        actionButton.textContent = '💸 Withdraw';
        updateBalanceDisplay();
        updateTransactionSummary();
        hideResultMessage();
    });
    
    // Asset selection change
    assetSelect.addEventListener('change', () => {
        currentOperation.asset = assetSelect.value;
        updateBalanceDisplay();
        updateTransactionSummary();
    });
    
    // Max button
    maxBtn.addEventListener('click', () => {
        const assetData = AppState.portfolio[currentOperation.asset];
        if (currentOperation.type === 'deposit') {
            amountInput.value = assetData.balance;
        } else {
            amountInput.value = assetData.supplied;
        }
        updateTransactionSummary();
    });
    
    // Amount input change
    amountInput.addEventListener('input', () => {
        updateTransactionSummary();
    });
    
    // Action button click
    actionButton.addEventListener('click', handleDepositWithdrawAction);
    
    // Initial display update
    updateBalanceDisplay();
    updateTransactionSummary();
}

/**
 * Update balance display based on current operation and asset
 */
function updateBalanceDisplay() {
    const balanceEl = document.getElementById('availableBalance');
    if (!balanceEl) return;
    
    const assetData = AppState.portfolio[currentOperation.asset];
    
    if (currentOperation.type === 'deposit') {
        balanceEl.textContent = Utils.formatToken(assetData.balance, currentOperation.asset);
    } else {
        balanceEl.textContent = Utils.formatToken(assetData.supplied, currentOperation.asset);
    }
}

/**
 * Update transaction summary display
 */
function updateTransactionSummary() {
    const amount = parseFloat(document.getElementById('amountInput').value) || 0;
    const assetData = AppState.portfolio[currentOperation.asset];
    
    // Update APY display
    const apyEl = document.getElementById('currentApy');
    if (apyEl) {
        apyEl.textContent = `${assetData.supplyApy}%`;
    }
    
    // Calculate estimated annual yield
    const estimatedYieldEl = document.getElementById('estimatedYield');
    if (estimatedYieldEl && currentOperation.type === 'deposit') {
        const yieldValue = amount * assetData.price * (assetData.supplyApy / 100);
        estimatedYieldEl.textContent = Utils.formatCurrency(yieldValue);
    } else if (estimatedYieldEl) {
        estimatedYieldEl.textContent = '--';
    }
}

/**
 * Handle deposit/withdraw action button click
 */
function handleDepositWithdrawAction() {
    const amountInput = document.getElementById('amountInput');
    const amount = parseFloat(amountInput.value);
    const asset = currentOperation.asset;
    const useAsCollateral = document.getElementById('useAsCollateral')?.checked || false;
    
    // Validation
    if (!amount || amount <= 0) {
        showResultMessage('Please enter a valid amount', 'error');
        return;
    }
    
    const assetData = AppState.portfolio[asset];
    
    if (currentOperation.type === 'deposit') {
        // Check if enough balance
        if (amount > assetData.balance) {
            showResultMessage('Insufficient balance', 'error');
            return;
        }
        
        // Execute deposit (mock)
        assetData.balance -= amount;
        assetData.supplied += amount;
        assetData.collateralEnabled = useAsCollateral;
        
        showResultMessage(`✅ Successfully deposited ${Utils.formatToken(amount, asset)}`, 'success');
        
    } else {
        // Withdraw
        if (amount > assetData.supplied) {
            showResultMessage('Insufficient supplied amount', 'error');
            return;
        }
        
        // Execute withdraw (mock)
        assetData.supplied -= amount;
        assetData.balance += amount;
        
        showResultMessage(`✅ Successfully withdrew ${Utils.formatToken(amount, asset)}`, 'success');
    }
    
    // Clear input
    amountInput.value = '';
    
    // Update transaction summary
    updateTransactionSummary();
    updateBalanceDisplay();
}

/**
 * Show result message
 */
function showResultMessage(message, type) {
    const resultMessage = document.getElementById('resultMessage');
    if (!resultMessage) return;
    
    resultMessage.textContent = message;
    resultMessage.className = `result-message result-${type}`;
    resultMessage.style.display = 'block';
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
        hideResultMessage();
    }, 3000);
}

/**
 * Hide result message
 */
function hideResultMessage() {
    const resultMessage = document.getElementById('resultMessage');
    if (resultMessage) {
        resultMessage.style.display = 'none';
    }
}

/**
 * Initialize Borrow/Repay page functionality
 */
function initBorrowRepay() {
    const borrowTab = document.getElementById('borrowTab');
    const repayTab = document.getElementById('repayTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const maxBtn = document.getElementById('maxBtn');
    const actionButton = document.getElementById('actionButton');
    const resultMessage = document.getElementById('resultMessage');
    
    if (!borrowTab || !repayTab) return;
    
    // Update borrow capacity display
    updateBorrowCapacityDisplay();
    
    // Tab switching
    borrowTab.addEventListener('click', () => {
        currentBorrowOperation.type = 'borrow';
        borrowTab.classList.add('active');
        repayTab.classList.remove('active');
        actionButton.textContent = '🏦 Borrow';
        updateCurrentDebtDisplay();
        updateTransactionDetails();
        hideResultMessage();
    });
    
    repayTab.addEventListener('click', () => {
        currentBorrowOperation.type = 'repay';
        repayTab.classList.add('active');
        borrowTab.classList.remove('active');
        actionButton.textContent = '💵 Repay';
        updateCurrentDebtDisplay();
        updateTransactionDetails();
        hideResultMessage();
    });
    
    // Asset selection change
    assetSelect.addEventListener('change', () => {
        currentBorrowOperation.asset = assetSelect.value;
        updateCurrentDebtDisplay();
        updateTransactionDetails();
    });
    
    // Max button
    maxBtn.addEventListener('click', () => {
        const assetData = AppState.portfolio[currentBorrowOperation.asset];
        if (currentBorrowOperation.type === 'borrow') {
            // Max borrow amount based on capacity
            const capacity = Utils.calculateBorrowCapacity();
            const maxAmount = capacity / assetData.price;
            amountInput.value = maxAmount.toFixed(6);
        } else {
            // Max repay = current debt
            amountInput.value = assetData.borrowed.toFixed(6);
        }
        updateTransactionDetails();
    });
    
    // Amount input change
    amountInput.addEventListener('input', () => {
        updateTransactionDetails();
    });
    
    // Action button click
    actionButton.addEventListener('click', handleBorrowRepayAction);
    
    // Initial display update
    updateCurrentDebtDisplay();
    updateTransactionDetails();
}

/**
 * Update borrow capacity display
 */
function updateBorrowCapacityDisplay() {
    const capacityEl = document.getElementById('borrowCapacityDisplay');
    if (capacityEl) {
        capacityEl.textContent = Utils.formatCurrency(Utils.calculateBorrowCapacity());
    }
}

/**
 * Update current debt display
 */
function updateCurrentDebtDisplay() {
    const debtEl = document.getElementById('currentDebt');
    if (!debtEl) return;
    
    const assetData = AppState.portfolio[currentBorrowOperation.asset];
    debtEl.textContent = Utils.formatToken(assetData.borrowed, currentBorrowOperation.asset);
}

/**
 * Update transaction details (APY, HF after, etc.)
 */
function updateTransactionDetails() {
    const amount = parseFloat(document.getElementById('amountInput').value) || 0;
    const asset = currentBorrowOperation.asset;
    const assetData = AppState.portfolio[asset];
    const operationType = currentBorrowOperation.type;
    
    // Update APY display
    const apyEl = document.getElementById('borrowApy');
    if (apyEl) {
        apyEl.textContent = `${assetData.borrowApy}%`;
    }
    
    // Calculate Health Factor after operation
    let hfAfter = calculateHealthFactorAfterOperation(amount, operationType, asset);
    
    const hfAfterEl = document.getElementById('healthFactorAfter');
    if (hfAfterEl) {
        if (hfAfter === Infinity) {
            hfAfterEl.textContent = '∞';
        } else {
            hfAfterEl.textContent = hfAfter.toFixed(3);
        }
        
        // Color coding
        if (hfAfter !== Infinity && hfAfter < 1) {
            hfAfterEl.style.color = 'var(--danger-color)';
        } else {
            hfAfterEl.style.color = 'var(--text-primary)';
        }
    }
    
    // Show/hide liquidation warning
    const warningRow = document.getElementById('liquidationWarningRow');
    if (warningRow) {
        if (hfAfter !== Infinity && hfAfter < 1.2) {
            warningRow.style.display = 'flex';
        } else {
            warningRow.style.display = 'none';
        }
    }
}

/**
 * Calculate Health Factor after operation (simulation)
 */
function calculateHealthFactorAfterOperation(amount, type, asset) {
    // Clone portfolio data for simulation
    const originalPortfolio = JSON.parse(JSON.stringify(AppState.portfolio));
    
    if (type === 'borrow') {
        originalPortfolio[asset].borrowed += amount;
    } else if (type === 'repay') {
        originalPortfolio[asset].borrowed -= Math.min(amount, originalPortfolio[asset].borrowed);
    }
    
    // Calculate HF with modified portfolio
    let totalDebt = 0;
    let weightedCollateral = 0;
    
    for (const [a, data] of Object.entries(originalPortfolio)) {
        totalDebt += data.borrowed * data.price;
        
        if (data.collateralEnabled) {
            const factor = a === 'ETH' ? 
                AppState.protocolParams.ethCollateralFactor : 
                AppState.protocolParams.usdcCollateralFactor;
            weightedCollateral += data.supplied * data.price * factor;
        }
    }
    
    if (totalDebt === 0) return Infinity;
    return weightedCollateral / totalDebt;
}

/**
 * Handle borrow/repay action button click
 */
function handleBorrowRepayAction() {
    const amountInput = document.getElementById('amountInput');
    const amount = parseFloat(amountInput.value);
    const asset = currentBorrowOperation.asset;
    
    // Validation
    if (!amount || amount <= 0) {
        showResultMessage('Please enter a valid amount', 'error');
        return;
    }
    
    const assetData = AppState.portfolio[asset];
    
    if (currentBorrowOperation.type === 'borrow') {
        // Check borrow capacity
        const capacity = Utils.calculateBorrowCapacity();
        const amountUSD = amount * assetData.price;
        
        if (amountUSD > capacity) {
            showResultMessage(`Exceeds borrow capacity. Available: ${Utils.formatCurrency(capacity)}`, 'error');
            return;
        }
        
        // Check LTV limit
        const newDebt = assetData.borrowed + amount;
        const totalCollateral = Utils.calculateTotalCollateral();
        const newLTV = (Utils.calculateTotalDebt() + amountUSD) / totalCollateral;
        
        if (newLTV > AppState.protocolParams.maxLTV) {
            showResultMessage(`Exceeds maximum LTV of ${(AppState.protocolParams.maxLTV * 100).toFixed(0)}%`, 'error');
            return;
        }
        
        // Execute borrow (mock)
        assetData.borrowed += amount;
        
        showResultMessage(`✅ Successfully borrowed ${Utils.formatToken(amount, asset)}`, 'success');
        
    } else {
        // Repay
        if (amount > assetData.borrowed) {
            showResultMessage('Amount exceeds current debt', 'error');
            return;
        }
        
        // Execute repay (mock)
        assetData.borrowed -= amount;
        
        showResultMessage(`✅ Successfully repaid ${Utils.formatToken(amount, asset)}`, 'success');
    }
    
    // Clear input
    amountInput.value = '';
    
    // Update displays
    updateBorrowCapacityDisplay();
    updateCurrentDebtDisplay();
    updateTransactionDetails();
}

// Export functions for global access
window.initDepositWithdraw = initDepositWithdraw;
window.initBorrowRepay = initBorrowRepay;
