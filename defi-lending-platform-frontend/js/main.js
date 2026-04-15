document.addEventListener('DOMContentLoaded', async () => {
    try {
        await Protocol.initialize();
        initializePage();
        document.addEventListener('protocol:updated', handleGlobalStateUpdate);
        handleGlobalStateUpdate();
    } catch (error) {
        console.error('Initialization failed:', error);
        showGlobalError(error.message || '页面初始化失败');
    }
});

function initializePage() {
    const currentPage = getCurrentPage();

    switch (currentPage) {
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
        case 'advanced.html':
            initAdvancedPage();
            break;
        default:
            updateHeaderWalletAddress();
            break;
    }
}

function getCurrentPage() {
    return window.location.pathname.split('/').pop();
}

function handleGlobalStateUpdate() {
    updateHeaderWalletAddress();
    updateAllStatusBanners();
}

function updateHeaderWalletAddress() {
    const addressEl = document.getElementById('headerWalletAddress');

    if (!addressEl) {
        return;
    }

    addressEl.textContent = AppState.walletConnected && AppState.currentAccount
        ? Utils.shortenAddress(AppState.currentAccount)
        : '未连接';
}

function updateAllStatusBanners() {
    const bannerIds = ['dashboardStatusBanner', 'depositStatusBanner', 'borrowStatusBanner', 'advancedStatusBanner'];
    const message = getProtocolStatusMessage();
    const type = getProtocolStatusType();

    bannerIds.forEach((id) => {
        const banner = document.getElementById(id);

        if (!banner) {
            return;
        }

        if (!message) {
            banner.style.display = 'none';
            banner.textContent = '';
            banner.className = 'status-banner';
            return;
        }

        banner.textContent = message;
        banner.className = `status-banner status-${type}`;
        banner.style.display = 'block';
    });
}

function getProtocolStatusMessage() {
    if (!Protocol.isDeploymentConfigured()) {
        return '请先在首页填写并保存 LendingPool 地址，然后再进行链上联调。';
    }

    if (!AppState.walletConnected) {
        return '请先连接钱包。当前页面处于只读状态，写操作按钮将不可用。';
    }

    if (!Protocol.isExpectedChainMatched()) {
        return `当前钱包网络为 ${AppState.chainLabel}，与配置的 Chain ID 不一致。请切换网络后再发起交易。`;
    }

    if (AppState.protocol.lastError) {
        return AppState.protocol.lastError;
    }

    return '';
}

function getProtocolStatusType() {
    if (!Protocol.isDeploymentConfigured() || !AppState.walletConnected || !Protocol.isExpectedChainMatched()) {
        return 'warning';
    }

    return AppState.protocol.lastError ? 'error' : 'info';
}

function updateElementText(elementId, text) {
    const element = document.getElementById(elementId);

    if (element) {
        element.textContent = text;
    }
}

function showGlobalError(message) {
    const errorElement = document.getElementById('errorMessage');

    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}

function initHomePage() {
    const connectBtn = document.getElementById('connectWalletBtn');
    const disconnectBtn = document.getElementById('disconnectWalletBtn');
    const switchNetworkBtn = document.getElementById('switchNetworkBtn');
    const saveConfigBtn = document.getElementById('saveDeploymentConfigBtn');
    const refreshProtocolBtn = document.getElementById('refreshProtocolBtn');
    const goToDashboardBtn = document.getElementById('goToDashboardBtn');

    renderHomePage();

    document.addEventListener('protocol:updated', renderHomePage);

    connectBtn?.addEventListener('click', async () => {
        await runButtonAction(connectBtn, '⏳ 连接中...', async () => {
            await Wallet.connect();
            renderHomePage();
        }, 'errorMessage');
    });

    disconnectBtn?.addEventListener('click', () => {
        Wallet.disconnect();
        renderHomePage();
    });

    switchNetworkBtn?.addEventListener('click', async () => {
        await runButtonAction(switchNetworkBtn, '⏳ 切换中...', async () => {
            await Protocol.switchToExpectedNetwork();
            renderHomePage();
        }, 'deploymentStatus');
    });

    saveConfigBtn?.addEventListener('click', async () => {
        const poolAddress = document.getElementById('poolAddressInput')?.value || '';
        const expectedChainId = document.getElementById('expectedChainIdInput')?.value || '';
        const statusEl = document.getElementById('deploymentStatus');

        try {
            Protocol.saveDeploymentConfig({ poolAddress, expectedChainId });

            if (statusEl) {
                statusEl.textContent = '配置已保存';
                statusEl.className = 'status-banner status-info';
                statusEl.style.display = 'block';
            }

            if (Protocol.isDeploymentConfigured()) {
                await Protocol.syncProtocolState();
            }
        } catch (error) {
            if (statusEl) {
                statusEl.textContent = error.message;
                statusEl.className = 'status-banner status-error';
                statusEl.style.display = 'block';
            }
        }
    });

    refreshProtocolBtn?.addEventListener('click', async () => {
        await runButtonAction(refreshProtocolBtn, '⏳ 刷新中...', async () => {
            if (!Protocol.isDeploymentConfigured()) {
                throw new Error('请先保存 LendingPool 地址');
            }

            await Protocol.syncProtocolState();
            renderHomePage();
        }, 'deploymentStatus');
    });

    goToDashboardBtn?.addEventListener('click', () => {
        window.location.href = 'dashboard.html';
    });
}

