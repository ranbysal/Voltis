# Voltis

Voltis is Yazan's private CME futures workspace for Dow and Nasdaq analysis.
It combines a fast dark chart, persistent multi-timeframe Fibonacci layers,
and a deliberately gated execution panel for funded-account workflows.

## Implemented workspace

- YM and NQ continuous analytical charts with YM/MYM and NQ/MNQ sizing
- 5m, 10m, 30m, 1h, 4h, 1d, 3d, 1w, and 1M ETH-session views
- Buy and sell fibs at 0, 0.382, 0.786, and 1
- Auto anchors using deviation 20 and depth 50, plus draggable manual anchors
- One buy and one sell layer per family/timeframe
- Cross-timeframe overlays with direction colors and timeframe opacity
- Layer visibility, lock, refresh, delete, local persistence, and optional Neon
- Password-protected single-user access and authenticated server routes
- Desktop trading workspace plus a compact read-only chart experience
- Armed paper orders with account selection, mini/micro sizing, and brackets

Live TradersPost routing remains intentionally disabled until Yazan's
subscriptions, prop-firm permissions, account identifiers, and test behavior
are verified.

## Market data

Voltis supports three progressively stronger data modes:

1. With no credentials, deterministic demo bars keep the complete UI usable.
2. `DATABENTO_API_KEY` enables authenticated Databento historical requests,
   continuous symbol mapping, ETH aggregation, and additive back adjustment.
3. The Python gateway in `services/market-gateway` subscribes to finalized
   Databento `ohlcv-1m` bars and streams them to the browser over an
   authenticated websocket. The Databento key never reaches the browser.

The app falls back to 30-second historical refreshes if the live gateway
disconnects.

## Development

```powershell
pnpm install
pnpm dev
```

Open `http://127.0.0.1:3000`.

Quality checks:

```powershell
pnpm test
pnpm lint
pnpm build
```

## Environment

Copy `.env.example` to `.env.local`.

```env
DATABENTO_API_KEY=
VOLTIS_ACCESS_PASSWORD=
VOLTIS_SESSION_SECRET=
VOLTIS_USER_ID=yazan
MARKET_GATEWAY_URL=
MARKET_GATEWAY_SECRET=
DATABASE_URL=
TRADERSPOST_WEBHOOK_URL=
TRADING_MODE=paper
```

`VOLTIS_SESSION_SECRET` and `MARKET_GATEWAY_SECRET` must each be at least 32
characters. Use `wss://` for `MARKET_GATEWAY_URL` in production.

When `DATABASE_URL` is absent, workspace state persists in browser storage.
When present, `/api/workspace` synchronizes the same state to Neon.

```powershell
pnpm db:generate
pnpm db:migrate
```

See `services/market-gateway/README.md` for gateway setup.

## Architecture

- `src/components/trading-workspace.tsx`: responsive product shell
- `src/components/market-chart.tsx`: Lightweight Charts and SVG fib layer
- `src/lib/market.ts`: fixture feed and automatic anchor engine
- `src/lib/market-data.ts`: Databento history and back adjustment
- `src/lib/market-aggregation.ts`: CME ETH timeframe aggregation
- `src/lib/market-stream.ts`: short-lived websocket authorization
- `src/lib/execution.ts`: replaceable paper/live execution boundary
- `src/app/api`: authenticated market, workspace, auth, and execution routes
- `services/market-gateway`: deployable Databento live websocket service
