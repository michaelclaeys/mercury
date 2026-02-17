/* ================================================================
   MERCURY RESEARCH — Edge-Finding Platform + Terminal
   Research: edge scanner, market scanner, news feed, signals
   Terminal: order book, volume, bot logs, chat
   ================================================================ */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const research = {
  charts: {},
  intervals: [],
  animFrameId: null,
  orderBook: null,
  tickerData: [],
  isActive: false,
  chatHistory: [],
  initializedTabs: {},
  edgeData: [],
  arbData: [],
  marketData: [],
  signalCount: 0,
  // Live data state
  liveConnected: false,
  liveDataAvailable: false,
  liveBTCPrice: null,
  liveDVOL: null,
  liveDivergence: null,
  liveKalshiImplied: null,
  lastLogLines: 0,
};

const RESEARCH_MARKETS = [
  { name: 'Fed Rate Cut Mar 2026', short: 'RATE', price: 62, vol: '$2.1M', polyPrice: 62, kalshiPrice: 64, tf: '1M' },
  { name: 'BTC > $100K by EOY', short: 'BTC100K', price: 48, vol: '$8.4M', polyPrice: 48, kalshiPrice: 46, tf: '1M' },
  { name: 'Trump 2028 Nominee', short: 'TRUMP28', price: 34, vol: '$4.2M', polyPrice: 34, kalshiPrice: 37, tf: '1Y' },
  { name: 'US Recession 2027', short: 'RECSN', price: 28, vol: '$1.8M', polyPrice: 28, kalshiPrice: 31, tf: '1Y' },
  { name: 'AI Regulation 2026', short: 'AIREG', price: 71, vol: '$3.1M', polyPrice: 71, kalshiPrice: 68, tf: '1M' },
  { name: 'SpaceX Mars Mission', short: 'MARS', price: 12, vol: '$0.9M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'Nvidia > $200', short: 'NVDA', price: 55, vol: '$5.7M', polyPrice: 55, kalshiPrice: 53, tf: '1W' },
  { name: 'US Debt Ceiling Crisis', short: 'DEBT', price: 82, vol: '$2.4M', polyPrice: 82, kalshiPrice: 80, tf: '1M' },
  { name: 'BTC above $97.5K 12:45', short: 'BTC15M', price: 62, vol: '$0.3M', polyPrice: 63, kalshiPrice: 62, tf: '15M' },
  { name: 'BTC above $97K 1:00pm', short: 'BTC1H', price: 71, vol: '$0.5M', polyPrice: 70, kalshiPrice: 71, tf: '1H' },
  { name: 'ETH above $3,800 1:00pm', short: 'ETH1H', price: 44, vol: '$0.2M', polyPrice: 45, kalshiPrice: 44, tf: '1H' },
  { name: 'BTC above $98K 1:00pm', short: 'BTC1H2', price: 38, vol: '$0.4M', polyPrice: 37, kalshiPrice: 38, tf: '1H' },
  { name: 'Super Bowl Winner', short: 'SB', price: 55, vol: '$12.1M', polyPrice: 55, kalshiPrice: 54, tf: '1W' },
  { name: 'Next Fed Chair Pick', short: 'FED', price: 22, vol: '$1.5M', polyPrice: 22, kalshiPrice: 24, tf: '1Y' },
];

const BOT_NAMES = ['Alpha-7', 'Theta-Decay', 'Momentum-X', 'Arb-Scanner', 'Whale-Watch', 'Fed-Hawk'];
const LOG_LEVELS = ['info', 'trade', 'warn', 'error'];
const LOG_MESSAGES = {
  info: [
    'Scanning {market} order book depth',
    'Volume spike detected on {market}: +{pct}%',
    'Correlation shift: {m1} / {m2} now {corr}',
    'Recalculating fair value for {market}',
    'Heartbeat OK \u2014 latency {ms}ms',
    'Market {market} liquidity: ${vol}',
  ],
  trade: [
    'BUY 500 YES @ {price}c on {market}',
    'SELL 300 NO @ {price}c on {market}',
    'FILLED: 1000 YES @ {price}c \u2014 {market}',
    'Limit order placed: {qty} YES @ {price}c',
    'Position closed: +${pnl} on {market}',
    'DCA entry #{n}: {qty} YES @ {price}c',
  ],
  warn: [
    'Slippage above threshold on {market}: {pct}%',
    'Low liquidity warning: {market} spread > 5c',
    'Position approaching limit: ${amt}/${max}',
    'API rate limit at 80% \u2014 throttling requests',
  ],
  error: [
    'Order rejected: insufficient margin for {market}',
    'Connection timeout to Polymarket \u2014 retrying',
    'Price feed stale for {market} (>30s)',
  ],
};

const NEWS_HEADLINES = [
  { source: 'Reuters', headline: 'Fed officials signal openness to rate cut as inflation cools', markets: ['RATE', 'BTC100K'], sentiment: 'bullish' },
  { source: 'Bloomberg', headline: 'Bitcoin ETF inflows reach $2.1B this week, highest since January', markets: ['BTC100K', 'NVDA'], sentiment: 'bullish' },
  { source: 'WSJ', headline: 'EU proposes strict AI liability framework, US lawmakers watching closely', markets: ['AIREG'], sentiment: 'bearish' },
  { source: 'AP News', headline: 'Trump announces 2028 exploratory committee, polls show mixed support', markets: ['TRUMP28'], sentiment: 'neutral' },
  { source: 'CNBC', headline: 'US Treasury yields fall sharply on weak jobs data', markets: ['RATE', 'RECSN'], sentiment: 'bullish' },
  { source: 'Reuters', headline: 'SpaceX Starship test delayed again due to FAA review', markets: ['MARS'], sentiment: 'bearish' },
  { source: 'Bloomberg', headline: 'Nvidia earnings beat expectations, datacenter revenue up 140% YoY', markets: ['NVDA', 'AIREG'], sentiment: 'bullish' },
  { source: 'WSJ', headline: 'Debt ceiling negotiations stall as deadline approaches', markets: ['DEBT', 'RECSN'], sentiment: 'bearish' },
  { source: 'Polymarket', headline: 'Whale buys $500K YES on Fed Rate Cut, largest single order this month', markets: ['RATE'], sentiment: 'bullish' },
  { source: 'Kalshi', headline: 'Recession contract volume spikes 300% following GDP revision', markets: ['RECSN', 'RATE'], sentiment: 'bearish' },
  { source: 'CoinDesk', headline: 'Bitcoin breaks $95K resistance, on-chain metrics turn bullish', markets: ['BTC100K'], sentiment: 'bullish' },
  { source: 'Reuters', headline: 'Core PCE comes in at 2.3%, below consensus expectations', markets: ['RATE', 'BTC100K'], sentiment: 'bullish' },
  { source: 'Bloomberg', headline: 'Cross-platform arbitrage opportunity detected: AI Regulation spread widens to 4c', markets: ['AIREG'], sentiment: 'neutral' },
  { source: 'AP News', headline: 'Senate confirms new SEC chair, expected to take moderate stance on crypto', markets: ['BTC100K', 'AIREG'], sentiment: 'bullish' },
];

const SIGNAL_TYPES = [
  { type: 'edge', icon: '\u25B2', label: 'Edge Detected' },
  { type: 'arb', icon: '\u21C4', label: 'Arbitrage Opportunity' },
  { type: 'volume', icon: '\u2593', label: 'Volume Spike' },
  { type: 'whale', icon: '\u25C6', label: 'Whale Activity' },
];

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════

function initResearchDashboard() {
  if (research.isActive) return;
  research.isActive = true;
  research.initializedTabs = {};

  initResearchTabs();
  initTicker();
  initKillSwitch();
  startResearchClock();

  // Init Edge Scanner (default tab, visible immediately)
  initEdgeScanner();

  // Start live data connection
  initLiveDataConnection();
}

function teardownResearchDashboard() {
  if (!research.isActive) return;
  research.isActive = false;

  research.intervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  research.intervals = [];

  // Stop bridge polling
  if (typeof dataBridge !== 'undefined') {
    dataBridge.stopAllPolling();
  }

  if (research.animFrameId) {
    cancelAnimationFrame(research.animFrameId);
    research.animFrameId = null;
  }

  Object.keys(research.charts).forEach(key => {
    if (research.charts[key]) {
      research.charts[key].destroy();
      research.charts[key] = null;
    }
  });

  research.initializedTabs = {};
}

function addResearchInterval(fn, ms) {
  research.intervals.push(setInterval(fn, ms));
}

// ═══════════════════════════════════════════════════════════════
// RESEARCH TABS
// ═══════════════════════════════════════════════════════════════

function initResearchTabs() {
  const tabBar = document.getElementById('researchTabBar');
  if (!tabBar) return;

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.research-tab');
    if (!btn) return;
    switchResearchTab(btn.dataset.rtab);
  });
}

