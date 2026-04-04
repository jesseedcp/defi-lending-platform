📄 DeFi Lending Platform - 页面与 JS 文件对应关系
1. index.html（首页 - 连接钱包）
对应的 JS 文件：
- js/wallet.js - 钱包连接逻辑
- js/main.js - 页面初始化
主要功能：
- ✅ 显示项目标题和介绍
- ✅ "🔗 Connect Wallet" 按钮 - 点击后连接 MetaMask
- ✅ 连接成功后显示：
- 钱包地址（完整地址）
- 链 ID（如 Ethereum Mainnet）
- 连接状态
- ✅ "📊 Go to Dashboard" 按钮 - 跳转到仪表板
- ✅ 三个特性卡片展示（Earn Interest、Borrow Assets、Secure & Decentralized）
- ❌ 不会自动连接钱包，只有点击按钮才触发
--------------------------------------------------------------------------------
2. dashboard.html（用户仪表板 - 核心评分页）
对应的 JS 文件：
- js/config.js - 全局配置和模拟数据
- js/wallet.js - 钱包状态管理
- js/main.js - 页面初始化和数据渲染
主要功能：
- ✅ 顶部导航栏显示钱包地址（缩短格式：0x71C...9A21）
- ✅ 风险状态横幅：
- HF ≥ 1：绿色安全提示 "Your position is safe"
- HF < 1：红色警告 "Warning! Risk of liquidation"
- ✅ 6 个核心指标卡片：
a.Total Collateral（总抵押价值 USD）
b.Total Debt（总债务 USD）
c.Health Factor（健康因子，HF）
d.LTV Ratio（贷款价值比 %）
e.Borrow Capacity（可借额度 USD）
f.Liquidation Threshold（清算阈值 75%）
- ✅ 快捷操作按钮：
- 💰 Go to Deposit
- 🏦 Go to Borrow
- ✅ 资产列表（ETH 和 USDC）：
- Supplied（存入数量）
- Supply APY（存款年利率）
- Borrowed（借款数量）
- Borrow APY（借款年利率）
- Used as Collateral（是否作为抵押品）
--------------------------------------------------------------------------------
3. deposit.html（存款/提款页面）
对应的 JS 文件：
- js/config.js - 全局配置和模拟数据
- js/wallet.js - 钱包状态检查
- js/op.js - 存取款操作逻辑（核心）
- js/main.js - 页面初始化
主要功能：
- ✅ 操作类型切换：
- Deposit（存款）标签
- Withdraw（提款）标签
- ✅ 资产选择：ETH / USDC 下拉菜单
- ✅ 金额输入框：
- 数字输入
- MAX 按钮（一键填入最大可用金额）
- 显示可用余额
- ✅ Use as Collateral 开关（仅存款时显示）：
- 切换是否将该资产用作抵押品
- ✅ 交易摘要：
- Current Supply APY（当前存款利率）
- Estimated Annual Yield（预计年收益 USD）
- Transaction Fee（预估 Gas 费）
- ✅ 操作按钮：
- Deposit 模式：💰 Deposit
- Withdraw 模式：💸 Withdraw
- ✅ 结果提示：成功/失败消息（3秒后自动消失）
- ✅ 未连接钱包时自动跳转回首页
--------------------------------------------------------------------------------
4. borrow.html（借款/还款页面）
对应的 JS 文件：
- js/config.js - 全局配置和模拟数据
- js/wallet.js - 钱包状态检查
- js/op.js - 借款还款操作逻辑（核心）
- js/main.js - 页面初始化
主要功能：
- ✅ 可借额度横幅：
- 大字显示 Available Borrow Capacity（USD）
- 渐变背景突出显示
- ✅ 操作类型切换：
- Borrow（借款）标签
- Repay（还款）标签
- ✅ 资产选择：ETH / USDC 下拉菜单
- ✅ 金额输入框：
- 数字输入
- MAX 按钮（根据操作类型智能计算最大值）
- 显示当前债务
- ✅ 交易详情：
- Borrow APY（借款年利率）
- Health Factor After（操作后的健康因子，实时计算）
- ⚠️ Liquidation Risk Warning（清算风险提示，HF < 1.2 时显示）
- LTV Limit（最大 LTV 限制 75%）
- ✅ 操作按钮：
- Borrow 模式：🏦 Borrow
- Repay 模式：💵 Repay
- ✅ 智能验证：
- 借款时检查是否超过可借额度
- 借款时检查是否超过 LTV 上限（75%）
- 还款时检查是否超过当前债务
- ✅ 结果提示：成功/失败消息
- ✅ 未连接钱包时自动跳转回首页
--------------------------------------------------------------------------------
🔧 JS 文件职责分工
js/config.js
// 全局状态管理
AppState = {
    walletConnected: false,
    currentAccount: null,
    chainId: null,
    portfolio: { ETH: {...}, USDC: {...} },  // 模拟数据
    protocolParams: { maxLTV: 0.75, ... }     // 协议参数
}

