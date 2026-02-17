/* ================================================================
   MERCURY DATA BRIDGE — Connects Research dashboard to real data

   Data sources:
   - Mercury Bridge API (localhost:8777) for authenticated exchange data
   - Direct browser fetch for CORS-friendly public APIs (fallback)

   Usage:
     const bridge = new MercuryDataBridge();
     const price = await bridge.getBTCPrice();
   ================================================================ */

class MercuryDataBridge {
  constructor(apiBase = 'http://localhost:8777') {
    this.apiBase = apiBase;
    this.connected = false;
    this.lastCheck = 0;
    this._cache = new Map();
    this._polls = new Map();
  }

  // ═══════════════════════════════════════════
  // INTERNAL HELPERS
  // ═══════════════════════════════════════════

  async _fetch(path, ttl = 5000) {
    const key = path;
    const now = Date.now();
    const cached = this._cache.get(key);
    if (cached && now - cached.ts < ttl) return cached.data;

    try {
      const resp = await fetch(`${this.apiBase}${path}`, {
        signal: AbortSignal.timeout(4000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      this._cache.set(key, { data, ts: now });
      this.connected = true;
      return data;
    } catch (e) {
      // Return stale cache if available
      if (cached) return cached.data;
      this.connected = false;
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // CONNECTION
  // ═══════════════════════════════════════════

  async checkConnection() {
    try {
      const resp = await fetch(`${this.apiBase}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      this.connected = resp.ok;
    } catch {
      this.connected = false;
    }
    this.lastCheck = Date.now();
    return this.connected;
  }

  // ═══════════════════════════════════════════
  // BTC PRICE DATA
  // ═══════════════════════════════════════════

  async getBTCPrice() {
    // Try bridge first
    const data = await this._fetch('/api/btc/price', 5000);
    if (data && data.binance) return data;

    // Fallback: direct Coinbase (CORS-friendly)
    try {
      const resp = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        signal: AbortSignal.timeout(3000),
      });
      if (resp.ok) {
        const json = await resp.json();
        const price = parseFloat(json.data.amount);
        return { coinbase: price, binance: null, divergence: null, source: 'direct-coinbase' };
      }
    } catch { /* ignore */ }

    return null;
  }

  async getDVOL() {
    // Try bridge
    const data = await this._fetch('/api/btc/dvol', 60000);
    if (data && data.dvol !== null) return data;

    // Fallback: direct Deribit (public, CORS-friendly)
    try {
      const resp = await fetch(
        'https://www.deribit.com/api/v2/public/get_index_price?index_name=btcdvol_usdc',
        { signal: AbortSignal.timeout(3000) }
      );
      if (resp.ok) {
        const json = await resp.json();
        const dvol = json.result?.index_price;
        if (dvol != null) return { dvol, history: null, source: 'direct-deribit' };
      }
    } catch { /* ignore */ }

    return null;
  }

  async getTrend() {
    return await this._fetch('/api/btc/trend', 60000);
  }

  async getATR() {
    return await this._fetch('/api/btc/atr', 60000);
  }

  async getCandles() {
    return await this._fetch('/api/btc/candles', 30000);
  }

  // ═══════════════════════════════════════════
  // BROAD MARKET LISTINGS
  // ═══════════════════════════════════════════

  async getActiveMarkets() {
    return await this._fetch('/api/markets/active', 60000);
  }

  // ═══════════════════════════════════════════
  // KALSHI
  // ═══════════════════════════════════════════

  async getKalshiMarkets() {
    return await this._fetch('/api/kalshi/markets', 30000);
  }

  async getKalshiOrderbook(ticker) {
    return await this._fetch(`/api/kalshi/orderbook/${encodeURIComponent(ticker)}`, 5000);
  }

  async getKalshiImpliedPrice() {
    return await this._fetch('/api/kalshi/implied-price', 15000);
  }

  async getKalshiLiquidity() {
    return await this._fetch('/api/kalshi/liquidity', 30000);
  }

  // ═══════════════════════════════════════════
  // POLYMARKET
  // ═══════════════════════════════════════════

  async getPolyMarket() {
    return await this._fetch('/api/poly/market', 30000);
  }

  async getPolyOrderbook() {
    return await this._fetch('/api/poly/orderbook', 10000);
  }

  // ═══════════════════════════════════════════
  // BOT STATE
  // ═══════════════════════════════════════════

  async getBotPosition() {
    return await this._fetch('/api/bot/position', 5000);
  }

  async getBotTrades() {
    return await this._fetch('/api/bot/trades', 10000);
  }

  async getBotLogs() {
    return await this._fetch('/api/bot/logs', 3000);
  }

  async getBotChecks() {
    return await this._fetch('/api/bot/checks', 30000);
  }

  // ═══════════════════════════════════════════
  // POLLING
  // ═══════════════════════════════════════════

  startPolling(key, intervalMs, callback) {
    this.stopPolling(key);
    // Run immediately
    callback();
    const id = setInterval(callback, intervalMs);
    this._polls.set(key, id);
    return id;
  }

  stopPolling(key) {
    const id = this._polls.get(key);
    if (id) {
      clearInterval(id);
      this._polls.delete(key);
    }
  }

  stopAllPolling() {
    for (const [key, id] of this._polls) {
      clearInterval(id);
    }
    this._polls.clear();
  }

  clearCache() {
    this._cache.clear();
  }
}

// Global instance
const dataBridge = new MercuryDataBridge();
