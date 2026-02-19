# CLAUDE.md — Mercury System Documentation

> Last updated: 2026-02-18
> Purpose: Single source of truth for what's built, what's real, what's simulated, and what's missing.

---

## Project Overview

Mercury is an automated trading platform for prediction markets (Polymarket, Kalshi), crypto, stocks, weather, and economic data. Users describe strategies in plain English or build them visually using a node editor. The engine compiles these into executable pipelines and runs them with paper or live trading.

**Two codebases:**
- `mercury/` — Frontend (vanilla HTML/CSS/JS, no framework)
- `mercury-engine/` — Backend (Python FastAPI, port 8778)

---

## Repository Structure

### Backend: `mercury-engine/`

```
mercury-engine/
├── main.py                 # FastAPI app + lifespan (health checks, bot recovery)
├── config.py               # All env vars (Turnkey, Poly, Kalshi, Supabase, AI)
├── db.py                   # SQLite persistence (bots, trades, positions, logs, strategies)
├── requirements.txt        # Python deps (fastapi, py-clob-client, web3, PyJWT, anthropic)
├── Dockerfile              # Python 3.12-slim, uvicorn on 8778
├── docker-compose.yml      # engine + nginx services
├── nginx.conf              # Reverse proxy, rate limiting, SSL-ready
├── deploy.sh               # VPS deployment script
├── .env.example            # Template (INCOMPLETE — missing Turnkey/Supabase/Builder vars)
├── api/
│   ├── auth.py             # Supabase JWT middleware (HS256, extracts user_id from sub)
│   ├── bots.py             # Bot CRUD: deploy, stop, pause, resume, delete, logs, trades
│   ├── strategies.py       # Strategy save/load/list (user-scoped)
│   ├── wallet.py           # Polymarket wallet: create, balance, withdraw, positions
│   ├── markets.py          # Public market data (Polymarket + Kalshi listings)
│   ├── agent.py            # AI chat (Claude API): conversational + strategy builder tool
│   ├── backtest.py         # Run backtests against historical data
│   └── rate_limit.py       # Per-IP token + message rate limiting
├── engine/
│   ├── scheduler.py        # Central bot manager: deploy, stop, connector init, recovery
│   ├── runner.py           # Bot execution loop (10s interval, 3 data paths)
│   ├── compiler.py         # Strategy validation + node instantiation
│   ├── paper.py            # Paper trading: simulated fills with 0.5% slippage
│   ├── live.py             # Live trading: routes to Polymarket/Kalshi real APIs
│   └── backtester.py       # Historical replay: Polymarket CLOB, Binance, Coinbase, Yahoo, Open-Meteo
├── connectors/
│   ├── base.py             # Abstract BaseConnector interface
│   ├── polymarket.py       # Public (read-only): Gamma API + CLOB
│   ├── polymarket_auth.py  # Authenticated: py-clob-client + Turnkey HSM signing
│   ├── kalshi.py           # Authenticated: RSA-PSS signed API, full trading
│   ├── price_feeds.py      # BTC price: Coinbase + Binance with cache
│   └── live_feeds.py       # LiveFeedRouter: crypto, stocks, weather, normalized to 5-95
├── services/
│   ├── turnkey_service.py  # Turnkey HSM: sub-org creation, hash signing, P-256 ECDSA
│   ├── turnkey_signer.py   # Adapter: TurnkeySigner → py-clob-client Signer interface
│   └── wallet_manager.py   # Full wallet lifecycle: Turnkey EOA → proxy deploy → CLOB creds
├── nodes/
│   ├── __init__.py         # NODE_REGISTRY — maps type strings to classes
│   ├── base.py             # BaseNode abstract class
│   ├── triggers.py         # 15 trigger types (8 real, 7 simulated)
│   ├── conditions.py       # 11 condition types (ALL real)
│   ├── executions.py       # 9 execution types (ALL real)
│   ├── risk.py             # 10 risk types (ALL real)
│   └── indicators.py       # 6 technical indicators (ALL real)
└── models/
    ├── bot.py              # Bot, BotStatus, BotLog (Pydantic)
    ├── strategy.py         # StrategyJSON, Pipeline, AssetConfig (Pydantic)
    └── trade.py            # Trade, PaperPosition (Pydantic)
```

