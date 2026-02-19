# LOGIC.md — Mercury Architecture and Logic Flow

> Last updated: 2026-02-18
> Purpose: How every piece of the system connects and flows.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (mercury/)                    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Architect │  │ Research  │  │ Funding  │  │  Login  │ │
│  │  (nodes)  │  │ (charts) │  │(wallets) │  │(Supa)   │ │
│  └─────┬────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│        │            │             │              │       │
│  ┌─────┴────────────┴─────────────┴──────────────┴────┐ │
│  │       core/auth.js (fetchWithAuth + Supabase)       │ │
│  │       core/config.js (ENGINE_BASE auto-detect)      │ │
│  └──────────────────────┬──────────────────────────────┘ │
└─────────────────────────┼────────────────────────────────┘
                          │ HTTP + Bearer JWT
┌─────────────────────────┼────────────────────────────────┐
│              BACKEND (mercury-engine/)                     │
│                         │                                 │
│  ┌──────────────────────┴───────────────────────────────┐│
│  │              FastAPI (main.py, port 8778)             ││
│  │  ┌────────┬────────┬────────┬────────┬──────┬──────┐ ││
│  │  │ /bots  │/strats │/wallet │/markets│/agent│/btest│ ││
│  │  └───┬────┴───┬────┴───┬────┴───┬────┴──┬───┴──┬───┘ ││
│  │      │        │        │        │       │      │      ││
│  │  ┌───┴────────┴────────┴────────┴───┐   │      │      ││
│  │  │    api/auth.py (JWT → user_id)   │   │      │      ││
│  │  └──────────────────────────────────┘   │      │      ││
│  └─────────────────────────────────────────┼──────┼──────┘│
│                                            │      │       │
│  ┌─────────────────────────────────────────┼──────┼──────┐│
│  │              ENGINE CORE                │      │      ││
│  │                                         │      │      ││
│  │  ┌────────────┐  ┌───────────┐  ┌──────┴──┐   │      ││
│  │  │ Scheduler  │  │ Compiler  │  │  Agent  │   │      ││
│  │  │ (bot mgmt) │  │(validate) │  │(Claude) │   │      ││
│  │  └─────┬──────┘  └───────────┘  └─────────┘   │      ││
│  │        │                                       │      ││
│  │  ┌─────┴──────────────────────────────────┐    │      ││
│  │  │ BotRunner (per-bot async loop, 10s)    │    │      ││
│  │  │                                        │    │      ││
│  │  │  1. Fetch Data ──→ LiveFeedRouter      │    │      ││
│  │  │  2. Eval Triggers ──→ nodes/triggers   │    │      ││
│  │  │  3. Eval Conditions ──→ nodes/conditions│   │      ││
│  │  │  4. Eval Executions ──→ nodes/executions│   │      ││
│  │  │  5. Eval Risk ──→ nodes/risk           │    │      ││
│  │  │  6. Execute Trade ──→ PaperTrader      │    │      ││
│  │  │                   ──→ OR LiveTrader    │    │      ││
│  │  └────────────────────────────────────────┘    │      ││
│  └────────────────────────────────────────────────┼──────┘│
│                                                   │       │
│  ┌────────────────────────────────────────────────┴──────┐│
│  │              CONNECTORS                                ││
│  │  ┌────────────┐  ┌───────────┐  ┌──────────────────┐  ││
│  │  │Polymarket  │  │  Kalshi   │  │ LiveFeedRouter   │  ││
│  │  │Public+Auth │  │(RSA-PSS) │  │(Binance,Coinbase │  ││
│  │  │+Turnkey HSM│  │           │  │ Yahoo, Open-Meteo)│  ││
│  │  └────────────┘  └───────────┘  └──────────────────┘  ││
│  └────────────────────────────────────────────────────────┘│
│                                                            │
│  ┌────────────────────────────────────────────────────────┐│
│  │  SQLite (data/mercury.db) + Turnkey HSM (external)     ││
│  └────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────┘
```

---

## Core Logic Flows

### 1. Strategy Creation (AI Agent Path)

```
User types: "Build me a BTC momentum strategy with stop loss"
  │
  ▼
Frontend → POST /api/agent/chat { message, history, tier }
  │
  ▼
