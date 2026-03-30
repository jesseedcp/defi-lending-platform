# COMP5568 Group Project Brief

Based on:
- Course announcement posted on 2026-02-19
- `COMP5568-Lecture 5.pdf` pages 79-82

## 1. Confirmed Requirements

### Topic
Build a decentralized lending and borrowing platform.

### Important Dates
- Group presentation: 2026-04-17
- Final submission deadline: 2026-04-23

### Required Submission Materials
- Project report
- Codebase
- Git commit history
- Honour Declaration for Group Assessment/Assignment

### Weight
- This project counts for 15% of the course grade.
- Internal project grading:
  - 70% presentation + oral defense
  - 30% report + code + Git commit

## 2. Core Functionalities Required

Your platform should include at least the following:

### Wallet Integration
- Connect a Web3 wallet such as MetaMask.

### Lending Pool Mechanics
- Support at least two ERC-20 tokens.
- Suggested pair from the slides:
  - one relatively stable asset, such as USDC
  - one volatile asset, such as ETH or WBTC
- Users must be able to:
  - Deposit / Supply
  - Withdraw
  - Borrow
  - Repay

### Risk Management
- Implement over-collateralization.
- Enforce LTV limits.
- Calculate and display Health Factor in real time.

### Interest Rate Model
- Use a utilization-based model.
- A simple linear model is acceptable.
- A kinked model is also acceptable.
- Interest should accrue for both lenders and borrowers per block.

### Dashboard
- Show at least:
  - total collateral
  - total debt
  - supply APY
  - borrow APY
  - health factor

## 3. Bonus Features

These are not mandatory, but they can improve the project:

- Liquidation mechanism when `Health Factor < 1`
- Liquidation bonus / spread for liquidators
- Flash loan interface
- Real oracle integration such as Chainlink on a testnet
- Governance / reward token for liquidity mining
- Historical analytics, APY charts, utilization charts
- Other UX improvements or novel protocol ideas

## 4. What Will Likely Score Well

The slides explicitly say customized and innovative ideas can get more marks.

Examples from the slides:
- NFT as collateral
- Unusual or original interest rate model

Practical interpretation:
- A clean, working MVP is the baseline.
- One well-implemented differentiator is better than many half-finished features.
- Oral defense matters, so every teammate should understand the contract logic and Git history.

## 5. Requirement Ambiguity To Note

There is a small inconsistency:
- Announcement: each group can have at most 6 students
- Slides: 4-6 members per group

Safe interpretation:
- Do not exceed 6 members.
- If your group has fewer than 4 members, confirm with the instructor.

## 6. Recommended MVP Scope

Given the timeline, the safest MVP is:

### Smart Contract MVP
- Single lending pool contract
- Two supported ERC-20 assets
- Collateral factor / LTV settings per asset
- Supply, withdraw, borrow, repay
- Health factor calculation
- Linear utilization-based interest model
- Per-block interest accrual

### Frontend MVP
- MetaMask connect
- Asset list with wallet balance and pool status
- Supply / withdraw / borrow / repay forms
- Position panel:
  - collateral value
  - debt value
  - health factor
  - LTV usage
  - current APY

### Best Bonus To Add If Time Allows
1. Liquidation
2. Chainlink oracle on testnet
3. APY/utilization chart

This bonus order gives the best balance between protocol depth and presentation value.

## 7. Recommended Tech Stack

If you are starting from scratch, a practical stack is:

### Smart Contracts
- Solidity
- Hardhat or Foundry
- OpenZeppelin contracts

### Frontend
- React + Vite
- `ethers` or `viem`
- `wagmi` for wallet integration

### Network
- Local development on Hardhat/Anvil
- Demo on Sepolia or another testnet if stable enough before presentation

### Price Design
- Phase 1: fixed prices for fast contract completion
- Phase 2: replace with Chainlink price feeds for bonus marks

## 8. Team Split Suggestion

For a 4-6 person team:

1. Lending pool and accounting logic
2. Interest model and risk management
3. Liquidation / oracle / bonus feature
4. Frontend wallet and transaction flow
5. Dashboard, charts, and styling
6. Testing, report, demo, and integration support

Everyone should contribute commits that clearly show meaningful work.

## 9. Suggested Timeline From Today

Current date in this workspace: 2026-03-30

### By 2026-04-02
- Finalize feature scope
- Settle the contract architecture
- Assign team responsibilities

### By 2026-04-06
- Finish core contract functions:
  - supply
  - withdraw
  - borrow
  - repay
- Finish LTV and health factor logic

### By 2026-04-09
- Finish interest accrual
- Add tests for normal and edge cases
- Freeze contract interfaces

### By 2026-04-12
- Finish frontend transaction flows
- Show live position data on dashboard

### By 2026-04-14
- Add one bonus feature
- Record demo scenarios
- Start presentation deck

### By 2026-04-16
- Full rehearsal for oral defense
- Make sure every teammate can explain:
  - protocol flow
  - health factor
  - interest model
  - Git contribution

### 2026-04-17
- Presentation day

### 2026-04-18 to 2026-04-23
- Improve report
- Clean code and README
- Organize Git history
- Submit final materials

## 10. Minimal Demo Story For Presentation

Use one clean demo script:

1. User A supplies collateral
2. User A borrows another asset
3. Dashboard shows updated debt, APY, and health factor
4. Interest accrues over time
5. User A repays part or all of the loan
6. If liquidation is implemented, show an unsafe position being liquidated

## 11. Immediate Next Step

If you want the fastest path to a good submission, build in this order:

1. Contract state model
2. Supply / withdraw / borrow / repay
3. LTV + health factor
4. Interest accrual
5. Frontend dashboard
6. One bonus feature

That order matches both implementation dependency and grading value.