function switchResearchTab(tabName) {
  document.querySelectorAll('.research-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.rtab === tabName);
  });
  document.querySelectorAll('.research-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'rtab-' + tabName);
  });

  // Lazy-init tabs on first visit
  if (tabName === 'markets' && !research.initializedTabs.markets) {
    research.initializedTabs.markets = true;
    initMarketScanner();
  }
  if (tabName === 'news' && !research.initializedTabs.news) {
    research.initializedTabs.news = true;
    initNewsFeed();
    initSignalAlerts();
  }
  if (tabName === 'crypto' && !research.initializedTabs.crypto) {
    research.initializedTabs.crypto = true;
    initCryptoTab();
  }
  if (tabName === 'terminal' && !research.initializedTabs.terminal) {
    research.initializedTabs.terminal = true;
    initOrderBook();
    initVolumeChart();
    initResearchLogs();
    initResearchChat();
  }

  // Resize volume chart when switching to Terminal
  if (tabName === 'terminal') {
    setTimeout(() => {
      if (research.charts.volume) {
        try { research.charts.volume.resize(); } catch (_) {}
      }
    }, 50);
  }
}

// ═══════════════════════════════════════════════════════════════
// TICKER TAPE
// ═══════════════════════════════════════════════════════════════

function initTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  research.tickerData = RESEARCH_MARKETS.map(m => ({
    name: m.short,
    price: m.price,
    delta: (Math.random() * 6 - 3).toFixed(1),
  }));

  function renderTicker() {
    const items = [...research.tickerData, ...research.tickerData];
    track.innerHTML = items.map(t => {
      const up = parseFloat(t.delta) >= 0;
      return `<span class="ticker-item">
        <span class="ticker-name">${t.name}</span>
        <span class="ticker-price">${t.price}c</span>
        <span class="ticker-delta ${up ? 'up' : 'down'}">${up ? '+' : ''}${t.delta}c</span>
      </span><span class="ticker-sep">\u25cf</span>`;
    }).join('');
  }

  renderTicker();

  addResearchInterval(() => {
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const idx = Math.floor(Math.random() * research.tickerData.length);
      const t = research.tickerData[idx];
      const change = (Math.random() * 4 - 2);
      t.price = Math.max(1, Math.min(99, Math.round(t.price + change)));
      t.delta = change.toFixed(1);
    }
    renderTicker();
  }, 5000);
}

// ═══════════════════════════════════════════════════════════════
// EDGE SCANNER
// ═══════════════════════════════════════════════════════════════

const ARB_CAUSES = [
  'Fee structure difference',
  'Liquidity imbalance',
  'Resolution criteria divergence',
  'Settlement timing mismatch',
  'Retail vs institutional mix',
  'Different user base composition',
];

function initEdgeScanner() {
  research.edgeTimeframe = 'all';
  research.liveMarkets = false;

  // Start with mock data for instant render
  loadMockEdgeData();

  // Timeframe filter buttons
  const tabs = document.getElementById('edgeTimeframeTabs');
  if (tabs) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.tf-btn');
      if (!btn) return;
      tabs.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      research.edgeTimeframe = btn.dataset.tf;
      renderEdgeCards();
    });
  }

  renderEdgeCards();
  renderArbTable();

  // Try to load live markets (replaces mock if successful)
  loadLiveMarkets();

  // Poll live markets every 60s
  addResearchInterval(loadLiveMarkets, 60000);

  // Simulate price shifts for mock data only (when bridge is offline)
  addResearchInterval(() => {
    if (research.liveMarkets) return;
    research.edgeData.forEach(e => {
      const shift = (Math.random() - 0.5) * 3;
      e.price = Math.max(1, Math.min(99, Math.round(e.price + shift)));
      e.change = ((Math.random() - 0.48) * 8).toFixed(1);
      e.polyPrice = e.price;
      e.kalshiPrice = e.price + Math.floor((Math.random() - 0.5) * 5);
    });

    research.arbData.forEach(a => {
      const m = research.edgeData.find(e => e.short === a.short);
      if (m) {
        a.polyPrice = m.polyPrice;
        a.kalshiPrice = m.kalshiPrice;
        a.spread = Math.abs(a.polyPrice - a.kalshiPrice);
      }
    });
    research.arbData.sort((a, b) => b.spread - a.spread);

    renderEdgeCards();
    renderArbTable();
  }, 8000);
}

function loadMockEdgeData() {
  research.edgeData = RESEARCH_MARKETS.map(m => ({
    name: m.name,
    short: m.short,
    price: m.price,
    vol: m.vol,
    _volNum: parseFloat(m.vol.replace(/[$MK]/g, '')) * (m.vol.includes('M') ? 1e6 : m.vol.includes('K') ? 1e3 : 1),
    change: (Math.random() * 10 - 4).toFixed(1),
    polyPrice: m.polyPrice,
    kalshiPrice: m.kalshiPrice,
    tf: m.tf,
  }));

  research.arbData = RESEARCH_MARKETS.map(m => ({
    name: m.name,
    short: m.short,
    polyPrice: m.polyPrice,
    kalshiPrice: m.kalshiPrice,
    spread: Math.abs(m.polyPrice - m.kalshiPrice),
    cause: ARB_CAUSES[Math.floor(Math.random() * ARB_CAUSES.length)],
  })).filter(a => a.spread >= 2).sort((a, b) => b.spread - a.spread);
}

