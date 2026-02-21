# CLAUDE.md — Mercury System Documentation

> Last updated: 2026-02-20
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

### Minor / Cosmetic

1. **`.env.example` is incomplete** — Missing several vars (Turnkey, Builder, SUPABASE_JWT_SECRET). Does NOT affect production — VPS `.env` is complete. Only matters if someone tries to deploy from scratch using the template.

2. **`data-bridge.js` MercuryDataBridge** — Old class defaults to `localhost:8777` (different port). `MercuryEngineBridge` on line 916 correctly uses `MERCURY_CONFIG.engineBase`. The old class is dead code for the research charting view — harmless.

3. **Paper trading contract names** — When no contract is provided, `paper.py` generates random names from a hardcoded list. Not harmful but looks odd in logs.

4. **`BacktestPaperTrader` monkey-patches db** — `backtester.py` lines 31-37 temporarily replaces `db.save_trade`/`save_position`/`delete_position` with no-ops. Works but is fragile.

### DONE (Previously listed as bugs, now fixed)

- ~~`config.js` stale `API.base`~~ — Removed. Only `ENGINE.base` exists, correctly points to `/engine` in prod.
- ~~Post-login redirect to index.html~~ — Fixed. `login.html` redirects to `architect-app.html`.
- ~~Turnkey withdrawal not implemented~~ — Implemented. `submit_usdc_transfer()` in `wallet_manager.py`.
- ~~No HTTPS/SSL~~ — Live at `mercurysuite.net` with Let's Encrypt via certbot.
- ~~Rate limit in-memory only~~ — `rate_limit.py` persists daily token usage to SQLite.

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

## Live Trading Infrastructure — What's Built, What's Needed

### Kalshi Live Trading — DONE

Full per-user credential pipeline is implemented and ready:

1. **Frontend**: Connect Account modal collects API Key + RSA Private Key (PEM textarea)
2. **Backend**: `POST /api/kalshi/credentials` validates creds against Kalshi API, encrypts PEM with Fernet (AES), stores in `user_credentials` table
3. **Per-user connectors**: `scheduler.get_kalshi_connector(user_id)` loads from DB, decrypts, creates `KalshiConnector`, caches
4. **Live execution**: `live.py` routes Kalshi orders using per-user connector, resolves `kalshi_ticker` key correctly
5. **Status check on boot**: Frontend calls `GET /api/kalshi/credentials` on page load to show connected state

Key files: `api/kalshi.py` (credential CRUD + auth on all endpoints), `services/credential_service.py` (Fernet encrypt/decrypt), `connectors/kalshi.py` (accepts `private_key_pem` param)

**Contract key**: Frontend uses `contract.kalshi_ticker` → `live.py` checks `kalshi_ticker` first, falls back to `ticker`

### Polymarket Live Trading — Needs 2 External APIs

Architecture is fully built. Code is written and ready. Just needs API credentials plugged into `.env`.

**API 1: Turnkey HSM** (non-custodial key management)
- Purpose: Creates Ethereum keypairs inside hardware security modules. Mercury NEVER sees or stores private keys.
- Each user gets a Turnkey "sub-org" with an EOA keypair (secp256k1, BIP-32 at `m/44'/60'/0'/0/0`)
- When a trade needs signing, Mercury sends the hash to Turnkey's API → HSM signs inside hardware → returns signature (r, s, v)
- Self-service signup at turnkey.com, no approval needed
- Env vars: `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`
- Key files: `services/turnkey_service.py`, `services/turnkey_signer.py` (bridges py-clob-client signer interface to Turnkey REST API)

**API 2: Polymarket Builder Program** (gasless infrastructure + revenue share)
- Purpose: (A) Relayer for gasless Safe wallet deployment, USDC approvals, CTF ops. (B) Volume attribution — weekly USDC kickbacks based on platform trading volume.
- The CLOB API itself is OPEN — anyone can trade. Builder is needed for the gasless UX and revenue share.
- Unverified tier: Immediate, no approval, 100 tx/day. Get keys at polymarket.com/settings?tab=builder
- Verified tier: Manual review, 3000 tx/day, revenue sharing enabled
- Env vars: `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE`
- Code already passes `BuilderConfig` with `BuilderApiKeyCreds` to `ClobClient` in `polymarket_auth.py`
- Scheduler passes `POLY_BUILDER_*` env vars to every `PolymarketAuthConnector` instance

**What happens without Builder**: Users would need MATIC for gas. We'd deploy Safe wallets ourselves (paying gas from an ops wallet). Trading still works via CLOB API. No revenue share.

**Contract key**: Frontend uses `contract.token_id` → flows through correctly (no mismatch like Kalshi had)

