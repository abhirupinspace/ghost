# Ghost Protocol

Peer-to-peer lending protocol on Arc chain. Users deposit USDC, submit intents (lend/borrow orders), and the system matches them into on-chain loans with credit-scored collateral tiers.

## Architecture

```
ghost-contract/   Solidity — GhostLending.sol (Hardhat, ethers v6)
server/           TypeScript — Hono API + Drizzle/Postgres (Bun)
runner/           TypeScript — cron that polls /trigger endpoints (Bun)
```

**Flow:**
1. Users deposit USDC on-chain (`depositLend` / `depositCollateral`)
2. Users submit intents to the server API (lend or borrow orders)
3. Runner triggers `POST /trigger/settle` every 5min — matches intents, executes loans on-chain
4. Contract events auto-index to DB via indexer + Circle webhooks
5. Runner triggers `POST /trigger/liquidate` — liquidates overdue loans

## Prerequisites

- [Bun](https://bun.sh) (runtime for server + runner)
- Docker (Postgres)
- Node.js (Hardhat contract tests/deploy)

## Setup

```bash
# 1. Start Postgres
docker compose up -d

# 2. Server
cd server
cp .env.example .env   # edit CONTRACT_ADDRESS, SERVER_PRIVATE_KEY
bun install
bun run db:push         # push schema to postgres
bun run dev             # http://localhost:3000

# 3. Contract (separate terminal)
cd ghost-contract
bun install
bun run compile
bun run test
bun run deploy          # deploy to Arc testnet

# 4. Runner (separate terminal)
cd runner
bun install
bun run start           # polls settle + liquidate every 5min
```

## Environment Variables

| Var | Default | Description |
|-----|---------|-------------|
| `DATABASE_URL` | `postgresql://ghost:ghost@localhost:5432/ghost_db` | Postgres connection |
| `CONTRACT_ADDRESS` | — | Deployed GhostLending address |
| `SERVER_PRIVATE_KEY` | — | Server wallet key (for executeLoan/liquidate) |
| `API_KEY` | `ghost-secret-key` | Protects trigger endpoints |
| `SERVER_URL` | `http://localhost:3000` | Runner target (runner env) |
| `POLL_INTERVAL_MS` | `300000` | Runner poll interval (runner env) |

## Commands

```bash
# Contract
cd ghost-contract && bun run test       # hardhat test
cd ghost-contract && bun run compile    # hardhat compile
cd ghost-contract && bun run deploy     # deploy to Arc

# Server
cd server && bun run dev                # hot-reload dev server (port 3000)
cd server && bun test                   # all tests
cd server && bun run db:push            # push schema to postgres
cd server && bun run db:generate        # generate migrations
cd server && bun run db:studio          # drizzle studio

# Runner
cd runner && bun run start              # polls trigger endpoints

# Database
docker compose up -d                    # postgres on :5432
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | Health check |
| `POST` | `/intent/lend` | — | Submit lend order |
| `POST` | `/intent/borrow` | — | Submit borrow order |
| `DELETE` | `/intent/:id` | — | Cancel intent |
| `GET` | `/intents/:address` | — | User's active intents |
| `GET` | `/market/stats` | — | Aggregate market stats |
| `GET` | `/market/orderbook` | — | Full order book |
| `GET` | `/loans/:address` | — | User's loans (borrower + lender) |
| `GET` | `/loans/overdue` | — | Overdue loans |
| `POST` | `/loans/sync/:loanId` | — | Sync loan status from chain |
| `GET` | `/user/:address/lends` | — | Lender dashboard |
| `GET` | `/user/:address/borrows` | — | Borrower dashboard |
| `GET` | `/user/:address/credit` | — | Credit score |
| `GET` | `/user/:address/activity` | — | Activity log (last 50) |
| `POST` | `/trigger/settle` | `x-api-key` | Match intents + execute loans |
| `POST` | `/trigger/liquidate` | `x-api-key` | Liquidate overdue loans |
| `POST` | `/webhook/circle` | — | Circle SCP event webhook |

Full API reference with request/response schemas: [`docs/integration.md`](docs/integration.md)

## Contract: GhostLending.sol

**Chain:** Arc Testnet (5042002) | **Solidity:** 0.8.24 | **Native token:** USDC (payable)

**Deployed:** [`0xdD996e8419Ce81Be3D60bF8490D9C3a6C590eb92`](https://testnet.arcscan.app/address/0xdD996e8419Ce81Be3D60bF8490D9C3a6C590eb92) on Arc Testnet

### User Functions
```solidity
function depositLend() external payable
function withdrawLend(uint256 amount) external
function depositCollateral() external payable
function withdrawCollateral(uint256 amount) external
function repay(uint256 loanId) external payable
```

### Server-Only (onlyServer)
```solidity
function executeLoan(address borrower, address[] senior, uint256[] seniorAmts,
  address[] junior, uint256[] juniorAmts, uint256 principal,
  uint256 collateral, uint256 rate, uint256 duration) external
function liquidate(uint256 loanId) external
```

### Credit & Collateral

| Score | Collateral | Score Change |
|-------|-----------|-------------|
| 0–299 | 200% | +50 repay / -150 default |
| 300–599 | 150% | |
| 600–799 | 120% | |
| 800–1000 | 100% | |

Default score: 500. Interest: `(principal * rateBps * elapsed) / (10000 * 365 days)`.

Senior lenders get repaid first on both repayment and liquidation.

## Database

4 Postgres tables via Drizzle ORM:

- **intents** — lend/borrow order book
- **loans** — on-chain loan mirror
- **lender_positions** — per-lender tranche tracking
- **activities** — event audit log

## Tech Stack

| Component | Tech |
|-----------|------|
| Contract | Solidity 0.8.24, Hardhat, ethers v6 |
| Server | Bun, Hono, Drizzle ORM, viem |
| Database | Postgres 16 (Docker) |
| Runner | Bun (simple fetch loop) |
| Chain | Arc Testnet (5042002) |
