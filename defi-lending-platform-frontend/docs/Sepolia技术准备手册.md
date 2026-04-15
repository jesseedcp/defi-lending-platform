# DeFi 借贷平台 Sepolia 技术准备手册

这份手册是给**技术同事**使用的。

它的目标不是演示页面操作，而是提前把 `Sepolia` 上的链上数据准备好，确保演示人员打开前端后可以顺利完成：

1. `Connect Wallet`
2. `Supply`
3. `Borrow`
4. `Repay`
5. `Withdraw`
6. `Claim Rewards`
7. `Liquidation Preview / Execute`（可选）
8. `Admin`（可选）
9. `Flash Loan`（可选）

***

## 0. 准备目标

在正式演示开始前，技术同事至少需要完成下面这些结果：

- 演示用户钱包里有 `WETH`
- 演示用户钱包里有少量 `Sepolia ETH`
- 池子里有充足 `USDC` 流动性
- 清算人钱包里有 `USDC`
- 池子里有 `GOV` 奖励代币
- 如演示清算，演示用户已经有一个可清算仓位
- 如演示闪电贷，接收合约已经部署并完成测试

***

## 1. 固定信息

### 1.1 网络

| 字段           | 固定值                                                          |
| ------------ | ------------------------------------------------------------ |
| Network Name | `Sepolia Testnet`                                            |
| Chain ID     | `11155111`                                                   |
| 主 RPC        | `https://eth-sepolia.g.alchemy.com/v2/2GYv4ydbfSpLHXMdD0XLa` |
| 备用 RPC 1     | `https://rpc.sepolia.org`                                    |
| 备用 RPC 2     | `https://ethereum-sepolia-rpc.publicnode.com`                |

### 1.2 合约地址

| 合约          | 地址                                           |
| ----------- | -------------------------------------------- |
| LendingPool | `0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac` |
| Mock USDC   | `0x36fDF6b89ed07B6D8457739b27F57E41025A12e6` |
| Mock WETH   | `0x8965Af6756303c5A9312479f3797687a9B70c84e` |
| GOV         | `0xda58c1c86855c63408517cE32008DEE67Cd665dc` |

### 1.3 合约方法依据

下面这些准备步骤会用到仓库里的现有方法：

- `mint(address,uint256)`：`src/mocks/MockERC20.sol`
- `supply(address,uint256)`：`src/LendingPool.sol`
- `borrow(address,uint256)`：`src/LendingPool.sol`
- `repay(address,uint256)`：`src/LendingPool.sol`
- `liquidate(address,address,address,uint256)`：`src/LendingPool.sol`
- `previewLiquidation(address,address,address,uint256)`：`src/LendingPool.sol`
- `updateAnswer(int256)`：`src/mocks/MockV3Aggregator.sol`

***

## 2. 前置要求

正式执行前请确认：

- 本机已安装 `Foundry`
- 可以使用 `cast`
- 技术同事已经拿到演示账户和清算人账户的私钥
- 技术同事确认这些账户不是生产钱包
- 技术同事的终端网络能访问 `Sepolia` RPC

验证命令：

```bash
forge --version
cast --version
```

如果主 RPC 访问失败，优先切换到备用 RPC，不要一直重试同一个地址。

***

## 3. 安全要求

请务必遵守下面这些要求：

- 不要把真实私钥直接发到聊天工具
- 不要在投屏状态下输入私钥
- 不要把生产钱包用于演示准备
- 可以直接在命令里替换占位符，但不要把替换后的命令截图外传
- 如果私钥曾经出现在截图、聊天记录或共享文档中，视为泄露，应立即弃用该钱包

***

## 4. 建议准备的账户角色

建议至少准备下面 3 个账户：

| 角色           | 用途                                                                      |
| ------------ | ----------------------------------------------------------------------- |
| `Owner`      | 提供池子流动性、准备奖励、必要时调整预言机价格、演示管理员功能                                         |
| `Demo User`  | 前端主演示账户，执行 `Supply` / `Borrow` / `Repay` / `Withdraw` / `Claim Rewards` |
| `Liquidator` | 演示清算操作                                                                  |

推荐要求：

- `Demo User` 和 `Liquidator` 已提前导入 MetaMask
- 如要讲 `Admin`，`Owner` 也已提前导入 MetaMask
- 3 个地址已提前写入演示交接卡

***

## 5. 命令中的固定值与占位符

下面命令默认直接使用显式参数。

固定值：

