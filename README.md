# COMP5568 Lending Protocol

Foundry-based starter for the COMP5568 group project.

## Current Status

This workspace now contains:
- a Foundry project layout
- a minimal lending pool prototype
- self-contained Solidity tests
- a project brief derived from the course announcement and slides

## Project Structure

- `src/LendingPool.sol`: minimal lending/borrowing protocol
- `src/interfaces/IERC20.sol`: local ERC-20 interface
- `src/mocks/MockERC20.sol`: simple mock token for testing
- `test/LendingPool.t.sol`: protocol tests covering borrow, repay, interest, and liquidation
- `script/DeployLendingPool.s.sol`: minimal deployment script
- `foundry.toml`: Foundry configuration
- `PROJECT_BRIEF.md`: extracted course requirements and recommended scope
- `PPT_STATUS.md`: PPT requirement tracking and project status summary

## Implemented MVP Features

- Two-or-more asset market design
- Supply / withdraw / borrow / repay
- Per-asset LTV and liquidation threshold
- Health factor calculation
- Utilization-based linear interest model
- Per-block interest accrual through lazy updates
- Account snapshot view for dashboard integration
- Liquidation flow with a 5% liquidation bonus
- Liquidation preview interface for frontend quoting

## Important Simplifications

This is a starter, not a production-safe protocol.

- Token valuation assumes 18-decimal assets
- Prices are owner-set on-chain, not oracle-driven
- No reserve factor or protocol fee yet
- No pause / guardian / access-control hardening beyond owner checks
- No flash loan support yet

## Recommended Next Steps

1. Replace fixed prices with a real oracle.
2. Add better test coverage for multi-asset and edge-case flows.
3. Build a frontend dashboard around `getAccountSnapshot` and `previewLiquidation`.
4. Add protocol safety features such as caps, pause controls, and reserve accounting.

## Notes For The Project

If your team wants the best score/time tradeoff, keep this order:

1. Make the core pool stable
2. Add oracle integration
3. Add frontend polish and analytics
4. Expand tests and risk controls
