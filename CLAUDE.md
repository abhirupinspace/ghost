# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Contract
cd ghost-contract && bun run test          # hardhat test
cd ghost-contract && bun run compile       # hardhat compile
cd ghost-contract && bun run deploy        # deploy to Arc

# Server
cd server && bun run dev                   # hot-reload dev server (port 3000)
cd server && bun test                      # all tests
cd server && bun test src/routes/intents.test.ts  # single test file
cd server && bun run db:push              # push schema to postgres
cd server && bun run db:generate          # generate migrations
cd server && bun run db:studio            # drizzle studio

# Database
docker compose up -d                       # postgres on :5432

# Runner
cd runner && bun run start                 # polls trigger endpoints every 5min
```

**Always use `bun` — never npm/yarn/npx.**

## Architecture

Three-component lending protocol: smart contract (on-chain logic) + server (API + DB) + runner (cron).

```
ghost-contract/   Solidity — GhostLending.sol (Hardhat, ethers v6)
server/           TypeScript — Hono API + Drizzle/Postgres (Bun runtime)
runner/           TypeScript — polls /trigger/settle and /trigger/liquidate (Bun)
```

### Flow
1. Users deposit lend/collateral on-chain, then submit intents to server
2. Runner triggers `/trigger/settle` → `clearMarket()` matches lend+borrow intents → calls `contract.executeLoan()`
3. Runner triggers `/trigger/liquidate` → finds overdue loans → calls `contract.liquidate()`
4. Event indexer listens to contract events → writes to DB (loans, positions, activities)

### Contract: GhostLending.sol
- Native token = USDC (payable functions, no ERC20)
- Senior/junior tranches — senior lenders get priority on liquidation
- Credit scores 0-1000 (default 500), +50 on repay, -150 on default
- Collateral tiers: score 0-299=200%, 300-599=150%, 600-799=120%, 800-1000=100%
- `onlyServer` modifier gates `executeLoan()` and `liquidate()`
- Arc chain (chainId 5042002) + local hardhat network

### Server
- Hono routes mounted at root: intents, market, loans, user, trigger
- Trigger routes protected by `x-api-key` header (`apiKeyAuth` middleware)
- `server/src/lib/contract.ts` — ethers provider + ABI for read/write contract access
- `server/src/lib/responses.ts` — `ok(c, data)` / `err(c, msg, status)` helpers
- `server/src/services/clearing.ts` — `clearMarket()` matches intents by rate/duration/tranche
- `server/src/services/indexer.ts` — `startIndexer()` subscribes to 7 contract events

### Database (Drizzle + Postgres)
4 tables: `intents` (lend/borrow order book), `loans` (on-chain loan mirror), `lender_positions` (per-lender tranche tracking), `activities` (event log). Connection string: `DATABASE_URL` env var or defaults to `postgresql://ghost:ghost@localhost:5432/ghost_db`.

## Environment Variables

```
DATABASE_URL=postgresql://ghost:ghost@localhost:5432/ghost_db
CONTRACT_ADDRESS=0x...
RPC_URL=https://rpc.arc.money
SERVER_PRIVATE_KEY=0x...
API_KEY=ghost-secret-key
```

Bun auto-loads `.env` — no dotenv needed.