### Frontend: `mercury/`

```
mercury/
├── index.html              # Landing page
├── hub.html                # Dashboard (Architect + Research + Funding views)
├── login.html              # Supabase auth (email/password + Google OAuth)
├── styles/                 # CSS files
├── scripts/
│   ├── core/
│   │   ├── config.js       # ENV detection, API/ENGINE base URLs, SUPABASE config
│   │   └── auth.js         # fetchWithAuth, requireAuth, getCurrentUser (Supabase)
│   ├── architect-app.js    # ~6000 lines: node editor, bot management, AI agent, deploy
│   ├── data-bridge.js      # Market data bridge (BTC, ETH, DVol, Polymarket, Kalshi)
│   ├── funding.js          # Wallet/funding UI (balance, positions, withdraw)
│   ├── wallet-service.js   # MercuryWalletService class (engine API wrapper)
│   ├── charting.js         # TradingView-style charts
│   ├── auth.js             # Legacy auth script (pre-module)
│   ├── landing.js          # Landing page animations
│   ├── tiers.js            # Tier config (free/pro/enterprise limits)
│   └── ...                 # Various UI scripts
└── assets/                 # Images, icons
```

---

## What's REAL vs SIMULATED

### REAL (Production-Ready)

| Component | Details |
|-----------|---------|
| **8 Trigger Nodes** | `market`, `price-threshold`, `volume-spike`, `time-based`, `market-event`, `probability-cross`, `api-data` (5 presets + custom URL), `news-alert` (NWS weather + USGS earthquake). All triggers are real — simulated nodes were removed. |
| **6 Indicator Nodes** | `rsi`, `macd`, `bollinger`, `moving-average`, `rate-of-change`, `pattern` — computed on probability curve history |
| **11 Condition Nodes** | ALL real — `probability-band`, `liquidity-check`, `portfolio-exposure`, `correlation`, `time-window`, `spread-check`, `momentum`, `volatility`, `logic-gate`, `price-range`, `volume-filter` |
| **9 Execution Nodes** | ALL real — `market-order`, `limit-order`, `scaled-entry`, `dca`, `close-position`, `hedge`, `twap`, `conditional-order`, `rebalance` |
| **10 Risk Nodes** | ALL real — `stop-loss`, `position-limit`, `portfolio-cap`, `max-drawdown`, `take-profit`, `trailing-stop`, `time-exit`, `daily-loss-limit`, `cooldown`, `size-scaler` (Kelly, fixed-fractional, vol-scaled) |
| **Polymarket Public** | Market listings (Gamma API), prices, orderbooks (CLOB API) |
| **Polymarket Authenticated** | `py-clob-client` SDK, Turnkey HSM signing (signature_type=2), SOCKS5 proxy, balance, orders, positions, trades |
| **Kalshi Authenticated** | RSA-PSS signed API, balance, orders, positions, markets, orderbook, implied BTC price |
| **LiveFeedRouter** | Binance/Coinbase (crypto), Yahoo Finance (stocks/indices/commodities), Open-Meteo (weather), with 24h bootstrap normalization |
| **Paper Trading** | Real price data + simulated fills with 0.5% slippage, full P&L tracking, position management |
| **Live Trading** | Routes orders to real Polymarket/Kalshi APIs with auth |
| **Backtesting** | Real historical data: Polymarket CLOB, Binance (paginated), Coinbase, Yahoo Finance, Open-Meteo archive, Kalshi candlesticks |
| **Turnkey Wallets** | Non-custodial HSM key management, proxy wallet deploy via builder relayer, CLOB API credential derivation |
| **Supabase Auth** | JWT validation middleware, user-scoped operations, dev bypass mode |
| **User Isolation** | `user_id` on bots + strategies tables, ownership checks on all endpoints |
| **AI Agent** | Claude API integration with tool use for strategy building, live market context injection |
| **DB Persistence** | SQLite with WAL mode, migrations for user_id + asset columns, bot recovery on restart |

### SIMULATED — REMOVED