- `LendingPool`：`0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac`
- `USDC`：`0x36fDF6b89ed07B6D8457739b27F57E41025A12e6`
- `WETH`：`0x8965Af6756303c5A9312479f3797687a9B70c84e`
- `GOV`：`0xda58c1c86855c63408517cE32008DEE67Cd665dc`
- `RPC URL`：优先使用 `https://rpc.sepolia.org`

需要你手动替换的占位符：

- `<OWNER_PRIVATE_KEY>`
- `<DEMO_USER_PRIVATE_KEY>`
- `<LIQUIDATOR_PRIVATE_KEY>`
- `<OWNER_ADDRESS>`
- `<DEMO_USER_ADDRESS>`
- `<LIQUIDATOR_ADDRESS>`
- `<WETH_ORACLE_ADDRESS>`

说明：

- 如果 `https://rpc.sepolia.org` 不通，可以把命令中的 `--rpc-url` 改成备用 RPC
- 所有命令都可以直接复制后替换尖括号内容再执行

***

## 6. 数量约定

本项目的 `USDC`、`WETH`、`GOV` 都是 `18` 位精度。

常用数量换算：

| 显示数量    | 链上数量                      |
| ------- | ------------------------- |
| `1`     | `1000000000000000000`     |
| `10`    | `10000000000000000000`    |
| `100`   | `100000000000000000000`   |
| `1000`  | `1000000000000000000000`  |
| `10000` | `10000000000000000000000` |
| `50000` | `50000000000000000000000` |

推荐演示准备量：

- 给 `Demo User`：`10 WETH`
- 给 `Owner`：`50000 USDC`
- 给 `Liquidator`：`10000 USDC`
- 给 `Pool`：`100000 GOV`

***

## 7. 第一步：给各账户 mint 演示代币

### 7.1 给演示用户 mint WETH

```bash
cast send 0x8965Af6756303c5A9312479f3797687a9B70c84e "mint(address,uint256)" <DEMO_USER_ADDRESS> 10000000000000000000 \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 给 `Demo User` 发放 `10 WETH`
- 用于前端的 `Supply` 演示

### 7.2 给 Owner mint USDC

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "mint(address,uint256)" <OWNER_ADDRESS> 50000000000000000000000 \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 给 `Owner` 发放 `50000 USDC`
- 用于后续向池子注入流动性

### 7.3 给清算人 mint USDC

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "mint(address,uint256)" <LIQUIDATOR_ADDRESS> 10000000000000000000000 \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 给 `Liquidator` 发放 `10000 USDC`
- 用于后续执行清算

### 7.4 给池子 mint GOV

```bash
cast send 0xda58c1c86855c63408517cE32008DEE67Cd665dc "mint(address,uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac 100000000000000000000000 \
  --rpc-url https://eth-sepolia.g.alchemy.com/v2/2GYv4ydbfSpLHXMdD0XLa \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 给池子发放 `100000 GOV`
- 用于 `Claim Rewards`

***

## 8. 第二步：给池子注入 USDC 流动性

如果只把 `USDC` mint 到 `Owner` 钱包，而不存进池子，前端 `Borrow` 仍然无法演示。

### 8.1 先授权

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "approve(address,uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac 50000000000000000000000 \
  --rpc-url https://ethereum-sepolia-rpc.publicnode.com \
  --private-key <OWNER_PRIVATE_KEY>
```

### 8.2 再 supply 到池子

```bash
cast send 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "supply(address,uint256)" 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 50000000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 池子获得 `50000 USDC` 流动性
- 前端 `Borrow` 页面可以正常借出 `USDC`

***

## 9. 第三步：给演示用户准备一个正常仓位

如果希望 `Dashboard` 一打开就不是全 0，可以提前替演示用户做好一笔存款和借款。

### 9.1 授权 WETH 给池子

```bash
cast send 0x8965Af6756303c5A9312479f3797687a9B70c84e "approve(address,uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac 10000000000000000000 \
  --rpc-url https://eth-sepolia.g.alchemy.com/v2/2GYv4ydbfSpLHXMdD0XLa \
  --private-key <DEMO_USER_PRIVATE_KEY>
```

### 9.2 演示用户 supply 10 WETH

```bash
cast send 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "supply(address,uint256)" 0x8965Af6756303c5A9312479f3797687a9B70c84e 10000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <DEMO_USER_PRIVATE_KEY>
```

### 9.3 演示用户 borrow 10000 USDC

```bash
cast send 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "borrow(address,uint256)" 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 10000000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <DEMO_USER_PRIVATE_KEY>
```

效果：

- `Demo User` 有抵押品
- `Demo User` 有债务
- `Dashboard` 不再是全 0
- 后续可直接演示 `Repay`、`Withdraw`、`Claim Rewards`