api/agent.py:
  1. Rate limit check (messages/min + tokens/day)
  2. needs_builder() keyword match → picks Claude model
     - Chat model (haiku) for questions
     - Build model (sonnet) for strategy creation
  3. Inject SYSTEM_PROMPT with all 51 node definitions
  4. Inject live market context (BTC price, top markets, running bots)
  5. Call Claude API with build_strategy tool
  6. Parse tool_use response → StrategyResult { nodes, connections, asset }
  │
  ▼
Frontend receives strategy → renders nodes on canvas
User can edit nodes, adjust params, add/remove nodes
  │
  ▼
User clicks "Deploy" → Frontend compiles node graph:
  - Categorize nodes into triggers/conditions/executions/risk
  - Build pipeline connections (wiredFrom arrays)
  - Set asset config (type, symbol, platform)
  - Create StrategyJSON object
  │
  ▼
POST /api/bots/deploy { strategy, bot_name, platform, capital, mode }
```

### 2. Bot Deployment

```
api/bots.py → deploy_bot()
  │
  ▼
scheduler.deploy_bot():
  1. Check user bot limit (MAX_BOTS_PER_USER = 10)
  2. Validate strategy (has triggers + executions)
  3. If live mode:
     a. Resolve platform (Auto → Polymarket if wallet exists, else Kalshi)
     b. Check connector availability (wallet or API keys)
  4. Compile strategy → instantiate BaseNode subclasses
  5. Create Bot object (id, user_id, strategy, capital, mode)
  6. Persist to SQLite
  7. Create BotRunner with:
     - Compiled nodes
     - PriceFeedConnector (BTC)
     - PolymarketPublicConnector (market data)
     - PolymarketAuthConnector (per-user, if wallet exists)
     - KalshiConnector (if configured)
     - LiveFeedRouter (crypto/stocks/weather)
  8. runner.start() → launches async eval loop
```

### 3. Bot Evaluation Loop (runner.py)

```
BotRunner._run_loop() — every TRIGGER_POLL_INTERVAL (10s):
  │
  ▼ Step 1: Get Market Data
  │
  ├─ If strategy has AssetConfig (crypto/stocks/weather):
  │    → LiveFeedRouter.get_market_data(asset)
  │      → Routes to Binance/Coinbase (crypto), Yahoo (stocks), Open-Meteo (weather)
  │      → Returns normalized probability (5-95), raw_price, real_data=True
  │
  ├─ Else if strategy has market_id or token_id (prediction market):
  │    → PolymarketPublicConnector.get_market_price(token_id)
  │    → Returns probability (in cents), volume, liquidity, real_data=True
  │
  └─ Else (no asset, no market):
       → Simulated fallback: random walk probability (30-70 range)
       → real_data=False

  │
  ▼ Step 2: Pre-fetch Custom API Data
  │
  For each api-data node:
    → Check poll_interval (skip if not due)
    → HTTP GET/POST to configured URL
    → Extract value via json_path (dot notation)
    → Cache result per-node
  │
  ▼ Step 3: Build Evaluation Context
  │
  context = {
    price: BTC price,
    positions: bot's open positions,
    capital: current cash,
    portfolio_value: cash + position value,
    market_data: { probability, volume, liquidity, ... },
    trigger_data: {},     // populated by fired trigger
    custom_data: {},      // api-data results
    social_data: {},      // news/social results
  }
  │
  ▼ Step 4: Evaluate Pipeline
  │
  TRIGGERS: for each trigger node:
    result = await trigger.evaluate(context)
    if result.fired → save trigger_data, proceed to conditions
    (first trigger to fire wins)
  │
  CONDITIONS: for each condition node:
    result = await condition.evaluate(context)
    if NOT result.fired → conditions_pass = False, skip executions
    (ALL conditions must pass)
  │
  RISK: for each risk node:
    result = await risk_node.evaluate(context)
    if result.fired:
      action = result.data.action
      "Block New Trades" → trades_blocked = True
      "close"/"Kill All Bots" → close all positions
      "Pause All Bots" → close all + pause bot
  │
  EXECUTIONS: if not trades_blocked:
    for each execution node:
      result = await execution.evaluate(context)
      if result.fired:
        order_data = result.data  // { side, amount, price, platform, contract }

        if bot.mode == "paper":
          → PaperTrader.execute_order(bot, order_data)
            → Simulated fill with 0.5% slippage
            → Updates bot.capital, bot.positions, bot.trades
        elif bot.mode == "live":
          → LiveTrader.execute_order(bot, order_data)
            → Routes to Polymarket or Kalshi real API
            → PolymarketAuthConnector.place_order() or KalshiConnector.place_order()
  │
  ▼ Step 5: Persist State
  │
  Debounced (every 30s or every 10th eval):
    → db.update_bot_stats(bot)
    → db.save_logs_batch(new_logs)