All 7 simulated trigger nodes (`sentiment`, `social-buzz`, `spread-detector`, `whale-alert`, `resolution-countdown`, `multi-market`, `order-flow`) have been **deleted** from both backend (`nodes/triggers.py`) and frontend (`architect-app.js`). Strategy templates that referenced them were updated to use real nodes (`api-data`, `volume-spike`, `time-based`). The `api-data` node covers all custom data source use cases.

---

## Known Bugs and Issues

### Critical

1. **`.env.example` is incomplete** — Missing: `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`, `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE`, `POLY_RELAYER_URL`, `SUPABASE_JWT_SECRET`, `POLY_PROXY_*` vars. Anyone deploying from this template will miss all managed wallet and auth config.

2. **`main.py` line 116** — ~~Health check loop calls `scheduler.get_poly_connector()` without `user_id` argument~~ **FIXED** — Now passes `bot.user_id` and includes `live_feed_router`.

3. **Turnkey withdrawal NOT implemented** — `polymarket_auth.py` lines 592-597: `withdraw_usdc()` returns `{"error": "Turnkey-based withdrawal coming soon"}` hardcoded. Users cannot withdraw funds from their managed wallets.

### Moderate

4. **`data-bridge.js` MercuryDataBridge** — Constructor defaults to `localhost:8777` (line 14) which is a DIFFERENT port than the engine (8778). This is a leftover from an older bridge server. The second class `MercuryEngineBridge` on line 916 correctly uses `MERCURY_CONFIG.engineBase`. The old `MercuryDataBridge` class is likely dead code for the research charting view.

5. **`architect-app.js` hardcoded engine URLs** — Lines 3495, 3507, 5451 inline `MERCURY_CONFIG.engineBase || 'http://localhost:8778'` instead of using a centralized variable. Works but is brittle.

6. **No HTTPS/SSL in deploy** — `nginx.conf` and `deploy.sh` exist but SSL cert provisioning (certbot) is referenced in comments only, not automated.

### Minor

7. **Paper trading contract names** — When no contract is provided, `paper.py` generates random names from a hardcoded list (`"Fed Rate Cut Mar 2026"`, etc.). Not harmful but looks odd in logs.

8. **`BacktestPaperTrader` monkey-patches db** — `backtester.py` lines 31-37 temporarily replaces `db.save_trade`/`save_position`/`delete_position` with no-ops. Works but is fragile.

---

## Architecture Key Points

### Data Flow: Strategy → Running Bot

```
User (English or Node Editor)
  → AI Agent (Claude) builds strategy JSON
  → OR Frontend compiles node graph → StrategyJSON
    → Compiler validates (triggers + executions required)
    → Scheduler creates Bot + BotRunner
      → Runner loops every 10 seconds:
        1. Fetch market data (LiveFeedRouter / Polymarket / simulated)
        2. Pre-fetch custom API data for api-data nodes
        3. Evaluate triggers → conditions → executions → risk
        4. Execute orders via PaperTrader or LiveTrader
        5. Persist state to SQLite (debounced)
```

### Three Data Paths in Runner

1. **LiveFeedRouter** — For asset-aware strategies (crypto/stocks/weather). Bootstraps with 24h candle history, normalizes to 5-95 range.
2. **Polymarket Real** — For prediction market strategies with a specific token_id/market_id. Fetches live probability from CLOB.
3. **Simulated Fallback** — Random walk probability when no asset config or market ID is available.

### Auth Flow

```
Frontend: Supabase client → login → session token
  → fetchWithAuth() attaches Bearer token to all engine API calls
Backend: api/auth.py → decode JWT (HS256) → extract user_id (sub claim)
  → All protected endpoints use Depends(get_current_user)
Dev mode: No SUPABASE_JWT_SECRET → returns user_id="default"
```

### Wallet Architecture (Turnkey + Polymarket Builder)

```
1. User clicks "Create Trading Wallet"
2. Backend: TurnkeyService.create_user_wallet() → HSM-backed EOA
3. Backend: Builder relayer → get proxy address → deploy proxy (gasless)
4. Backend: TurnkeySigner → py-clob-client → derive CLOB API credentials
5. Backend: Builder relayer → approve USDC for exchange contracts
6. Metadata stored in SQLite (NO private keys ever touch Mercury)
7. User deposits USDC.e to proxy address on Polygon
8. Trading: Backend requests signatures from Turnkey API per-order
```

---

## What's Missing for Deployment

