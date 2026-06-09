# Voltis

Voltis is a private, desktop-first CME futures workspace for Dow and Nasdaq
analysis. It combines a fast candlestick chart with persistent, color-coded
multi-timeframe Fibonacci drawings and a gated execution boundary for a future
TradersPost integration.

## Current release

- YM and NQ analytical families with mini/micro execution sizing
- 5m, 10m, 30m, 1h, 4h, 1d, 3d, 1w, and 1M chart views
- Buy and sell fibs at 0, 0.382, 0.786, and 1
- One buy and one sell fib per family/timeframe
- Cross-timeframe overlays with age-based opacity
- Draggable active anchors that lock as manual drawings
- Per-layer visibility, lock, refresh, and delete controls
- Local persistence plus optional Neon workspace synchronization
- Armed paper execution with account selection and bracket inputs
- Typed, server-side execution endpoint with live routing intentionally gated
- Compact-screen protection that disables the trading workspace below 1024px

The bundled market feed is deterministic demo data. `DATABENTO_API_KEY` is
reserved for the dedicated market gateway phase; the key is never exposed to
the browser.

## Development

```bash
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`.

Quality checks:

```bash
pnpm test
pnpm lint
pnpm build
```

## Environment

Copy `.env.example` to `.env.local`.

```env
DATABENTO_API_KEY=
DATABASE_URL=
VOLTIS_USER_ID=yazan
TRADERSPOST_WEBHOOK_URL=
TRADING_MODE=paper
```

When `DATABASE_URL` is absent, drawings persist in browser storage. When it is
present, `/api/workspace` synchronizes the same state to Neon.

Generate and apply the database migration after configuring Neon:

```bash
pnpm db:generate
pnpm db:migrate
```

## Architecture

- `src/components/trading-workspace.tsx`: product shell and interactions
- `src/components/market-chart.tsx`: Lightweight Charts and fib overlay layer
- `src/lib/market.ts`: deterministic feed, interval definitions, anchor engine
- `src/lib/execution.ts`: replaceable execution provider boundary
- `src/app/api`: market, workspace, and execution server endpoints
- `src/db/schema.ts`: Neon/Drizzle workspace schema

Live TradersPost routing remains disabled until the account subscriptions,
prop-firm permissions, contract mapping, and test-mode behavior are verified.

