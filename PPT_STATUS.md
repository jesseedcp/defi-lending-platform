# COMP5568 项目要求与当前状态

依据文件：
- `COMP5568-Lecture 5.pdf` 第 79-82 页
- 老师 2026-02-19 公告

## 1. 项目基本要求

- 项目主题：去中心化借贷平台
- 展示日期：2026-04-17
- 最终提交日期：2026-04-23
- 提交内容：
  - Project Report
  - Codebase
  - Git commit history
  - Honour Declaration for Group Assessment/Assignment

## 2. 当前项目的重要实现假设

当前版本统一采用：
- 所有演示资产均为 18-decimal ERC-20 mock token

这意味着：
- 当前代码在这个前提下是自洽的
- 当前项目满足“至少支持两种 ERC-20”的基础要求
- 当前版本不宣称兼容真实 USDC 这类 6-decimal token

建议在答辩和报告中明确说明：
- 当前版本为了聚焦借贷协议核心逻辑，演示资产统一采用 18-decimal ERC-20 mock assets
- 真实 USDC 一类 6-decimal token 的 decimals normalization 暂未纳入本版本实现范围

## 3. PPT 基础功能要求 vs 当前状态

| PPT要求 | 当前状态 | 说明 |
| --- | --- | --- |
| 接入 Web3 钱包，如 MetaMask | 未完成 | 这部分属于前端，还没开始做 |
| 至少支持两种 ERC-20 | 已完成 | 当前合约支持多资产市场，测试里已使用两种 18-decimal mock token |
| Deposit / Supply | 已完成 | 已实现 `supply` |
| Withdraw | 已完成 | 已实现 `withdraw` |
| Borrow | 已完成 | 已实现 `borrow` |
| Repay | 已完成 | 已实现 `repay` |
| 超额抵押 | 已完成 | 借款受抵押能力限制 |
| 实时 Health Factor | 已完成 | 已实现账户级 `Health Factor` 计算 |
| LTV 限制 | 已完成 | 每个资产可配置 `ltvBps` |
| 基于 Utilization 的动态利率模型 | 已完成 | 当前实现为线性模型 |
| 按区块计息 | 已完成 | 已实现 lazy accrual |
| Dashboard 显示 Total Collateral / Debt / APY / HF | 部分完成 | 合约侧已有快照和利率接口，前端页面还没做 |

## 4. PPT 加分项 vs 当前状态

| 加分项 | 当前状态 | 说明 |
| --- | --- | --- |
| Liquidation | 已完成 | 已支持第三方清算不健康仓位 |
| Liquidation Bonus / Spread | 已完成 | 当前实现为 5% 清算奖励 |
| Flash Loan | 未完成 | 目前没有实现 |
| Oracle Integration，如 Chainlink | 未完成 | 当前价格是手动设置，不是真实预言机 |
| Governance / Reward Token | 未完成 | 目前没有奖励机制 |
| 历史图表 / APY 图 / Utilization 图 | 未完成 | 前端还没开始做 |
| 其他创新功能 | 未完成 | 后续可考虑 NFT 抵押或更特别的利率模型 |

## 5. 当前已经完成的智能合约内容

目前工作区已经有一个可编译、可测试的 Foundry 智能合约原型。

### 已完成文件

- `foundry.toml`
- `src/LendingPool.sol`
- `src/interfaces/IERC20.sol`
- `src/mocks/MockERC20.sol`
- `test/LendingPool.t.sol`
- `script/DeployLendingPool.s.sol`

### 已完成的核心逻辑

- 多资产市场
- 市场配置：价格、LTV、清算阈值、基础利率、利率斜率
- `supply`
- `withdraw`
- `borrow`
- `repay`
- 抵押能力检查
- `Health Factor` 计算
- `Utilization` 驱动的线性利率
- 按区块计息
- 前端可用的账户快照接口
- `previewLiquidation` 清算预览接口
- `liquidate` 清算接口
- 5% 清算奖励

## 6. 当前测试状态

已经在 WSL 中真实跑通：

- `forge build`
- `forge test -vv`

当前测试结果：
- 6 个测试全部通过

已覆盖的测试场景：
- 在 LTV 范围内借款成功
- 超过 LTV 借款失败
- 还款后再提款
- 跨区块利息累积
- 健康仓位不能被清算
- 不健康仓位可被清算，且抵押品按奖励比例被扣除

## 7. 当前还缺什么

为了更接近 PPT 完整要求，目前还缺：

- 前端钱包连接
- Dashboard 页面
- Chainlink 预言机
- Flash Loan
- 报告
- Git 仓库初始化与规范提交历史

从智能合约角度还建议继续补：

- 更多极端情况测试
- 更完整的风控和权限控制

## 8. 当前完成度判断

如果只看智能合约核心借贷逻辑：
- 基础功能已经完成了大部分
- 关键 bonus 里的 liquidation 也已经补上
- 在“全部演示资产均为 18 decimals”的假设下，当前逻辑是成立的

如果看整个课程项目交付：
- 目前仍然只是完成了“后端合约 MVP+”
- 距离最终可展示版本还有明显工作量

## 9. 建议下一步优先级

建议按这个顺序继续做：

1. 接入 Chainlink 价格预言机
2. 做前端钱包连接和 Dashboard
3. 初始化 Git 仓库并开始规范提交
4. 补多资产和边界测试
5. 准备展示和报告

## 10. 一句话总结

当前项目已经有一个能运行、能测试的借贷协议基础版智能合约，覆盖了 PPT 大部分基础功能，并已经补上 liquidation；在“演示资产统一为 18-decimal mock token”的前提下，当前智能合约逻辑成立，但前端、预言机和最终提交材料还没有完成。
