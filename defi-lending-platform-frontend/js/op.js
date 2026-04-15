const depositState = {
    type: 'deposit'
};

const borrowState = {
    type: 'borrow'
};

function initDepositWithdraw() {
    const depositTab = document.getElementById('depositTab');
    const withdrawTab = document.getElementById('withdrawTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const maxBtn = document.getElementById('maxBtn');
    const actionButton = document.getElementById('actionButton');

    populateAssetSelect(assetSelect);
    renderDepositWithdraw();

    document.addEventListener('protocol:updated', renderDepositWithdraw);

    depositTab?.addEventListener('click', () => {
        depositState.type = 'deposit';
        renderDepositWithdraw();
        hideResultMessage('resultMessage');
    });

    withdrawTab?.addEventListener('click', () => {
        depositState.type = 'withdraw';
        renderDepositWithdraw();
        hideResultMessage('resultMessage');
    });

    assetSelect?.addEventListener('change', renderDepositWithdraw);
    amountInput?.addEventListener('input', renderDepositWithdraw);

    maxBtn?.addEventListener('click', () => {
        const asset = Utils.resolveAsset(assetSelect?.value);

        if (!asset || !amountInput) {
            return;
        }

        amountInput.value = depositState.type === 'deposit'
            ? asset.walletBalance.toFixed(6)
            : asset.supplied.toFixed(6);

        renderDepositWithdraw();
    });

    actionButton?.addEventListener('click', async () => {
        await withButtonState(actionButton, depositState.type === 'deposit' ? '⏳ Supply 中...' : '⏳ Withdraw 中...', async () => {
            const asset = Utils.resolveAsset(assetSelect?.value);
            const amount = amountInput?.value || '';

            if (!asset) {
                throw new Error('当前没有可用资产');
            }

            if (depositState.type === 'deposit') {
                const result = await Protocol.supply(asset.address, amount);
                showResultMessage(result.approvalHash ? '授权并存入成功' : '存入成功', 'success', 'resultMessage');
            } else {
                await Protocol.withdraw(asset.address, amount);
                showResultMessage('提取成功', 'success', 'resultMessage');
            }

            if (amountInput) {
                amountInput.value = '';
            }

            renderDepositWithdraw();
        }, 'resultMessage');
    });
}

function renderDepositWithdraw() {
    const depositTab = document.getElementById('depositTab');
    const withdrawTab = document.getElementById('withdrawTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const actionButton = document.getElementById('actionButton');
    const collateralSection = document.getElementById('collateralSection');
    populateAssetSelect(assetSelect);
    const asset = Utils.resolveAsset(assetSelect?.value || AppState.protocol.assets[0]?.address);
    const amount = parseFloat(amountInput?.value || '0') || 0;

    if (depositTab && withdrawTab) {
        depositTab.classList.toggle('active', depositState.type === 'deposit');
        withdrawTab.classList.toggle('active', depositState.type === 'withdraw');
    }

    if (!asset) {
        updateElementText('availableBalance', '--');
        updateElementText('currentApy', '--');
        updateElementText('estimatedYield', '--');
        updateElementText('allowanceStatus', '--');
        updateElementText('liquidityDepth', '--');
        if (actionButton) {
            actionButton.disabled = true;
        }
        return;
    }

    if (collateralSection) {
        collateralSection.style.display = depositState.type === 'deposit' ? 'block' : 'none';
    }

    if (actionButton) {
        actionButton.disabled = !AppState.walletConnected || !Protocol.isDeploymentConfigured() || !Protocol.isExpectedChainMatched();
        actionButton.textContent = depositState.type === 'deposit' ? '💰 Supply' : '💸 Withdraw';
    }

    updateElementText(
        'availableBalance',
        depositState.type === 'deposit'
            ? Utils.formatToken(asset.walletBalance, asset.symbol)
            : Utils.formatToken(asset.supplied, asset.symbol)
    );
    updateElementText('currentApy', Utils.formatPercent(asset.supplyApy));
    updateElementText('estimatedYield', depositState.type === 'deposit'
        ? Utils.formatCurrency(amount * asset.priceUsd * (asset.supplyApy / 100))
        : '--');
    updateElementText('allowanceStatus', Utils.formatToken(asset.allowance, asset.symbol));
    updateElementText('liquidityDepth', Utils.formatToken(asset.availableLiquidity, asset.symbol));
    updateElementText('collateralBehavior', '当前合约会自动将已存入资产计入抵押，前端不再单独维护 collateral toggle。');
}

function initBorrowRepay() {
    const borrowTab = document.getElementById('borrowTab');
    const repayTab = document.getElementById('repayTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const maxBtn = document.getElementById('maxBtn');
    const actionButton = document.getElementById('actionButton');

    populateAssetSelect(assetSelect);
    renderBorrowRepay();

    document.addEventListener('protocol:updated', renderBorrowRepay);

    borrowTab?.addEventListener('click', () => {
        borrowState.type = 'borrow';
        renderBorrowRepay();
        hideResultMessage('resultMessage');
    });

    repayTab?.addEventListener('click', () => {
        borrowState.type = 'repay';
        renderBorrowRepay();
        hideResultMessage('resultMessage');
    });

    assetSelect?.addEventListener('change', renderBorrowRepay);
    amountInput?.addEventListener('input', renderBorrowRepay);

    maxBtn?.addEventListener('click', () => {
        const asset = Utils.resolveAsset(assetSelect?.value);

        if (!asset || !amountInput) {
            return;
        }

        if (borrowState.type === 'borrow') {
            const maxByCapacity = asset.priceUsd ? AppState.protocol.accountSnapshot.borrowCapacityUsd / asset.priceUsd : 0;
            const maxBorrowAmount = Math.min(maxByCapacity, asset.availableLiquidity);
            amountInput.value = Math.max(0, maxBorrowAmount).toFixed(6);
        } else {
            amountInput.value = asset.borrowed.toFixed(6);
        }

        renderBorrowRepay();
    });

    actionButton?.addEventListener('click', async () => {
        await withButtonState(actionButton, borrowState.type === 'borrow' ? '⏳ Borrow 中...' : '⏳ Repay 中...', async () => {
            const asset = Utils.resolveAsset(assetSelect?.value);
            const amount = amountInput?.value || '';

            if (!asset) {
                throw new Error('当前没有可用资产');
            }

            if (borrowState.type === 'borrow') {
                await Protocol.borrow(asset.address, amount);
                showResultMessage('借款成功', 'success', 'resultMessage');
            } else {
                const result = await Protocol.repay(asset.address, amount);
                showResultMessage(result.approvalHash ? '授权并偿还成功' : '偿还成功', 'success', 'resultMessage');
            }

            if (amountInput) {
                amountInput.value = '';
            }

            renderBorrowRepay();
        }, 'resultMessage');
    });
}

function renderBorrowRepay() {
    const borrowTab = document.getElementById('borrowTab');
    const repayTab = document.getElementById('repayTab');
    const assetSelect = document.getElementById('assetSelect');
    const amountInput = document.getElementById('amountInput');
    const actionButton = document.getElementById('actionButton');
    populateAssetSelect(assetSelect);
    const asset = Utils.resolveAsset(assetSelect?.value || AppState.protocol.assets[0]?.address);
    const amount = parseFloat(amountInput?.value || '0') || 0;
    const hfAfter = Utils.calculateHealthFactorAfter(asset?.address, amount, borrowState.type);

    if (borrowTab && repayTab) {
        borrowTab.classList.toggle('active', borrowState.type === 'borrow');
        repayTab.classList.toggle('active', borrowState.type === 'repay');
    }

    updateElementText('borrowCapacityDisplay', Utils.formatCurrency(AppState.protocol.accountSnapshot.borrowCapacityUsd));

    if (!asset) {
        updateElementText('currentDebt', '--');
        updateElementText('borrowApy', '--');
        updateElementText('healthFactorAfter', '--');
        updateElementText('liquidityAvailable', '--');
        updateElementText('effectiveLtvLimit', '--');
        if (actionButton) {
            actionButton.disabled = true;
        }
        return;
    }

    if (actionButton) {
        actionButton.disabled = !AppState.walletConnected || !Protocol.isDeploymentConfigured() || !Protocol.isExpectedChainMatched();
        actionButton.textContent = borrowState.type === 'borrow' ? '🏦 Borrow' : '💵 Repay';
    }

    updateElementText('currentDebt', Utils.formatToken(asset.borrowed, asset.symbol));
    updateElementText('borrowApy', Utils.formatPercent(asset.borrowApy));
    updateElementText('healthFactorAfter', Utils.formatHealthFactor(hfAfter));
    updateElementText('liquidityAvailable', Utils.formatToken(asset.availableLiquidity, asset.symbol));
    updateElementText('effectiveLtvLimit', Utils.formatPercent((asset.ltvBps || 0) / 100));

    const healthFactorAfter = document.getElementById('healthFactorAfter');
    const warningRow = document.getElementById('liquidationWarningRow');

    if (healthFactorAfter) {
        healthFactorAfter.style.color = hfAfter !== null && hfAfter < 1 ? 'var(--danger-color)' : 'var(--text-primary)';
    }

    if (warningRow) {
        warningRow.style.display = hfAfter !== null && hfAfter < 1.2 ? 'flex' : 'none';
    }
}

function initAdvancedOperations() {
    const liquidationDebtSelect = document.getElementById('liquidationDebtAsset');
    const liquidationCollateralSelect = document.getElementById('liquidationCollateralAsset');
    const flashLoanAssetSelect = document.getElementById('flashLoanAsset');
    const updateMarketAssetSelect = document.getElementById('updateMarketAssetSelect');
    const updateMarketAssetInput = document.getElementById('updateMarketAsset');
    const claimRewardsBtn = document.getElementById('advancedClaimRewardsBtn');
    const previewLiquidationBtn = document.getElementById('previewLiquidationBtn');
    const executeLiquidationBtn = document.getElementById('executeLiquidationBtn');
    const flashLoanBtn = document.getElementById('flashLoanBtn');
    const setRewardTokenBtn = document.getElementById('setRewardTokenBtn');
    const listMarketBtn = document.getElementById('listMarketBtn');
    const updateMarketBtn = document.getElementById('updateMarketBtn');

    populateAssetSelect(liquidationDebtSelect);
    populateAssetSelect(liquidationCollateralSelect);
    populateAssetSelect(flashLoanAssetSelect);
    populateAssetSelect(updateMarketAssetSelect);
    if (updateMarketAssetInput && updateMarketAssetSelect?.value) {
        updateMarketAssetInput.value = updateMarketAssetSelect.value;
    }

    renderAdvancedOperations();
    document.addEventListener('protocol:updated', renderAdvancedOperations);

    updateMarketAssetSelect?.addEventListener('change', () => {
        if (updateMarketAssetInput) {
            updateMarketAssetInput.value = updateMarketAssetSelect.value;
        }

        syncUpdateMarketFormFromSelection();
    });

    claimRewardsBtn?.addEventListener('click', async () => {
        await withButtonState(claimRewardsBtn, '⏳ 领取中...', async () => {
            await Protocol.claimRewards();
            showResultMessage('奖励领取成功', 'success', 'advancedRewardsMessage');
        }, 'advancedRewardsMessage');
    });

    previewLiquidationBtn?.addEventListener('click', async () => {
        await withButtonState(previewLiquidationBtn, '⏳ 预览中...', async () => {
            const preview = await Protocol.previewLiquidation({
                borrower: document.getElementById('liquidationBorrower')?.value,
                debtAsset: liquidationDebtSelect?.value,
                collateralAsset: liquidationCollateralSelect?.value,
                amount: document.getElementById('liquidationAmount')?.value
            });

            updateElementText('previewRepayAmount', Utils.formatToken(preview.actualRepayAmount, preview.debtAsset.symbol));
            updateElementText('previewCollateralToSeize', Utils.formatToken(preview.collateralToSeize, preview.collateralAsset.symbol));
            updateElementText('previewHealthFactor', Utils.formatHealthFactor(preview.healthFactor));
            showResultMessage('清算预览已更新', 'success', 'advancedLiquidationMessage');
        }, 'advancedLiquidationMessage');
    });

    executeLiquidationBtn?.addEventListener('click', async () => {
        await withButtonState(executeLiquidationBtn, '⏳ 清算中...', async () => {
            const result = await Protocol.liquidate({
                borrower: document.getElementById('liquidationBorrower')?.value,
                debtAsset: liquidationDebtSelect?.value,
                collateralAsset: liquidationCollateralSelect?.value,
                amount: document.getElementById('liquidationAmount')?.value
            });

            showResultMessage(result.approvalHash ? '授权并完成清算' : '清算执行成功', 'success', 'advancedLiquidationMessage');
        }, 'advancedLiquidationMessage');
    });

    flashLoanBtn?.addEventListener('click', async () => {
        await withButtonState(flashLoanBtn, '⏳ 执行中...', async () => {
            await Protocol.flashLoan({
                receiverAddress: document.getElementById('flashLoanReceiver')?.value,
                asset: flashLoanAssetSelect?.value,
                amount: document.getElementById('flashLoanAmount')?.value,
                paramsHex: document.getElementById('flashLoanParams')?.value
            });

            showResultMessage('Flash loan 调用已提交', 'success', 'advancedFlashLoanMessage');
        }, 'advancedFlashLoanMessage');
    });

    setRewardTokenBtn?.addEventListener('click', async () => {
        await withButtonState(setRewardTokenBtn, '⏳ 设置中...', async () => {
            await Protocol.setRewardToken(document.getElementById('rewardTokenAddressInput')?.value);
            showResultMessage('奖励代币地址已更新', 'success', 'advancedAdminMessage');
        }, 'advancedAdminMessage');
    });

    listMarketBtn?.addEventListener('click', async () => {
        await withButtonState(listMarketBtn, '⏳ 上线中...', async () => {
            await Protocol.listMarket(readMarketForm('list'));
            showResultMessage('新市场已上线', 'success', 'advancedAdminMessage');
        }, 'advancedAdminMessage');
    });

    updateMarketBtn?.addEventListener('click', async () => {
        await withButtonState(updateMarketBtn, '⏳ 更新中...', async () => {
            await Protocol.updateMarket(readMarketForm('update'));
            showResultMessage('市场参数已更新', 'success', 'advancedAdminMessage');
        }, 'advancedAdminMessage');
    });
}

function renderAdvancedOperations() {
    populateAssetSelect(document.getElementById('liquidationDebtAsset'));
    populateAssetSelect(document.getElementById('liquidationCollateralAsset'));
    populateAssetSelect(document.getElementById('flashLoanAsset'));
    populateAssetSelect(document.getElementById('updateMarketAssetSelect'));

    const updateMarketAssetSelect = document.getElementById('updateMarketAssetSelect');
    const updateMarketAssetInput = document.getElementById('updateMarketAsset');

    if (updateMarketAssetInput && updateMarketAssetSelect?.value) {
        updateMarketAssetInput.value = updateMarketAssetSelect.value;
    }

    syncUpdateMarketFormFromSelection();

    updateElementText('advancedPoolAddress', AppState.deployment.poolAddress || '未配置');
    updateElementText('advancedOwnerAddress', AppState.protocol.owner || '--');
    updateElementText('advancedRewardTokenAddress', AppState.protocol.rewardTokenMeta ? AppState.protocol.rewardTokenMeta.address : '未设置');
    updateElementText('advancedAccruedRewards', Utils.formatToken(AppState.protocol.accruedRewards, AppState.protocol.rewardTokenMeta?.symbol || 'RWD', 4));
    updateElementText('advancedRewardBalance', Utils.formatToken(AppState.protocol.rewardBalance, AppState.protocol.rewardTokenMeta?.symbol || 'RWD', 4));
    updateElementText('advancedNetwork', AppState.chainLabel);
    updateElementText('advancedSyncTime', AppState.protocol.lastSyncedAt ? new Date(AppState.protocol.lastSyncedAt).toLocaleString() : '未同步');

    const adminNotice = document.getElementById('adminAccessNotice');

    if (adminNotice) {
        adminNotice.textContent = AppState.protocol.isOwner
            ? '当前钱包是 owner，可执行管理员接口。'
            : '当前钱包不是 owner，管理员按钮会被禁用。';
        adminNotice.className = `status-banner ${AppState.protocol.isOwner ? 'status-info' : 'status-warning'}`;
        adminNotice.style.display = 'block';
    }

    ['setRewardTokenBtn', 'listMarketBtn', 'updateMarketBtn'].forEach((id) => {
        const button = document.getElementById(id);

        if (button) {
            button.disabled = !AppState.protocol.isOwner || !AppState.walletConnected || !Protocol.isExpectedChainMatched();
        }
    });

    ['advancedClaimRewardsBtn', 'executeLiquidationBtn', 'flashLoanBtn'].forEach((id) => {
        const button = document.getElementById(id);

        if (button) {
            button.disabled = !AppState.walletConnected || !Protocol.isDeploymentConfigured() || !Protocol.isExpectedChainMatched();
        }
    });

    const previewButton = document.getElementById('previewLiquidationBtn');

    if (previewButton) {
        previewButton.disabled = !Protocol.isDeploymentConfigured();
    }
}

function syncUpdateMarketFormFromSelection() {
    const selectedAsset = Utils.resolveAsset(document.getElementById('updateMarketAssetSelect')?.value);

    if (!selectedAsset) {
        return;
    }

    const fields = {
        updateMarketAsset: selectedAsset.address,
        updateMarketPriceFeed: selectedAsset.market.priceFeed,
        updateMarketLtv: selectedAsset.ltvBps,
        updateMarketThreshold: selectedAsset.liquidationThresholdBps,
        updateMarketBaseRate: selectedAsset.market.baseRateWad,
        updateMarketSlope: selectedAsset.market.slopeWad,
        updateMarketKink: selectedAsset.market.kinkBps,
        updateMarketJumpSlope: selectedAsset.market.jumpSlopeWad
    };

    Object.entries(fields).forEach(([id, value]) => {
        const field = document.getElementById(id);

        if (field) {
            field.value = value ?? '';
        }
    });
}

function populateAssetSelect(selectElement) {
    if (!selectElement) {
        return;
    }

    const selectedValue = selectElement.value;
    selectElement.innerHTML = AppState.protocol.assets.map((asset) => `
        <option value="${asset.address}">${asset.name} (${asset.symbol})</option>
    `).join('');

    if (selectedValue) {
        selectElement.value = selectedValue;
    }

    if (!selectElement.value && AppState.protocol.assets[0]) {
        selectElement.value = AppState.protocol.assets[0].address;
    }
}

function readMarketForm(prefix) {
    return {
        asset: document.getElementById(`${prefix}MarketAsset`)?.value,
        priceFeed: document.getElementById(`${prefix}MarketPriceFeed`)?.value,
        ltvBps: document.getElementById(`${prefix}MarketLtv`)?.value,
        liquidationThresholdBps: document.getElementById(`${prefix}MarketThreshold`)?.value,
        baseRateWad: document.getElementById(`${prefix}MarketBaseRate`)?.value,
        slopeWad: document.getElementById(`${prefix}MarketSlope`)?.value,
        kinkBps: document.getElementById(`${prefix}MarketKink`)?.value,
        jumpSlopeWad: document.getElementById(`${prefix}MarketJumpSlope`)?.value
    };
}

async function withButtonState(button, pendingText, action, messageTargetId) {
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = pendingText;

    try {
        await action();
    } catch (error) {
        showResultMessage(error.message || '操作失败', 'error', messageTargetId);
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

function showResultMessage(message, type, elementId = 'resultMessage') {
    const resultMessage = document.getElementById(elementId);

    if (!resultMessage) {
        return;
    }

    resultMessage.textContent = message;
    resultMessage.className = `result-message result-${type}`;
    resultMessage.style.display = 'block';
}

function hideResultMessage(elementId = 'resultMessage') {
    const resultMessage = document.getElementById(elementId);

    if (resultMessage) {
        resultMessage.style.display = 'none';
    }
}

window.initDepositWithdraw = initDepositWithdraw;
window.initBorrowRepay = initBorrowRepay;
window.initAdvancedOperations = initAdvancedOperations;