function renderHomePage() {
    const connectBtn = document.getElementById('connectWalletBtn');
    const walletInfo = document.getElementById('walletInfo');
    const disconnectBtn = document.getElementById('disconnectWalletBtn');
    const switchNetworkBtn = document.getElementById('switchNetworkBtn');
    const errorMessage = document.getElementById('errorMessage');
    const poolInput = document.getElementById('poolAddressInput');
    const chainInput = document.getElementById('expectedChainIdInput');
    const configHint = document.getElementById('deploymentConfigHint');

    if (poolInput) {
        poolInput.value = AppState.deployment.poolAddress || '';
    }

    if (chainInput) {
        chainInput.value = AppState.deployment.expectedChainId || '';
    }

    updateElementText('targetNetworkName', Constants.network.chainName);
    updateElementText('targetRpcUrl', Constants.network.rpcUrls[0]);
    updateElementText('knownPoolAddress', Constants.deployedContracts.lendingPool);
    updateElementText('knownUsdcAddress', Constants.deployedContracts.usdc);
    updateElementText('knownWethAddress', Constants.deployedContracts.weth);
    updateElementText('knownGovAddress', Constants.deployedContracts.gov);
    updateElementText('walletAddress', AppState.currentAccount || '--');
    updateElementText('chainId', AppState.chainLabel || '--');
    updateElementText('connectionStatus', AppState.walletConnected ? 'Connected ✅' : 'Not Connected');
    updateElementText('sessionToken', AppState.auth.sessionToken ? Utils.shortenAddress(AppState.auth.sessionToken, 8, 6) : '未创建');
    updateElementText('sessionExpiry', Utils.formatSessionExpiry(AppState.auth.expiresAt));
    updateElementText('configuredPoolAddress', AppState.deployment.poolAddress || '未配置');
    updateElementText('configuredChainId', AppState.deployment.expectedChainId || '未配置');

    if (connectBtn && walletInfo && disconnectBtn) {
        connectBtn.style.display = AppState.walletConnected ? 'none' : 'inline-flex';
        walletInfo.style.display = AppState.walletConnected ? 'block' : 'none';
        disconnectBtn.style.display = AppState.walletConnected ? 'inline-flex' : 'none';
    }

    if (switchNetworkBtn) {
        switchNetworkBtn.style.display = AppState.walletConnected && !Protocol.isExpectedChainMatched() ? 'inline-flex' : 'none';
    }

    if (errorMessage) {
        errorMessage.style.display = 'none';
    }

    if (configHint) {
        configHint.textContent = Protocol.isDeploymentConfigured()
            ? '已写入 Sepolia 的真实 LendingPool 地址，页面将从链上加载资产和市场数据。'
            : '当前仓库没有 HTTP 后端 API，请在此填写已部署的 LendingPool 合约地址以启用前端联调。';
    }
}

function initDashboardPage() {
    renderDashboardPage();
    document.addEventListener('protocol:updated', renderDashboardPage);

    const refreshBtn = document.getElementById('refreshDashboardBtn');
    const claimBtn = document.getElementById('claimRewardsBtn');

    refreshBtn?.addEventListener('click', async () => {
        await runButtonAction(refreshBtn, '⏳ 刷新中...', async () => {
            await Protocol.syncProtocolState();
        });
    });

    claimBtn?.addEventListener('click', async () => {
        await runButtonAction(claimBtn, '⏳ 领取中...', async () => {
            await Protocol.claimRewards();
            showInlineMessage('dashboardActionMessage', '奖励领取成功', 'success');
        }, 'dashboardActionMessage');
    });
}