### Must-Have (Blocking)

1. **Fix `.env.example`** — Add all Turnkey, Builder, Supabase, proxy env vars with documentation.
2. **Implement Turnkey withdrawal** — Replace the stub in `polymarket_auth.py` with real USDC transfer via Turnkey signing.
3. **Fix `main.py` health check** — Pass `bot.user_id` to `get_poly_connector()`.
4. **SSL/HTTPS** — Automate certbot in `deploy.sh` or document the manual process.
5. **VPS provisioning** — Actually deploy to a VPS and test the full Docker Compose + nginx setup end-to-end.

### Should-Have (Important)

6. **Error monitoring** — No Sentry, no structured logging export. Engine errors are console.warn only.
7. **Rate limit persistence** — `rate_limit.py` uses in-memory dicts. Resets on engine restart. Should use Redis or SQLite.
8. **Graceful bot shutdown** — Engine shutdown persists bot state but doesn't cleanly cancel open live orders.
9. **Frontend production build** — No minification, no bundling, no cache busting. Just raw JS files.
10. **Health check dashboard** — No way to monitor engine health, connector status, or bot metrics from the frontend beyond the basic sidebar dots.

### Nice-to-Have

11. **WebSocket live updates** — Currently polling every 10-15s. WebSocket would give instant bot status/trade updates.
12. **Multi-user Kalshi** — Currently single Kalshi account (one set of API keys). Not per-user like Polymarket.
13. **Wire simulated nodes to real sources** — `sentiment` could use an NLP API; `social-buzz` could use Twitter/Reddit APIs.
14. **Bot logs export** — No way to download trade history or bot logs as CSV.

---

## Environment Variables (Complete List)

```env
# Engine
PORT=8778
HOST=0.0.0.0
ENV=development

# AI Agent
ANTHROPIC_API_KEY=
AGENT_CHAT_MODEL=claude-3-5-haiku-20241022
AGENT_BUILD_MODEL=claude-sonnet-4-5-20250929

# Supabase Auth
SUPABASE_JWT_SECRET=          # From Supabase dashboard → Settings → API → JWT Secret

# Turnkey HSM (non-custodial wallets)
TURNKEY_API_PUBLIC_KEY=       # Hex P-256 public key from Turnkey dashboard
TURNKEY_API_PRIVATE_KEY=      # Hex P-256 private key from Turnkey dashboard
TURNKEY_ORGANIZATION_ID=      # Parent org ID

# Polymarket Builder Program
POLY_BUILDER_API_KEY=         # Builder API key
POLY_BUILDER_SECRET=          # Builder API secret
POLY_BUILDER_PASSPHRASE=      # Builder API passphrase
POLY_RELAYER_URL=https://relayer-v2.polymarket.com
POLY_CHAIN_ID=137

# Polymarket SOCKS5 Proxy (for VPS/datacenter)
POLY_PROXY_HOST=
POLY_PROXY_PORT=
POLY_PROXY_USERNAME=
POLY_PROXY_PASSWORD=

# Kalshi
KALSHI_API_KEY=
KALSHI_PRIVATE_KEY_PATH=kalshi_private_key.pem
KALSHI_BASE_URL=https://api.elections.kalshi.com/trade-api/v2

# Legacy (dev only — not used in production)
WALLET_ENCRYPTION_KEY=
```

---

## Node Count Summary

| Category | Total | Notes |
|----------|-------|-------|
| Triggers | 8 | All real — `market`, `price-threshold`, `volume-spike`, `time-based`, `market-event`, `probability-cross`, `api-data`, `news-alert` |
| Indicators | 6 | `rsi`, `macd`, `bollinger`, `moving-average`, `rate-of-change`, `pattern` |
| Conditions | 11 | All real |
| Executions | 9 | All real |
| Risk | 10 | All real |
| **Total** | **44** | **Zero simulated nodes** |

---

## Commands

```bash
# Run engine locally
cd mercury-engine
pip install -r requirements.txt
cp .env.example .env  # Fill in values
uvicorn main:app --host 0.0.0.0 --port 8778 --workers 1

# Run with Docker
cd mercury-engine
docker-compose up --build

# Frontend
# Just open mercury/hub.html in a browser (or serve with any static server)
```