async function loadLiveMarkets() {
  if (!research.isActive || typeof dataBridge === 'undefined') return;

  try {
    const data = await dataBridge.getActiveMarkets();
    if (!data || !data.markets || data.markets.length === 0) return;

    research.liveMarkets = true;
    research.edgeData = data.markets.map(m => ({
      name: m.name,
      short: m.ticker || '',
      price: m.price || 0,
      vol: formatVolume(m.volume),
      _volNum: m.volume || 0,
      change: '--',
      polyPrice: m.source === 'polymarket' ? m.price : null,
      kalshiPrice: m.source === 'kalshi' ? m.price : null,
      tf: classifyMarketTf(m),
      source: m.source,
    }));

    // Build arb data — only possible for same-name markets on both platforms
    // For now, just show all markets with their source prices
    research.arbData = research.edgeData
      .filter(e => e.price > 0)
      .map(e => ({
        name: e.name,
        short: e.short,
        polyPrice: e.polyPrice,
        kalshiPrice: e.kalshiPrice,
        spread: 0,
        cause: e.source,
      }));

    // Update overview metrics
    const el = document.getElementById('metricActiveMarkets');
    if (el) el.textContent = data.count;
    const volEl = document.getElementById('metricTotalVol');
    if (volEl) {
      const totalVol = data.markets.reduce((s, m) => s + (m.volume || 0), 0);
      volEl.textContent = formatVolume(totalVol);
    }

    renderEdgeCards();
    renderArbTable();
  } catch (e) {
    console.warn('[Research] Live markets unavailable:', e);
  }
}

function formatVolume(num) {
  if (num == null || num === 0) return '$0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(1)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(1)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(0)}K`;
  return `$${Math.round(num)}`;
}

function classifyMarketTf(m) {
  if (m.series === 'KXBTCD') return '1H';
  if (m.close_time) {
    const hours = (new Date(m.close_time) - Date.now()) / 3.6e6;
    if (hours <= 0.5) return '15M';
    if (hours <= 2) return '1H';
    if (hours <= 24 * 7) return '1W';
    if (hours <= 24 * 31) return '1M';
    return '1Y';
  }
  return '1M';
}

function renderEdgeCards() {
  const container = document.getElementById('edgeResearchCards');
  if (!container) return;

  // Filter by timeframe then sort by volume descending
  const tf = research.edgeTimeframe || 'all';
  const filtered = tf === 'all'
    ? [...research.edgeData]
    : research.edgeData.filter(e => e.tf === tf);

  const sorted = filtered.sort((a, b) => (b._volNum || 0) - (a._volNum || 0));

  let html = `<div class="edge-table-header">
    <span class="edge-col">Market</span>
    <span class="edge-col">Price</span>
    <span class="edge-col">Volume</span>
    <span class="edge-col">Source</span>
    <span class="edge-col">Poly</span>
    <span class="edge-col">Kalshi</span>
    <span class="edge-col">Spread</span>
  </div>`;

  if (sorted.length === 0) {
    html += '<div style="padding: 12px 16px; color: var(--dim); font-size: 10px;">No markets in this timeframe</div>';
  } else {
    html += sorted.map(e => {
      const polyStr = e.polyPrice != null ? `${e.polyPrice}c` : '\u2014';
      const kalshiStr = e.kalshiPrice != null ? `${e.kalshiPrice}c` : '\u2014';
      const spread = (e.polyPrice != null && e.kalshiPrice != null)
        ? Math.abs(e.polyPrice - e.kalshiPrice) : null;
      const spreadStr = spread != null ? `${spread}c` : '\u2014';
      const sourceTag = e.source === 'kalshi' ? 'K' : e.source === 'polymarket' ? 'P' : e.change || '\u2014';

      return `<div class="edge-row">
        <span class="edge-row-name">${e.name} <span class="edge-row-short">${e.short}</span></span>
        <span class="edge-row-val">${e.price}c</span>
        <span class="edge-row-vol-val">${e.vol}</span>
        <span class="edge-row-val edge-source-${e.source || 'mock'}">${sourceTag}</span>
        <span class="edge-row-val">${polyStr}</span>
        <span class="edge-row-val">${kalshiStr}</span>
        <span class="edge-row-spread ${spread >= 2 ? 'notable' : ''}">${spreadStr}</span>
      </div>`;
    }).join('');
  }

  container.innerHTML = html;
}