```

### 4. LiveFeedRouter Normalization

```
Raw asset prices are normalized to a 5-95 "probability" scale
so all node logic works the same regardless of asset type.

Formula: normalized = 5 + ((value - lo) / (hi - lo)) * 90

Bootstrap (first call per asset):
  - Crypto: 24h of hourly candles from Binance/Coinbase
  - Stocks: 7 days of hourly candles from Yahoo Finance
  - Weather: 30 days of hourly temps from Open-Meteo

Rolling window:
  - 500 data points (crypto/stocks)
  - 720 data points (weather)
  - lo/hi recalculated from window on each new data point

Cache TTLs:
  - Crypto: 10s
  - Stocks: 60s
  - Weather: 300s

This means a trigger like "price-threshold > 70" works on ALL asset types:
  - Prediction markets: >70 = probability > 70 cents
  - Crypto: >70 = BTC price in upper 72% of 24h range
  - Stocks: >70 = S&P in upper 72% of 7-day range
  - Weather: >70 = NYC temp in upper 72% of 30-day range
```

### 5. Wallet Creation Flow

```
User clicks "Create Trading Wallet" in Funding view
  │
  ▼
Frontend: initPolymarketWallet() → POST /api/wallet/polymarket
  │
  ▼
api/wallet.py → wallet_manager.create_wallet(user_id)
  │
  ▼
