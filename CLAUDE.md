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

### Known limitation

- **Turnkey withdrawal NOT implemented** — `polymarket_auth.py` `withdraw_usdc()` returns `{"error": "coming soon"}` stub. Users cannot withdraw from managed wallets yet.

---

## Launch Checklist

### BLOCKERS — Must fix before any user touches it

- [ ] **Fix `.env.example`** — Missing `SUPABASE_JWT_SECRET`, all Turnkey vars, all Builder vars, `ADMIN_SECRET`, `ALLOWED_ORIGIN`. A deployer using this template gets silent dev mode with no auth.
- [ ] **Fix `config.js` stale `API.base`** — Line 18-20 points to `localhost:8000` / `mercury-backend.onrender.com`. Either remove `API` export entirely or point it at the engine. Currently only `ENGINE.base` is correct.
- [ ] **Fix post-login redirect** — `login.html` redirects to `index.html` (landing page) after login. Should go to `architect-app.html` (the actual app).
- [ ] **CORS for split deploy** — Engine `main.py` CORS must allow the Netlify/production frontend domain. Currently may only allow localhost.
- [ ] **Deploy frontend to Netlify** — Static site, free tier, auto SSL. Point `mercurysuite.net` DNS at it.
- [ ] **Deploy engine to VPS** — DigitalOcean/Hetzner ($6-12/mo). Docker + `deploy.sh`. Subdomain like `engine.mercurysuite.net`.
- [ ] **SSL on engine VPS** — Uncomment HTTPS block in `nginx.conf`, run certbot, fill in domain. `deploy.sh` runs certbot but doesn't auto-update nginx config afterward.
- [ ] **Get Anthropic API key** — Needed for AI agent. Set `ANTHROPIC_API_KEY` in `.env`.
- [ ] **Set `SUPABASE_JWT_SECRET`** — From Supabase dashboard → Settings → API → JWT Secret. Without this, engine runs in dev mode (no user isolation).
- [ ] **Set `WALLET_ENCRYPTION_KEY`** — Or engine derives from `SUPABASE_JWT_SECRET`. Needed to encrypt stored Kalshi credentials.

### EXTERNAL APIS — Sign up and plug in env vars

- [ ] **Polymarket Builder keys** — Go to polymarket.com/settings?tab=builder, create profile, generate API keys. Unverified tier = instant, 100 tx/day. Set `POLY_BUILDER_API_KEY`, `POLY_BUILDER_SECRET`, `POLY_BUILDER_PASSPHRASE`.
- [ ] **Turnkey account** — Sign up at turnkey.com, create org-level P-256 API key. Set `TURNKEY_API_PUBLIC_KEY`, `TURNKEY_API_PRIVATE_KEY`, `TURNKEY_ORGANIZATION_ID`. Needed for non-custodial Polymarket wallets.
- [ ] **SOCKS5 proxy (VPS only)** — Polymarket blocks datacenter IPs. Need a residential proxy. Set `POLY_PROXY_HOST/PORT/USERNAME/PASSWORD`.
- [ ] **Polymarket Builder Verified tier** — Apply after generating volume. Unlocks 3000 tx/day + revenue share.

### PRE-LAUNCH POLISH — Should fix before real users

- [ ] **Implement Turnkey withdrawal** — `polymarket_auth.py` `withdraw_usdc()` is a stub. Users can deposit but can't withdraw. Either implement or add clear warning in UI.
- [ ] **Engine `config.js` production URL** — `ENGINE.base` falls back to `window.location.origin/engine` in prod. For split deploy (Netlify + VPS), need to hardcode the engine domain or use an env-injected config.
- [ ] **Error monitoring** — No Sentry, no structured logging. Engine errors are console only. At minimum add Sentry SDK.
- [ ] **Rate limit persistence** — `rate_limit.py` uses in-memory dicts, resets on engine restart. Move to SQLite or Redis.
- [ ] **Graceful bot shutdown** — Engine shutdown persists bot state but doesn't cancel open live orders. Could leave orphan orders on Kalshi/Polymarket.
- [ ] **Test full Kalshi live flow end-to-end** — Connect real Kalshi creds → deploy bot → verify order execution → verify position tracking.
- [ ] **Admin panel auth** — `admin.html` exists. Verify it's protected by `ADMIN_SECRET` and not accessible to regular users.

### QUALITY OF LIFE — Nice to have before or shortly after launch

- [ ] **WebSocket live updates** — Currently polling every 10-15s. WebSocket would give instant bot status/trade/log updates.
- [ ] **Bot logs export** — No way to download trade history or logs as CSV. Users will want this for tax/analysis.
- [ ] **Strategy sharing/templates** — Users can save strategies but can't share them. A public template gallery would help onboarding.
- [ ] **Email notifications** — No alerts when bots trigger trades, hit stop-loss, or error out. At minimum email on critical events.
- [ ] **Mobile responsive check** — `DEVICE.isMobile` detection exists but unclear if the node editor is usable on mobile. May need a simplified mobile view.
- [ ] **Onboarding tour** — First-time users need guidance. The node editor is powerful but has a learning curve.
- [ ] **Loading states everywhere** — Deploy button, connect modal, strategy save — make sure all async operations show spinners and disable buttons.
- [ ] **Better error toasts** — Engine errors should surface user-friendly messages, not raw exception text.
- [ ] **Bot performance charts** — Equity curve, P&L over time, win rate visualization in the bot detail view.
- [ ] **Strategy version history** — No undo/version control on strategy edits. Users can accidentally overwrite their work.
- [ ] **Multi-bot dashboard** — When a user has 5+ bots, they need an overview of all bots' performance at a glance.
- [ ] **Cache busting** — Frontend serves raw JS files with no versioning. Add `?v=hash` to script tags or use Netlify's built-in asset hashing.

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