**Reference**: Polymarket's own `turnkey-safe-builder-example` repo matches our architecture exactly (Turnkey + Safe + Builder + CLOB).

### Polymarket Wallet Lifecycle (once both APIs are configured)

```
1. User clicks "Create Trading Wallet"
2. TurnkeyService.create_user_wallet() → HSM-backed EOA (keys in hardware)
3. Builder relayer → get proxy address → deploy Gnosis Safe (gasless)
4. TurnkeySigner → py-clob-client → derive CLOB API credentials (EIP-712)
5. Builder relayer → approve USDC for exchange contracts (gasless)
6. Wallet metadata stored in SQLite (NO private keys ever touch Mercury)
7. User deposits USDC.e to Safe proxy address on Polygon
8. Trading: Mercury requests HSM signatures from Turnkey API per-order
9. Orders submitted via ClobClient with BuilderConfig for attribution
```

### Withdrawal

- **Turnkey withdrawal DONE** — `submit_usdc_transfer()` in `wallet_manager.py` via builder relayer. Frontend exposes withdraw flow in the funding UI.

---

## Launch Checklist

### DEPLOYMENT STATUS — LIVE at mercurysuite.net

- [x] VPS deployed — DigitalOcean, Docker + nginx, `mercurysuite.net` with Let's Encrypt SSL
- [x] Frontend served from `/opt/mercury/mercury/` via nginx volume mount
- [x] Engine running at `mercurysuite.net/engine/` via nginx proxy
- [x] `SUPABASE_JWT_SECRET` set on VPS, `ENV=production` (JWT verification active)
- [x] `ANTHROPIC_API_KEY` set (AI agent functional)
- [x] Turnkey API keys configured (`TURNKEY_API_PUBLIC_KEY/PRIVATE_KEY/ORGANIZATION_ID`)
- [x] Polymarket Builder keys configured (`POLY_BUILDER_API_KEY/SECRET/PASSPHRASE`)
- [x] SOCKS5 proxy configured for Polymarket (`POLY_PROXY_*`)
- [x] Kalshi live trading — per-user credentials, encrypted storage, live order execution
- [x] Polymarket live trading — Turnkey HSM + Builder relayer, full wallet lifecycle
- [x] Turnkey withdrawal — `submit_usdc_transfer()` in `wallet_manager.py`
- [x] Cloudflare — real IP passthrough, tiered rate limiting, bot fight mode
- [x] Mobile optimization — 2-col grid on landing, mobile welcome popup, `is-mobile` CSS class
- [x] Shared API caching — BTC candles (60s), Kalshi events (60s), market search (30s)

### REMAINING BEFORE REAL USERS

- [ ] **End-to-end live trade test** — Connect real Kalshi creds → deploy bot → verify execution + position tracking on prod VPS. Same for Polymarket.
- [ ] **Graceful bot shutdown with order cancellation** — Engine shutdown persists state but doesn't cancel open live orders. Could leave orphan orders on exchange. Add cancel-all-open-orders on `SIGTERM`.
- [ ] **Error monitoring** — No Sentry. Engine errors only in Docker logs. Add Sentry SDK + DSN to `.env` so crashes surface without SSH.
- [ ] **Fix `.env.example`** — Missing Turnkey, Builder, SUPABASE_JWT_SECRET vars. Doesn't affect prod but anyone deploying fresh will fail silently.

### SCALING — What breaks first under load

- [ ] **SQLite concurrent writes** — WAL mode helps but SQLite serializes writes. At ~100+ concurrent active bots or heavy backtest load, migrate to Postgres.
- [ ] **Single uvicorn worker** — All bots run in one process/event loop. CPU-bound backtests can block bot evaluation cycles. Add `--workers 2` or offload backtests to a background task queue (e.g., arq + Redis).
- [ ] **In-memory bot state** — Scheduler holds all bot runners in RAM. At ~200+ bots this becomes a memory concern. Add bot state paging or Redis-backed runner state.
- [ ] **VPS size** — Current DigitalOcean droplet is small. At 50+ concurrent users, upgrade to 4GB RAM / 2 vCPU. At 200+ users, add a second VPS and load balance.

### QUALITY OF LIFE — Post-launch

- [ ] **Email notifications** — No alerts on bot errors, stop-loss triggers, or trade fills. Add Resend/SendGrid for critical events.
- [ ] **Bot logs / trade history export** — No CSV download. Users need this for taxes.
- [ ] **WebSocket live updates** — Currently polling every 5-10s. WebSockets would give instant updates.
- [ ] **Onboarding tour** — Node editor is powerful but has a learning curve. Add first-run tooltip sequence.
- [ ] **Polymarket Builder Verified tier** — Apply once volume builds. Unlocks 3000 tx/day + revenue share kickbacks.

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