Step 1: TurnkeyService.create_user_wallet(user_id)
  → POST to Turnkey API: create_sub_organization
  → Creates: sub-org + HSM-backed secp256k1 keypair
  → Returns: { turnkey_org_id, wallet_id, eoa_address }
  (Private key NEVER leaves Turnkey's HSM)
  │
  ▼
Step 2: Builder relayer → GET /proxy/address?owner=<eoa>
  → Returns deterministic proxy wallet address (CREATE2)
  │
  ▼
Step 3: Builder relayer → POST /relay/proxy/deploy
  → Deploys proxy contract on Polygon (gasless, builder-attributed)
  │
  ▼
Step 4: Derive CLOB API credentials
  → TurnkeySigner wraps Turnkey signing for py-clob-client
  → client.create_api_key() or client.derive_api_key()
  → EIP-712 signature created via Turnkey HSM
  → Returns: { api_key, api_secret, api_passphrase }
  │
  ▼
Step 5: Builder relayer → POST /relay/proxy/approve
  → Approves USDC for Polymarket exchange contracts (gasless)
  │
  ▼
Step 6: Store in SQLite wallets table
  → id, user_id, eoa_address, proxy_address, turnkey_org_id
  → api_key, api_secret, api_passphrase (for CLOB trading)
  → NO private keys stored
  │
  ▼
Return to frontend: { address: proxy_address, status: "active" }
  → User deposits USDC.e to proxy address on Polygon
  → Balance shows up via /api/wallet/polymarket/balance
```

### 6. Backtesting Flow

```
User configures: strategy, period (days), capital, platform, asset
  │
  ▼
POST /api/backtest/run
  │
  ▼
BacktestEngine.run():
  1. Validate + compile strategy
  2. Resolve data source by priority:
     a. Specific asset (BTC, ETH, SPX, GOLD, NYC_TEMP, etc.)
        → Binance candles / Coinbase candles / Yahoo candles / Open-Meteo archive
     b. Polymarket token_id → CLOB price history API
     c. Kalshi ticker → Kalshi candlestick API (public, no auth)
     d. Generic crypto/stocks → Binance BTC / Yahoo S&P 500
     e. Fallback → synthetic prices derived from BTC movements
  3. Normalize to 5-95 range (same formula as LiveFeedRouter)
  4. Create virtual Bot with paper capital
  5. Step through each historical data point:
     - Monkey-patch time.time() to simulated timestamp
     - Build same evaluation context as live runner
     - Evaluate trigger → condition → risk → execution pipeline
     - Paper trades executed without DB writes
     - Record equity curve
  6. Calculate metrics: return, Sharpe, win rate, max drawdown
  │
  ▼
Return BacktestResult:
  { trades, equity_curve, total_return, sharpe_ratio, win_rate,
    max_drawdown, data_source, data_points }
```

### 7. Authentication Flow

```
FRONTEND:
  1. User loads hub.html
  2. core/auth.js checks ENV.isLocal:
     - Local dev: skip auth, use { email: 'dev@local', tier: 'free' }
     - Production: supabase.auth.getSession()
       - No session → redirect to login.html
       - Has session → extract access_token
  3. fetchWithAuth(url, opts) wraps all engine API calls:
     - Injects Authorization: Bearer <access_token>
     - Injects Content-Type: application/json
  4. Exposed as window.fetchWithAuth for non-module scripts

BACKEND:
  1. api/auth.py: get_current_user(request)
     - Extract Authorization: Bearer <token>
     - If no SUPABASE_JWT_SECRET set → return "default" (dev mode)
     - Decode JWT (HS256, audience="authenticated")
     - Return payload.sub (user_id UUID)
  2. All protected routes: user_id = Depends(get_current_user)
  3. Public routes (no auth): GET /api/health, GET /api/markets/*
```

---

## Node Evaluation Contract

Every node implements `evaluate(context) -> NodeResult`:

```python
class NodeResult:
    fired: bool      # Did the node trigger/pass?
    data: dict       # Output data (order params, trigger data, risk action, etc.)

# Context shape:
context = {
    "price": float,              # BTC price (USD)
    "prices": dict,              # Multi-asset prices
    "positions": list,           # Bot's open PaperPositions
    "capital": float,            # Current cash
    "portfolio_value": float,    # Cash + position value
    "timestamp": str,            # ISO timestamp
    "market_data": {
        "probability": float,    # 1-99 (normalized or raw cents)
        "volume": float,
        "liquidity": float,
        "correlation": float,
        "events": list,
        "real_data": bool,
    },
    "trigger_data": dict,        # Data from the fired trigger
    "custom_data": dict,         # api-data node results { node_id: { value, ... } }
    "social_data": dict,         # news-alert / sentiment results
}
```

---

## Database Schema

```sql
-- Bots (user-scoped)
bots (
  id TEXT PK, user_id TEXT, name TEXT, strategy_json TEXT,
  status TEXT, mode TEXT, platform TEXT,
  initial_capital REAL, current_capital REAL,
  total_pnl REAL, win_rate REAL, sharpe_ratio REAL, max_drawdown REAL,
  equity_history TEXT(JSON), asset_type TEXT, asset_symbol TEXT,
  created_at TEXT, started_at TEXT, stopped_at TEXT, eval_count INT
)

-- Trades (per-bot, CASCADE delete)
trades (
  id TEXT PK, bot_id TEXT FK, timestamp TEXT, side TEXT,
  contract TEXT, platform TEXT, price REAL, amount REAL,
  quantity INT, pnl REAL, fees REAL, mode TEXT
)

-- Positions (per-bot, CASCADE delete)
positions (
  id TEXT PK, bot_id TEXT FK, contract TEXT, platform TEXT,
  side TEXT, direction TEXT, entry_price REAL, current_price REAL,
  quantity INT, cost_basis REAL, unrealized_pnl REAL,
  stop_loss REAL, take_profit REAL
)

-- Strategies (user-scoped)
strategies (
  id TEXT PK, user_id TEXT, name TEXT, strategy_json TEXT,
  created_at TEXT, updated_at TEXT
)

-- Wallets (managed by wallet_manager.py)
wallets (
  id TEXT PK, user_id TEXT, eoa_address TEXT, proxy_address TEXT,
  turnkey_org_id TEXT, api_key TEXT, api_secret TEXT, api_passphrase TEXT,
  platform TEXT, network TEXT, status TEXT, created_at TEXT
)

-- Logs (per-bot, CASCADE delete)
logs (id INT PK AUTO, bot_id TEXT FK, timestamp TEXT, level TEXT, message TEXT)
```

---

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/health | No | Engine health + connector status |
| POST | /api/bots/deploy | Yes | Deploy a bot from strategy JSON |
| GET | /api/bots | Yes | List user's bots |
| GET | /api/bots/{id} | Yes | Bot detail (trades, positions, logs) |
| POST | /api/bots/{id}/stop | Yes | Stop a running bot |
| POST | /api/bots/{id}/pause | Yes | Pause a live bot |
| POST | /api/bots/{id}/resume | Yes | Resume a paused bot |
| DELETE | /api/bots/{id} | Yes | Delete a bot |
| GET | /api/bots/{id}/logs | Yes | Bot logs |
| GET | /api/bots/{id}/trades | Yes | Bot trades |
| POST | /api/strategies | Yes | Save a strategy |
| GET | /api/strategies | Yes | List user's strategies |
| GET | /api/strategies/{id} | Yes | Load a strategy |
| DELETE | /api/strategies/{id} | Yes | Delete a strategy |
| POST | /api/wallet/polymarket | Yes | Create trading wallet |
| GET | /api/wallet/polymarket | Yes | Get wallet info |
| GET | /api/wallet/polymarket/balance | Yes | Get wallet balance |
| POST | /api/wallet/polymarket/withdraw | Yes | Withdraw USDC |
| GET | /api/wallet/polymarket/positions | Yes | Get open positions |
| GET | /api/kalshi/balance | Yes | Kalshi account balance |
| GET | /api/kalshi/positions | Yes | Kalshi positions |
| GET | /api/markets/polymarket | No | Polymarket market listings |
| GET | /api/markets/kalshi | No | Kalshi market listings |
| POST | /api/agent/chat | Partial | AI chat (rate limited by IP) |
| GET | /api/agent/usage | No | Agent token usage |
| POST | /api/backtest/run | Yes | Run a backtest |

---

## Deployment Architecture

```
┌─────────────────────────────────────────────┐
│                   VPS                        │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  nginx (ports 80, 443)                 │  │
│  │    / → static files (mercury/)         │  │
│  │    /engine/ → proxy → engine:8778      │  │
│  │    SSL via Let's Encrypt               │  │
│  │    Rate limit: 60 req/min per IP       │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────┴─────────────────────────┐  │
│  │  mercury-engine (Docker, port 8778)    │  │
│  │    SQLite → ./data/mercury.db          │  │
│  │    .env → all secrets                  │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘

External services:
  - Supabase (auth)
  - Turnkey (HSM key management)
  - Polymarket Builder Relayer (proxy deploy, approval)
  - Polymarket CLOB (trading)
  - Kalshi API (trading)
  - Binance / Coinbase (crypto prices)
  - Yahoo Finance (stocks/indices)
  - Open-Meteo (weather)
  - Anthropic Claude API (AI agent)
```

---

## Roadmap to "Any Strategy in Plain English → Deployed Bot"

The system is approximately **80% built**. Here's what remains:

### Already Working
- Natural language → AI agent → strategy JSON → canvas → deploy
- 44 real nodes covering triggers, indicators, conditions, executions, risk
- Paper trading with real price data from 5+ sources
- Live trading via Polymarket (Turnkey HSM) and Kalshi (RSA-PSS)
- Backtesting against real historical data
- User auth + isolation
- Docker deployment infrastructure

### Remaining Gap
1. **Turnkey withdrawal** — Users can deposit but not withdraw. This blocks real money usage.
2. **VPS deployment** — Docker Compose + nginx configs exist but haven't been tested end-to-end on a real VPS.
3. **`.env.example` completeness** — New deployers won't know what env vars to set.
4. **SSL** — certbot not automated.
5. **Error monitoring** — No visibility into production failures.
6. **The 7 simulated triggers** — Not blocking, clearly labeled, but worth noting they produce fake data. Users should use `api-data` node for real external sources.