function renderArbTable() {
  const body = document.getElementById('arbTableBody');
  if (!body) return;

  const ts = document.getElementById('arbTimestamp');
  if (ts) ts.textContent = 'Updated just now';

  body.innerHTML = research.arbData.map(a => {
    const polyStr = a.polyPrice != null ? `${a.polyPrice}c` : '\u2014';
    const kalshiStr = a.kalshiPrice != null ? `${a.kalshiPrice}c` : '\u2014';
    const notable = a.spread >= 2;
    return `<div class="arb-row">
      <span class="arb-market">${a.name}</span>
      <span class="arb-price">${polyStr}</span>
      <span class="arb-price">${kalshiStr}</span>
      <span class="arb-spread ${notable ? 'profitable' : ''}">${a.spread}c</span>
      <span class="arb-cause">${a.cause}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// CRYPTO TAB — 15-Min & 1-Hour Market Probabilities
// ═══════════════════════════════════════════════════════════════

function initCryptoTab() {
  pollCryptoData();
  addResearchInterval(pollCryptoData, 10000);
}

async function pollCryptoData() {
  if (!research.isActive || typeof dataBridge === 'undefined') return;

  // Fetch everything in parallel
  const [priceData, dvolData, kalshiData, polyData] = await Promise.all([
    dataBridge.getBTCPrice().catch(() => null),
    dataBridge.getDVOL().catch(() => null),
    dataBridge.getKalshiMarkets().catch(() => null),
    dataBridge.getPolyMarket().catch(() => null),
  ]);

  // ── BTC Price ──
  if (priceData) {
    const btc = priceData.binance || priceData.coinbase;
    if (btc) {
      research.liveBTCPrice = btc;
      const el = document.getElementById('cryptoBTCPrice');
      if (el) el.textContent = '$' + Math.round(btc).toLocaleString();
    }
  }

  // ── DVOL ──
  if (dvolData && dvolData.dvol != null) {
    research.liveDVOL = dvolData.dvol;
    const el = document.getElementById('cryptoDVOL');
    if (el) {
      el.textContent = dvolData.dvol.toFixed(1) + '%';
      el.style.color = dvolData.dvol > 60 ? '#ff1744' : dvolData.dvol > 40 ? '#ffab00' : '#00c853';
    }
  }

  // ── Polymarket YES price ──
  let polyYes = null;
  if (polyData && polyData.price != null) {
    polyYes = Math.round(polyData.price * 100);
  }

  // ── Kalshi markets → split into 15m and 1h ──
  if (kalshiData && kalshiData.markets && kalshiData.markets.length > 0) {
    const markets15m = [];
    const markets1h = [];

    for (const m of kalshiData.markets) {
      const kalshiYes = m.yes_bid || m.last_price || 0;
      const strike = extractStrike(m.title || m.ticker);

      const row = { strike, kalshiYes, polyYes, title: m.title || m.ticker };

      // Categorize by timeframe from title
      const title = (m.title || '').toLowerCase();
      if (title.includes('15') || title.includes('quarter') || title.includes(':15') || title.includes(':45') || title.includes(':30')) {
        markets15m.push(row);
      } else {
        markets1h.push(row);
      }
    }

    // If no clear split, put all in 1h (hourly is the default for condor-bot)
    if (markets15m.length === 0 && markets1h.length === 0) {
      kalshiData.markets.forEach(m => {
        markets1h.push({
          strike: extractStrike(m.title || m.ticker),
          kalshiYes: m.yes_bid || m.last_price || 0,
          polyYes,
          title: m.title || m.ticker,
        });
      });
    }

    renderCryptoMarkets('crypto15mBody', markets15m, 'crypto15mCount');
    renderCryptoMarkets('crypto1hBody', markets1h, 'crypto1hCount');
  }
}

function extractStrike(title) {
  // Pull dollar amount from title like "BTC above $97,500" or "KXBTC-25FEB16-B97500"
  const dollarMatch = title.match(/\$[\d,]+/);
  if (dollarMatch) return dollarMatch[0];

  const numMatch = title.match(/B(\d{4,6})/i);
  if (numMatch) return '$' + Number(numMatch[1]).toLocaleString();

  return title;
}

function renderCryptoMarkets(containerId, markets, countId) {
  const container = document.getElementById(containerId);
  const countEl = document.getElementById(countId);
  if (!container) return;

  if (countEl) countEl.textContent = markets.length + ' active';

  if (markets.length === 0) {
    container.innerHTML = '<div style="padding: 12px 16px; color: var(--dim); font-size: 10px;">No active markets</div>';
    return;
  }

  container.innerHTML = markets.map(m => {
    const spread = m.polyYes != null ? Math.abs(m.kalshiYes - m.polyYes) : null;
    const notable = spread != null && spread >= 3;

    return `<div class="crypto-mkt-row">
      <span class="crypto-mkt-strike">${m.strike}</span>
      <span class="crypto-mkt-price yes">${m.kalshiYes}¢</span>
      <span class="crypto-mkt-price ${m.polyYes != null ? 'yes' : 'na'}">${m.polyYes != null ? m.polyYes + '¢' : '--'}</span>
      <span class="crypto-mkt-spread ${notable ? 'notable' : ''}">${spread != null ? spread + '¢' : '--'}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// MARKET SCANNER
// ═══════════════════════════════════════════════════════════════

function initMarketScanner() {
  research.marketData = RESEARCH_MARKETS.map(m => ({
    name: m.name,
    short: m.short,
    price: m.price,
    fair: m.fair,
    change: (Math.random() * 10 - 5).toFixed(1),
    vol: m.vol,
    polyPrice: m.polyPrice,
    kalshiPrice: m.kalshiPrice,
  }));

  renderMarketTable();

  addResearchInterval(() => {
    research.marketData.forEach(m => {
      const shift = (Math.random() - 0.5) * 3;
      m.price = Math.max(1, Math.min(99, Math.round(m.price + shift)));
      m.change = ((Math.random() - 0.48) * 8).toFixed(1);
      m.polyPrice = m.price;
      m.kalshiPrice = m.price + Math.floor((Math.random() - 0.5) * 5);
    });
    renderMarketTable();
  }, 8000);

  // Sort dropdown
  const sortEl = document.getElementById('marketScannerSort');
  if (sortEl) {
    sortEl.addEventListener('change', renderMarketTable);
  }
}

function renderMarketTable() {
  const body = document.getElementById('marketTableBody');
  if (!body) return;

  const sortEl = document.getElementById('marketScannerSort');
  const sortBy = sortEl ? sortEl.value : 'edge';
  let sorted = [...research.marketData];

  if (sortBy === 'edge') sorted.sort((a, b) => Math.abs(b.fair - b.price) - Math.abs(a.fair - a.price));
  else if (sortBy === 'volume') sorted.sort((a, b) => parseFloat(b.vol.replace(/[$M]/g, '')) - parseFloat(a.vol.replace(/[$M]/g, '')));
  else if (sortBy === 'change') sorted.sort((a, b) => Math.abs(parseFloat(b.change)) - Math.abs(parseFloat(a.change)));
  else sorted.sort((a, b) => a.name.localeCompare(b.name));

  body.innerHTML = sorted.map(m => {
    const changeUp = parseFloat(m.change) >= 0;
    const edge = m.fair - m.price;
    const edgeSign = edge >= 0 ? '+' : '';
    const edgeClass = Math.abs(edge) >= 3 ? 'notable' : '';

    return `<div class="mkt-row">
      <span class="mkt-name">${m.name}</span>
      <span class="mkt-val">${m.price}c</span>
      <span class="mkt-val">${m.fair}c</span>
      <span class="mkt-val mkt-change ${changeUp ? 'up' : 'down'}">${changeUp ? '+' : ''}${m.change}c</span>
      <span class="mkt-val">${m.vol}</span>
      <span class="mkt-val">${m.polyPrice}c</span>
      <span class="mkt-val">${m.kalshiPrice}c</span>
      <span class="mkt-divergence ${edgeClass}">${edgeSign}${edge}c</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// NEWS FEED
// ═══════════════════════════════════════════════════════════════

function initNewsFeed() {
  const feed = document.getElementById('newsFeed');
  if (!feed) return;

  // Seed with initial news
  const shuffled = [...NEWS_HEADLINES].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 6; i++) {
    appendNewsItem(feed, shuffled[i % shuffled.length], false);
  }

  // Add new news every 12-20s
  function tick() {
    if (!research.isActive) return;
    const item = NEWS_HEADLINES[Math.floor(Math.random() * NEWS_HEADLINES.length)];
    appendNewsItem(feed, item, true);
    const delay = 12000 + Math.random() * 8000;
    research.intervals.push(setTimeout(tick, delay));
  }
  research.intervals.push(setTimeout(tick, 8000));
}

function appendNewsItem(feed, item, animate) {
  if (!feed) return;

  const now = new Date();
  const time = now.toTimeString().slice(0, 5);

  const el = document.createElement('div');
  el.className = 'news-item';
  if (!animate) el.style.animation = 'none';
  el.innerHTML = `
    <div class="news-item-header">
      <span class="news-item-time">${time}</span>
      <span class="news-item-source">${item.source}</span>
      <span class="news-item-sentiment ${item.sentiment}">${item.sentiment}</span>
    </div>
    <div class="news-item-headline">${item.headline}</div>
    <div class="news-item-markets">
      ${item.markets.map(m => `<span class="news-item-tag">${m}</span>`).join('')}
    </div>
  `;

  feed.insertBefore(el, feed.firstChild);

  while (feed.children.length > 30) {
    feed.removeChild(feed.lastChild);
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGNAL ALERTS
// ═══════════════════════════════════════════════════════════════

function initSignalAlerts() {
  const feed = document.getElementById('signalFeed');
  if (!feed) return;

  // Seed with initial signals
  for (let i = 0; i < 5; i++) {
    appendSignal(feed, false);
  }

  function tick() {
    if (!research.isActive) return;
    appendSignal(feed, true);
    research.signalCount++;
    const countEl = document.getElementById('signalCount');
    if (countEl) countEl.textContent = research.signalCount + ' new';
    const delay = 15000 + Math.random() * 20000;
    research.intervals.push(setTimeout(tick, delay));
  }
  research.intervals.push(setTimeout(tick, 10000));
}

function appendSignal(feed, animate) {
  if (!feed) return;

  const sig = SIGNAL_TYPES[Math.floor(Math.random() * SIGNAL_TYPES.length)];
  const m = RESEARCH_MARKETS[Math.floor(Math.random() * RESEARCH_MARKETS.length)];
  const now = new Date();
  const time = now.toTimeString().slice(0, 8);

  let title, desc;
  if (sig.type === 'edge') {
    const pct = Math.floor(Math.random() * 200) + 50;
    title = `${m.short}: Volume surge +${pct}% in last 2h`;
    desc = `${m.name} seeing unusual activity at ${m.price}c. ${m.vol} traded recently.`;
  } else if (sig.type === 'arb') {
    const spread = Math.floor(Math.random() * 4) + 2;
    title = `${m.short}: ${spread}c cross-platform discrepancy`;
    desc = `Polymarket ${m.polyPrice}c vs Kalshi ${m.polyPrice + spread}c. Investigating cause — possible liquidity imbalance.`;
  } else if (sig.type === 'volume') {
    const pct = Math.floor(Math.random() * 300) + 100;
    title = `${m.short}: Volume spike +${pct}%`;
    desc = `Unusual volume on ${m.name}. ${m.vol} in last hour — may indicate information flow.`;
  } else {
    const amount = (Math.random() * 500 + 50).toFixed(0);
    title = `${m.short}: Large position $${amount}K detected`;
    desc = `Significant position change on ${m.name}. Monitoring for informed flow patterns.`;
  }

  const el = document.createElement('div');
  el.className = 'signal-item';
  if (!animate) el.style.animation = 'none';
  el.innerHTML = `
    <span class="signal-icon ${sig.type}">${sig.icon}</span>
    <div class="signal-content">
      <div class="signal-title">${title}</div>
      <div class="signal-desc">${desc}</div>
    </div>
    <span class="signal-time">${time}</span>
  `;

  feed.insertBefore(el, feed.firstChild);

  while (feed.children.length > 40) {
    feed.removeChild(feed.lastChild);
  }
}

// ═══════════════════════════════════════════════════════════════
// ORDER BOOK (Terminal tab)
// ═══════════════════════════════════════════════════════════════

async function initOrderBook() {
  const body = document.getElementById('orderbookBody');
  if (!body) return;

  // Try live orderbook first
  const usedLive = await loadLiveOrderBook();

  if (!usedLive) {
    // Fall back to mock orderbook
    const midPrice = 62;
    research.orderBook = {
      bids: Array.from({ length: 10 }, (_, i) => ({ price: midPrice - i, size: 5000 + Math.random() * 20000 })),
      asks: Array.from({ length: 10 }, (_, i) => ({ price: midPrice + 1 + i, size: 5000 + Math.random() * 20000 })),
    };
    renderOrderBook();
    // Mock simulation only when not live
    addResearchInterval(simulateOrderBookTick, 800);
  } else {
    // Live: poll real orderbook every 5s
    addResearchInterval(async () => {
      await loadLiveOrderBook();
    }, 5000);
  }
}

function renderOrderBook() {
  const body = document.getElementById('orderbookBody');
  if (!body || !research.orderBook) return;

  const ob = research.orderBook;
  const maxSize = Math.max(...ob.bids.map(b => b.size), ...ob.asks.map(a => a.size));
  const bestBid = ob.bids[0].price;
  const bestAsk = ob.asks[0].price;
  const spread = bestAsk - bestBid;

  let html = `<div class="ob-spread-indicator">
    <span class="ob-best-bid">${bestBid}c</span>
    <span class="ob-spread">spread ${spread}c</span>
    <span class="ob-best-ask">${bestAsk}c</span>
  </div><div class="ob-depth">`;

  [...ob.asks].reverse().forEach(a => {
    const pct = (a.size / maxSize * 100).toFixed(0);
    html += `<div class="ob-row ask">
      <span class="ob-price">${a.price}c</span>
      <span class="ob-bar-container"><span class="ob-bar ask" style="width:${pct}%"></span></span>
      <span class="ob-size">$${(a.size / 1000).toFixed(1)}K</span>
    </div>`;
  });

  ob.bids.forEach(b => {
    const pct = (b.size / maxSize * 100).toFixed(0);
    html += `<div class="ob-row bid">
      <span class="ob-price">${b.price}c</span>
      <span class="ob-bar-container"><span class="ob-bar bid" style="width:${pct}%"></span></span>
      <span class="ob-size">$${(b.size / 1000).toFixed(1)}K</span>
    </div>`;
  });

  html += '</div>';
  body.innerHTML = html;
}

function simulateOrderBookTick() {
  if (!research.orderBook) return;
  const ob = research.orderBook;
  ob.bids.forEach(b => { b.size = Math.max(500, b.size + (Math.random() - 0.5) * b.size * 0.15); });
  ob.asks.forEach(a => { a.size = Math.max(500, a.size + (Math.random() - 0.5) * a.size * 0.15); });
  if (Math.random() > 0.9) {
    const shift = Math.random() > 0.5 ? 1 : -1;
    ob.bids.forEach(b => b.price += shift);
    ob.asks.forEach(a => a.price += shift);
  }
  renderOrderBook();
}

// ═══════════════════════════════════════════════════════════════
// VOLUME FOOTPRINT (Terminal tab)
// ═══════════════════════════════════════════════════════════════

function initVolumeChart() {
  const container = document.getElementById('volumeChart');
  if (!container) return;

  const categories = [];
  const buyData = [];
  const sellData = [];
  const now = new Date();

  for (let i = 19; i >= 0; i--) {
    const t = new Date(now - i * 3600000);
    categories.push(t.getHours() + ':00');
    buyData.push(Math.floor(Math.random() * 400 + 100));
    sellData.push(-Math.floor(Math.random() * 350 + 80));
  }

  const options = {
    chart: {
      type: 'bar', height: '100%', stacked: true, background: 'transparent',
      toolbar: { show: false },
      animations: { enabled: true, speed: 400 },
    },
    series: [{ name: 'Buy Volume', data: buyData }, { name: 'Sell Volume', data: sellData }],
    plotOptions: { bar: { columnWidth: '80%' } },
    colors: ['#00c853', '#ff1744'],
    xaxis: {
      categories,
      labels: { style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' }, rotate: 0, hideOverlappingLabels: true },
      axisBorder: { color: '#1a1a1a' }, axisTicks: { color: '#1a1a1a' },
    },
    yaxis: {
      labels: {
        style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' },
        formatter: v => Math.abs(v) > 999 ? (v / 1000).toFixed(0) + 'K' : Math.abs(v).toString(),
      },
    },
    grid: { borderColor: '#1a1a1a', strokeDashArray: 3 },
    tooltip: { enabled: false },
    legend: { show: false },
    dataLabels: { enabled: false },
  };

  research.charts.volume = new ApexCharts(container, options);
  research.charts.volume.render();

  addResearchInterval(() => {
    buyData.shift(); sellData.shift(); categories.shift();
    const t = new Date();
    categories.push(t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0'));
    buyData.push(Math.floor(Math.random() * 400 + 100));
    sellData.push(-Math.floor(Math.random() * 350 + 80));
    if (research.charts.volume) {
      research.charts.volume.updateOptions({ xaxis: { categories } });
      research.charts.volume.updateSeries([{ data: buyData }, { data: sellData }]);
    }
  }, 3000);

  document.querySelectorAll('#volumeTimeframe .tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#volumeTimeframe .tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// BOT PERFORMANCE LOGS (Terminal tab)
// ═══════════════════════════════════════════════════════════════

function initResearchLogs() {
  const container = document.getElementById('researchLogs');
  if (!container) return;

  // Seed with mock logs
  for (let i = 0; i < 15; i++) {
    appendResearchLog(container, false);
  }

  // Mock log generation (continues alongside live logs)
  function tick() {
    if (!research.isActive) return;
    appendResearchLog(container, true);
    const delay = 1500 + Math.random() * 2000;
    research.intervals.push(setTimeout(tick, delay));
  }
  research.intervals.push(setTimeout(tick, 2000));

  // Also poll live bot logs if bridge is up
  if (research.liveConnected) {
    addResearchInterval(pollLiveBotLogs, 3000);
  }
}

function appendResearchLog(container, animate) {
  if (!container) container = document.getElementById('researchLogs');
  if (!container) return;

  const level = LOG_LEVELS[Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3];
  const templates = LOG_MESSAGES[level];
  let msg = templates[Math.floor(Math.random() * templates.length)];
  const m = RESEARCH_MARKETS[Math.floor(Math.random() * RESEARCH_MARKETS.length)];
  const m2 = RESEARCH_MARKETS[Math.floor(Math.random() * RESEARCH_MARKETS.length)];
  const bot = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

  msg = msg.replace('{market}', m.short).replace('{m1}', m.short).replace('{m2}', m2.short)
    .replace('{price}', (m.price + Math.floor(Math.random() * 5 - 2)).toString())
    .replace('{pct}', (Math.random() * 20 + 5).toFixed(1))
    .replace('{corr}', (Math.random() * 2 - 1).toFixed(2))
    .replace('{ms}', Math.floor(Math.random() * 45 + 5).toString())
    .replace('{vol}', (Math.random() * 500 + 50).toFixed(0) + 'K')
    .replace('{qty}', (Math.floor(Math.random() * 2000 + 200)).toString())
    .replace('{pnl}', (Math.random() * 800 + 20).toFixed(0))
    .replace('{amt}', (Math.random() * 8000 + 1000).toFixed(0))
    .replace('{max}', '10000')
    .replace('{n}', Math.floor(Math.random() * 5 + 1).toString());

  const time = new Date().toTimeString().slice(0, 8);

  const entry = document.createElement('div');
  entry.className = 'rlog-entry';
  if (!animate) entry.style.animation = 'none';
  entry.innerHTML = `<span class="rlog-time">${time}</span> <span class="rlog-bot">[${bot}]</span> <span class="rlog-level-${level}">[${level.toUpperCase()}]</span> <span class="rlog-msg">${msg}</span>`;

  container.appendChild(entry);
  while (container.children.length > 100) { container.removeChild(container.firstChild); }
  if (animate) { container.scrollTop = container.scrollHeight; }
}

// ═══════════════════════════════════════════════════════════════
// RESEARCH CHAT (Terminal tab)
// ═══════════════════════════════════════════════════════════════

function initResearchChat() {
  const input = document.getElementById('researchChatInput');
  const sendBtn = document.getElementById('researchChatSend');
  if (!input || !sendBtn) return;

  sendBtn.addEventListener('click', handleResearchChatInput);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleResearchChatInput();
  });
}

function handleResearchChatInput() {
  const input = document.getElementById('researchChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addResearchChatMessage(text, 'user');

  const welcome = document.querySelector('.research-chat-welcome');
  if (welcome) welcome.style.display = 'none';

  setTimeout(() => simulateResearchResponse(text), 600 + Math.random() * 800);
}

function addResearchChatMessage(content, type) {
  const container = document.getElementById('researchChatMessages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = `research-chat-msg ${type}`;

  if (type === 'assistant') {
    const div = document.createElement('div');
    div.textContent = content;
    msg.innerHTML = `<span class="msg-label">Mercury Research</span>${div.innerHTML.replace(/\n/g, '<br>')}`;
  } else {
    msg.textContent = content;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function simulateResearchResponse(text) {
  const lower = text.toLowerCase();
  let response;

  if (lower.includes('btc') || lower.includes('bitcoin')) {
    // Inject live data if available
    const btcLine = research.liveBTCPrice
      ? `Live BTC Price: $${research.liveBTCPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : 'BTC Price: fetching...';
    const dvolLine = research.liveDVOL
      ? `DVOL: ${research.liveDVOL.toFixed(1)}% implied vol`
      : '';
    const divLine = research.liveDivergence != null
      ? `Oracle Divergence: $${research.liveDivergence.toFixed(0)} (Binance - Coinbase)`
      : '';
    const impliedLine = research.liveKalshiImplied
      ? `Kalshi Implied: $${research.liveKalshiImplied.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : '';
    const liveBlock = [btcLine, dvolLine, divLine, impliedLine].filter(Boolean).join('\n');

    response = `BTC Overview:\n\n${liveBlock}\n\nKey data: Track ETF flows as a leading indicator. Compare Binance spot vs Kalshi implied price for spread opportunities.`;
  } else if (lower.includes('fed') || lower.includes('rate') || lower.includes('interest')) {
    response = 'Fed Rate Cut:\n\nCurrent: 62c YES | Volume: $2.1M/24h\nCME FedWatch: 68% probability\nPoly: 62c | Kalshi: 64c (2c spread)\n\nKey data: Core PCE at 2.3%, FOMC minutes showing dovish lean, 3/7 governors signaling openness to cuts.\n\nResearch angle: Compare CME FedWatch vs prediction market prices for spread opportunities.';
  } else if (lower.includes('edge') || lower.includes('opportunity') || lower.includes('volume')) {
    const topVol = research.edgeData ? [...research.edgeData].sort((a, b) => parseFloat(b.vol.replace(/[$M]/g, '')) - parseFloat(a.vol.replace(/[$M]/g, ''))).slice(0, 4) : [];
    const volLines = topVol.map((m, i) => `${i + 1}. ${m.name}: ${m.vol} volume, ${m.price}c, Poly ${m.polyPrice}c / Kalshi ${m.kalshiPrice}c`).join('\n');
    response = `Top markets by volume:\n\n${volLines}\n\nLook for cross-platform spreads and volume spikes as potential opportunities.`;
  } else if (lower.includes('arb') || lower.includes('spread') || lower.includes('arbitrage')) {
    response = 'Cross-platform spread analysis:\n\nActive spreads between Polymarket and Kalshi:\n\nSpreads can indicate: fee structure differences, liquidity imbalances, different resolution criteria, or retail vs institutional user base mix.\n\nNote: Persistent gaps often reflect structural differences, not pure arbitrage. Always check resolution terms.';
  } else if (lower.includes('correlat')) {
    response = 'Market correlations (estimated):\n\n+0.72: Fed Rate Cut / BTC > $100K\n+0.61: AI Regulation / Nvidia > $200\n-0.54: Recession 2027 / BTC > $100K\n-0.48: US Debt Ceiling / SpaceX Mars\n+0.45: Trump 2028 / Recession 2027\n\nNote: When correlated markets move out of sync, it may signal a trading opportunity.';
  } else {
    response = `Market overview:\n\n${research.edgeData ? research.edgeData.length : 8} markets tracked | Combined volume: $28.6M/24h\n\nAsk about specific markets (btc, fed, etc.), spreads, volume, correlations, or arbitrage.`;
  }

  addResearchChatMessage(response, 'assistant');
}

// ═══════════════════════════════════════════════════════════════
// KILL SWITCH
// ═══════════════════════════════════════════════════════════════

function initKillSwitch() {
  const btn = document.getElementById('killSwitchBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const modal = document.getElementById('killConfirmModal');
    if (modal) {
      const liveCount = typeof bots !== 'undefined' ? bots.filter(b => b.status === 'live').length : 3;
      const countEl = document.getElementById('killBotCount');
      if (countEl) countEl.textContent = liveCount + ' bots';
      modal.classList.add('active');
    }
  });

  const confirmBtn = document.getElementById('killConfirmBtn');
  if (confirmBtn) confirmBtn.addEventListener('click', executeKillSwitch);

  const cancelBtn = document.getElementById('killCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      const modal = document.getElementById('killConfirmModal');
      if (modal) modal.classList.remove('active');
    });
  }
}

function executeKillSwitch() {
  const modal = document.getElementById('killConfirmModal');
  if (modal) modal.classList.remove('active');

  if (typeof bots !== 'undefined') {
    bots.forEach(b => { if (b.status === 'live') b.status = 'paused'; });
  }

  const btn = document.getElementById('killSwitchBtn');
  if (btn) {
    btn.classList.add('activated');
    btn.innerHTML = '<span class="kill-switch-icon">&#10003;</span> ALL STOPPED';
    setTimeout(() => {
      btn.classList.remove('activated');
      btn.innerHTML = '<span class="kill-switch-icon">&#9632;</span> KILL ALL';
    }, 3000);
  }

  if (typeof showToast === 'function') {
    showToast('EMERGENCY STOP \u2014 All bots halted');
  } else {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMessage');
    if (toast && toastMsg) {
      toastMsg.textContent = 'EMERGENCY STOP \u2014 All bots halted';
      toast.classList.add('active');
      setTimeout(() => toast.classList.remove('active'), 4000);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// CLOCK + TRADING SESSION
// ═══════════════════════════════════════════════════════════════

const TRADING_SESSIONS = [
  { name: 'NEW YORK',  open: 13.5, close: 21 },
  { name: 'LONDON',    open: 8,    close: 16.5 },
  { name: 'TOKYO',     open: 0,    close: 9 },
  { name: 'SYDNEY',    open: 22,   close: 7 },
];

function getCurrentSession(utcH, utcM) {
  const t = utcH + utcM / 60;
  for (const s of TRADING_SESSIONS) {
    if (s.open < s.close) {
      if (t >= s.open && t < s.close) return s.name;
    } else {
      if (t >= s.open || t < s.close) return s.name;
    }
  }
  return 'OFF-HOURS';
}

function startResearchClock() {
  function tick() {
    const el = document.getElementById('researchClock');
    if (!el) return;
    const now = new Date();
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();
    const s = now.getUTCSeconds();
    const session = getCurrentSession(h, m);
    const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    el.textContent = `${session} SESSION \u2014 ${time} UTC`;
  }
  tick();
  addResearchInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════════════
// LIVE DATA CONNECTION (Mercury Bridge API)
// ═══════════════════════════════════════════════════════════════

async function initLiveDataConnection() {
  if (typeof dataBridge === 'undefined') return;

  // Check bridge connection
  const bridgeUp = await dataBridge.checkConnection();
  research.liveConnected = bridgeUp;

  // Even if bridge is down, try direct data (Coinbase/Deribit fallbacks)
  const priceData = await dataBridge.getBTCPrice();
  research.liveDataAvailable = bridgeUp || !!(priceData && (priceData.binance || priceData.coinbase));
  updateConnectionIndicator();

  // Poll connection status every 15s
  addResearchInterval(async () => {
    research.liveConnected = await dataBridge.checkConnection();
    research.liveDataAvailable = research.liveConnected || research.liveBTCPrice != null || research.liveDVOL != null;
    updateConnectionIndicator();
  }, 15000);

  // Start live data polling (these work even without bridge via fallbacks)
  startLiveBTCPricePolling();
  startLiveDVOLPolling();
  startLiveMetricsPolling();
}

function updateConnectionIndicator() {
  const dot = document.querySelector('.research-live-dot');
  const label = document.querySelector('.research-live-label');
  if (!dot && !label) return;

  if (research.liveConnected) {
    // Full bridge connection — all data available
    if (dot) dot.style.background = '#00c853';
    if (label) { label.textContent = 'LIVE'; label.style.color = '#00c853'; }
  } else if (research.liveDataAvailable) {
    // Direct API data flowing (Coinbase/Deribit fallbacks, no bridge)
    if (dot) dot.style.background = '#ffab00';
    if (label) { label.textContent = 'DIRECT'; label.style.color = '#ffab00'; }
  } else {
    // No data at all
    if (dot) dot.style.background = '#ff1744';
    if (label) { label.textContent = 'OFFLINE'; label.style.color = '#ff1744'; }
  }
}

// ─── BTC Price Polling ──────────────────────────────────────

function startLiveBTCPricePolling() {
  async function poll() {
    if (!research.isActive) return;
    const data = await dataBridge.getBTCPrice();
    if (!data) return;

    const price = data.binance || data.coinbase;
    if (price) {
      research.liveBTCPrice = price;
      updateTickerWithLivePrice(price);
      // Update data availability on first successful fetch
      if (!research.liveDataAvailable) {
        research.liveDataAvailable = true;
        updateConnectionIndicator();
      }
    }
    if (data.divergence != null) {
      research.liveDivergence = data.divergence;
    }
  }
  poll();
  addResearchInterval(poll, 5000);
}

function updateTickerWithLivePrice(price) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  // Find or create the live BTC ticker item
  let btcItem = track.querySelector('.ticker-item-live-btc');
  if (!btcItem) {
    // Insert at the very beginning of the ticker
    const span = document.createElement('span');
    span.className = 'ticker-item ticker-item-live-btc';
    span.innerHTML = `<span class="ticker-name" style="color:#00c853">BTC</span>
      <span class="ticker-price ticker-btc-price">$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>`;
    const sep = document.createElement('span');
    sep.className = 'ticker-sep';
    sep.textContent = '\u25cf';
    track.insertBefore(sep, track.firstChild);
    track.insertBefore(span, track.firstChild);
  } else {
    const priceEl = btcItem.querySelector('.ticker-btc-price');
    if (priceEl) {
      const oldText = priceEl.textContent;
      const newText = `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      priceEl.textContent = newText;
      if (oldText !== newText) {
        priceEl.style.color = parseFloat(newText.replace(/[$,]/g, '')) > parseFloat(oldText.replace(/[$,]/g, '')) ? '#00c853' : '#ff1744';
        setTimeout(() => { priceEl.style.color = ''; }, 1500);
      }
    }
  }
}

// ─── DVOL Polling ───────────────────────────────────────────

function startLiveDVOLPolling() {
  async function poll() {
    if (!research.isActive) return;
    const data = await dataBridge.getDVOL();
    if (!data || data.dvol == null) return;

    research.liveDVOL = data.dvol;
    if (!research.liveDataAvailable) {
      research.liveDataAvailable = true;
      updateConnectionIndicator();
    }

    // Update ticker with DVOL
    const track = document.getElementById('tickerTrack');
    if (!track) return;
    let dvolItem = track.querySelector('.ticker-item-live-dvol');
    if (!dvolItem) {
      const span = document.createElement('span');
      span.className = 'ticker-item ticker-item-live-dvol';
      span.innerHTML = `<span class="ticker-name" style="color:#ffab00">DVOL</span>
        <span class="ticker-price ticker-dvol-val">${data.dvol.toFixed(1)}</span>`;
      const sep = document.createElement('span');
      sep.className = 'ticker-sep';
      sep.textContent = '\u25cf';
      // Insert after BTC item
      const btcSep = track.querySelector('.ticker-item-live-btc');
      const insertAfter = btcSep ? btcSep.nextSibling?.nextSibling || null : track.firstChild;
      track.insertBefore(sep, insertAfter);
      track.insertBefore(span, insertAfter);
    } else {
      const valEl = dvolItem.querySelector('.ticker-dvol-val');
      if (valEl) valEl.textContent = data.dvol.toFixed(1);
    }
  }
  poll();
  addResearchInterval(poll, 60000);
}

// ─── Metrics Polling (Crypto tab cards) ──────────

function startLiveMetricsPolling() {
  async function poll() {
    if (!research.isActive) return;

    // Update BTC price on crypto tab
    if (research.liveBTCPrice) {
      const el = document.getElementById('cryptoBTCPrice');
      if (el) el.textContent = '$' + Math.round(research.liveBTCPrice).toLocaleString();
    }

    // Update DVOL on crypto tab
    if (research.liveDVOL) {
      const el = document.getElementById('cryptoDVOL');
      if (el) {
        el.textContent = research.liveDVOL.toFixed(1) + '%';
        el.style.color = research.liveDVOL > 40 ? '#ff1744' : '#00c853';
      }
    }
  }
  poll();
  addResearchInterval(poll, 6000);
}

// ─── Live Order Book (replaces mock when bridge is up) ──────

async function loadLiveOrderBook() {
  if (typeof dataBridge === 'undefined' || !research.liveConnected) return false;

  try {
    // Get Kalshi markets to find an active one
    const mkts = await dataBridge.getKalshiMarkets();
    if (!mkts || !mkts.markets || mkts.markets.length === 0) return false;

    // Find the first market with an orderbook
    const target = mkts.markets.find(m => m.last_price > 0 || m.yes_bid > 0);
    if (!target) return false;

    const book = await dataBridge.getKalshiOrderbook(target.ticker);
    if (!book || (!book.yes?.length && !book.no?.length)) return false;

    // Convert Kalshi format to our orderbook format
    // Kalshi: { yes: [[price, size], ...], no: [[price, size], ...] }
    // Our format: { bids: [{price, size}], asks: [{price, size}] }
    const yesBids = (book.yes || []).sort((a, b) => b[0] - a[0]);
    const noBids = (book.no || []).sort((a, b) => b[0] - a[0]);

    // YES bids = people wanting to buy YES
    // To us: YES bids are "bids" (demand side), NO bids become asks (supply side for YES)
    const bids = yesBids.slice(0, 10).map(([price, size]) => ({ price, size: size * 100 }));
    const asks = noBids.slice(0, 10).map(([price, size]) => ({ price: 100 - price, size: size * 100 }));
    asks.sort((a, b) => a.price - b.price);

    if (bids.length > 0 || asks.length > 0) {
      research.orderBook = { bids, asks };
      // Show which market we're displaying
      const selectorEl = document.getElementById('obMarketSelector');
      if (selectorEl) selectorEl.textContent = target.ticker;
      renderOrderBook();
      return true;
    }
  } catch (e) {
    // Silently fall back to mock
  }
  return false;
}

// ─── Live Bot Logs ──────────────────────────────────────────

async function pollLiveBotLogs() {
  if (typeof dataBridge === 'undefined' || !research.liveConnected) return;

  const data = await dataBridge.getBotLogs();
  if (!data || !data.lines || data.lines.length === 0) return;

  const container = document.getElementById('researchLogs');
  if (!container) return;

  // Only append new lines
  const newLines = data.lines.slice(research.lastLogLines);
  if (newLines.length === 0) return;
  research.lastLogLines = data.lines.length;

  newLines.forEach(line => {
    const entry = document.createElement('div');
    entry.className = 'rlog-entry';

    // Parse log level from line content
    let level = 'info';
    if (line.includes('WARNING') || line.includes('[WARN]')) level = 'warn';
    else if (line.includes('ERROR') || line.includes('CRITICAL')) level = 'error';
    else if (line.includes('TRADE') || line.includes('FILLED') || line.includes('BUY') || line.includes('SELL')) level = 'trade';

    entry.innerHTML = `<span class="rlog-level-${level}">[LIVE]</span> <span class="rlog-msg">${line}</span>`;
    container.appendChild(entry);
  });

  while (container.children.length > 150) {
    container.removeChild(container.firstChild);
  }
  container.scrollTop = container.scrollHeight;
}