function renderDashboardPage() {
    const snapshot = AppState.protocol.accountSnapshot;
    const healthFactor = snapshot.healthFactorWad;
    const ltvRatio = Utils.calculateLtvRatio();
    const liquidationThreshold = Utils.calculateWeightedLiquidationThreshold();

    updateElementText('totalCollateral', Utils.formatCurrency(snapshot.totalCollateralUsd));
    updateElementText('totalDebt', Utils.formatCurrency(snapshot.totalDebtUsd));
    updateElementText('healthFactor', Utils.formatHealthFactor(healthFactor));
    updateElementText('ltvRatio', Utils.formatPercent(ltvRatio * 100));
    updateElementText('borrowCapacity', Utils.formatCurrency(snapshot.borrowCapacityUsd));
    updateElementText('liquidationThreshold', Utils.formatPercent(liquidationThreshold));
    updateElementText('accruedRewards', Utils.formatToken(AppState.protocol.accruedRewards, AppState.protocol.rewardTokenMeta?.symbol || 'RWD', 4));
    updateElementText('rewardBalance', Utils.formatToken(AppState.protocol.rewardBalance, AppState.protocol.rewardTokenMeta?.symbol || 'RWD', 4));

    updateElementText('summaryPoolAddress', AppState.deployment.poolAddress || '未配置');
    updateElementText('summaryOwnerAddress', AppState.protocol.owner ? Utils.shortenAddress(AppState.protocol.owner, 10, 8) : '--');
    updateElementText('summaryRewardToken', AppState.protocol.rewardTokenMeta ? `${AppState.protocol.rewardTokenMeta.symbol} · ${Utils.shortenAddress(AppState.protocol.rewardTokenMeta.address, 8, 6)}` : '未设置');
    updateElementText('summaryChain', AppState.chainLabel);

    updateRiskBanner(healthFactor);
    renderAssetDetails();
}

function updateRiskBanner(healthFactor) {
    const banner = document.getElementById('riskBanner');
    const riskIcon = document.getElementById('riskIcon');
    const riskText = document.getElementById('riskText');

    if (!banner || !riskIcon || !riskText) {
        return;
    }

    if (healthFactor === null || healthFactor >= 1) {
        banner.className = 'risk-banner risk-safe';
        riskIcon.textContent = '✅';
        riskText.textContent = '当前仓位安全';
        return;
    }

    banner.className = 'risk-banner risk-warning';
    riskIcon.textContent = '⚠️';
    riskText.textContent = '仓位接近或进入清算区间，请尽快补充抵押或偿还债务';
}

function renderAssetDetails() {
    const container = document.getElementById('assetsContainer');

    if (!container) {
        return;
    }

    if (!AppState.protocol.assets.length) {
        container.innerHTML = '<div class="empty-card">当前未发现已上线市场。请先确认 LendingPool 地址正确，或由 owner 调用 listMarket。</div>';
        return;
    }

    container.innerHTML = AppState.protocol.assets.map((asset) => `
        <div class="asset-card">
            <div class="asset-header">
                <div class="asset-info">
                    <span class="asset-icon">${asset.icon}</span>
                    <span class="asset-name">${asset.name} (${asset.symbol})</span>
                </div>
                <div class="asset-actions">
                    <button class="btn-small btn-deposit" onclick="window.location.href='deposit.html'">Supply</button>
                    <button class="btn-small btn-withdraw" onclick="window.location.href='borrow.html'">Borrow</button>
                </div>
            </div>
            <div class="asset-body">
                <div class="asset-row">
                    <span class="label">Wallet Balance</span>
                    <span class="value">${Utils.formatToken(asset.walletBalance, asset.symbol)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Supplied</span>
                    <span class="value">${Utils.formatToken(asset.supplied, asset.symbol)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Borrowed</span>
                    <span class="value">${Utils.formatToken(asset.borrowed, asset.symbol)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Price</span>
                    <span class="value">${Utils.formatCurrency(asset.priceUsd)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Supply APR</span>
                    <span class="value apy-positive">${Utils.formatPercent(asset.supplyApy)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Borrow APR</span>
                    <span class="value">${Utils.formatPercent(asset.borrowApy)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Available Liquidity</span>
                    <span class="value">${Utils.formatToken(asset.availableLiquidity, asset.symbol)}</span>
                </div>
                <div class="asset-row">
                    <span class="label">Utilization</span>
                    <span class="value">${Utils.formatPercent(asset.utilization)}</span>
                </div>
            </div>
        </div>
    `).join('');
}

function initDepositPage() {
    updateHeaderWalletAddress();
    if (window.initDepositWithdraw) {
        window.initDepositWithdraw();
    }
}

function initBorrowPage() {
    updateHeaderWalletAddress();
    if (window.initBorrowRepay) {
        window.initBorrowRepay();
    }
}

function initAdvancedPage() {
    updateHeaderWalletAddress();
    if (window.initAdvancedOperations) {
        window.initAdvancedOperations();
    }
}

async function runButtonAction(button, pendingText, action, messageTargetId) {
    if (!button) {
        return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = pendingText;

    try {
        await action();
    } catch (error) {
        if (messageTargetId) {
            showInlineMessage(messageTargetId, error.message || '操作失败', 'error');
        } else {
            throw error;
        }
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function showInlineMessage(targetId, message, type) {
    const element = document.getElementById(targetId);

    if (!element) {
        return;
    }

    element.textContent = message;
    element.className = `result-message result-${type}`;
    element.style.display = 'block';
}

window.updateElementText = updateElementText;
window.showInlineMessage = showInlineMessage;