说明：

- 如果你希望仓位更保守，可以把借款额改小，例如 `5000 USDC`
- 如果你希望后续更容易进入清算，可以保留 `10000 USDC`

***

## 10. 第四步：为还款演示做准备

如果演示用户借过 `USDC`，理论上他已经有还款资金。\
但为避免演示前误转走，建议额外再给他补一点 `USDC`。

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "mint(address,uint256)" <DEMO_USER_ADDRESS> 1000000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <OWNER_PRIVATE_KEY>
```

效果：

- 给 `Demo User` 额外补 `1000 USDC`
- 避免现场 `Repay` 时因为余额不足失败

***

## 11. 第五步：准备清算演示所需的危险仓位

只有在借款人的 `Health Factor < 1` 时，清算才会成功。

推荐流程：

1. 演示用户先有抵押仓位
2. 演示用户借出较多 `USDC`
3. 技术同事把 `WETH` 价格下调

### 11.1 查询 WETH 对应的预言机地址

```bash
cast call 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "markets(address)(bool,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" 0x8965Af6756303c5A9312479f3797687a9B70c84e \
  --rpc-url https://rpc.sepolia.org
```

说明：

- 返回值中的第 2 个字段就是 `priceFeed`
- 把它记下来，然后替换下面命令里的 `<WETH_ORACLE_ADDRESS>`

### 11.2 把 WETH 价格从 2000 下调到 1000

`MockV3Aggregator` 使用 `8` 位价格精度。

- `2000 美元` 对应 `2000e8`
- `1000 美元` 对应 `100000000000`

```bash
cast send <WETH_ORACLE_ADDRESS> "updateAnswer(int256)" 100000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <OWNER_PRIVATE_KEY>
```

### 11.3 先做一次清算预览

```bash
cast call 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "previewLiquidation(address,address,address,uint256)(uint256,uint256,uint256)" \
  <DEMO_USER_ADDRESS> 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 0x8965Af6756303c5A9312479f3797687a9B70c84e 4000000000000000000000 \
  --rpc-url https://rpc.sepolia.org
```

判断标准：

- 如果返回值不是全 `0`
- 且 `healthFactorWad` 小于 `1000000000000000000`

说明已经具备清算条件

如果返回值仍然全 `0`，可以尝试：

- 再把 `WETH` 价格继续下调
- 或者先让 `Demo User` 再借一点 `USDC`

***

## 12. 第六步：准备清算人账户

清算人不仅要有 `USDC`，还必须先授权给池子。

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "approve(address,uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac 10000000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <LIQUIDATOR_PRIVATE_KEY>
```

效果：

- 清算人后续可以在前端执行 `Execute Liquidation`

***

## 13. 第七步：验证奖励领取是否可演示

`Claim Rewards` 要成功，至少满足两件事：

1. 池子里有 `GOV`
2. 演示用户已经有一些累计奖励

建议做法：

- 确保第 7 步里的 `mint GOV` 已完成
- 确保演示用户已经做过 `Supply`、`Borrow`
- 等待几个区块后，再做一次链上交互

如果你想再制造一些奖励累计，可以额外让 `Demo User` 做一次小额 `Repay`。

### 13.1 授权 USDC 给池子

```bash
cast send 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "approve(address,uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac 1000000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <DEMO_USER_PRIVATE_KEY>
```

### 13.2 做一次小额还款

```bash
cast send 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "repay(address,uint256)" 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 100000000000000000000 \
  --rpc-url https://rpc.sepolia.org \
  --private-key <DEMO_USER_PRIVATE_KEY>
```

效果：

- 帮助前端更快显示奖励累计变化

***

## 14. 第八步：准备 Admin 演示

如果要讲 `Admin`，请确认：

- 当前 `Owner` 地址就是池子的 `owner`
- `Owner` 账户已导入 MetaMask
- 不要在正式演示中随意改核心参数

可验证 `owner`：

```bash
cast call 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "owner()(address)" --rpc-url https://rpc.sepolia.org
```

建议：

- 正式演示时只展示权限识别和参数读取
- 如非必要，不要现场提交 `updateMarket`

***

## 15. 第九步：Flash Loan 准备说明

当前仓库里只有测试用的 `FlashLoanReceiverMock`，位于测试文件中，不能直接当成 Sepolia 现成脚本来部署。

这意味着：

- 如果本场必须讲 `Flash Loan`
- 技术同事需要额外整理一个可部署的 `Receiver` 合约
- 并提前在 `Sepolia` 上部署并验证成功

如果没有这部分准备，建议：

