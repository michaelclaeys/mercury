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

// Global instance — condor bot bridge (research dashboard)
const dataBridge = new MercuryDataBridge();


/* ================================================================
   MERCURY LIVE MARKETS — Direct public API fetching
   Polymarket (Gamma API) + Kalshi (Trade API v2) — no auth needed
   ================================================================ */

// Extract YES token_id from Gamma's clobTokenIds JSON string
function _parseClobTokenId(clobTokenIds) {
  if (!clobTokenIds) return null;
  try {
    const arr = typeof clobTokenIds === 'string' ? JSON.parse(clobTokenIds) : clobTokenIds;
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  } catch { return null; }
}

const MercuryLiveMarkets = {
  _cache: new Map(),
  _priceHistory: new Map(),  // short -> [{t, price}]
  _proxyFailed: false,       // True after first proxy failure — skip proxy on subsequent calls

  // Use local proxy when running on localhost (avoids CORS), direct URLs otherwise
  _polyBase: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/proxy/polymarket/'
    : 'https://gamma-api.polymarket.com/',
  _kalshiBase: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/proxy/kalshi/'
    : 'https://api.elections.kalshi.com/trade-api/v2/',
  _clobBase: location.hostname === 'localhost' || location.hostname === '127.0.0.1'
    ? '/proxy/polymarket-clob/'
    : 'https://clob.polymarket.com/',
  _newsBase: '/proxy/news',

  // Direct API URLs (used as fallback when proxy is down)
  _polyDirect: 'https://gamma-api.polymarket.com/',
  _kalshiDirect: 'https://api.elections.kalshi.com/trade-api/v2/',
  _clobDirect: 'https://clob.polymarket.com/',

  // Smart fetch: tries proxy first, falls back to direct URL on failure
  async _fetchWithFallback(proxyUrl, directUrl, opts = {}) {
    const timeout = opts.timeout || 8000;
    // If proxy already known to be down, skip straight to direct
    if (!this._proxyFailed && proxyUrl !== directUrl) {
      try {
        const resp = await fetch(proxyUrl, { signal: AbortSignal.timeout(timeout) });
        if (resp.ok) return resp;
      } catch (_) { /* proxy down */ }
      this._proxyFailed = true;
      console.log('[LiveMarkets] Proxy unavailable — switching to direct API calls');
    }
    // Direct call (works when Gamma/CLOB CORS headers allow it)
    return fetch(directUrl, { signal: AbortSignal.timeout(timeout) });
  },

  // ═══════════════════════════════════════════
  // POLYMARKET — Gamma API (Events + Markets)
  // ═══════════════════════════════════════════

  async fetchPolymarketMarkets(limit = 500) {
    const key = 'poly_markets';
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 30000) return cached.data;

    try {
      const qs = `markets?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`;
      const resp = await this._fetchWithFallback(`${this._polyBase}${qs}`, `${this._polyDirect}${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const raw = Array.isArray(data) ? data : data.markets || data;
      const markets = raw
        .filter(m => m.question && m.acceptingOrders !== false && !m.closed)
        .map(m => ({
          id: m.id,
          name: m.question,
          slug: m.slug,
          price: Math.round(parseFloat(m.outcomePrices?.[0] || m.lastTradePrice || 0) * 100),
          bestBid: Math.round(parseFloat(m.bestBid || 0) * 100),
          bestAsk: Math.round(parseFloat(m.bestAsk || 0) * 100),
          volume24h: parseFloat(m.volume24hr || 0),
          volumeTotal: parseFloat(m.volume || 0),
          liquidity: parseFloat(m.liquidity || 0),
          lastTrade: Math.round(parseFloat(m.lastTradePrice || 0) * 100),
          endDate: m.endDate,
          source: 'polymarket',
          conditionId: m.conditionId,
          clobTokenId: _parseClobTokenId(m.clobTokenIds),
        }))
        .filter(m => m.price > 0 && m.price < 100);
      this._cache.set(key, { data: markets, ts: Date.now() });
      return markets;
    } catch (e) {
      console.warn('[LiveMarkets] Polymarket fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // Fetch Polymarket events (groups of sub-markets)
  async fetchPolymarketEvents(limit = 200, pages = 2) {
    const key = `poly_events_p${pages}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 30000) return cached.data;

    try {
      // Fetch multiple pages in parallel for more markets
      const fetches = [];
      for (let p = 0; p < pages; p++) {
        const offset = p * limit;
        const qs = `events?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false&offset=${offset}`;
        fetches.push(
          this._fetchWithFallback(`${this._polyBase}${qs}`, `${this._polyDirect}${qs}`, { timeout: 20000 })
            .then(r => r.ok ? r.json() : []).catch(() => [])
        );
      }
      const results = await Promise.all(fetches);
      const allRaw = results.flatMap(raw => Array.isArray(raw) ? raw : raw.events || []);
      // Deduplicate by event ID
      const seen = new Set();
      const events = allRaw.filter(ev => {
        if (!ev.id || seen.has(ev.id)) return false;
        seen.add(ev.id);
        return ev.title && ev.markets && ev.markets.length > 0;
      })
        .filter(ev => ev.title && ev.markets && ev.markets.length > 0)
        .map(ev => {
          const subMarkets = ev.markets
            .filter(m => m.question && m.acceptingOrders !== false && !m.closed)
            .map(m => ({
              id: m.id,
              name: m.question,
              groupTitle: m.groupItemTitle || m.question,
              slug: m.slug,
              price: Math.round(parseFloat(m.outcomePrices?.[0] || m.lastTradePrice || 0) * 100),
              bestBid: Math.round(parseFloat(m.bestBid || 0) * 100),
              bestAsk: Math.round(parseFloat(m.bestAsk || 0) * 100),
              volume24h: parseFloat(m.volume24hr || 0),
              volumeTotal: parseFloat(m.volume || 0),
              liquidity: parseFloat(m.liquidity || 0),
              conditionId: m.conditionId,
              clobTokenId: _parseClobTokenId(m.clobTokenIds),
            }))
            .filter(m => m.price > 0 && m.price < 100)
            .sort((a, b) => b.price - a.price);

          const totalVol = subMarkets.reduce((s, m) => s + m.volume24h, 0);
          const topMarket = subMarkets[0];
          return {
            id: ev.id,
            name: ev.title,
            slug: ev.slug,
            endDate: ev.endDate,
            source: 'polymarket',
            isEvent: subMarkets.length > 1,
            subCount: subMarkets.length,
            subMarkets,
            price: topMarket ? topMarket.price : 0,
            bestBid: topMarket ? topMarket.bestBid : 0,
            bestAsk: topMarket ? topMarket.bestAsk : 0,
            volume24h: totalVol,
            volumeTotal: parseFloat(ev.volume || 0),
            liquidity: parseFloat(ev.liquidity || 0),
          };
        })
        .filter(ev => ev.price > 0);
      this._cache.set(key, { data: events, ts: Date.now() });
      return events;
    } catch (e) {
      console.warn('[LiveMarkets] Polymarket events fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // ═══════════════════════════════════════════
  // KALSHI — Trade API v2
  // ═══════════════════════════════════════════

  async fetchKalshiMarkets(limit = 200) {
    const key = 'kalshi_markets';
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 30000) return cached.data;

    try {
      const qs = `markets?limit=${limit}&status=open`;
      const resp = await this._fetchWithFallback(`${this._kalshiBase}${qs}`, `${this._kalshiDirect}${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const markets = (json.markets || [])
        .filter(m => m.title && m.last_price > 0 && m.last_price < 100)
        .map(m => ({
          id: m.ticker,
          name: m.title,
          ticker: m.ticker,
          eventTicker: m.event_ticker,
          price: m.last_price || m.yes_bid || 0,
          yesBid: m.yes_bid || 0,
          yesAsk: m.yes_ask || 0,
          noBid: m.no_bid || 0,
          noAsk: m.no_ask || 0,
          volume24h: m.volume_24h || 0,
          volumeTotal: m.volume || 0,
          liquidity: m.liquidity || 0,
          openInterest: m.open_interest || 0,
          closeTime: m.close_time,
          source: 'kalshi',
        }));
      this._cache.set(key, { data: markets, ts: Date.now() });
      return markets;
    } catch (e) {
      console.warn('[LiveMarkets] Kalshi fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // Fetch Kalshi events with nested markets (groups sub-markets by event)
  async fetchKalshiEvents(limit = 200, pages = 2) {
    const key = `kalshi_events_p${pages}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 30000) return cached.data;

    try {
      // Fetch multiple pages using cursor pagination
      let allRaw = [];
      let cursor = '';
      for (let p = 0; p < pages; p++) {
        const qs = `events?limit=${limit}&status=open&with_nested_markets=true${cursor ? '&cursor=' + cursor : ''}`;
        const resp = await this._fetchWithFallback(`${this._kalshiBase}${qs}`, `${this._kalshiDirect}${qs}`, { timeout: 20000 });
        if (!resp.ok) break;
        const json = await resp.json();
        const batch = json.events || [];
        allRaw = allRaw.concat(batch);
        cursor = json.cursor || '';
        if (batch.length < limit || !cursor) break; // No more pages
      }
      const events = allRaw
        .filter(ev => ev.title && ev.markets && ev.markets.length > 0)
        .map(ev => {
          const subMarkets = ev.markets
            .filter(m => m.title && m.status === 'active')
            .map(m => ({
              id: m.ticker,
              name: m.title,
              ticker: m.ticker,
              eventTicker: m.event_ticker,
              price: m.last_price || m.yes_bid || 0,
              yesBid: m.yes_bid || 0,
              yesAsk: m.yes_ask || 0,
              volume24h: m.volume_24h || m.volume || 0,
              openInterest: m.open_interest || 0,
              closeTime: m.close_time,
            }))
            .filter(m => m.price > 0 && m.price < 100)
            .sort((a, b) => b.price - a.price);

          const totalVol = subMarkets.reduce((s, m) => s + m.volume24h, 0);
          const topMarket = subMarkets[0];
          return {
            id: ev.event_ticker,
            name: ev.title,
            eventTicker: ev.event_ticker,
            seriesTicker: ev.series_ticker,
            closeTime: subMarkets[0]?.closeTime,
            source: 'kalshi',
            mutuallyExclusive: ev.mutually_exclusive || false,
            isEvent: subMarkets.length > 1,
            subCount: subMarkets.length,
            subMarkets,
            price: topMarket ? topMarket.price : 0,
            yesBid: topMarket ? topMarket.yesBid : 0,
            yesAsk: topMarket ? topMarket.yesAsk : 0,
            volume24h: totalVol,
            liquidity: ev.liquidity || 0,
          };
        })
        .filter(ev => ev.price > 0);
      this._cache.set(key, { data: events, ts: Date.now() });
      return events;
    } catch (e) {
      console.warn('[LiveMarkets] Kalshi events fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // ═══════════════════════════════════════════
  // KALSHI — Trade history for a specific market
  // ═══════════════════════════════════════════

  async fetchKalshiTrades(ticker, limit = 100) {
    const key = `kalshi_trades_${ticker}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 60000) return cached.data;

    try {
      const qs = `markets/trades?ticker=${encodeURIComponent(ticker)}&limit=${limit}`;
      const resp = await this._fetchWithFallback(`${this._kalshiBase}${qs}`, `${this._kalshiDirect}${qs}`, { timeout: 6000 });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const trades = (json.trades || []).map(t => ({
        price: t.yes_price || t.no_price || 0,
        count: t.count || 1,
        time: t.created_time,
        taker_side: t.taker_side,
      }));
      this._cache.set(key, { data: trades, ts: Date.now() });
      return trades;
    } catch (e) {
      console.warn('[LiveMarkets] Kalshi trades fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // ═══════════════════════════════════════════
  // COMBINED — Fetch both platforms, merge & deduplicate
  // ═══════════════════════════════════════════

  async fetchAllMarkets() {
    // Fetch events (grouped, paginated) + individual markets from both platforms
    const [polyEvents, kalshiEvents, polyMarkets, kalshiMarkets] = await Promise.all([
      this.fetchPolymarketEvents(200, 2).catch(() => []),
      this.fetchKalshiEvents(200, 2).catch(() => []),
      this.fetchPolymarketMarkets(),
      this.fetchKalshiMarkets(),
    ]);

    const combined = [];
    const seenNorms = new Set();

    // ── Process Polymarket events first ──
    for (const ev of polyEvents) {
      const norm = this._normalizeForMatch(ev.name);
      seenNorms.add(norm);
      // Also mark each sub-market name as seen so individual market fetch doesn't duplicate
      for (const sm of ev.subMarkets) seenNorms.add(this._normalizeForMatch(sm.name));

      combined.push({
        name: ev.name,
        short: this._shortName(ev.name),
        price: ev.price,
        vol: this._formatVol(ev.volume24h),
        _volNum: ev.volume24h,
        polyPrice: ev.price,
        kalshiPrice: null,
        polyBid: ev.bestBid,
        polyAsk: ev.bestAsk,
        tf: this._classifyTf(ev.endDate),
        _endDate: ev.endDate || null,
        source: 'polymarket',
        slug: ev.slug,
        _polyId: ev.id,
        _conditionId: ev.subMarkets[0]?.conditionId || null,
        _clobTokenId: ev.subMarkets[0]?.clobTokenId || null,
        liquidity: ev.liquidity,
        isEvent: ev.isEvent,
        subCount: ev.subCount,
        subMarkets: ev.isEvent ? ev.subMarkets.map(sm => ({
          name: sm.groupTitle || sm.name,
          price: sm.price,
          vol: this._formatVol(sm.volume24h),
          _volNum: sm.volume24h,
          bestBid: sm.bestBid,
          bestAsk: sm.bestAsk,
          source: 'polymarket',
          _conditionId: sm.conditionId,
        })) : null,
      });
    }

    // ── Add individual Polymarket markets not covered by events ──
    for (const m of polyMarkets) {
      const norm = this._normalizeForMatch(m.name);
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      combined.push({
        name: m.name,
        short: this._shortName(m.name),
        price: m.price,
        vol: this._formatVol(m.volume24h),
        _volNum: m.volume24h,
        polyPrice: m.price,
        kalshiPrice: null,
        polyBid: m.bestBid,
        polyAsk: m.bestAsk,
        tf: this._classifyTf(m.endDate),
        _endDate: m.endDate || null,
        source: 'polymarket',
        slug: m.slug,
        _polyId: m.id,
        _conditionId: m.conditionId || null,
        _clobTokenId: m.clobTokenId || null,
        liquidity: m.liquidity,
        isEvent: false,
        subCount: 0,
        subMarkets: null,
      });
    }

    // ── Process Kalshi events — merge into existing or add new ──
    for (const ev of kalshiEvents) {
      const norm = this._normalizeForMatch(ev.name);
      const existing = combined.find(c => this._normalizeForMatch(c.name) === norm);
      if (existing) {
        existing.kalshiPrice = ev.price;
        existing.kalshiBid = ev.yesBid;
        existing.kalshiAsk = ev.yesAsk;
        existing._kalshiTicker = ev.subMarkets[0]?.ticker || ev.eventTicker;
        // Merge Kalshi sub-markets into existing event
        if (ev.isEvent && ev.subMarkets.length > 0) {
          if (!existing.isEvent) {
            existing.isEvent = true;
            existing.subMarkets = [];
          }
          // Add Kalshi sub-markets that don't exist in Poly
          for (const ksm of ev.subMarkets) {
            const kNorm = this._normalizeForMatch(ksm.name);
            const existingSub = (existing.subMarkets || []).find(s => this._normalizeForMatch(s.name) === kNorm);
            if (existingSub) {
              existingSub.kalshiPrice = ksm.price;
              existingSub.kalshiBid = ksm.yesBid;
              existingSub.kalshiAsk = ksm.yesAsk;
            } else {
              existing.subMarkets = existing.subMarkets || [];
              existing.subMarkets.push({
                name: ksm.name,
                price: ksm.price,
                vol: this._formatVol(ksm.volume24h),
                _volNum: ksm.volume24h,
                yesBid: ksm.yesBid,
                yesAsk: ksm.yesAsk,
                source: 'kalshi',
              });
            }
          }
          existing.subCount = (existing.subMarkets || []).length;
        }
      } else {
        // Mark sub-market names as seen
        for (const sm of ev.subMarkets) seenNorms.add(this._normalizeForMatch(sm.name));
        seenNorms.add(norm);
        combined.push({
          name: ev.name,
          short: this._shortName(ev.name),
          price: ev.price,
          vol: this._formatVol(ev.volume24h),
          _volNum: ev.volume24h,
          polyPrice: null,
          kalshiPrice: ev.price,
          kalshiBid: ev.yesBid,
          kalshiAsk: ev.yesAsk,
          tf: this._classifyTf(ev.closeTime),
          _endDate: ev.closeTime || null,
          source: 'kalshi',
          _kalshiTicker: ev.subMarkets[0]?.ticker || ev.eventTicker,
          liquidity: ev.liquidity,
          isEvent: ev.isEvent,
          subCount: ev.subCount,
          subMarkets: ev.isEvent ? ev.subMarkets.map(sm => ({
            name: sm.name,
            ticker: sm.ticker,
            price: sm.price,
            vol: this._formatVol(sm.volume24h),
            _volNum: sm.volume24h,
            yesBid: sm.yesBid,
            yesAsk: sm.yesAsk,
            source: 'kalshi',
          })) : null,
        });
      }
    }

    // ── Add remaining individual Kalshi markets ──
    for (const m of kalshiMarkets) {
      const norm = this._normalizeForMatch(m.name);
      const existing = combined.find(c => this._normalizeForMatch(c.name) === norm);
      if (existing) {
        if (existing.kalshiPrice == null) {
          existing.kalshiPrice = m.price;
          existing.kalshiBid = m.yesBid;
          existing.kalshiAsk = m.yesAsk;
          existing._kalshiTicker = m.ticker;
        }
      } else if (!seenNorms.has(norm)) {
        seenNorms.add(norm);
        combined.push({
          name: m.name,
          short: this._shortName(m.name),
          price: m.price,
          vol: this._formatVol(m.volume24h),
          _volNum: m.volume24h,
          polyPrice: null,
          kalshiPrice: m.price,
          kalshiBid: m.yesBid,
          kalshiAsk: m.yesAsk,
          tf: this._classifyTf(m.closeTime),
          _endDate: m.closeTime || null,
          source: 'kalshi',
          _kalshiTicker: m.ticker,
          liquidity: m.liquidity,
          isEvent: false,
          subCount: 0,
          subMarkets: null,
        });
      }
    }

    // Sort by volume descending
    combined.sort((a, b) => (b._volNum || 0) - (a._volNum || 0));

    // Record price snapshots for history
    const now = Date.now();
    for (const m of combined) {
      const key = m.short;
      if (!this._priceHistory.has(key)) this._priceHistory.set(key, []);
      const hist = this._priceHistory.get(key);
      if (hist.length === 0 || now - hist[hist.length - 1].t > 60000) {
        hist.push({ t: now, price: m.price });
        if (hist.length > 200) hist.shift();
      }
    }

    return combined;
  },

  // Get accumulated price history for a market
  getPriceHistory(short) {
    return this._priceHistory.get(short) || [];
  },

  // ═══════════════════════════════════════════
  // HISTORICAL PRICE DATA (CLOB + Kalshi Candlesticks)
  // ═══════════════════════════════════════════

  // Fetch Polymarket price history via CLOB API
  // clobTokenId is the YES token from Gamma's clobTokenIds field
  async fetchPolyPriceHistory(clobTokenId, interval = 'max', fidelity = 60) {
    if (!clobTokenId) return [];
    const key = `poly_hist_${clobTokenId}_${interval}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 120000) return cached.data;

    try {
      const qs = `prices-history?market=${encodeURIComponent(clobTokenId)}&interval=${interval}&fidelity=${fidelity}`;
      const resp = await this._fetchWithFallback(`${this._clobBase}${qs}`, `${this._clobDirect}${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      // CLOB returns { history: [{ t: unix_seconds, p: float_0_to_1 }] }
      const history = (json.history || []).map(h => ({
        t: (h.t || 0) * 1000, // convert seconds to ms
        price: Math.round((h.p || 0) * 100), // convert 0-1 to cents
      }));
      this._cache.set(key, { data: history, ts: Date.now() });
      return history;
    } catch (e) {
      console.warn('[LiveMarkets] CLOB price history failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // Fetch Kalshi candlestick data for a market
  async fetchKalshiCandlesticks(ticker, periodInterval = 60) {
    if (!ticker) return [];
    const key = `kalshi_candles_${ticker}_${periodInterval}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 120000) return cached.data;

    try {
      const qs = `markets/${encodeURIComponent(ticker)}/candlesticks?period_interval=${periodInterval}`;
      const resp = await this._fetchWithFallback(`${this._kalshiBase}${qs}`, `${this._kalshiDirect}${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      // Kalshi returns { candlesticks: [{ end_period_ts, yes_price: {open,high,low,close}, volume, ... }] }
      const candles = (json.candlesticks || []).map(c => ({
        t: new Date(c.end_period_ts || c.period_end || 0).getTime(),
        open: c.yes_price?.open || c.open || 0,
        high: c.yes_price?.high || c.high || 0,
        low: c.yes_price?.low || c.low || 0,
        close: c.yes_price?.close || c.close || 0,
        price: c.yes_price?.close || c.close || 0,
        volume: c.volume || 0,
      })).filter(c => c.t > 0 && c.price > 0);
      this._cache.set(key, { data: candles, ts: Date.now() });
      return candles;
    } catch (e) {
      console.warn('[LiveMarkets] Kalshi candlesticks failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // ═══════════════════════════════════════════
  // NEWS — Real news via Google News RSS proxy
  // ═══════════════════════════════════════════

  async fetchNews(query = 'prediction market polymarket kalshi crypto politics') {
    const key = `news_${query}`;
    const cached = this._cache.get(key);
    if (cached && Date.now() - cached.ts < 120000) return cached.data;

    try {
      const url = `${this._newsBase}?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const articles = (json.articles || []).map(a => ({
        title: a.title || '',
        link: a.link || '',
        pubDate: a.pubDate || '',
        source: a.source || '',
        // Calculate relative time
        _ts: a.pubDate ? new Date(a.pubDate).getTime() : Date.now(),
      }));
      this._cache.set(key, { data: articles, ts: Date.now() });
      return articles;
    } catch (e) {
      console.warn('[LiveMarkets] News fetch failed:', e.message);
      return cached ? cached.data : [];
    }
  },

  // ═══════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════

  _shortName(question) {
    if (!question) return '???';
    let q = question
      .replace(/^Will\s+/i, '')
      .replace(/^Is\s+/i, '')
      .replace(/^Does\s+/i, '')
      .replace(/^Do\s+/i, '')
      .replace(/\?$/g, '')
      .replace(/by\s+\w+\s+\d{1,2},?\s+\d{4}/gi, '')  // "by February 28, 2026"
      .replace(/after the \w+ \d{4} meeting/gi, '')
      .replace(/\d{4}-\d{2}-\d{2}/g, '')  // dates
      .trim();
    // Extract key terms: tickers, names, numbers
    const keyTerms = q.match(/\b[A-Z]{2,}[a-z]*\b|\$[\d,.]+[MKBT]?|\b\d+[%cC]?\b/g);
    if (keyTerms && keyTerms.length >= 2) {
      return keyTerms.slice(0, 3).join('').slice(0, 10).toUpperCase();
    }
    // Use significant words
    const words = q.split(/\s+/).filter(w => w.length > 2 && !/^(the|and|for|from|with|into|over|under|than|that|this|have|been|after|before|about|during)$/i.test(w));
    if (words.length <= 2) return words.join('').slice(0, 10).toUpperCase();
    return words.slice(0, 3).map(w => w.slice(0, 3)).join('').toUpperCase().slice(0, 10);
  },

  _formatVol(v) {
    if (!v || v === 0) return '$0';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + (v / 1e3).toFixed(0) + 'K';
    return '$' + Math.round(v);
  },

  _classifyTf(endDate) {
    if (!endDate) return '1M';
    const ms = new Date(endDate).getTime() - Date.now();
    const days = ms / 86400000;
    if (days < 0.0625) return '15M';
    if (days < 0.1) return '1H';
    if (days < 8) return '1W';
    if (days < 35) return '1M';
    return '1Y';
  },

  _normalizeForMatch(s) {
    if (!s) return '';
    return s.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\b(will|the|by|in|on|of|a|an)\b/g, '');
  },
};


/* ================================================================
   MERCURY ENGINE BRIDGE — Connects Architect to the strategy engine
   (localhost:8778 — the new mercury-engine backend)
   ================================================================ */

class MercuryEngineBridge {
  constructor(apiBase = 'http://localhost:8778') {
    this.apiBase = apiBase;
    this.connected = false;
    this._polls = new Map();
  }

  async _fetch(path, options = {}) {
    try {
      const resp = await fetch(`${this.apiBase}${path}`, {
        signal: AbortSignal.timeout(8000),
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        const detail = err.detail;
        const msg = Array.isArray(detail)
          ? detail.map(d => d.msg || d.message || JSON.stringify(d)).join('; ')
          : (detail || `HTTP ${resp.status}`);
        throw new Error(msg);
      }
      this.connected = true;
      return await resp.json();
    } catch (e) {
      if (e.name === 'AbortError') {
        this.connected = false;
        throw new Error('Engine timeout — is mercury-engine running?');
      }
      throw e;
    }
  }

  // ═══════════════════════════════════════════
  // HEALTH
  // ═══════════════════════════════════════════

  async checkHealth() {
    try {
      const data = await this._fetch('/api/health');
      this.connected = true;
      return data;
    } catch {
      this.connected = false;
      return null;
    }
  }

  // ═══════════════════════════════════════════
  // STRATEGIES
  // ═══════════════════════════════════════════

  async validateStrategy(strategy) {
    return await this._fetch('/api/strategies/validate', {
      method: 'POST',
      body: JSON.stringify(strategy),
    });
  }

  async listStrategies() {
    return await this._fetch('/api/strategies');
  }

  // ═══════════════════════════════════════════
  // BOTS
  // ═══════════════════════════════════════════

  async deployBot(strategy, botName, platform, capital, mode) {
    return await this._fetch('/api/bots/deploy', {
      method: 'POST',
      body: JSON.stringify({
        strategy,
        bot_name: botName,
        platform,
        capital: parseFloat(capital) || 10000,
        mode: mode || 'paper',
      }),
    });
  }

  async listBots() {
    return await this._fetch('/api/bots');
  }

  async getBot(botId) {
    return await this._fetch(`/api/bots/${botId}`);
  }

  async stopBot(botId) {
    return await this._fetch(`/api/bots/${botId}/stop`, { method: 'POST' });
  }

  async pauseBot(botId) {
    return await this._fetch(`/api/bots/${botId}/pause`, { method: 'POST' });
  }

  async resumeBot(botId) {
    return await this._fetch(`/api/bots/${botId}/resume`, { method: 'POST' });
  }

  async getBotLogs(botId, limit = 50) {
    return await this._fetch(`/api/bots/${botId}/logs?limit=${limit}`);
  }

  async getBotTrades(botId, limit = 50) {
    return await this._fetch(`/api/bots/${botId}/trades?limit=${limit}`);
  }

  async deleteBot(botId) {
    return await this._fetch(`/api/bots/${botId}`, { method: 'DELETE' });
  }

  // ═══════════════════════════════════════════
  // MARKETS
  // ═══════════════════════════════════════════

  async getBTCPrice() {
    return await this._fetch('/api/markets/btc/price');
  }

  async getPolymarketActive(limit = 30, search = '') {
    let url = `/api/markets/polymarket/active?limit=${limit}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    return await this._fetch(url);
  }

  async getPolymarketMarket(marketId) {
    return await this._fetch(`/api/markets/polymarket/market/${encodeURIComponent(marketId)}`);
  }

  async testApiUrl(url, method = 'GET', headers = '{}', jsonPath = '') {
    let parsedHeaders = {};
    try { parsedHeaders = JSON.parse(headers || '{}'); } catch { /* ignore */ }
    return await this._fetch('/api/markets/test-api', {
      method: 'POST',
      body: JSON.stringify({ url, method, headers: parsedHeaders, json_path: jsonPath }),
    });
  }

  // ═══════════════════════════════════════════
  // AGENT
  // ═══════════════════════════════════════════

  async agentChat(message, history = [], tier = 'free') {
    try {
      const resp = await fetch(`${this.apiBase}/api/agent/chat`, {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history, tier }),
      });

      if (resp.status === 429) {
        const body = await resp.json().catch(() => ({}));
        const detail = body.detail || {};
        const error = new Error(detail.message || 'Rate limit exceeded');
        error.rateLimited = true;
        error.rateLimitType = detail.error;
        error.usage = detail.usage || null;
        error.upgrade = detail.upgrade || false;
        error.retryAfter = detail.retry_after_seconds || 60;
        throw error;
      }

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }

      this.connected = true;
      const data = await resp.json();
      if (data.usage) this.lastAgentUsage = data.usage;
      return data;
    } catch (e) {
      if (e.name === 'AbortError') {
        this.connected = false;
        throw new Error('Engine timeout — is mercury-engine running?');
      }
      throw e;
    }
  }

  async getAgentUsage(tier = 'free') {
    return await this._fetch(`/api/agent/usage?tier=${encodeURIComponent(tier)}`);
  }

  // ═══════════════════════════════════════════
  // WALLET (Polymarket managed wallets)
  // ═══════════════════════════════════════════

  async getOrCreateWallet(authToken) {
    return await this._fetch('/api/wallet/polymarket', {
      method: 'POST',
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
    });
  }

  async getWalletBalance(authToken) {
    return await this._fetch('/api/wallet/polymarket/balance', {
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
    });
  }

  async requestWithdrawal(toAddress, amount, authToken) {
    return await this._fetch('/api/wallet/polymarket/withdraw', {
      method: 'POST',
      body: JSON.stringify({ to_address: toAddress, amount }),
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
    });
  }

  // ═══════════════════════════════════════════
  // STATS
  // ═══════════════════════════════════════════

  async getStats() {
    return await this._fetch('/api/stats');
  }

  // ═══════════════════════════════════════════
  // POLLING
  // ═══════════════════════════════════════════

  startPolling(key, intervalMs, callback) {
    this.stopPolling(key);
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
    for (const [, id] of this._polls) clearInterval(id);
    this._polls.clear();
  }
}

// Global engine instance
const engineBridge = new MercuryEngineBridge();