// 工具函数
Utils = {
    calculateTotalCollateral(),   // 计算总抵押
    calculateTotalDebt(),         // 计算总债务
    calculateHealthFactor(),      // 计算健康因子
    calculateLTV(),               // 计算 LTV
    calculateBorrowCapacity(),    // 计算可借额度
    formatCurrency(),             // 格式化货币
    formatToken(),                // 格式化代币数量
    shortenAddress(),             // 缩短地址显示
    isPositionSafe()              // 检查仓位是否安全
}

js/wallet.js
Wallet = {
    isMetaMaskInstalled(),        // 检测 MetaMask
    connect(),                    // 连接钱包（点击触发）
    disconnect(),                 // 断开连接
    checkPreviousConnection(),    // 检查之前的连接状态
    formatChainId(),              // 格式化链 ID
    onAccountChanged(),           // 监听账户变化
    onChainChanged()              // 监听网络变化
}

js/main.js
// 页面初始化入口
initializePage()                  // 根据 URL 路由到不同页面

initHomePage()                    // 首页初始化
initDashboardPage()               // 仪表板初始化
initDepositPage()                 // 存款页初始化
initBorrowPage()                  // 借款页初始化

// UI 更新函数
updateHeaderWalletAddress()       // 更新头部钱包地址
renderDashboardMetrics()          // 渲染仪表板指标
renderAssetDetails()              // 渲染资产详情
updateRiskBanner()                // 更新风险横幅

js/op.js
// 存款/提款功能
initDepositWithdraw()             // 初始化存取款页面
updateBalanceDisplay()            // 更新余额显示
updateTransactionSummary()        // 更新交易摘要
handleDepositWithdrawAction()     // 处理存取款操作

// 借款/还款功能
initBorrowRepay()                 // 初始化借款还款页面
updateBorrowCapacityDisplay()     // 更新可借额度
updateCurrentDebtDisplay()        // 更新当前债务
updateTransactionDetails()        // 更新交易详情（含 HF 预测）
calculateHealthFactorAfterOperation()  // 预测操作后的 HF
handleBorrowRepayAction()         // 处理借款还款操作

// 通用函数
showResultMessage()               // 显示结果消息
hideResultMessage()               // 隐藏结果消息

--------------------------------------------------------------------------------
📊 页面流程图
index.html (首页)
    ↓ 点击 Connect Wallet
    ↓ 连接 MetaMask
    ↓ 点击 Go to Dashboard
    
dashboard.html (仪表板)
    ↓ 查看总览数据
    ↓ 点击 Go to Deposit → deposit.html
    ↓ 点击 Go to Borrow → borrow.html

deposit.html (存取款)
    ↓ 选择资产 (ETH/USDC)
    ↓ 输入金额
    ↓ 点击 Deposit/Withdraw
    ↓ 操作成功 → 返回 dashboard

borrow.html (借款还款)
    ↓ 查看可借额度
    ↓ 选择资产 (ETH/USDC)
    ↓ 输入金额
    ↓ 实时查看 HF 变化
    ↓ 点击 Borrow/Repay
    ↓ 操作成功 → 返回 dashboard

--------------------------------------------------------------------------------
🎯 总结
页面核心 JS主要功能index.htmlwallet.js + main.js连接钱包，显示钱包信息dashboard.htmlconfig.js + main.js展示所有指标和资产详情deposit.htmlop.js + main.js存款/提款操作borrow.htmlop.js + main.js借款/还款操作，实时 HF 计算
所有页面共享：
- config.js - 数据和计算逻辑
- wallet.js - 钱包管理
- main.js - 页面路由和初始化