- 演示手册里把 `Flash Loan` 保留为可选项
- 现场只讲原理，不点执行

***

## 16. 最终校验命令

正式开始前，建议技术同事逐条执行下面的检查命令。

### 16.1 检查演示用户 WETH 余额

```bash
cast call 0x8965Af6756303c5A9312479f3797687a9B70c84e "balanceOf(address)(uint256)" <DEMO_USER_ADDRESS> --rpc-url https://rpc.sepolia.org
```

### 16.2 检查清算人 USDC 余额

```bash
cast call 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 "balanceOf(address)(uint256)" <LIQUIDATOR_ADDRESS> --rpc-url https://rpc.sepolia.org
```

### 16.3 检查池子 GOV 余额

```bash
cast call 0xda58c1c86855c63408517cE32008DEE67Cd665dc "balanceOf(address)(uint256)" 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac --rpc-url https://rpc.sepolia.org
```

### 16.4 检查演示用户账户快照

```bash
cast call 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "getAccountSnapshot(address)(uint256,uint256,uint256,uint256)" <DEMO_USER_ADDRESS> \
  --rpc-url https://rpc.sepolia.org
```

### 16.5 检查清算预览

```bash
cast call 0x4c5C2d3888171b879BC8D8733bFc0975982B47Ac "previewLiquidation(address,address,address,uint256)(uint256,uint256,uint256)" \
  <DEMO_USER_ADDRESS> 0x36fDF6b89ed07B6D8457739b27F57E41025A12e6 0x8965Af6756303c5A9312479f3797687a9B70c84e 4000000000000000000000 \
  --rpc-url https://rpc.sepolia.org
```

通过标准：

- `Demo User` 的 `WETH` 余额不为 `0`
- `Liquidator` 的 `USDC` 余额不为 `0`
- `Pool` 的 `GOV` 余额不为 `0`
- `getAccountSnapshot()` 返回的抵押和债务不是全 `0`
- 如要讲清算，`previewLiquidation()` 返回值不应全 `0`

***

## 17. 常见问题与处理

### 17.1 `tls handshake eof`

说明：

- 这是 RPC HTTPS 握手失败
- 不是合约方法报错

处理：

- 换备用 RPC
- 关闭代理或 VPN 重试
- 换手机热点

### 17.2 前端显示 `WETH = 0`

说明：

- 演示账户没有项目里的 `Mock WETH`
- 不等于没有 `Sepolia ETH`

处理：

- 重新执行 `mint WETH`
- 检查 MetaMask 是否切到正确地址

### 17.3 Borrow 失败提示流动性不足

说明：

- 池子里没有足够 `USDC`

处理：

- 重新执行 `approve USDC`
- 重新执行 `supply USDC`

### 17.4 Claim Rewards 失败

说明：

- 奖励没有累计出来
- 或者池子没有足够 `GOV`

处理：

- 再做一两次链上交互
- 检查池子的 `GOV balance`

### 17.5 清算失败提示 `position healthy`

说明：

- 当前仓位还不够危险

处理：

- 进一步下调 `WETH` 价格
- 或先增加借款额

***

## 18. 最小可用准备方案

如果时间紧，只需要完成下面这些步骤，就足够覆盖大部分基础演示：

1. 给 `Demo User` mint `10 WETH`
2. 给 `Owner` mint `50000 USDC`
3. 给 `Liquidator` mint `10000 USDC`
4. 给 `Pool` mint `100000 GOV`
5. `Owner` 执行 `approve + supply 50000 USDC`
6. `Demo User` 执行 `approve + supply 10 WETH`
7. `Demo User` 执行 `borrow 10000 USDC`
8. `Demo User` 额外补一点 `USDC`
9. 如要讲清算，再把 `WETH` 价格从 `2000` 下调到 `1000`

这样可以覆盖：

- `Dashboard`
- `Supply`
- `Borrow`
- `Repay`
- `Withdraw`
- `Claim Rewards`
- `Liquidation Preview / Execute`

***

## 19. 正式开始前最后确认

开始投屏前，技术同事请最后确认：

- 演示人员拿到的是正确的钱包地址
- MetaMask 已切到 `Sepolia`
- 演示账户里有 `WETH` 和少量 `Sepolia ETH`
- 池子里有 `USDC` 流动性
- 奖励池里有 `GOV`
- 如要讲清算，清算人已授权，预览有结果
- 如要讲 `Admin`，`Owner` 已导入 MetaMask
- 如要讲 `Flash Loan`，接收合约已部署并验过

做到这些，演示人员就不需要临场准备链上数据，只要专注页面操作即可。
