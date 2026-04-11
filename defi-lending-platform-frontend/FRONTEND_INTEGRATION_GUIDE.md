# Frontend Integration Guide

## 1. 项目结论

- 当前仓库没有传统 HTTP 后端服务，也没有 REST/OpenAPI 文档。
- 前端真实需要对接的是 `LendingPool.sol` 合约、ERC20 资产合约和 MetaMask 钱包。
- 认证机制不是账号密码/JWT，而是浏览器钱包授权。

## 2. 前端接入架构

新增前端分层如下：

- `js/config.js`
  - 统一维护全局状态 `AppState`
  - 提供金额格式化、链 ID 转换、资产映射、HF/LTV 计算等工具
- `js/protocol.js`
  - 统一封装所有合约 ABI
  - 负责钱包连接、会话 token 存储、自动续期
  - 提供所有合约读写方法
  - 负责错误映射和链上状态同步
- `js/wallet.js`
  - 对页面暴露轻量的钱包接口
- `js/main.js`
  - 负责页面初始化、全局状态刷新、Dashboard 数据渲染
- `js/op.js`
  - 负责 Supply/Withdraw、Borrow/Repay、Liquidation、Flash Loan、Admin 的 UI 交互

## 3. 运行前配置

前端首页新增了部署配置区，至少需要填写：

- `LendingPool Address`
- `Expected Chain ID`

前端会把配置保存在 `localStorage`，后续页面直接复用。

## 4. 认证与会话

### 4.1 实际认证方式

- 用户点击 `Connect Wallet`
- 前端调用 `eth_requestAccounts`
- 读取 `eth_chainId`
- 使用当前账户和链 ID 生成本地会话 token

### 4.2 会话 token 说明

- 该 token 仅用于前端登录态持久化
- 不替代链上签名认证
- 会保存在 `localStorage`
- 默认有效期 4 小时
- 当页面检测到会话即将过期时，会通过 `eth_accounts` 自动续期

### 4.3 自动续期边界

- 钱包账户变化时自动刷新
- 网络变化时自动刷新
- 如果钱包断开授权，会清空本地会话

## 5. 协议 API 总表

### 5.1 管理员写接口

| 方法 | 前端封装 | 说明 |
|------|----------|------|
| `setRewardToken(address)` | `Protocol.setRewardToken(address)` | 设置奖励代币 |
| `listMarket(...)` | `Protocol.listMarket(payload)` | 上线新市场 |
| `updateMarket(...)` | `Protocol.updateMarket(payload)` | 更新市场参数 |

### 5.2 用户写接口

| 方法 | 前端封装 | 说明 |
|------|----------|------|
| `claimRewards()` | `Protocol.claimRewards()` | 领取奖励 |
| `supply(address,uint256)` | `Protocol.supply(asset, amount)` | 存款，自动处理 approve |
| `withdraw(address,uint256)` | `Protocol.withdraw(asset, amount)` | 提款 |
| `borrow(address,uint256)` | `Protocol.borrow(asset, amount)` | 借款 |
| `repay(address,uint256)` | `Protocol.repay(asset, amount)` | 还款，自动处理 approve |
| `liquidate(...)` | `Protocol.liquidate(payload)` | 执行清算，自动处理 approve |
| `flashLoan(...)` | `Protocol.flashLoan(payload)` | 发起闪电贷 |

### 5.3 查询接口

| 方法 | 前端用途 |
|------|----------|
| `owner()` | 判断管理员权限 |
| `rewardToken()` | 读取奖励代币 |
| `markets(asset)` | 读取市场参数 |
| `getListedAssets()` | 动态渲染资产列表和下拉框 |
| `getAssetPrice(asset)` | 读取链上价格 |
| `getMarketState(asset)` | 读取市场总供给/总借款 |
| `getRates(asset)` | 读取利用率、Supply APR、Borrow APR |
| `supplyBalance(user, asset)` | 读取用户存款 |
| `borrowBalance(user, asset)` | 读取用户债务 |
| `getAccountSnapshot(user)` | 读取 Total Collateral / Debt / Borrow Capacity / HF |
| `availableLiquidity(asset)` | 读取池子流动性 |
| `previewLiquidation(...)` | 清算前预估 repay 和 seize |
| `userAccruedRewards(user)` | 读取累计奖励 |
| `userRewardLastUpdate(user,asset)` | 读取奖励更新时间 |
| `userSupplyShares(user,asset)` | 读取供给份额 |
| `userBorrowShares(user,asset)` | 读取借款份额 |

## 6. 统一数据模型

前端不再使用 mock portfolio，而是统一使用链上同步后的结构：

```js
AppState.protocol = {
  owner,
  rewardToken,
  rewardTokenMeta,
  isOwner,
  accruedRewards,
  rewardBalance,
  accountSnapshot: {
    totalCollateralUsd,
    totalDebtUsd,
    borrowCapacityUsd,
    healthFactorWad
  },
  assets: [
    {
      address,
      name,
      symbol,
      decimals,
      priceUsd,
      walletBalance,
      supplied,
      borrowed,
      allowance,
      ltvBps,
      liquidationThresholdBps,
      availableLiquidity,
      utilization,
      supplyApy,
      borrowApy,
      market
    }
  ]
}
```

## 7. UI 对接关系

### 7.1 首页

- 钱包连接
- 会话 token 展示
- 部署参数配置
- 手动刷新协议状态

### 7.2 Dashboard

- 绑定 `getAccountSnapshot` 结果
- 绑定资产市场列表
- 展示 owner、rewardToken、chain、reward 状态
- 支持直接领取奖励

### 7.3 Deposit 页面

- 动态读取已上线资产
- `Supply` 前自动检查并补充授权
- `Withdraw` 前显示当前可提数量
- 页面提示“合约自动将 supply 计入抵押”

### 7.4 Borrow 页面

- 绑定可借额度
- 绑定当前债务
- 预估借款/还款后的 HF
- 展示资产流动性和有效 LTV

### 7.5 Advanced 页面

- 奖励领取
- 清算预览与执行
- Flash loan 调用
- Admin 市场管理

## 8. 错误处理策略

统一在 `Protocol.mapError()` 中处理：

- `4001` -> 用户取消钱包操作
- `-32002` -> MetaMask 正在处理上一请求
- `4902` -> 当前网络未添加到钱包
- `execution reverted: ...` -> 提取真实 revert message
- `not owner` -> 当前钱包不是管理员
- `insufficient allowance` -> 需要先授权代币
- `insufficient balance` -> 钱包余额不足

页面层统一把异常显示为中文提示。

## 9. 联调建议

### 9.1 推荐流程

1. 启动本地链或测试网节点
2. 部署 `LendingPool`、MockERC20、MockV3Aggregator
3. 将部署后的 `LendingPool Address` 和 `Chain ID` 填到首页
4. 用 MetaMask 切换到相同网络
5. 依次验证 Dashboard、Supply、Borrow、Repay、Claim Rewards、Liquidation、Admin

### 9.2 关键注意事项

- `supply / repay / liquidate` 都依赖 ERC20 `approve`
- `flashLoan` 需要接收合约实现 `executeOperation`
- 当前合约没有“关闭抵押”的接口，所有 supply 默认参与抵押
- 前端应以链上返回的资产列表和市场参数为准，不再写死 ETH / USDC

## 10. 已完成的验证

- 通过编辑器诊断检查新增前端文件没有显式语法错误
- 前端页面结构已更新为链上驱动模式
- 后续如需做完整人工联调，需要提供真实部署地址并在钱包中切换到对应网络
