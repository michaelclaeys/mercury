/* ================================================================
   MERCURY CHARTING — Edge-Finding Platform + Terminal
   Charting: edge scanner, market scanner, news feed
   Terminal: order book, volume, bot logs, chat
   ================================================================ */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const charting = {
  charts: {},
  intervals: [],      // Global intervals (always-on: ticker, clock, live polling)
  tabIntervals: [],   // Current tab's intervals (cleared on tab switch)
  animFrameId: null,
  orderBook: null,
  tickerData: [],
  isActive: false,
  chatHistory: [],
  initializedTabs: {},
  activeTab: 'edge',
  edgeData: [],
  arbData: [],
  marketData: [],
  // Live data state
  liveConnected: false,
  liveDataAvailable: false,
  liveBTCPrice: null,
  liveDVOL: null,
  liveDivergence: null,
  liveKalshiImplied: null,
  lastLogLines: 0,
};

const CHARTING_MARKETS = [
  // ── Crypto (20) ──
  { name: 'BTC > $100K by EOY', short: 'BTC100K', price: 48, vol: '$8.4M', polyPrice: 48, kalshiPrice: 46, tf: '1M' },
  { name: 'BTC > $150K by EOY', short: 'BTC150K', price: 18, vol: '$4.1M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: 'BTC > $200K by 2027', short: 'BTC200K', price: 9, vol: '$2.6M', polyPrice: 9, kalshiPrice: 11, tf: '1Y' },
  { name: 'BTC above $97.5K 12:45', short: 'BTC15M', price: 62, vol: '$0.3M', polyPrice: 63, kalshiPrice: 62, tf: '15M' },
  { name: 'BTC above $97K 1:00pm', short: 'BTC1H', price: 71, vol: '$0.5M', polyPrice: 70, kalshiPrice: 71, tf: '1H' },
  { name: 'BTC above $98K 1:00pm', short: 'BTC1H2', price: 38, vol: '$0.4M', polyPrice: 37, kalshiPrice: 38, tf: '1H' },
  { name: 'BTC above $96K 2:00pm', short: 'BTC1H3', price: 82, vol: '$0.6M', polyPrice: 82, kalshiPrice: 81, tf: '1H' },
  { name: 'ETH above $3,800 1:00pm', short: 'ETH1H', price: 44, vol: '$0.2M', polyPrice: 45, kalshiPrice: 44, tf: '1H' },
  { name: 'ETH > $5K by EOY', short: 'ETH5K', price: 31, vol: '$2.8M', polyPrice: 31, kalshiPrice: 29, tf: '1M' },
  { name: 'ETH > $8K by 2027', short: 'ETH8K', price: 12, vol: '$1.4M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'SOL > $300 by EOY', short: 'SOL300', price: 22, vol: '$1.9M', polyPrice: 22, kalshiPrice: 24, tf: '1M' },
  { name: 'SOL > $500 by 2027', short: 'SOL500', price: 8, vol: '$0.9M', polyPrice: 8, kalshiPrice: 10, tf: '1Y' },
  { name: 'BTC Spot ETF Inflows > $50B', short: 'BTCETF', price: 64, vol: '$3.2M', polyPrice: 64, kalshiPrice: 62, tf: '1Y' },
  { name: 'ETH Spot ETF Net Positive', short: 'ETHETF', price: 78, vol: '$2.1M', polyPrice: 78, kalshiPrice: 76, tf: '1M' },
  { name: 'Crypto Total MCap > $5T', short: 'CRYPTO5T', price: 35, vol: '$1.4M', polyPrice: 35, kalshiPrice: 37, tf: '1Y' },
  { name: 'DOGE > $0.50', short: 'DOGE50', price: 15, vol: '$1.1M', polyPrice: 15, kalshiPrice: 17, tf: '1M' },
  { name: 'XRP > $2.00', short: 'XRP2', price: 28, vol: '$1.3M', polyPrice: 28, kalshiPrice: 26, tf: '1M' },
  { name: 'ADA > $1.50', short: 'ADA15', price: 14, vol: '$0.7M', polyPrice: 14, kalshiPrice: 16, tf: '1M' },
  { name: 'BNB > $800', short: 'BNB800', price: 19, vol: '$0.8M', polyPrice: 19, kalshiPrice: 21, tf: '1M' },
  { name: 'Stablecoin MCap > $200B', short: 'STABLE', price: 72, vol: '$0.5M', polyPrice: 72, kalshiPrice: 70, tf: '1Y' },

  // ── Economics & Fed (15) ──
  { name: 'Fed Rate Cut Mar 2026', short: 'RATE', price: 62, vol: '$2.1M', polyPrice: 62, kalshiPrice: 64, tf: '1M' },
  { name: 'Fed Rate Cut Jun 2026', short: 'RATEJUN', price: 74, vol: '$1.8M', polyPrice: 74, kalshiPrice: 72, tf: '1M' },
  { name: 'Fed Rate Cut Sep 2026', short: 'RATESEP', price: 81, vol: '$1.2M', polyPrice: 81, kalshiPrice: 79, tf: '1M' },
  { name: 'Fed Funds < 4% by EOY', short: 'FF4', price: 44, vol: '$1.6M', polyPrice: 44, kalshiPrice: 42, tf: '1Y' },
  { name: 'Next Fed Chair Pick', short: 'FED', price: 22, vol: '$1.5M', polyPrice: 22, kalshiPrice: 24, tf: '1Y' },
  { name: 'US Recession 2026', short: 'RECSN26', price: 19, vol: '$2.4M', polyPrice: 19, kalshiPrice: 21, tf: '1Y' },
  { name: 'US Recession 2027', short: 'RECSN', price: 28, vol: '$1.8M', polyPrice: 28, kalshiPrice: 31, tf: '1Y' },
  { name: 'US Debt Ceiling Crisis', short: 'DEBT', price: 82, vol: '$2.4M', polyPrice: 82, kalshiPrice: 80, tf: '1M' },
  { name: 'CPI > 3% Jun 2026', short: 'CPI3', price: 33, vol: '$1.2M', polyPrice: 33, kalshiPrice: 35, tf: '1M' },
  { name: 'CPI < 2% by EOY', short: 'CPI2', price: 21, vol: '$0.9M', polyPrice: 21, kalshiPrice: 23, tf: '1Y' },
  { name: 'US Unemployment > 5%', short: 'UNEMP5', price: 14, vol: '$0.8M', polyPrice: 14, kalshiPrice: 16, tf: '1Y' },
  { name: 'S&P 500 > 6000 by EOY', short: 'SP6K', price: 58, vol: '$5.2M', polyPrice: 58, kalshiPrice: 56, tf: '1Y' },
  { name: 'Dow > 45000', short: 'DOW45K', price: 52, vol: '$2.8M', polyPrice: 52, kalshiPrice: 50, tf: '1Y' },
  { name: 'US GDP Growth > 3%', short: 'GDP3', price: 41, vol: '$0.9M', polyPrice: 41, kalshiPrice: 43, tf: '1Y' },
  { name: '10Y Treasury > 5%', short: 'T10Y5', price: 26, vol: '$1.6M', polyPrice: 26, kalshiPrice: 28, tf: '1M' },

  // ── US Politics (15) ──
  { name: 'Vance 2028 Nominee', short: 'VANCE28', price: 34, vol: '$4.2M', polyPrice: 34, kalshiPrice: 37, tf: '1Y' },
  { name: 'DeSantis 2028 Nominee', short: 'DESAN28', price: 21, vol: '$2.1M', polyPrice: 21, kalshiPrice: 23, tf: '1Y' },
  { name: 'Vivek 2028 Nominee', short: 'VIVEK28', price: 8, vol: '$1.2M', polyPrice: 8, kalshiPrice: 10, tf: '1Y' },
  { name: 'Dem 2028 Nominee', short: 'DEM28', price: 28, vol: '$3.8M', polyPrice: 28, kalshiPrice: 26, tf: '1Y' },
  { name: 'Newsom 2028 Nominee', short: 'NEWSOM', price: 18, vol: '$1.9M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: '2026 Midterms Senate', short: 'MID26', price: 52, vol: '$6.4M', polyPrice: 52, kalshiPrice: 54, tf: '1Y' },
  { name: '2026 Midterms House', short: 'MIDH26', price: 48, vol: '$5.1M', polyPrice: 48, kalshiPrice: 46, tf: '1Y' },
  { name: 'Government Shutdown 2026', short: 'SHUTDN', price: 45, vol: '$1.7M', polyPrice: 45, kalshiPrice: 43, tf: '1M' },
  { name: 'Trump Impeachment 2026', short: 'IMPEACH', price: 8, vol: '$2.9M', polyPrice: 8, kalshiPrice: 10, tf: '1Y' },
  { name: 'TikTok Ban Upheld', short: 'TIKTOK', price: 38, vol: '$3.5M', polyPrice: 38, kalshiPrice: 36, tf: '1M' },
  { name: 'Federal Cannabis Legalization', short: 'CANNA', price: 12, vol: '$1.8M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'Student Loan Forgiveness', short: 'STLOAN', price: 16, vol: '$2.2M', polyPrice: 16, kalshiPrice: 18, tf: '1Y' },
  { name: 'Supreme Court Expansion', short: 'SCOTUS', price: 5, vol: '$0.9M', polyPrice: 5, kalshiPrice: 7, tf: '1Y' },
  { name: 'US Crypto Regulation Bill', short: 'CRYREG', price: 42, vol: '$2.6M', polyPrice: 42, kalshiPrice: 40, tf: '1M' },
  { name: 'DOGE Dept Budget Cuts > $100B', short: 'DOGEDPT', price: 28, vol: '$3.1M', polyPrice: 28, kalshiPrice: 30, tf: '1Y' },

  // ── Geopolitics (10) ──
  { name: 'Ukraine Ceasefire 2026', short: 'UACEAF', price: 24, vol: '$4.6M', polyPrice: 24, kalshiPrice: 26, tf: '1Y' },
  { name: 'China Taiwan Escalation', short: 'TAIWAN', price: 7, vol: '$2.2M', polyPrice: 7, kalshiPrice: 9, tf: '1Y' },
  { name: 'Iran Nuclear Deal 2026', short: 'IRAN', price: 11, vol: '$1.1M', polyPrice: 11, kalshiPrice: 13, tf: '1Y' },
  { name: 'NATO New Member 2026', short: 'NATO', price: 32, vol: '$0.6M', polyPrice: 32, kalshiPrice: 30, tf: '1Y' },
  { name: 'North Korea Missile Test', short: 'NKMSL', price: 78, vol: '$0.8M', polyPrice: 78, kalshiPrice: 76, tf: '1M' },
  { name: 'Israel-Hamas Permanent Ceasefire', short: 'GAZA', price: 18, vol: '$3.4M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: 'Venezuela Regime Change', short: 'VENEZ', price: 9, vol: '$0.5M', polyPrice: 9, kalshiPrice: 11, tf: '1Y' },
  { name: 'BRICS Currency Launch', short: 'BRICS', price: 6, vol: '$1.3M', polyPrice: 6, kalshiPrice: 8, tf: '1Y' },
  { name: 'US-China Trade Deal', short: 'USTRADE', price: 22, vol: '$2.1M', polyPrice: 22, kalshiPrice: 24, tf: '1Y' },
  { name: 'South China Sea Incident', short: 'SCS', price: 31, vol: '$0.7M', polyPrice: 31, kalshiPrice: 29, tf: '1Y' },

  // ── Tech & AI (15) ──
  { name: 'AI Regulation 2026', short: 'AIREG', price: 71, vol: '$3.1M', polyPrice: 71, kalshiPrice: 68, tf: '1M' },
  { name: 'Nvidia > $200', short: 'NVDA', price: 55, vol: '$5.7M', polyPrice: 55, kalshiPrice: 53, tf: '1W' },
  { name: 'Apple > $250', short: 'AAPL250', price: 42, vol: '$3.3M', polyPrice: 42, kalshiPrice: 40, tf: '1M' },
  { name: 'Tesla > $400', short: 'TSLA400', price: 29, vol: '$4.8M', polyPrice: 29, kalshiPrice: 31, tf: '1M' },
  { name: 'Tesla > $500', short: 'TSLA500', price: 14, vol: '$2.1M', polyPrice: 14, kalshiPrice: 16, tf: '1Y' },
  { name: 'AGI by 2027', short: 'AGI27', price: 11, vol: '$2.7M', polyPrice: 11, kalshiPrice: 13, tf: '1Y' },
  { name: 'GPT-5 Release 2026', short: 'GPT5', price: 68, vol: '$1.9M', polyPrice: 68, kalshiPrice: 66, tf: '1Y' },
  { name: 'Claude 5 Release 2026', short: 'CLAUDE5', price: 52, vol: '$0.8M', polyPrice: 52, kalshiPrice: 50, tf: '1Y' },
  { name: 'SpaceX Mars Mission', short: 'MARS', price: 12, vol: '$0.9M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'SpaceX IPO 2026', short: 'SPACEX', price: 9, vol: '$1.4M', polyPrice: 9, kalshiPrice: 11, tf: '1Y' },
  { name: 'Meta Stock > $700', short: 'META700', price: 36, vol: '$2.1M', polyPrice: 36, kalshiPrice: 34, tf: '1M' },
  { name: 'Google Antitrust Breakup', short: 'GOOG', price: 18, vol: '$2.8M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: 'Apple AR Glasses Ship', short: 'APPLAR', price: 34, vol: '$1.1M', polyPrice: 34, kalshiPrice: 32, tf: '1Y' },
  { name: 'OpenAI IPO 2026', short: 'OAIIPO', price: 42, vol: '$2.4M', polyPrice: 42, kalshiPrice: 40, tf: '1Y' },
  { name: 'Robotaxi Nationwide US', short: 'RTAXI', price: 15, vol: '$1.6M', polyPrice: 15, kalshiPrice: 17, tf: '1Y' },

  // ── Sports (12) ──
  { name: 'World Cup 2026 USA Wins', short: 'WCUSA', price: 55, vol: '$12.1M', polyPrice: 55, kalshiPrice: 54, tf: '1Y' },
  { name: 'NBA Champion 2026', short: 'NBA26', price: 31, vol: '$7.8M', polyPrice: 31, kalshiPrice: 33, tf: '1Y' },
  { name: 'NBA MVP 2026', short: 'NBAMVP', price: 38, vol: '$3.2M', polyPrice: 38, kalshiPrice: 36, tf: '1Y' },
  { name: 'World Cup 2026 Winner', short: 'WC26', price: 18, vol: '$14.2M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: 'World Cup 2026 Top Scorer', short: 'WCTOP', price: 12, vol: '$4.8M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'MLB World Series 2026', short: 'MLB26', price: 14, vol: '$3.4M', polyPrice: 14, kalshiPrice: 16, tf: '1Y' },
  { name: 'UFC 315 Main Event', short: 'UFC315', price: 58, vol: '$1.8M', polyPrice: 58, kalshiPrice: 56, tf: '1W' },
  { name: 'F1 Champion 2026', short: 'F126', price: 44, vol: '$2.6M', polyPrice: 44, kalshiPrice: 42, tf: '1Y' },
  { name: 'NHL Stanley Cup 2026', short: 'NHL26', price: 22, vol: '$2.1M', polyPrice: 22, kalshiPrice: 24, tf: '1Y' },
  { name: 'March Madness Winner', short: 'NCAAM', price: 8, vol: '$5.4M', polyPrice: 8, kalshiPrice: 10, tf: '1M' },
  { name: 'Premier League Winner', short: 'EPL26', price: 42, vol: '$6.2M', polyPrice: 42, kalshiPrice: 40, tf: '1Y' },
  { name: 'Wimbledon Mens Winner', short: 'WIMB', price: 28, vol: '$1.9M', polyPrice: 28, kalshiPrice: 26, tf: '1M' },

  // ── Climate & Energy (8) ──
  { name: 'Hottest Year on Record 2026', short: 'HOT26', price: 56, vol: '$0.7M', polyPrice: 56, kalshiPrice: 54, tf: '1Y' },
  { name: 'Cat 5 Hurricane US 2026', short: 'HURR5', price: 32, vol: '$1.1M', polyPrice: 32, kalshiPrice: 34, tf: '1Y' },
  { name: 'Oil > $100/barrel', short: 'OIL100', price: 21, vol: '$2.8M', polyPrice: 21, kalshiPrice: 23, tf: '1M' },
  { name: 'Oil < $60/barrel', short: 'OIL60', price: 18, vol: '$1.4M', polyPrice: 18, kalshiPrice: 20, tf: '1M' },
  { name: 'US EV Sales > 30%', short: 'EV30', price: 37, vol: '$0.6M', polyPrice: 37, kalshiPrice: 35, tf: '1Y' },
  { name: 'Major US Wildfire > 500K acres', short: 'FIRE', price: 62, vol: '$0.4M', polyPrice: 62, kalshiPrice: 60, tf: '1Y' },
  { name: 'US Solar > 10% Grid', short: 'SOLAR10', price: 48, vol: '$0.3M', polyPrice: 48, kalshiPrice: 46, tf: '1Y' },
  { name: 'Carbon Credit > $100/ton EU', short: 'CARB', price: 38, vol: '$0.5M', polyPrice: 38, kalshiPrice: 36, tf: '1M' },

  // ── Entertainment & Culture (8) ──
  { name: 'Oscar Best Picture 2026', short: 'OSCAR', price: 28, vol: '$1.3M', polyPrice: 28, kalshiPrice: 30, tf: '1M' },
  { name: 'Twitter/X Monthly Users > 600M', short: 'XUSERS', price: 42, vol: '$0.8M', polyPrice: 42, kalshiPrice: 40, tf: '1Y' },
  { name: 'Threads Overtakes Twitter', short: 'THREADS', price: 16, vol: '$0.5M', polyPrice: 16, kalshiPrice: 18, tf: '1Y' },
  { name: 'GTA 6 Release 2026', short: 'GTA6', price: 72, vol: '$3.9M', polyPrice: 72, kalshiPrice: 70, tf: '1Y' },
  { name: 'Netflix Subscribers > 300M', short: 'NFLX300', price: 58, vol: '$0.6M', polyPrice: 58, kalshiPrice: 56, tf: '1Y' },
  { name: 'Spotify > 700M Users', short: 'SPOT700', price: 44, vol: '$0.3M', polyPrice: 44, kalshiPrice: 42, tf: '1Y' },
  { name: 'Grammy Album of Year', short: 'GRAM', price: 22, vol: '$0.9M', polyPrice: 22, kalshiPrice: 24, tf: '1M' },
  { name: 'Taylor Swift Retirement', short: 'SWIFT', price: 4, vol: '$1.8M', polyPrice: 4, kalshiPrice: 6, tf: '1Y' },

  // ── Global Economy (10) ──
  { name: 'UK Snap Election 2026', short: 'UKELEC', price: 11, vol: '$0.6M', polyPrice: 11, kalshiPrice: 13, tf: '1Y' },
  { name: 'Euro > $1.15', short: 'EUR115', price: 47, vol: '$1.4M', polyPrice: 47, kalshiPrice: 45, tf: '1M' },
  { name: 'Japan Rate Hike 2026', short: 'JPRATE', price: 62, vol: '$0.9M', polyPrice: 62, kalshiPrice: 60, tf: '1Y' },
  { name: 'Gold > $2800/oz', short: 'GOLD28', price: 82, vol: '$2.3M', polyPrice: 82, kalshiPrice: 80, tf: '1M' },
  { name: 'Gold > $3500/oz by EOY', short: 'GOLD35', price: 28, vol: '$1.7M', polyPrice: 28, kalshiPrice: 30, tf: '1Y' },
  { name: 'India GDP > UK GDP', short: 'INDUK', price: 82, vol: '$0.4M', polyPrice: 82, kalshiPrice: 80, tf: '1Y' },
  { name: 'China GDP Growth > 5%', short: 'CNGDP5', price: 38, vol: '$1.1M', polyPrice: 38, kalshiPrice: 36, tf: '1Y' },
  { name: 'Germany Recession 2026', short: 'DERECSN', price: 34, vol: '$0.7M', polyPrice: 34, kalshiPrice: 32, tf: '1Y' },
  { name: 'Brazil Real > $0.20', short: 'BRL20', price: 26, vol: '$0.3M', polyPrice: 26, kalshiPrice: 28, tf: '1M' },
  { name: 'Argentina Inflation < 50%', short: 'ARGINF', price: 42, vol: '$0.5M', polyPrice: 42, kalshiPrice: 40, tf: '1Y' },

  // ── Science & Health (7) ──
  { name: 'FDA Approves Psychedelic Therapy', short: 'PSYCH', price: 28, vol: '$0.9M', polyPrice: 28, kalshiPrice: 26, tf: '1Y' },
  { name: 'mRNA Cancer Vaccine Trial Success', short: 'MRNA', price: 34, vol: '$1.4M', polyPrice: 34, kalshiPrice: 32, tf: '1Y' },
  { name: 'New COVID Variant WHO Alert', short: 'COVID', price: 42, vol: '$0.8M', polyPrice: 42, kalshiPrice: 40, tf: '1M' },
  { name: 'Bird Flu Human Pandemic', short: 'H5N1', price: 8, vol: '$2.1M', polyPrice: 8, kalshiPrice: 10, tf: '1Y' },
  { name: 'Ozempic Sales > $30B', short: 'OZEM', price: 62, vol: '$0.6M', polyPrice: 62, kalshiPrice: 60, tf: '1Y' },
  { name: 'Nuclear Fusion Net Energy', short: 'FUSION', price: 14, vol: '$0.7M', polyPrice: 14, kalshiPrice: 16, tf: '1Y' },
  { name: 'Artemis Moon Landing 2026', short: 'ARTEM', price: 22, vol: '$1.3M', polyPrice: 22, kalshiPrice: 24, tf: '1Y' },
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
  { source: 'AP News', headline: 'Vance teases 2028 presidential bid, allies form exploratory PAC', markets: ['VANCE28'], sentiment: 'neutral' },
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

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════

function initChartingDashboard() {
  if (charting.isActive) return;
  charting.isActive = true;
  charting.initializedTabs = {};

  // Show tutorial for first-time visitors
  maybeShowChartingTutorial();

  initChartingTabs();
  initTicker();
  initKillSwitch();
  startChartingClock();

  // Init Edge Scanner (default tab, visible immediately)
  initEdgeScanner();

  // Start live data connection
  initLiveDataConnection();
}

function maybeShowChartingTutorial() {
  if (localStorage.getItem('mercury_charting_tutorial_done')) return;
  const overlay = document.getElementById('chartingTutorial');
  if (!overlay) return;
  overlay.classList.add('active');

  const closeBtn = document.getElementById('chartingTutorialClose');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    dismissChartingTutorial();
    startChartingTour(true);
  });
}

function dismissChartingTutorial() {
  const overlay = document.getElementById('chartingTutorial');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_charting_tutorial_done', '1');
}

function startChartingTour(force) {
  console.log('[Charting Tour] startChartingTour called, force =', !!force);
  if (!force && localStorage.getItem('mercury_charting_tour_done')) {
    console.log('[Charting Tour] Already completed — skipping');
    return;
  }
  if (!window.MercuryTour) {
    console.log('[Charting Tour] MercuryTour engine not loaded');
    return;
  }

  // Clear previous completion if forcing
  if (force) {
    localStorage.removeItem('mercury_charting_tour_done');
  }

  // Make sure we're on the Overview tab so tour elements are visible
  switchChartingTab('edge');

  setTimeout(() => {
    const tour = window.MercuryTour.create({
      steps: [
        {
          selector: '#chartingTopbar',
          title: 'Live Status Bar',
          text: 'Real-time ticker tape scrolling every tracked market. The clock shows UTC time and the Kill All button instantly halts all running bots in an emergency.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '#chartingTabBar',
          title: 'Charting Tabs',
          text: 'Six specialized views: Overview for edge scanning, Crypto for BTC/ETH markets, Markets for the full contract scanner, News for live market headlines, Bonding Arb for near-resolution yield opportunities, and Terminal for execution.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '#rtab-edge .overview-metrics',
          title: 'Key Metrics',
          text: 'At-a-glance numbers: active markets, 24h combined volume, and best cross-platform spread. These update in real-time.',
          position: 'bottom',
          padding: 6,
        },
        {
          selector: '#rtab-edge .charting-scroll',
          title: 'Markets & Spreads',
          text: 'Top markets by volume and a live cross-platform comparison table. Click any market card to see full price history, volume charts, and probability timelines. Watch for 3c+ spreads — potential arbitrage.',
          position: 'top',
          padding: 6,
        },
        {
          selector: '.charting-tab[data-rtab="crypto"]',
          title: 'Crypto Dashboard',
          text: 'Live BTC and ETH prices from Binance, plus 15-min and 1-hour crypto prediction markets on Kalshi and Polymarket with cross-platform spread detection.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.charting-tab[data-rtab="markets"]',
          title: 'Market Scanner',
          text: 'Full sortable table of every contract we track. Sort by divergence, volume, 24h change, or name. Click any row to drill into detailed stats and historical data.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.charting-tab[data-rtab="news"]',
          title: 'News',
          text: 'Live news feed from Reuters, Bloomberg, and crypto sources with sentiment tags.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.charting-tab[data-rtab="bonding"]',
          title: 'Bonding Arb',
          text: 'Find near-certain outcomes (95-99c) close to resolution. Buy at 97c, collect $1 when it resolves — like a short-term bond. Sort by annualized yield to find the best high-probability returns.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.charting-tab[data-rtab="terminal"]',
          title: 'Terminal',
          text: 'Full execution dashboard: live order book, volume heatmap, trade logs, and an AI chat. Ask it anything — "what\'s the edge on BTC?", "show biggest spreads", "find underpriced contracts".',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '#killSwitchBtn',
          title: 'Emergency Kill Switch',
          text: 'Immediately stops all running bots and cancels pending orders. Use this if markets move against you fast. Better safe than sorry — you can always restart.',
          position: 'left',
          padding: 6,
        },
      ],
      storageKey: 'mercury_charting_tour_done',
    });
    tour.start();
  }, 600);
}

// Expose for manual console use (no-arg wrapper that forces)
window.rerunChartingTour = function() { startChartingTour(true); };

// Reset and immediately re-show tutorial + tour
window.resetChartingTutorial = function() {
  localStorage.removeItem('mercury_charting_tutorial_done');
  localStorage.removeItem('mercury_charting_tour_done');
  // Immediately show the tutorial overlay if we're on Charting
  const overlay = document.getElementById('chartingTutorial');
  if (overlay) {
    overlay.classList.add('active');
    console.log('[Mercury] Charting tutorial re-shown');
  } else {
    console.log('[Mercury] Charting tutorial reset — navigate to Charting to see it');
  }
};

function teardownChartingDashboard() {
  if (!charting.isActive) return;
  charting.isActive = false;

  // Clear ALL intervals (global + tab)
  charting.intervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  charting.intervals = [];
  charting.tabIntervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  charting.tabIntervals = [];

  // Stop bridge polling
  if (typeof dataBridge !== 'undefined') {
    dataBridge.stopAllPolling();
  }

  if (charting.animFrameId) {
    cancelAnimationFrame(charting.animFrameId);
    charting.animFrameId = null;
  }

  Object.keys(charting.charts).forEach(key => {
    if (charting.charts[key]) {
      charting.charts[key].destroy();
      charting.charts[key] = null;
    }
  });

  charting.initializedTabs = {};
  charting.activeTab = 'edge';
}

// Global interval — persists across tab switches (ticker, clock, live polling)
function addChartingInterval(fn, ms) {
  charting.intervals.push(setInterval(fn, ms));
}

// Tab-scoped interval — cleared when switching to a different tab
function addTabInterval(fn, ms) {
  charting.tabIntervals.push(setInterval(fn, ms));
}

// Clear only tab-scoped intervals (called on tab switch)
function clearTabIntervals() {
  charting.tabIntervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  charting.tabIntervals = [];
}

// ═══════════════════════════════════════════════════════════════
// CHARTING TABS
// ═══════════════════════════════════════════════════════════════

function initChartingTabs() {
  const tabBar = document.getElementById('chartingTabBar');
  if (!tabBar) return;

  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.charting-tab');
    if (!btn) return;
    switchChartingTab(btn.dataset.rtab);
  });
}

function switchChartingTab(tabName) {
  if (tabName === charting.activeTab) return; // No-op if same tab

  // ── Clear previous tab's intervals + mark for re-init ──
  clearTabIntervals();
  if (charting.activeTab) {
    charting.initializedTabs[charting.activeTab] = false;
  }

  // Destroy tab-scoped charts to free memory
  if (charting.activeTab === 'terminal') {
    if (charting.charts.volume) { charting.charts.volume.destroy(); charting.charts.volume = null; }
  }

  charting.activeTab = tabName;

  document.querySelectorAll('.charting-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.rtab === tabName);
  });
  document.querySelectorAll('.charting-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'rtab-' + tabName);
  });

  // Init the new tab (re-creates its intervals fresh)
  if (tabName === 'markets' && !charting.initializedTabs.markets) {
    charting.initializedTabs.markets = true;
    initMarketScanner();
  }
  if (tabName === 'news' && !charting.initializedTabs.news) {
    charting.initializedTabs.news = true;
    initNewsFeed();
    initBiggestMovers();
  }
  if (tabName === 'crypto' && !charting.initializedTabs.crypto) {
    charting.initializedTabs.crypto = true;
    initCryptoTab();
  }
  if (tabName === 'terminal' && !charting.initializedTabs.terminal) {
    charting.initializedTabs.terminal = true;
    initOrderBook();
    initVolumeChart();
    initChartingLogs();
    initChartingChat();
  }

  // Resize volume chart when switching to Terminal
  if (tabName === 'terminal') {
    setTimeout(() => {
      if (charting.charts.volume) {
        try { charting.charts.volume.resize(); } catch (_) {}
      }
    }, 50);
  }

  // Add data source footer to active panel (once)
  const activePanel = document.getElementById('rtab-' + tabName);
  if (activePanel && !activePanel.querySelector('.charting-data-footer')) {
    const footer = document.createElement('div');
    footer.className = 'charting-data-footer';
    footer.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.3); text-align:center; padding:12px 0 4px;';
    footer.textContent = 'Data from third-party APIs. May be delayed. Not financial advice.';
    activePanel.appendChild(footer);
  }
}

// ═══════════════════════════════════════════════════════════════
// TICKER TAPE
// ═══════════════════════════════════════════════════════════════

function initTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  // Start with mock data for instant render, replaced by live when available
  charting.tickerData = CHARTING_MARKETS.map(m => ({
    name: m.short,
    price: m.price,
    delta: '0.0',
    _prevPrice: m.price,
  }));

  let tickerBuilt = false; // track whether DOM has been built

  // Build DOM elements once — never replace innerHTML again (prevents animation snap)
  function buildTicker() {
    const items = [...charting.tickerData, ...charting.tickerData];
    track.innerHTML = items.map(t => {
      const up = parseFloat(t.delta) >= 0;
      return `<span class="ticker-item" onclick="openMarketDetail('${(t.name||'').replace(/'/g,"\\'")}')" style="cursor:pointer;">
        <span class="ticker-name">${t.name}</span>
        <span class="ticker-price">${t.price}c</span>
        <span class="ticker-delta ${up ? 'up' : 'down'}">${up ? '+' : ''}${t.delta}c</span>
      </span><span class="ticker-sep">\u25cf</span>`;
    }).join('');
    tickerBuilt = true;
  }

  // Update existing DOM elements in-place (preserves CSS animation)
  function updateTickerInPlace() {
    const spans = track.querySelectorAll('.ticker-item');
    const data = charting.tickerData;
    const len = data.length;
    spans.forEach((span, i) => {
      const t = data[i % len];
      if (!t) return;
      const nameEl = span.querySelector('.ticker-name');
      const priceEl = span.querySelector('.ticker-price');
      const deltaEl = span.querySelector('.ticker-delta');
      if (nameEl && nameEl.textContent !== t.name) nameEl.textContent = t.name;
      if (priceEl) priceEl.textContent = t.price + 'c';
      if (deltaEl) {
        const up = parseFloat(t.delta) >= 0;
        deltaEl.textContent = (up ? '+' : '') + t.delta + 'c';
        deltaEl.className = 'ticker-delta ' + (up ? 'up' : 'down');
      }
    });
  }

  buildTicker();

  // Update ticker from live edge data when available (real prices)
  function refreshTickerFromLive() {
    if (!charting.liveMarkets || !charting.edgeData || charting.edgeData.length === 0) return;
    const prevLen = charting.tickerData.length;
    const live = charting.edgeData.slice(0, 40).map(m => {
      const prev = charting.tickerData.find(t => t.name === m.short);
      const prevPrice = prev ? prev.price : m.price;
      const delta = m.change || (m.price - prevPrice).toFixed(1);
      return { name: m.short, price: m.price, delta: String(delta), _prevPrice: prevPrice };
    });
    if (live.length > 0) charting.tickerData = live;
    // Rebuild DOM only if item count changed (first live load), otherwise update in-place
    if (live.length !== prevLen || !tickerBuilt) {
      buildTicker();
    } else {
      updateTickerInPlace();
    }
  }

  // Check for live data every 5s — if live, use real; if not, do small random drift
  addChartingInterval(() => {
    if (charting.liveMarkets) {
      refreshTickerFromLive();
    } else {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const idx = Math.floor(Math.random() * charting.tickerData.length);
        const t = charting.tickerData[idx];
        const change = (Math.random() * 4 - 2);
        t.price = Math.max(1, Math.min(99, Math.round(t.price + change)));
        t.delta = change.toFixed(1);
      }
      updateTickerInPlace();
    }
  }, 5000);

  // Initial live refresh attempt (after short delay for API to load)
  setTimeout(refreshTickerFromLive, 3000);
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
  charting.edgeTimeframe = 'all';
  charting.edgePlatform = 'all';
  charting.edgeSearch = '';
  charting.edgeCategory = 'all';
  charting.edgeSort = 'chart-quality';
  charting.liveMarkets = false;

  // Start with mock data for instant render
  loadMockEdgeData();

  // Timeframe filter buttons (if present)
  const tabs = document.getElementById('edgeTimeframeTabs');
  if (tabs) {
    tabs.addEventListener('click', e => {
      const btn = e.target.closest('.tf-btn');
      if (!btn) return;
      tabs.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      charting.edgeTimeframe = btn.dataset.tf;
      renderEdgeCards();
    });
  }
  // Default: show all timeframes in TradingView watchlist
  charting.edgeTimeframe = 'all';

  // Platform filter buttons (TradingView watchlist uses .tv-wl-fbtn)
  const platTabs = document.getElementById('edgePlatformTabs');
  if (platTabs) {
    platTabs.addEventListener('click', e => {
      const btn = e.target.closest('.tv-wl-fbtn') || e.target.closest('.plat-btn');
      if (!btn) return;
      platTabs.querySelectorAll('.tv-wl-fbtn, .plat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      charting.edgePlatform = btn.dataset.plat;
      renderEdgeCards();
    });
  }

  // Search input
  const searchInput = document.getElementById('edgeSearchInput');
  if (searchInput) {
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        charting.edgeSearch = searchInput.value.trim().toLowerCase();
        renderEdgeCards();
      }, 200);
    });
    // '/' keyboard shortcut to focus search
    document.addEventListener('keydown', e => {
      if (e.key === '/' && document.activeElement !== searchInput && !e.ctrlKey && !e.metaKey) {
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        searchInput.focus();
      }
    });
  }

  // Category filter
  const catSelect = document.getElementById('edgeCategorySelect');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      charting.edgeCategory = catSelect.value;
      renderEdgeCards();
    });
  }

  // Sort select
  const sortSelect = document.getElementById('edgeSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      charting.edgeSort = sortSelect.value;
      renderEdgeCards();
    });
  }

  renderEdgeCards();
  renderArbTable();
  updateChartingMetrics();

  // Auto-select first mock market immediately for instant chart render
  if (charting.edgeData.length > 0 && !charting._mdMarket) {
    openMarketDetail(charting.edgeData[0].short);
  }

  // Init trending keywords (bottom panel)
  initTrending();

  // Init news feed (now in bottom panel)
  if (!charting.initializedTabs.news) {
    charting.initializedTabs.news = true;
    initNewsFeed();
  }

  // Try live public APIs first — Polymarket + Kalshi
  // Fetch from server cache (polls Polymarket + Kalshi every 15s server-side)
  loadLivePublicMarkets();
  addChartingInterval(loadLivePublicMarkets, 15000);

  // Simulate price shifts for mock data only (when live APIs are offline)
  addChartingInterval(() => {
    if (charting.liveMarkets) return;
    charting.edgeData.forEach(e => {
      const shift = (Math.random() - 0.5) * 3;
      e.price = Math.max(1, Math.min(99, Math.round(e.price + shift)));
      e.change = ((Math.random() - 0.48) * 8).toFixed(1);
      e.polyPrice = e.price;
      e.kalshiPrice = e.price + Math.floor((Math.random() - 0.5) * 5);
    });

    charting.arbData.forEach(a => {
      const m = charting.edgeData.find(e => e.short === a.short);
      if (m) {
        a.polyPrice = m.polyPrice;
        a.kalshiPrice = m.kalshiPrice;
        a.spread = Math.abs(a.polyPrice - a.kalshiPrice);
      }
    });
    charting.arbData.sort((a, b) => b.spread - a.spread);

    renderEdgeCards();
    renderArbTable();
  }, 15000);
}

// ═══════════════════════════════════════════════════════════════
// LIVE PUBLIC API LOADING (Polymarket + Kalshi)
// ═══════════════════════════════════════════════════════════════

async function loadLivePublicMarkets() {
  if (!charting.isActive) return;

  try {
    // Fetch from server cache — one fast request, no external API calls
    const resp = await fetch('/api/markets', { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const markets = data.markets;
    if (!markets || markets.length === 0) return;

    charting.liveMarkets = true;
    charting._cacheStatus = data.status; // 'live', 'stale', 'starting'

    // Update live badge
    const liveBadge = document.getElementById('edgeLiveBadge');
    if (liveBadge) {
      liveBadge.style.display = 'inline';
      liveBadge.textContent = data.status === 'live' ? 'LIVE' : data.status.toUpperCase();
    }

    // Store previous prices for delta calculation
    const prevPrices = {};
    charting.edgeData.forEach(e => { prevPrices[e.short] = e.price; });

    charting.edgeData = markets.map(m => {
      const prev = prevPrices[m.short];
      const change = prev != null ? (m.price - prev) : 0;
      return {
        name: m.name,
        short: m.short,
        price: m.price,
        vol: m.vol,
        _volNum: m._volNum,
        change: change.toFixed(1),
        polyPrice: m.polyPrice,
        kalshiPrice: m.kalshiPrice,
        polyBid: m.polyBid,
        polyAsk: m.polyAsk,
        kalshiBid: m.kalshiBid,
        kalshiAsk: m.kalshiAsk,
        tf: m.tf,
        _endDate: m._endDate || null,
        source: m.source,
        slug: m.slug,
        _polyId: m._polyId,
        _conditionId: m._conditionId,
        _clobTokenId: m._clobTokenId,
        _kalshiTicker: m._kalshiTicker,
        liquidity: m.liquidity,
        isEvent: m.isEvent || false,
        subCount: m.subCount || 0,
        subMarkets: m.subMarkets || null,
      };
    });

    // Build arb data from markets that have prices on both platforms
    charting.arbData = charting.edgeData
      .filter(e => e.polyPrice != null && e.kalshiPrice != null)
      .map(e => ({
        name: e.name,
        short: e.short,
        polyPrice: e.polyPrice,
        kalshiPrice: e.kalshiPrice,
        spread: Math.abs(e.polyPrice - e.kalshiPrice),
        cause: e.polyPrice > e.kalshiPrice ? 'Poly liquidity premium' : 'Kalshi early mover',
      }))
      .filter(a => a.spread >= 1)
      .sort((a, b) => b.spread - a.spread);

    // Update ticker with live data
    charting.tickerData = charting.edgeData.slice(0, 60).map(m => ({
      name: m.short,
      price: m.price,
      delta: m.change,
    }));
    const track = document.getElementById('tickerTrack');
    if (track) renderLiveTicker(track);

    renderEdgeCards();
    renderArbTable();
    updateChartingMetrics();

    // Auto-select first market if none selected
    if (!charting._mdMarket && charting.edgeData.length > 0) {
      openMarketDetail(charting.edgeData[0].short);
    }
  } catch (e) {
    console.warn('[Mercury] Market cache fetch failed:', e.message);
  }
}

function renderLiveTicker(track) {
  // Update existing DOM in-place to preserve CSS animation (no innerHTML rebuild)
  const spans = track.querySelectorAll('.ticker-item');
  const data = charting.tickerData;
  const len = data.length;
  if (spans.length === 0 || spans.length !== len * 2) {
    // First render or count changed — must rebuild
    const items = [...data, ...data];
    track.innerHTML = items.map(t => {
      const up = parseFloat(t.delta) >= 0;
      return `<span class="ticker-item" onclick="openMarketDetail('${(t.name||'').replace(/'/g,"\\'")}')" style="cursor:pointer;">
        <span class="ticker-name">${t.name}</span>
        <span class="ticker-price">${t.price}c</span>
        <span class="ticker-delta ${up ? 'up' : 'down'}">${up ? '+' : ''}${t.delta}c</span>
      </span><span class="ticker-sep">\u25cf</span>`;
    }).join('');
    return;
  }
  spans.forEach((span, i) => {
    const t = data[i % len];
    if (!t) return;
    const priceEl = span.querySelector('.ticker-price');
    const deltaEl = span.querySelector('.ticker-delta');
    if (priceEl) priceEl.textContent = t.price + 'c';
    if (deltaEl) {
      const up = parseFloat(t.delta) >= 0;
      deltaEl.textContent = (up ? '+' : '') + t.delta + 'c';
      deltaEl.className = 'ticker-delta ' + (up ? 'up' : 'down');
    }
  });
}

function updateChartingMetrics() {
  const mktCount = charting.edgeData.length;
  const totalVol = charting.edgeData.reduce((s, e) => s + (e._volNum || 0), 0);
  const topSpread = charting.arbData.length > 0 ? charting.arbData[0].spread : 0;

  const el1 = document.getElementById('metricActiveMarkets');
  const el2 = document.getElementById('metricTotalVol');
  const el3 = document.getElementById('metricTopSpread');

  if (el1) el1.textContent = mktCount;
  if (el2) el2.textContent = totalVol >= 1e6
    ? '$' + (totalVol / 1e6).toFixed(1) + 'M'
    : '$' + (totalVol / 1e3).toFixed(0) + 'K';
  if (el3 && topSpread > 0) el3.textContent = topSpread + 'c';

  // Biggest mover card
  const moverEl = document.getElementById('metricBiggestMover');
  const moverSub = document.getElementById('metricBiggestMoverSub');
  if (moverEl && charting.edgeData.length > 0) {
    const sorted = [...charting.edgeData]
      .filter(e => e.change !== '--' && e.change != null)
      .map(e => ({ ...e, absChange: Math.abs(parseFloat(e.change)) }))
      .sort((a, b) => b.absChange - a.absChange);
    if (sorted.length > 0) {
      const top = sorted[0];
      const change = parseFloat(top.change);
      const sign = change >= 0 ? '+' : '';
      moverEl.textContent = sign + top.change + 'c';
      moverEl.style.color = change >= 0 ? 'var(--green)' : 'var(--red)';
      if (moverSub) moverSub.textContent = top.short;
    }
  }

  // LIVE badge is managed by loadLivePublicMarkets()
}

function loadMockEdgeData() {
  charting.edgeData = CHARTING_MARKETS.map(m => ({
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

  charting.arbData = CHARTING_MARKETS.map(m => ({
    name: m.name,
    short: m.short,
    polyPrice: m.polyPrice,
    kalshiPrice: m.kalshiPrice,
    spread: Math.abs(m.polyPrice - m.kalshiPrice),
    cause: ARB_CAUSES[Math.floor(Math.random() * ARB_CAUSES.length)],
  })).filter(a => a.spread >= 2).sort((a, b) => b.spread - a.spread);
}

async function loadLiveMarkets() {
  if (!charting.isActive || typeof dataBridge === 'undefined') return;

  try {
    const data = await dataBridge.getActiveMarkets();
    if (!data || !data.markets || data.markets.length === 0) return;

    charting.liveMarkets = true;
    charting.edgeData = data.markets.map(m => ({
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
    charting.arbData = charting.edgeData
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
    console.warn('[Charting] Live markets unavailable:', e);
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

// Category classification from market name
const CATEGORY_PATTERNS = {
  crypto: /\bBTC\b|\bETH\b|\bSOL\b|\bDOGE\b|\bXRP\b|\bADA\b|\bBNB\b|bitcoin|ethereum|solana|crypto|stablecoin|defi|nft|token|blockchain|altcoin|memecoin|spot etf|btc|eth/i,
  politics: /president|congress|senat|governor|election|midterm|impeach|nominee|republican|democrat|trump|biden|desantis|newsom|gop|dnc|rnc|supreme court|scotus|parliament|vote|ballot|primary|caucus/i,
  economics: /fed\b|rate cut|cpi|gdp|inflation|recession|unemployment|treasury|debt ceiling|s&p|dow|nasdaq|interest rate|fed fund|tariff|trade deal|deficit/i,
  sports: /world cup|super bowl|superbowl|nba|nfl|mlb|nhl|champions league|premier league|wimbledon|olympics|f1|formula|ufc|boxing|tennis|soccer|football|basketball|baseball|hockey|championship|playoff|mvp|winner.*season/i,
  entertainment: /oscar|grammy|emmy|box office|album|movie|film|spotify|netflix|youtube|tiktok|streaming|celebrity|award|billboard|concert|tour/i,
  science: /ai\b|artificial intelligence|spacex|nasa|mars|moon|quantum|climate|temperature|hurricane|earthquake|pandemic|vaccine|fda|cdc|who\b|nuclear|fusion|launch|satellite/i,
  world: /ukraine|russia|china|taiwan|iran|nato|ceasefire|sanctions|brics|regime|border|immigration|eu\b|un\b|treaty|conflict|war\b|peace|diplomacy|embargo/i,
};

function classifyMarketCategory(name) {
  if (!name) return 'other';
  for (const [cat, pattern] of Object.entries(CATEGORY_PATTERNS)) {
    if (pattern.test(name)) return cat;
  }
  return 'other';
}

// Format _endDate into human-readable time-to-resolution
function formatTimeToRes(endDate) {
  if (!endDate) return '\u2014';
  const end = new Date(endDate).getTime();
  if (isNaN(end)) return '\u2014';
  const diff = end - Date.now();
  if (diff <= 0) return 'Ended';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ' + (mins % 60) + 'm';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd';
  const months = Math.floor(days / 30);
  if (months < 12) return months + 'mo';
  return Math.floor(days / 365) + 'y';
}

function renderEdgeCards() {
  const container = document.getElementById('edgeChartingCards');
  if (!container) return;

  // Filter by timeframe
  const tf = charting.edgeTimeframe || 'all';
  let filtered = tf === 'all'
    ? [...charting.edgeData]
    : charting.edgeData.filter(e => e.tf === tf);

  // Filter by platform
  const plat = charting.edgePlatform || 'all';
  if (plat === 'polymarket') {
    filtered = filtered.filter(e => e.polyPrice != null);
  } else if (plat === 'kalshi') {
    filtered = filtered.filter(e => e.kalshiPrice != null);
  }

  // Filter by search query
  const searchQ = charting.edgeSearch || '';
  if (searchQ) {
    filtered = filtered.filter(e =>
      (e.name || '').toLowerCase().includes(searchQ) ||
      (e.short || '').toLowerCase().includes(searchQ)
    );
  }

  // Filter by category
  const cat = charting.edgeCategory || 'all';
  if (cat !== 'all') {
    filtered = filtered.filter(e => classifyMarketCategory(e.name) === cat);
  }

  // Hide near-resolved markets (>97c or <3c) — they produce flat charts
  filtered = filtered.filter(e => {
    const p = e.price ?? 50;  // ?? not || — 0 is a valid price
    return p >= 3 && p <= 97;
  });

  // Chart quality score: mid-range prices + high volume = best charts
  function chartScore(m) {
    const p = m.price ?? 50;  // ?? not || — 0 is a valid price
    const dist = Math.abs(p - 50) / 50; // 0 at center, 1 at extremes
    const priceWeight = Math.max(0.05, 1 - dist * dist);
    return (m._volNum || 0) * priceWeight;
  }

  // Sort
  const sortMode = charting.edgeSort || 'chart-quality';
  let sorted;
  if (sortMode === 'chart-quality') {
    sorted = filtered.sort((a, b) => chartScore(b) - chartScore(a));
  } else if (sortMode === 'spread') {
    sorted = filtered.sort((a, b) => {
      const sa = (a.polyPrice != null && a.kalshiPrice != null) ? Math.abs(a.polyPrice - a.kalshiPrice) : -1;
      const sb = (b.polyPrice != null && b.kalshiPrice != null) ? Math.abs(b.polyPrice - b.kalshiPrice) : -1;
      return sb - sa;
    });
  } else if (sortMode === 'resolves') {
    sorted = filtered.sort((a, b) => {
      const ea = a._endDate ? new Date(a._endDate).getTime() : Infinity;
      const eb = b._endDate ? new Date(b._endDate).getTime() : Infinity;
      return ea - eb;
    });
  } else if (sortMode === 'price-high') {
    sorted = filtered.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortMode === 'price-low') {
    sorted = filtered.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else {
    // volume
    sorted = filtered.sort((a, b) => (b._volNum || 0) - (a._volNum || 0));
  }

  // Update filter meta
  const metaEl = document.getElementById('edgeFilterMeta');
  if (metaEl) {
    const parts = [];
    if (plat !== 'all') parts.push(plat === 'polymarket' ? 'Polymarket' : 'Kalshi');
    if (cat !== 'all') parts.push(cat.charAt(0).toUpperCase() + cat.slice(1));
    if (searchQ) parts.push('\u201c' + searchQ + '\u201d');
    metaEl.textContent = parts.length ? `${sorted.length} results \u2014 ${parts.join(' \u00b7 ')}` : '';
  }

  // Displayed price based on platform filter
  function displayPrice(e) {
    if (plat === 'polymarket' && e.polyPrice != null) return e.polyPrice;
    if (plat === 'kalshi' && e.kalshiPrice != null) return e.kalshiPrice;
    return e.price;
  }

  // Source badge
  function srcBadge(e) {
    if (e.polyPrice != null && e.kalshiPrice != null) return '<span class="tv-wl-item-src both">P+K</span>';
    if (e.source === 'kalshi') return '<span class="tv-wl-item-src kalshi">K</span>';
    if (e.source === 'polymarket') return '<span class="tv-wl-item-src poly">P</span>';
    return '';
  }

  let html = '';

  if (sorted.length === 0) {
    const emptyMsg = searchQ ? 'No markets matching \u201c' + esc(searchQ) + '\u201d' : 'No markets found';
    html = `<div class="tv-wl-empty">${emptyMsg}</div>`;
  } else {
    const activeShort = charting._mdMarket ? charting._mdMarket.short : null;
    html = sorted.map(e => {
      const safeShort = (e.short || '').replace(/'/g, "\\'");
      const p = displayPrice(e);
      const noP = Math.round(100 - p);
      const changeVal = parseFloat(e.change) || 0;
      const changeClass = changeVal > 0 ? 'up' : changeVal < 0 ? 'down' : 'flat';
      const changeStr = (changeVal >= 0 ? '+' : '') + changeVal.toFixed(1) + 'c';
      const isActive = e.short === activeShort ? ' active' : '';

      return `<div class="tv-wl-item${isActive}" onclick="openMarketDetail('${safeShort}')">
        <div class="tv-wl-item-left">
          <div style="display:flex;align-items:center;gap:4px;">
            <span class="tv-wl-item-ticker">${esc(e.short)}</span>
            ${srcBadge(e)}
          </div>
          <span class="tv-wl-item-name">${esc(e.name)}</span>
        </div>
        <div class="tv-wl-item-right">
          <span class="tv-wl-item-price"><span class="tv-yn-sm">Y</span>${p}c <span class="tv-yn-sm tv-yn-no">N</span>${noP}c</span>
          <span class="tv-wl-item-change ${changeClass}">${changeStr}</span>
        </div>
      </div>`;
    }).join('');
  }

  container.innerHTML = html;
}

// Toggle event sub-market expansion
window.toggleEventSubs = function(eventId) {
  const container = document.getElementById(eventId);
  if (!container) return;
  const row = document.querySelector(`[data-event-id="${eventId}"]`);
  if (container.classList.contains('open')) {
    container.classList.remove('open');
    if (row) row.classList.remove('expanded');
  } else {
    container.classList.add('open');
    if (row) row.classList.add('expanded');
  }
};

function renderArbTable() {
  const body = document.getElementById('arbTableBody');
  if (!body) return;

  const ts = document.getElementById('arbTimestamp');
  if (ts) ts.textContent = 'Updated just now';

  body.innerHTML = charting.arbData.map(a => {
    const polyStr = a.polyPrice != null ? `Y:${a.polyPrice}c N:${Math.round(100 - a.polyPrice)}c` : '\u2014';
    const kalshiStr = a.kalshiPrice != null ? `Y:${a.kalshiPrice}c N:${Math.round(100 - a.kalshiPrice)}c` : '\u2014';
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
  addTabInterval(pollCryptoData, 10000);
}

async function pollCryptoData() {
  if (!charting.isActive || typeof dataBridge === 'undefined') return;

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
      charting.liveBTCPrice = btc;
      const el = document.getElementById('cryptoBTCPrice');
      if (el) el.textContent = '$' + Math.round(btc).toLocaleString();
    }
  }

  // ── DVOL ──
  if (dvolData && dvolData.dvol != null) {
    charting.liveDVOL = dvolData.dvol;
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
  charting.marketData = CHARTING_MARKETS.map(m => ({
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

  addTabInterval(() => {
    if (charting.liveMarkets) return; // Skip mock drift when live
    charting.marketData.forEach(m => {
      const shift = (Math.random() - 0.5) * 3;
      m.price = Math.max(1, Math.min(99, Math.round(m.price + shift)));
      m.change = ((Math.random() - 0.48) * 8).toFixed(1);
      m.polyPrice = m.price;
      m.kalshiPrice = m.price + Math.floor((Math.random() - 0.5) * 5);
    });
    renderMarketTable();
  }, 12000);

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
  let sorted = [...charting.marketData];

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

  // Load real news immediately
  _loadRealNews(feed);

  // Refresh every 2 minutes
  addTabInterval(_loadRealNews.bind(null, feed), 120000);
}

async function _loadRealNews(feed) {
  if (!feed) return;
  const LM = typeof MercuryLiveMarkets !== 'undefined' ? MercuryLiveMarkets : null;
  if (!LM) {
    // Fallback to hardcoded if no live data layer
    const shuffled = [...NEWS_HEADLINES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < 6; i++) appendNewsItem(feed, shuffled[i % shuffled.length], false);
    return;
  }

  try {
    // Fetch multiple news categories in parallel
    const [general, crypto, politics] = await Promise.all([
      LM.fetchNews('prediction market polymarket kalshi').catch(() => []),
      LM.fetchNews('bitcoin crypto ethereum market').catch(() => []),
      LM.fetchNews('elections politics congress federal reserve economy').catch(() => []),
    ]);

    // Merge, deduplicate by title, sort by date
    const seen = new Set();
    const all = [...general, ...crypto, ...politics].filter(a => {
      if (!a.title || seen.has(a.title)) return false;
      seen.add(a.title);
      return true;
    }).sort((a, b) => (b._ts || 0) - (a._ts || 0)).slice(0, 30);

    if (all.length === 0) return;

    // Clear feed and render real articles
    feed.innerHTML = '';
    for (const article of all) {
      _appendRealNewsItem(feed, article);
    }
  } catch (e) {
    console.warn('[Mercury] News load failed:', e.message);
  }
}

function _classifyNewsSentiment(title) {
  const t = title.toLowerCase();
  if (/surge|soar|rally|jump|beat|record|boost|gain|rise|bull|approve|pass|breakthrough/i.test(t)) return 'bullish';
  if (/crash|fall|drop|plunge|decline|fear|risk|warn|miss|fail|reject|slump|crisis/i.test(t)) return 'bearish';
  return 'neutral';
}

function _matchNewsToMarkets(title) {
  const t = title.toLowerCase();
  const tags = [];
  if (/bitcoin|btc|crypto|ethereum|eth\b/i.test(t)) tags.push('Crypto');
  if (/fed\b|rate|inflation|cpi|gdp|recession|treasury|economy/i.test(t)) tags.push('Econ');
  if (/trump|election|congress|senate|house|democrat|republican|politic/i.test(t)) tags.push('Politics');
  if (/polymarket|kalshi|prediction market/i.test(t)) tags.push('Markets');
  if (/nvidia|ai\b|openai|gpt|claude|artificial intelligence/i.test(t)) tags.push('AI/Tech');
  if (/ukraine|china|taiwan|iran|nato|war|ceasefire/i.test(t)) tags.push('Geopolitics');
  if (/nba|nfl|super bowl|world cup|sports|mlb/i.test(t)) tags.push('Sports');
  if (/oil|climate|hurricane|wildfire|energy/i.test(t)) tags.push('Climate');
  if (tags.length === 0) tags.push('General');
  return tags;
}

function _appendRealNewsItem(feed, article) {
  if (!feed || !article.title) return;

  const sentiment = _classifyNewsSentiment(article.title);
  const tags = _matchNewsToMarkets(article.title);
  const relTime = _relativeTime(article._ts || Date.now());

  const el = document.createElement('div');
  el.className = 'news-item';
  // XSS: escape user-controlled strings
  const safeTitle = typeof esc === 'function' ? esc(article.title) : article.title.replace(/</g, '&lt;');
  const safeSource = typeof esc === 'function' ? esc(article.source) : article.source.replace(/</g, '&lt;');
  const safeLink = article.link ? article.link.replace(/"/g, '&quot;') : '';

  el.innerHTML = `
    <div class="news-item-header">
      <span class="news-item-time">${relTime}</span>
      <span class="news-item-source">${safeSource}</span>
      <span class="news-item-sentiment ${sentiment}">${sentiment}</span>
    </div>
    <div class="news-item-headline">${safeLink ? `<a href="${safeLink}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${safeTitle}</a>` : safeTitle}</div>
    <div class="news-item-markets">
      ${tags.map(m => `<span class="news-item-tag">${m}</span>`).join('')}
    </div>
  `;

  feed.appendChild(el);
}

function _relativeTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  return Math.floor(diff / 86400000) + 'd ago';
}

// Legacy appendNewsItem for fallback compatibility
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
  while (feed.children.length > 30) feed.removeChild(feed.lastChild);
}

// ═══════════════════════════════════════════════════════════════
// BIGGEST MOVERS (News tab)
// ═══════════════════════════════════════════════════════════════

function initBiggestMovers() {
  renderBiggestMovers();
  addTabInterval(renderBiggestMovers, 15000);
}

function renderBiggestMovers() {
  const body = document.getElementById('biggestMoverBody');
  if (!body) return;
  if (!charting.edgeData || charting.edgeData.length === 0) {
    body.innerHTML = '<div class="mover-empty">Waiting for market data...</div>';
    return;
  }

  // Sort by absolute change, take top movers
  const sorted = [...charting.edgeData]
    .filter(e => e.change !== '--' && e.change != null)
    .map(e => ({ ...e, absChange: Math.abs(parseFloat(e.change)) }))
    .sort((a, b) => b.absChange - a.absChange)
    .slice(0, 8);

  if (sorted.length === 0) {
    body.innerHTML = '<div class="mover-empty">No movers yet</div>';
    return;
  }

  body.innerHTML = sorted.map((m, i) => {
    const change = parseFloat(m.change);
    const up = change >= 0;
    const sign = up ? '+' : '';
    const cls = up ? 'up' : 'down';
    const barWidth = Math.min(100, (m.absChange / (sorted[0].absChange || 1)) * 100);
    return `<div class="mover-row${i === 0 ? ' mover-row--top' : ''}">
      <span class="mover-rank">${i + 1}</span>
      <div class="mover-info">
        <span class="mover-name">${m.short}</span>
        <span class="mover-full">${m.name.length > 32 ? m.name.slice(0, 32) + '...' : m.name}</span>
      </div>
      <div class="mover-bar-wrap">
        <div class="mover-bar mover-bar--${cls}" style="width:${barWidth}%"></div>
      </div>
      <span class="mover-price">${m.price}c</span>
      <span class="mover-change mover-change--${cls}">${sign}${m.change}c</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// TRENDING KEYWORDS (Bottom panel)
// ═══════════════════════════════════════════════════════════════

let _trendingData = [];
let _trendingCat = 'all';

function initTrending() {
  _fetchTrending();
  addChartingInterval(_fetchTrending, 60000); // Refresh every 60s

  const catSelect = document.getElementById('trendingCatSelect');
  if (catSelect) {
    catSelect.addEventListener('change', () => {
      _trendingCat = catSelect.value;
      _renderTrending();
    });
  }
}

async function _fetchTrending() {
  // Reuse Catalyst data if available (avoids double-fetching)
  if (_catalystData && _catalystData.length > 0) {
    _trendingData = _catalystData;
    _renderTrending();
    return;
  }
  // Otherwise try server endpoint
  try {
    const resp = await fetch('/api/trending');
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.keywords && data.keywords.length > 0) {
      _trendingData = data.keywords;
      _renderTrending();
    }
  } catch (e) {
    console.warn('[Mercury] Trending fetch failed:', e.message);
  }
}

function _renderTrending() {
  const grid = document.getElementById('trendingGrid');
  const countEl = document.getElementById('trendingCount');
  if (!grid) return;

  let filtered = _trendingData;
  if (_trendingCat !== 'all') {
    filtered = filtered.filter(k => k.category === _trendingCat);
  }

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = '<div class="trending-loading">No keywords detected yet&hellip;</div>';
    return;
  }

  const maxCount = filtered[0].count || 1;

  grid.innerHTML = filtered.map(k => {
    const barWidth = Math.min(100, (k.count / maxCount) * 100);
    const trendIcon = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
    const trendClass = k.trend;
    const spikeLabel = k.spikePct > 0 ? `+${k.spikePct}%` : `${k.spikePct}%`;
    const showSpike = Math.abs(k.spikePct) > 25;
    const safeKw = k.keyword.replace(/</g, '&lt;');

    return `<div class="trending-row" data-cat="${k.category}">
      <span class="trending-kw">${safeKw}</span>
      <div class="trending-bar-wrap">
        <div class="trending-fill trending-fill--${k.category}" style="width:${barWidth}%"></div>
      </div>
      <span class="trending-count-val">${k.count}</span>
      <span class="trending-trend trending-trend--${trendClass}">${trendIcon}</span>
      ${showSpike ? `<span class="trending-spike trending-spike--${trendClass}">${spikeLabel}</span>` : '<span class="trending-spike"></span>'}
      <span class="trending-cat trending-cat--${k.category}">${k.category}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// CATALYST VIEW (Full-page keyword spike monitor)
// ═══════════════════════════════════════════════════════════════

let _catalystData = [];
let _catalystCat = 'all';
let _catalystSort = 'count';
let _catalystInterval = null;
let _catalystInited = false;
let _catalystHeadlineTotal = 0;

// --- Spike detection history ---
// Each snapshot is { ts: Date.now(), counts: { keyword: count, ... } }
let _catalystHistory = [];
const _CATALYST_HISTORY_MAX = 30;     // Keep last 30 snapshots (30 min at 60s intervals)
const _CATALYST_BASELINE_MIN = 3;     // Need at least 3 snapshots before computing spikes
const _CATALYST_SPIKE_THRESHOLD = 75; // % above baseline to qualify as a spike alert
let _catalystServerWarned = false;

// Stop words for client-side keyword extraction
const _CATALYST_STOP = new Set((
  'the a an and or but in on at to for of is it that this with from by as be are was were ' +
  'will can has have had not no do does did so if its he she they we you his her my your our ' +
  'their than more most very also been about into over such what which who how when where all ' +
  'each new after says said could would should may first one two will just get set still even ' +
  'much many these those out up per day year time some other being between through during before ' +
  'after against under here there why next back last own any us them make made like know take ' +
  'help try use let big top need way well long full part great think come look good high going ' +
  'want give find tell work call both few every keep same another while must show old again off ' +
  'number since right change turn point small end move follow act began begin lead left late ' +
  'might put run does plan state world week month today report according data key things people ' +
  'news now man won loss amid over via near'
).split(' '));

// ── Spike computation from rolling history ──
function _computeCatalystSpikes(currentCounts) {
  _catalystHistory.push({ ts: Date.now(), counts: { ...currentCounts } });

  // Trim to max size
  if (_catalystHistory.length > _CATALYST_HISTORY_MAX) {
    _catalystHistory = _catalystHistory.slice(-_CATALYST_HISTORY_MAX);
  }

  // Not enough history yet
  if (_catalystHistory.length < _CATALYST_BASELINE_MIN) return {};

  const result = {};
  const prev = _catalystHistory[_catalystHistory.length - 2].counts;

  // Compute baseline average from all snapshots except the latest
  const baselineSnapshots = _catalystHistory.slice(0, -1);
  const baselineTotals = {};
  const baselineCounts = {};
  for (const snap of baselineSnapshots) {
    for (const [kw, count] of Object.entries(snap.counts)) {
      baselineTotals[kw] = (baselineTotals[kw] || 0) + count;
      baselineCounts[kw] = (baselineCounts[kw] || 0) + 1;
    }
  }
  const baselineAvg = {};
  for (const kw of Object.keys(baselineTotals)) {
    baselineAvg[kw] = baselineTotals[kw] / baselineCounts[kw];
  }

  for (const [kw, count] of Object.entries(currentCounts)) {
    const prevCount = prev[kw] || 0;
    const avg = baselineAvg[kw] || 0;
    const change = count - prevCount;

    // Trend: 3-point lookback
    let trend = 'flat';
    if (_catalystHistory.length >= 3) {
      const c3 = _catalystHistory[_catalystHistory.length - 3].counts[kw] || 0;
      const c2 = prevCount;
      const c1 = count;
      if (c1 > c2 && c2 >= c3) trend = 'up';
      else if (c1 < c2 && c2 <= c3) trend = 'down';
      else if (c1 > c2) trend = 'up';
      else if (c1 < c2) trend = 'down';
    } else {
      if (change > 0) trend = 'up';
      else if (change < 0) trend = 'down';
    }

    // SpikePct: percentage above baseline average
    let spikePct = 0;
    if (avg > 0) {
      spikePct = Math.round(((count - avg) / avg) * 100);
    } else if (count > 0) {
      spikePct = 100; // Brand new keyword
    }

    result[kw] = { change, trend, spikePct };
  }

  return result;
}

function initCatalystView() {
  // Prevent duplicate listeners on re-init
  if (_catalystInterval) clearInterval(_catalystInterval);

  // Fetch immediately from both sources
  _fetchCatalystFromNews();  // Client-side extraction — instant results
  _fetchCatalystFromServer(); // Server spike data — overlays when ready
  _catalystInterval = setInterval(() => {
    _fetchCatalystFromNews();
    _fetchCatalystFromServer();
  }, 60000);

  if (_catalystInited) return; // Only wire listeners once
  _catalystInited = true;

  // Category tabs
  const catTabs = document.getElementById('catalystCatTabs');
  if (catTabs) {
    catTabs.addEventListener('click', e => {
      const btn = e.target.closest('.catalyst-cat-btn');
      if (!btn) return;
      catTabs.querySelectorAll('.catalyst-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _catalystCat = btn.dataset.cat;
      _renderCatalystView();
    });
  }

  // Sort select
  const sortSel = document.getElementById('catalystSortSelect');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      _catalystSort = sortSel.value;
      _renderCatalystView();
    });
  }
}

function teardownCatalystView() {
  if (_catalystInterval) { clearInterval(_catalystInterval); _catalystInterval = null; }
}

// ── Client-side keyword extraction from live news ──
async function _fetchCatalystFromNews() {
  const LM = typeof MercuryLiveMarkets !== 'undefined' ? MercuryLiveMarkets : null;
  if (!LM) {
    const body = document.getElementById('catalystTableBody');
    if (body && _catalystData.length === 0) body.innerHTML = '<div class="catalyst-empty">News data source unavailable &mdash; data-bridge.js may not be loaded</div>';
    return;
  }

  try {
    const [general, crypto, politics, ai, econ, geopolitics] = await Promise.all([
      LM.fetchNews('prediction market polymarket kalshi').catch(() => []),
      LM.fetchNews('bitcoin crypto ethereum solana').catch(() => []),
      LM.fetchNews('elections politics congress federal reserve').catch(() => []),
      LM.fetchNews('AI artificial intelligence technology nvidia openai').catch(() => []),
      LM.fetchNews('economy inflation GDP jobs market stocks').catch(() => []),
      LM.fetchNews('geopolitics war trade tariff sanctions').catch(() => []),
    ]);

    // Deduplicate headlines
    const seen = new Set();
    const headlines = [...general, ...crypto, ...politics, ...ai, ...econ, ...geopolitics]
      .filter(a => {
        if (!a.title || seen.has(a.title)) return false;
        seen.add(a.title);
        return true;
      })
      .map(a => a.title);

    _catalystHeadlineTotal = headlines.length;
    if (headlines.length === 0) {
      const body = document.getElementById('catalystTableBody');
      if (body && _catalystData.length === 0) body.innerHTML = '<div class="catalyst-empty">No news articles found &mdash; check proxy connection to Google News</div>';
      _updateCatalystStats();
      return;
    }

    // Extract keywords
    const counts = {};
    for (const h of headlines) {
      const words = h.match(/[A-Za-z'\-]+/g) || [];
      const cleaned = [];
      for (const w of words) {
        const wl = w.toLowerCase().replace(/^['\-]+|['\-]+$/g, '');
        if (wl.length < 3 || _CATALYST_STOP.has(wl)) continue;
        cleaned.push(wl);
      }
      // Unigrams
      for (const w of cleaned) counts[w] = (counts[w] || 0) + 1;
      // Bigrams
      for (let i = 0; i < cleaned.length - 1; i++) {
        const bg = cleaned[i] + ' ' + cleaned[i + 1];
        counts[bg] = (counts[bg] || 0) + 1;
      }
    }

    // Build raw count map for spike detection
    const rawCounts = {};
    for (const [kw, c] of Object.entries(counts)) {
      if (c >= 3) rawCounts[kw] = c;
    }

    // Compute spike metrics from rolling history
    const spikeData = _computeCatalystSpikes(rawCounts);

    // Build keyword list — sort by count, take top 50
    const keywords = Object.entries(rawCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 50)
      .map(([kw, count]) => {
        const spike = spikeData[kw] || { change: 0, trend: 'flat', spikePct: 0 };
        return {
          keyword: kw,
          count,
          change: spike.change,
          trend: spike.trend,
          spikePct: spike.spikePct,
          category: _catalystCategorizKw(kw),
        };
      });

    _catalystData = keywords;
    _updateCatalystStats();
    _renderCatalystView();
  } catch (e) {
    console.warn('[Catalyst] News extraction failed:', e.message);
    if (_catalystData.length === 0) {
      const body = document.getElementById('catalystTableBody');
      if (body) body.innerHTML = '<div class="catalyst-empty">News fetch failed &mdash; ' + (e.message || 'unknown error').replace(/</g, '&lt;') + '</div>';
    }
  }
}

// ── Server-side spike data overlay (stub — /api/trending does not exist yet) ──
async function _fetchCatalystFromServer() {
  // All spike detection is now client-side via _computeCatalystSpikes().
  // When a server /api/trending endpoint is built, this function can overlay
  // server-computed spike data onto the client keyword list.
  if (!_catalystServerWarned) {
    console.log('[Catalyst] Server spike endpoint not available — using client-side detection only');
    _catalystServerWarned = true;
  }
}

function _updateCatalystStats(serverTs) {
  const kwCount = document.getElementById('catalystKeywordCount');
  const hlCount = document.getElementById('catalystHeadlineCount');
  const lastUpd = document.getElementById('catalystLastUpdate');
  if (kwCount) kwCount.textContent = _catalystData.length;
  if (hlCount) hlCount.textContent = _catalystHeadlineTotal || _catalystData.reduce((s, k) => s + k.count, 0);
  if (lastUpd) {
    if (serverTs) {
      const ago = Math.floor((Date.now() - serverTs) / 1000);
      lastUpd.textContent = ago < 60 ? 'just now' : Math.floor(ago / 60) + 'm ago';
    } else {
      lastUpd.textContent = 'just now';
    }
  }
}

function _catalystCategorizKw(kw) {
  const k = kw.toLowerCase();
  if (/bitcoin|btc|crypto|ethereum|eth|coin|defi|blockchain/.test(k)) return 'crypto';
  if (/trump|election|congress|senate|democrat|republican|politic|vote|biden|president|gop/.test(k)) return 'politics';
  if (/fed\b|rate|inflation|cpi|gdp|recession|treasury|economy|tariff|trade war|jobs/.test(k)) return 'econ';
  if (/nvidia|openai|gpt|claude|artificial|intelligence|ai\b/.test(k)) return 'ai';
  if (/ukraine|china|taiwan|iran|nato|war|ceasefire|russia|missile|military/.test(k)) return 'geopolitics';
  if (/nba|nfl|super bowl|world cup|sport|mlb|soccer|football/.test(k)) return 'sports';
  return 'general';
}

function _renderCatalystView() {
  _renderCatalystTable();
  _renderCatalystSpikeAlerts();
  _renderCatalystCategoryBreakdown();
}

function _renderCatalystTable() {
  const body = document.getElementById('catalystTableBody');
  if (!body) return;

  let filtered = _catalystData;
  if (_catalystCat !== 'all') {
    filtered = filtered.filter(k => k.category === _catalystCat);
  }

  // Sort
  filtered = [...filtered];
  if (_catalystSort === 'spike') {
    filtered.sort((a, b) => Math.abs(b.spikePct) - Math.abs(a.spikePct));
  } else if (_catalystSort === 'change') {
    filtered.sort((a, b) => Math.abs(b.change || 0) - Math.abs(a.change || 0));
  } else if (_catalystSort === 'alpha') {
    filtered.sort((a, b) => a.keyword.localeCompare(b.keyword));
  }
  // 'count' is already the default server sort

  if (filtered.length === 0) {
    body.innerHTML = '<div class="catalyst-empty">No keywords detected yet&hellip;</div>';
    return;
  }

  const maxCount = Math.max(...filtered.map(k => k.count), 1);

  body.innerHTML = filtered.map(k => {
    const barWidth = Math.min(100, (k.count / maxCount) * 100);
    const chg = k.change || 0;
    const chgDir = chg > 0 ? 'up' : chg < 0 ? 'down' : 'flat';
    const chgLabel = chg > 0 ? '+' + chg : chg < 0 ? String(chg) : '0';
    const trendIcon = k.trend === 'up' ? '&#9650;' : k.trend === 'down' ? '&#9660;' : '&#8212;';
    const spikeLabel = k.spikePct > 0 ? '+' + k.spikePct + '%' : k.spikePct + '%';
    const showSpike = Math.abs(k.spikePct) > 25;
    const isHot = k.trend === 'up' && k.spikePct > 100;
    const safeKw = k.keyword.replace(/</g, '&lt;');

    return `<div class="catalyst-row${isHot ? ' catalyst-row--hot' : ''}" data-cat="${k.category}">
      <span class="catalyst-row-kw">${safeKw}</span>
      <div class="catalyst-row-bar-wrap">
        <div class="catalyst-row-fill catalyst-row-fill--${k.category}" style="width:${barWidth}%"></div>
      </div>
      <span class="catalyst-row-count">${k.count}</span>
      <span class="catalyst-row-change catalyst-row-change--${chgDir}">${chgLabel}</span>
      <span class="catalyst-row-trend catalyst-row-trend--${k.trend}">${trendIcon}</span>
      <span class="catalyst-row-spike catalyst-row-spike--${k.trend}">${showSpike ? spikeLabel : ''}</span>
      <span class="catalyst-row-cat catalyst-row-cat--${k.category}">${k.category}</span>
    </div>`;
  }).join('');
}

function _renderCatalystSpikeAlerts() {
  const list = document.getElementById('catalystSpikeList');
  const badge = document.getElementById('catalystSpikeCount');
  if (!list) return;

  const spikes = _catalystData.filter(k => k.trend === 'up' && k.spikePct > 75);
  if (badge) badge.textContent = spikes.length;

  if (spikes.length === 0) {
    const hasBaseline = _catalystHistory.length >= _CATALYST_BASELINE_MIN;
    list.innerHTML = hasBaseline
      ? '<div class="catalyst-empty-sm">No significant spikes right now</div>'
      : '<div class="catalyst-empty-sm">Building baseline&hellip; spikes appear after ~' + _CATALYST_BASELINE_MIN + ' min</div>';
    return;
  }

  list.innerHTML = spikes.slice(0, 12).map(k => {
    const safeKw = k.keyword.replace(/</g, '&lt;');
    return `<div class="catalyst-spike-item">
      <span class="catalyst-spike-kw">${safeKw}</span>
      <span class="catalyst-spike-pct">+${k.spikePct}%</span>
      <span class="catalyst-spike-cat catalyst-row-cat--${k.category}">${k.category}</span>
    </div>`;
  }).join('');
}

function _renderCatalystCategoryBreakdown() {
  const container = document.getElementById('catalystCategoryBreakdown');
  if (!container) return;

  // Count keywords per category
  const cats = {};
  for (const k of _catalystData) {
    cats[k.category] = (cats[k.category] || 0) + 1;
  }
  const total = _catalystData.length || 1;
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="catalyst-empty-sm">Waiting for data&hellip;</div>';
    return;
  }

  container.innerHTML = sorted.map(([cat, count]) => {
    const pct = Math.round((count / total) * 100);
    return `<div class="catalyst-cat-row">
      <span class="catalyst-cat-row-name catalyst-row-cat--${cat}">${cat}</span>
      <div class="catalyst-cat-row-bar-wrap">
        <div class="catalyst-row-fill catalyst-row-fill--${cat}" style="width:${pct}%"></div>
      </div>
      <span class="catalyst-cat-row-pct">${pct}%</span>
      <span class="catalyst-cat-row-count">${count}</span>
    </div>`;
  }).join('');
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
    charting.orderBook = {
      bids: Array.from({ length: 10 }, (_, i) => ({ price: midPrice - i, size: 5000 + Math.random() * 20000 })),
      asks: Array.from({ length: 10 }, (_, i) => ({ price: midPrice + 1 + i, size: 5000 + Math.random() * 20000 })),
    };
    renderOrderBook();
    // Mock simulation — throttled to 3s (was 800ms — caused DOM thrash)
    addTabInterval(simulateOrderBookTick, 3000);
  } else {
    // Live: poll real orderbook every 5s
    addTabInterval(async () => {
      await loadLiveOrderBook();
    }, 5000);
  }
}

function renderOrderBook() {
  const body = document.getElementById('orderbookBody');
  if (!body || !charting.orderBook) return;

  const ob = charting.orderBook;
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
  if (!charting.orderBook) return;
  const ob = charting.orderBook;
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

  charting.charts.volume = new ApexCharts(container, options);
  charting.charts.volume.render();

  addTabInterval(() => {
    buyData.shift(); sellData.shift(); categories.shift();
    const t = new Date();
    categories.push(t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0'));
    buyData.push(Math.floor(Math.random() * 400 + 100));
    sellData.push(-Math.floor(Math.random() * 350 + 80));
    if (charting.charts.volume) {
      charting.charts.volume.updateOptions({ xaxis: { categories } });
      charting.charts.volume.updateSeries([{ data: buyData }, { data: sellData }]);
    }
  }, 5000);

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

function initChartingLogs() {
  const container = document.getElementById('chartingLogs');
  if (!container) return;

  // Seed with mock logs
  for (let i = 0; i < 15; i++) {
    appendChartingLog(container, false);
  }

  // Mock log generation — fixed interval instead of recursive setTimeout chain
  addTabInterval(() => {
    if (!charting.isActive) return;
    appendChartingLog(container, true);
  }, 2500);

  // Also poll live bot logs if bridge is up
  if (charting.liveConnected) {
    addTabInterval(pollLiveBotLogs, 5000);
  }
}

function appendChartingLog(container, animate) {
  if (!container) container = document.getElementById('chartingLogs');
  if (!container) return;

  const level = LOG_LEVELS[Math.random() < 0.5 ? 0 : Math.random() < 0.7 ? 1 : Math.random() < 0.9 ? 2 : 3];
  const templates = LOG_MESSAGES[level];
  let msg = templates[Math.floor(Math.random() * templates.length)];
  const m = CHARTING_MARKETS[Math.floor(Math.random() * CHARTING_MARKETS.length)];
  const m2 = CHARTING_MARKETS[Math.floor(Math.random() * CHARTING_MARKETS.length)];
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
// CHARTING CHAT (Terminal tab)
// ═══════════════════════════════════════════════════════════════

function initChartingChat() {
  const input = document.getElementById('chartingChatInput');
  const sendBtn = document.getElementById('chartingChatSend');
  if (!input || !sendBtn) return;

  sendBtn.addEventListener('click', handleChartingChatInput);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleChartingChatInput();
  });
}

function handleChartingChatInput() {
  const input = document.getElementById('chartingChatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  addChartingChatMessage(text, 'user');

  const welcome = document.querySelector('.charting-chat-welcome');
  if (welcome) welcome.style.display = 'none';

  setTimeout(() => simulateChartingResponse(text), 600 + Math.random() * 800);
}

function addChartingChatMessage(content, type) {
  const container = document.getElementById('chartingChatMessages');
  if (!container) return;

  const msg = document.createElement('div');
  msg.className = `charting-chat-msg ${type}`;

  if (type === 'assistant') {
    const div = document.createElement('div');
    div.textContent = content;
    msg.innerHTML = `<span class="msg-label">Mercury Charting</span>${div.innerHTML.replace(/\n/g, '<br>')}`;
  } else {
    msg.textContent = content;
  }

  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function simulateChartingResponse(text) {
  const lower = text.toLowerCase();
  let response;

  if (lower.includes('btc') || lower.includes('bitcoin')) {
    // Inject live data if available
    const btcLine = charting.liveBTCPrice
      ? `Live BTC Price: $${charting.liveBTCPrice.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : 'BTC Price: fetching...';
    const dvolLine = charting.liveDVOL
      ? `DVOL: ${charting.liveDVOL.toFixed(1)}% implied vol`
      : '';
    const divLine = charting.liveDivergence != null
      ? `Oracle Divergence: $${charting.liveDivergence.toFixed(0)} (Binance - Coinbase)`
      : '';
    const impliedLine = charting.liveKalshiImplied
      ? `Kalshi Implied: $${charting.liveKalshiImplied.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
      : '';
    const liveBlock = [btcLine, dvolLine, divLine, impliedLine].filter(Boolean).join('\n');

    response = `BTC Overview:\n\n${liveBlock}\n\nKey data: Track ETF flows as a leading indicator. Compare Binance spot vs Kalshi implied price for spread opportunities.`;
  } else if (lower.includes('fed') || lower.includes('rate') || lower.includes('interest')) {
    response = 'Fed Rate Cut:\n\nCurrent: 62c YES | Volume: $2.1M/24h\nCME FedWatch: 68% probability\nPoly: 62c | Kalshi: 64c (2c spread)\n\nKey data: Core PCE at 2.3%, FOMC minutes showing dovish lean, 3/7 governors signaling openness to cuts.\n\nAnalysis angle: Compare CME FedWatch vs prediction market prices for spread opportunities.';
  } else if (lower.includes('edge') || lower.includes('opportunity') || lower.includes('volume')) {
    const topVol = charting.edgeData ? [...charting.edgeData].sort((a, b) => parseFloat(b.vol.replace(/[$M]/g, '')) - parseFloat(a.vol.replace(/[$M]/g, ''))).slice(0, 4) : [];
    const volLines = topVol.map((m, i) => `${i + 1}. ${m.name}: ${m.vol} volume, ${m.price}c, Poly ${m.polyPrice}c / Kalshi ${m.kalshiPrice}c`).join('\n');
    response = `Top markets by volume:\n\n${volLines}\n\nLook for cross-platform spreads and volume spikes as potential opportunities.`;
  } else if (lower.includes('arb') || lower.includes('spread') || lower.includes('arbitrage')) {
    response = 'Cross-platform spread analysis:\n\nActive spreads between Polymarket and Kalshi:\n\nSpreads can indicate: fee structure differences, liquidity imbalances, different resolution criteria, or retail vs institutional user base mix.\n\nNote: Persistent gaps often reflect structural differences, not pure arbitrage. Always check resolution terms.';
  } else if (lower.includes('correlat')) {
    response = 'Market correlations (estimated):\n\n+0.72: Fed Rate Cut / BTC > $100K\n+0.68: Fed Rate Cut Jun / ETH > $5K\n+0.61: AI Regulation / Nvidia > $200\n+0.58: S&P 6000 / US GDP > 3%\n-0.54: Recession 2027 / BTC > $100K\n-0.51: Oil > $100 / US EV Sales > 30%\n-0.48: US Debt Ceiling / SpaceX Mars\n+0.45: Trump 2028 / Recession 2027\n+0.42: Gold > $2500 / 10Y Treasury > 5%\n-0.39: Government Shutdown / S&P 6000\n\nTracking correlations across ' + (charting.edgeData ? charting.edgeData.length : CHARTING_MARKETS.length) + ' markets. When correlated markets move out of sync, it may signal a trading opportunity.';
  } else {
    const mktCount = charting.edgeData ? charting.edgeData.length : CHARTING_MARKETS.length;
    const totalVol = charting.edgeData
      ? charting.edgeData.reduce((s, e) => s + (e._volNum || 0), 0)
      : CHARTING_MARKETS.reduce((s, m) => s + parseFloat(m.vol.replace(/[$M]/g, '')), 0);
    response = `Market overview:\n\n${mktCount} markets tracked | Combined volume: $${totalVol.toFixed(1)}M/24h\n\nAsk about specific markets (btc, fed, etc.), spreads, volume, correlations, or arbitrage.`;
  }

  addChartingChatMessage(response, 'assistant');
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

function startChartingClock() {
  function tick() {
    const el = document.getElementById('chartingClock');
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
  addChartingInterval(tick, 1000);
}

// ═══════════════════════════════════════════════════════════════
// LIVE DATA CONNECTION (Mercury Bridge API)
// ═══════════════════════════════════════════════════════════════

async function initLiveDataConnection() {
  if (typeof dataBridge === 'undefined') return;

  // Check bridge connection
  const bridgeUp = await dataBridge.checkConnection();
  charting.liveConnected = bridgeUp;

  // Even if bridge is down, try direct data (Coinbase/Deribit fallbacks)
  const priceData = await dataBridge.getBTCPrice();
  charting.liveDataAvailable = bridgeUp || !!(priceData && (priceData.binance || priceData.coinbase));
  updateConnectionIndicator();

  // Poll connection status every 15s
  addChartingInterval(async () => {
    charting.liveConnected = await dataBridge.checkConnection();
    charting.liveDataAvailable = charting.liveConnected || charting.liveBTCPrice != null || charting.liveDVOL != null;
    updateConnectionIndicator();
  }, 15000);

  // Start live data polling (these work even without bridge via fallbacks)
  startLiveBTCPricePolling();
  startLiveDVOLPolling();
  startLiveMetricsPolling();
}

function updateConnectionIndicator() {
  const dot = document.querySelector('.charting-live-dot');
  const label = document.querySelector('.charting-live-label');
  if (!dot && !label) return;

  if (charting.liveConnected) {
    // Full bridge connection — all data available
    if (dot) dot.style.background = '#00c853';
    if (label) { label.textContent = 'LIVE'; label.style.color = '#00c853'; }
  } else if (charting.liveDataAvailable) {
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
    if (!charting.isActive) return;
    const data = await dataBridge.getBTCPrice();
    if (!data) return;

    const price = data.binance || data.coinbase;
    if (price) {
      charting.liveBTCPrice = price;
      updateTickerWithLivePrice(price);
      // Update data availability on first successful fetch
      if (!charting.liveDataAvailable) {
        charting.liveDataAvailable = true;
        updateConnectionIndicator();
      }
    }
    if (data.divergence != null) {
      charting.liveDivergence = data.divergence;
    }
  }
  poll();
  addChartingInterval(poll, 5000);
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
    if (!charting.isActive) return;
    const data = await dataBridge.getDVOL();
    if (!data || data.dvol == null) return;

    charting.liveDVOL = data.dvol;
    if (!charting.liveDataAvailable) {
      charting.liveDataAvailable = true;
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
  addChartingInterval(poll, 60000);
}

// ─── Metrics Polling (Crypto tab cards) ──────────

function startLiveMetricsPolling() {
  async function poll() {
    if (!charting.isActive) return;

    // Update BTC price on crypto tab
    if (charting.liveBTCPrice) {
      const el = document.getElementById('cryptoBTCPrice');
      if (el) el.textContent = '$' + Math.round(charting.liveBTCPrice).toLocaleString();
    }

    // Update DVOL on crypto tab
    if (charting.liveDVOL) {
      const el = document.getElementById('cryptoDVOL');
      if (el) {
        el.textContent = charting.liveDVOL.toFixed(1) + '%';
        el.style.color = charting.liveDVOL > 40 ? '#ff1744' : '#00c853';
      }
    }
  }
  poll();
  addChartingInterval(poll, 6000);
}

// ─── Live Order Book (replaces mock when bridge is up) ──────

async function loadLiveOrderBook() {
  if (typeof dataBridge === 'undefined' || !charting.liveConnected) return false;

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
      charting.orderBook = { bids, asks };
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
  if (typeof dataBridge === 'undefined' || !charting.liveConnected) return;

  const data = await dataBridge.getBotLogs();
  if (!data || !data.lines || data.lines.length === 0) return;

  const container = document.getElementById('chartingLogs');
  if (!container) return;

  // Only append new lines
  const newLines = data.lines.slice(charting.lastLogLines);
  if (newLines.length === 0) return;
  charting.lastLogLines = data.lines.length;

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

// ═══════════════════════════════════════════════════════════════
// BONDING ARB — Markets at >=97% resolution probability
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// BONDING ARBITRAGE — Dedicated View (accessed from sidebar nav)
// ═══════════════════════════════════════════════════════════════

let _bondingArbInterval = null;
let _bondCache = { data: null, ts: 0 };

window.teardownBondingArbView = function() {
  if (_bondingArbInterval) { clearInterval(_bondingArbInterval); _bondingArbInterval = null; }
};

window.initBondingArbView = function() {
  // Show welcome explainer on first visit
  const welcomeEl = document.getElementById('bondWelcome');
  if (welcomeEl) {
    welcomeEl.style.display = localStorage.getItem('mercury_bond_welcome_dismissed') ? 'none' : '';
  }

  renderBondingArbView();
  if (_bondingArbInterval) clearInterval(_bondingArbInterval);
  _bondingArbInterval = setInterval(renderBondingArbView, 30000);

  // Wire sort/filter/platform handlers (once)
  const sortSel = document.getElementById('bondingViewSort');
  const platTabs = document.getElementById('bondingViewPlatformTabs');
  if (sortSel && !sortSel._wired) {
    sortSel._wired = true;
    sortSel.addEventListener('change', () => renderBondingArbView());
  }
  if (platTabs && !platTabs._wired) {
    platTabs._wired = true;
    platTabs.addEventListener('click', e => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      platTabs.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderBondingArbView();
    });
  }
};

window.dismissBondWelcome = function() {
  localStorage.setItem('mercury_bond_welcome_dismissed', '1');
  const el = document.getElementById('bondWelcome');
  if (el) el.style.display = 'none';
};

// ── Fetch real bond-worthy markets from Polymarket + Kalshi ──

async function fetchBondingMarkets() {
  if (_bondCache.data && Date.now() - _bondCache.ts < 30000) return _bondCache.data;

  const LM = window.MercuryLiveMarkets;
  if (!LM) return [];

  const bonds = [];
  const now = Date.now();
  const MAX_DAYS = 60;
  const MIN_BOND_CENTS = 90; // YES price >= 90c (YES bond) or <= 10c (NO bond)

  // Fetch both platforms in parallel
  // For Polymarket we call Gamma raw to get both YES and NO clobTokenIds
  const polyQs = `markets?limit=500&active=true&closed=false&order=volume24hr&ascending=false`;
  const [polyRaw, kalshiMarkets] = await Promise.all([
    LM._fetchWithFallback(`${LM._polyBase}${polyQs}`, `${LM._polyDirect}${polyQs}`)
      .then(r => r.ok ? r.json() : []).catch(() => []),
    LM.fetchKalshiMarkets(200).catch(() => []),
  ]);

  // ── Process Polymarket ──
  const polyArr = Array.isArray(polyRaw) ? polyRaw : polyRaw.markets || [];
  for (const m of polyArr) {
    if (!m.question || m.closed || m.acceptingOrders === false) continue;
    const yesPrice = Math.round(parseFloat(m.outcomePrices?.[0] || m.lastTradePrice || 0) * 100);
    if (yesPrice <= 0 || yesPrice >= 100) continue;

    const isYesBond = yesPrice >= MIN_BOND_CENTS;
    const isNoBond  = yesPrice <= (100 - MIN_BOND_CENTS);
    if (!isYesBond && !isNoBond) continue;

    const endDate = m.endDate;
    if (!endDate) continue;
    const days = Math.ceil((new Date(endDate).getTime() - now) / 86400000);
    if (days <= 0 || days > MAX_DAYS) continue;

    // Parse both YES (index 0) and NO (index 1) token IDs
    let yesTokenId = null, noTokenId = null;
    try {
      const arr = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
      if (Array.isArray(arr)) { yesTokenId = arr[0] || null; noTokenId = arr[1] || null; }
    } catch {}

    const side = isYesBond ? 'yes' : 'no';
    const bondPrice = side === 'yes' ? yesPrice / 100 : (100 - yesPrice) / 100;

    bonds.push({
      name: m.question,
      platform: 'polymarket',
      side,
      bondPrice,
      yesPrice: yesPrice / 100,
      days,
      volume24h: parseFloat(m.volume24hr || 0),
      liquidity: parseFloat(m.liquidity || 0),
      endDate,
      clobTokenId: yesTokenId,
      noTokenId,
      ticker: null,
      bestBid: Math.round(parseFloat(m.bestBid || 0) * 100),
      bestAsk: Math.round(parseFloat(m.bestAsk || 0) * 100),
    });
  }

  // ── Process Kalshi ──
  for (const m of kalshiMarkets) {
    const yesPrice = m.price; // 0-100 cents
    const isYesBond = yesPrice >= MIN_BOND_CENTS;
    const isNoBond  = yesPrice <= (100 - MIN_BOND_CENTS);
    if (!isYesBond && !isNoBond) continue;

    const closeTime = m.closeTime;
    if (!closeTime) continue;
    const days = Math.ceil((new Date(closeTime).getTime() - now) / 86400000);
    if (days <= 0 || days > MAX_DAYS) continue;

    const side = isYesBond ? 'yes' : 'no';
    const bondPrice = side === 'yes' ? yesPrice / 100 : (100 - yesPrice) / 100;

    bonds.push({
      name: m.name,
      platform: 'kalshi',
      side,
      bondPrice,
      yesPrice: yesPrice / 100,
      days,
      volume24h: m.volume24h || 0,
      liquidity: m.liquidity || 0,
      endDate: closeTime,
      clobTokenId: null,
      noTokenId: null,
      ticker: m.ticker,
      bestBid: m.yesBid || 0,
      bestAsk: m.yesAsk || 0,
    });
  }

  _bondCache = { data: bonds, ts: Date.now() };
  return bonds;
}

// ── Render bonding arb table with real data ──

async function renderBondingArbView() {
  const tbody = document.getElementById('bondingViewBody');

  // Show loading on first render
  if (!_bondCache.data && tbody) {
    tbody.innerHTML = '<div class="bonding-loading">Scanning markets\u2026</div>';
  }

  let markets;
  try {
    markets = await fetchBondingMarkets();
  } catch (e) {
    console.warn('[BondArb] Fetch failed:', e);
    if (tbody) tbody.innerHTML = '<div class="bonding-loading">Failed to load markets. Retrying\u2026</div>';
    return;
  }

  const sortSel = document.getElementById('bondingViewSort');
  const activePlat = document.querySelector('#bondingViewPlatformTabs .filter-tab.active');
  const sortBy = sortSel ? sortSel.value : 'yield';
  const platformFilter = activePlat ? activePlat.dataset.plat : 'all';

  let filtered = [...markets];
  if (platformFilter !== 'all') {
    filtered = filtered.filter(m => m.platform === platformFilter);
  }

  // Calculate yield
  filtered = filtered.map(m => {
    const rawYield = (1 - m.bondPrice) / m.bondPrice;
    const annualized = m.days > 0 ? rawYield * (365 / m.days) : 0;
    return { ...m, rawYield, annualized };
  });

  // Sort
  if (sortBy === 'yield') filtered.sort((a, b) => b.annualized - a.annualized);
  else if (sortBy === 'prob') filtered.sort((a, b) => b.bondPrice - a.bondPrice);
  else if (sortBy === 'volume') filtered.sort((a, b) => b.volume24h - a.volume24h);
  else if (sortBy === 'days') filtered.sort((a, b) => a.days - b.days);

  // Store for buy modal reference
  window._bondFilteredMarkets = filtered;

  // Metrics
  const avgYield = filtered.length > 0 ? filtered.reduce((s, m) => s + m.annualized, 0) / filtered.length : 0;
  const totalVol = filtered.reduce((s, m) => s + m.volume24h, 0);
  const avgDays = filtered.length > 0 ? filtered.reduce((s, m) => s + m.days, 0) / filtered.length : 0;

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('bondingViewOpps', filtered.length);
  setTxt('bondingViewYield', (avgYield * 100).toFixed(1) + '%');
  setTxt('bondingViewLiq', '$' + (totalVol / 1e6).toFixed(1) + 'M');
  setTxt('bondingViewDays', Math.round(avgDays) + 'd');
  setTxt('bondingViewCount', filtered.length + ' opportunities');

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '<div class="bonding-loading">No bond opportunities found</div>';
    return;
  }

  tbody.innerHTML = filtered.map((m, idx) => {
    const prob = (m.bondPrice * 100).toFixed(1) + '%';
    const yieldPct = (m.annualized * 100).toFixed(1) + '%';
    const vol = m.volume24h;
    const volStr = vol >= 1e6 ? '$' + (vol / 1e6).toFixed(1) + 'M' : '$' + (vol / 1e3).toFixed(0) + 'K';
    const platClass = m.platform === 'polymarket' ? 'poly' : 'kalshi';
    const platLabel = m.platform === 'polymarket' ? 'Polymarket' : 'Kalshi';
    const sideClass = m.side === 'yes' ? 'bonding-side--yes' : 'bonding-side--no';
    const sideLabel = m.side === 'yes' ? 'YES' : 'NO';
    const btnLabel = m.side === 'yes' ? 'Buy YES' : 'Buy NO';
    const btnClass = m.side === 'yes' ? 'bonding-view-btn' : 'bonding-view-btn bonding-view-btn--no';
    return `<div class="bonding-vrow">
      <span class="bonding-vcol bonding-vcol--market">${esc(m.name)}</span>
      <span class="bonding-vcol bonding-vcol--platform bonding-vcol--${platClass}">${platLabel}</span>
      <span class="bonding-vcol bonding-vcol--side ${sideClass}">${sideLabel}</span>
      <span class="bonding-vcol bonding-vcol--price">${(m.bondPrice * 100).toFixed(1)}c</span>
      <span class="bonding-vcol bonding-vcol--prob">${prob}</span>
      <span class="bonding-vcol bonding-vcol--yield">${yieldPct}</span>
      <span class="bonding-vcol bonding-vcol--days">${m.days}d</span>
      <span class="bonding-vcol bonding-vcol--vol">${volStr}</span>
      <span class="bonding-vcol bonding-vcol--action"><button class="${btnClass}" onclick="openBondBuyModal(${idx})">${btnLabel}</button></span>
    </div>`;
  }).join('');
}

// ── Bond Buy Modal ──

window._bondBuyTarget = null;
window._bondBuyBalance = 0;

window.openBondBuyModal = async function(idx) {
  const market = window._bondFilteredMarkets?.[idx];
  if (!market) return;

  window._bondBuyTarget = market;
  const isPoly = market.platform === 'polymarket';

  const warningEl = document.getElementById('bondBuyWarning');
  const warningText = document.getElementById('bondBuyWarningText');
  const confirmBtn = document.getElementById('bondBuyConfirmBtn');

  let connected = false;
  let balance = 0;

  if (isPoly) {
    try {
      const wallet = await window.walletService.getWallet();
      if (wallet && wallet.address) {
        connected = true;
        const bal = await window.walletService.getBalance();
        balance = bal?.usdc || 0;
      }
    } catch {}
  } else {
    try {
      const base = (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) || 'http://localhost:8778';
      const authFetch = window.fetchWithAuth || fetch;
      const resp = await authFetch(`${base}/api/kalshi/credentials`);
      if (resp.ok) {
        const data = await resp.json();
        connected = !!data.connected;
        if (connected) {
          const balResp = await authFetch(`${base}/api/kalshi/balance`);
          if (balResp.ok) {
            const balData = await balResp.json();
            balance = balData.balance || balData.available_balance || 0;
          }
        }
      }
    } catch {}
  }

  // Populate modal fields
  document.getElementById('bondBuyModalTitle').textContent =
    market.side === 'yes' ? 'Buy YES Bond' : 'Buy NO Bond';
  document.getElementById('bondBuyMarketName').textContent = market.name;

  const platEl = document.getElementById('bondBuyPlatform');
  platEl.textContent = isPoly ? 'Polymarket' : 'Kalshi';
  platEl.className = 'bond-buy-platform bond-buy-platform--' + (isPoly ? 'poly' : 'kalshi');

  const sideEl = document.getElementById('bondBuySide');
  sideEl.textContent = market.side.toUpperCase();
  sideEl.className = 'bond-buy-side bond-buy-side--' + market.side;

  document.getElementById('bondBuyDays').textContent = market.days + 'd to resolution';
  document.getElementById('bondBuyPrice').textContent = (market.bondPrice * 100).toFixed(1) + 'c';
  document.getElementById('bondBuyRawYield').textContent = (market.rawYield * 100).toFixed(1) + '%';
  document.getElementById('bondBuyAnnYield').textContent = (market.annualized * 100).toFixed(1) + '%';

  document.getElementById('bondBuyBalance').textContent = '$' + parseFloat(balance).toFixed(2);
  window._bondBuyBalance = balance;

  // Reset amount + estimate
  const amountInput = document.getElementById('bondBuyAmount');
  amountInput.value = '';
  document.getElementById('bondBuyEstimate').style.display = 'none';
  amountInput.oninput = () => updateBondBuyEstimate(market);

  // Connection / token warnings
  let hasWarning = false;
  if (!connected) {
    warningEl.style.display = 'flex';
    warningText.textContent = isPoly
      ? 'No Polymarket wallet connected. Use Connected Accounts in the sidebar.'
      : 'No Kalshi account connected. Use Connected Accounts in the sidebar.';
    hasWarning = true;
  } else if (isPoly && market.side === 'yes' && !market.clobTokenId) {
    warningEl.style.display = 'flex';
    warningText.textContent = 'Token ID not available for this market.';
    hasWarning = true;
  } else if (isPoly && market.side === 'no' && !market.noTokenId) {
    warningEl.style.display = 'flex';
    warningText.textContent = 'NO token ID not available for this market.';
    hasWarning = true;
  } else {
    warningEl.style.display = 'none';
  }

  confirmBtn.disabled = hasWarning;
  document.getElementById('bondBuyModal').classList.add('open');
};

window.closeBondBuyModal = function() {
  document.getElementById('bondBuyModal').classList.remove('open');
  window._bondBuyTarget = null;
};

function updateBondBuyEstimate(market) {
  const estimateEl = document.getElementById('bondBuyEstimate');
  const amount = parseFloat(document.getElementById('bondBuyAmount').value);

  if (!amount || amount <= 0) {
    estimateEl.style.display = 'none';
    return;
  }

  estimateEl.style.display = 'flex';

  // Kalshi: integer contracts at bondPrice each; Polymarket: fractional shares
  const contracts = market.platform === 'kalshi'
    ? Math.floor(amount / market.bondPrice)
    : amount / market.bondPrice;
  const cost = market.platform === 'kalshi'
    ? contracts * market.bondPrice
    : amount;
  const payout = contracts * 1.00; // each contract/share resolves to $1
  const profit = payout - cost;

  document.getElementById('bondBuyContracts').textContent =
    market.platform === 'kalshi' ? contracts.toString() : contracts.toFixed(2);
  document.getElementById('bondBuyCost').textContent = '$' + cost.toFixed(2);
  document.getElementById('bondBuyPayout').textContent = '$' + payout.toFixed(2);
  document.getElementById('bondBuyProfit').textContent = '+$' + profit.toFixed(2);

  // Disable confirm if over balance (only when no other warning shown)
  const confirmBtn = document.getElementById('bondBuyConfirmBtn');
  const warningVisible = document.getElementById('bondBuyWarning').style.display === 'flex';
  confirmBtn.disabled = warningVisible || cost > window._bondBuyBalance;
}

window.setBondBuyMax = function() {
  document.getElementById('bondBuyAmount').value = (window._bondBuyBalance || 0).toFixed(2);
  if (window._bondBuyTarget) updateBondBuyEstimate(window._bondBuyTarget);
};

window.confirmBondBuy = async function() {
  const market = window._bondBuyTarget;
  if (!market) return;

  const amount = parseFloat(document.getElementById('bondBuyAmount').value);
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const confirmBtn = document.getElementById('bondBuyConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Placing order\u2026';

  try {
    if (market.platform === 'polymarket') {
      const tokenId = market.side === 'yes' ? market.clobTokenId : market.noTokenId;
      if (!tokenId) throw new Error('Token ID not available');
      const size = amount / market.bondPrice;
      await window.walletService.placeOrder(tokenId, 'BUY', market.bondPrice, size);
      showToast('Polymarket bond order placed', 'success');
    } else {
      const count = Math.floor(amount / market.bondPrice);
      if (count <= 0) throw new Error('Amount too small for at least 1 contract');
      const priceCents = Math.round(market.bondPrice * 100);
      const base = (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) || 'http://localhost:8778';
      const authFetch = window.fetchWithAuth || fetch;
      const resp = await authFetch(`${base}/api/kalshi/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: market.ticker,
          side: market.side,
          count,
          price: priceCents,
          action: 'buy',
          order_type: 'limit',
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }));
        throw new Error(err.detail || err.error || `HTTP ${resp.status}`);
      }
      showToast(`Kalshi bond order placed: ${count} contracts`, 'success');
    }
    closeBondBuyModal();
  } catch (e) {
    showToast('Order failed: ' + e.message, 'error');
    console.error('[BondBuy] Order failed:', e);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Buy';
  }
};

// ═══════════════════════════════════════════════════════════════
// PORTFOLIO — Dedicated View (accessed from sidebar nav)
// ═══════════════════════════════════════════════════════════════

let _portfolioInterval = null;

window.teardownPortfolioView = function() {
  if (_portfolioInterval) { clearInterval(_portfolioInterval); _portfolioInterval = null; }
};

let _portfolioEquityChart = null;

window.initPortfolioView = async function() {
  await renderPortfolioView();
  if (_portfolioInterval) clearInterval(_portfolioInterval);
  _portfolioInterval = setInterval(renderPortfolioView, 15000);

  // Wire filter tabs (once)
  const filterTabs = document.getElementById('portfolioFilterTabs');
  const sortSel = document.getElementById('portfolioSort');
  if (filterTabs && !filterTabs._wired) {
    filterTabs._wired = true;
    filterTabs.addEventListener('click', e => {
      const btn = e.target.closest('.filter-tab');
      if (!btn) return;
      filterTabs.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderPortfolioView();
    });
  }
  if (sortSel && !sortSel._wired) {
    sortSel._wired = true;
    sortSel.addEventListener('change', renderPortfolioView);
  }
};

async function renderPortfolioView() {
  const _esc = typeof esc === 'function' ? esc : (s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setHtml = (id, v) => { const el = document.getElementById(id); if (el) el.innerHTML = v; };

  if (typeof engineBridge === 'undefined') {
    const tbody = document.getElementById('portfolioTableBody');
    if (tbody) tbody.innerHTML = '<div class="bonding-loading">Connect to engine to view portfolio\u2026</div>';
    return;
  }

  try {
    // Fetch portfolio summary, positions, and trades in parallel
    const [summary, positions, trades] = await Promise.all([
      engineBridge.getPortfolio(),
      engineBridge.getPortfolioPositions(100),
      engineBridge.getPortfolioTrades(30),
    ]);

    // Map positions to render format
    const withPnl = (positions || []).map(p => {
      const value = (p.quantity || 0) * (p.current_price || 0) / 100;
      const cost = p.cost_basis || 0;
      const pnl = p.unrealized_pnl || 0;
      const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
      return {
        market: p.contract || 'Unknown',
        botName: p.bot_name || '',
        botMode: p.bot_mode || 'paper',
        platform: (p.platform || 'polymarket').toLowerCase(),
        side: (p.side || 'yes').toLowerCase(),
        qty: p.quantity || 0,
        avgPrice: (p.entry_price || 0) / 100,
        currentPrice: (p.current_price || 0) / 100,
        value, cost, pnl, pnlPct,
        status: 'open',
      };
    });

    // Filtering
    const activeFilter = document.querySelector('#portfolioFilterTabs .filter-tab.active');
    const filter = activeFilter ? activeFilter.dataset.filter : 'all';
    let filtered = withPnl;
    if (filter === 'open') filtered = filtered.filter(p => p.status === 'open');

    // Sorting
    const sortSel = document.getElementById('portfolioSort');
    const sortBy = sortSel ? sortSel.value : 'pnl';
    if (sortBy === 'pnl') filtered.sort((a, b) => b.pnl - a.pnl);
    else if (sortBy === 'value') filtered.sort((a, b) => b.value - a.value);
    else if (sortBy === 'recent') filtered.sort((a, b) => (b.status === 'open' ? 1 : 0) - (a.status === 'open' ? 1 : 0));

    // Update summary metrics from API
    const totalPnl = summary.total_pnl || 0;
    const totalPnlPct = summary.total_pnl_pct || 0;
    setTxt('portfolioTotalValue', '$' + (summary.total_equity || 0).toFixed(2));
    const pnlColor = totalPnl >= 0 ? 'portfolio-summary-value--green' : 'portfolio-summary-value--red';
    const pnlSign = totalPnl >= 0 ? '+' : '';
    setHtml('portfolioTotalPnl', `<span class="${pnlColor}">${pnlSign}$${totalPnl.toFixed(2)}</span>`);
    setTxt('portfolioOpenCount', summary.open_positions || 0);
    setTxt('portfolioWinRate', (summary.win_rate || 0).toFixed(0) + '%');
    setTxt('portfolioSettledCount', summary.total_trades || 0);
    const avgRetColor = totalPnlPct >= 0 ? 'portfolio-summary-value--green' : 'portfolio-summary-value--red';
    setHtml('portfolioAvgReturn', `<span class="${avgRetColor}">${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%</span>`);
    setTxt('portfolioPositionCount', filtered.length + ' positions');

    // Render positions table
    const tbody = document.getElementById('portfolioTableBody');
    if (tbody) {
      if (filtered.length === 0) {
        tbody.innerHTML = '<div class="bonding-loading">No open positions. Deploy a bot to start trading.</div>';
      } else {
        tbody.innerHTML = filtered.map(p => {
          const platClass = p.platform === 'polymarket' ? 'poly' : 'kalshi';
          const platLabel = p.platform === 'polymarket' ? 'Polymarket' : 'Kalshi';
          const sideClass = p.side === 'yes' ? 'portfolio-side--yes' : 'portfolio-side--no';
          const sideLabel = p.side.toUpperCase();
          const avgStr = (p.avgPrice * 100).toFixed(1) + 'c';
          const curStr = (p.currentPrice * 100).toFixed(1) + 'c';
          const valueStr = '$' + p.value.toFixed(2);
          const pnlVal = p.pnl;
          const pnlClass = pnlVal >= 0 ? 'portfolio-pnl--pos' : 'portfolio-pnl--neg';
          const pnlStr = (pnlVal >= 0 ? '+' : '') + '$' + pnlVal.toFixed(2);
          const pnlPctStr = ' (' + (pnlVal >= 0 ? '+' : '') + p.pnlPct.toFixed(1) + '%)';
          return `<div class="portfolio-row">
            <span class="portfolio-col portfolio-col--market" title="${_esc(p.market)}">${_esc(p.market)}</span>
            <span class="portfolio-col portfolio-col--bot" title="${_esc(p.botName)}">${_esc(p.botName)}</span>
            <span class="portfolio-col portfolio-col--platform portfolio-col--${platClass}">${platLabel}</span>
            <span class="portfolio-col portfolio-col--side ${sideClass}">${sideLabel}</span>
            <span class="portfolio-col portfolio-col--qty">${p.qty}</span>
            <span class="portfolio-col portfolio-col--avg">${avgStr}</span>
            <span class="portfolio-col portfolio-col--current">${curStr}</span>
            <span class="portfolio-col portfolio-col--value">${valueStr}</span>
            <span class="portfolio-col portfolio-col--pnl ${pnlClass}">${pnlStr}<span class="portfolio-pnl-pct">${pnlPctStr}</span></span>
          </div>`;
        }).join('');
      }
    }

    // Render trades table
    const tradesTbody = document.getElementById('portfolioTradesBody');
    if (tradesTbody) {
      if (!trades || trades.length === 0) {
        tradesTbody.innerHTML = '<div class="bonding-loading">No trades yet\u2026</div>';
      } else {
        tradesTbody.innerHTML = trades.map(t => {
          const sideClass = (t.side || '').toUpperCase() === 'BUY' ? 'portfolio-side--yes' : 'portfolio-side--no';
          const pnlVal = t.pnl || 0;
          const pnlClass = pnlVal > 0 ? 'portfolio-pnl--pos' : pnlVal < 0 ? 'portfolio-pnl--neg' : '';
          const pnlStr = pnlVal !== 0 ? ((pnlVal >= 0 ? '+' : '') + '$' + pnlVal.toFixed(2)) : '--';
          const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--';
          return `<div class="portfolio-row">
            <span class="portfolio-col portfolio-col--time">${_esc(timeStr)}</span>
            <span class="portfolio-col portfolio-col--bot" title="${_esc(t.bot_name)}">${_esc(t.bot_name || '')}</span>
            <span class="portfolio-col portfolio-col--side ${sideClass}">${_esc((t.side || '').toUpperCase())}</span>
            <span class="portfolio-col portfolio-col--market" title="${_esc(t.contract)}">${_esc(t.contract || '')}</span>
            <span class="portfolio-col portfolio-col--qty">${t.quantity || 0}</span>
            <span class="portfolio-col portfolio-col--avg">${((t.price || 0)).toFixed(1)}c</span>
            <span class="portfolio-col portfolio-col--value">$${(t.amount || 0).toFixed(2)}</span>
            <span class="portfolio-col portfolio-col--pnl ${pnlClass}">${pnlStr}</span>
          </div>`;
        }).join('');
      }
    }

    // Render equity chart (if snapshots available)
    renderPortfolioEquityChart();

  } catch (e) {
    console.warn('[Portfolio] Failed to fetch:', e.message);
    const tbody = document.getElementById('portfolioTableBody');
    if (tbody) {
      tbody.innerHTML = '<div class="bonding-loading">Connect to engine to view portfolio\u2026</div>';
    }
  }
}

async function renderPortfolioEquityChart() {
  if (typeof engineBridge === 'undefined' || typeof ApexCharts === 'undefined') return;
  const chartEl = document.getElementById('portfolioEquityChart');
  if (!chartEl) return;

  try {
    const data = await engineBridge.getPortfolioEquity(7);
    if (!data.snapshots || data.snapshots.length < 2) {
      chartEl.style.display = 'none';
      return;
    }

    chartEl.style.display = 'block';
    const series = data.snapshots.map(s => ({
      x: new Date(s.timestamp).getTime(),
      y: s.total_equity,
    }));

    const isPositive = series[series.length - 1].y >= series[0].y;
    const color = isPositive ? '#00e676' : '#ff1744';

    if (_portfolioEquityChart) {
      _portfolioEquityChart.destroy();
      _portfolioEquityChart = null;
    }

    _portfolioEquityChart = new ApexCharts(chartEl, {
      chart: {
        type: 'area',
        height: 180,
        sparkline: { enabled: false },
        toolbar: { show: false },
        zoom: { enabled: false },
        background: 'transparent',
        fontFamily: 'JetBrains Mono, monospace',
      },
      series: [{ name: 'Portfolio Equity', data: series }],
      colors: [color],
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] },
      },
      stroke: { curve: 'smooth', width: 2 },
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: '#666', fontSize: '10px' } },
        axisBorder: { show: false },
        axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#666', fontSize: '10px' },
          formatter: v => '$' + v.toFixed(0),
        },
      },
      grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 3 },
      tooltip: {
        theme: 'dark',
        x: { format: 'MMM dd, HH:mm' },
        y: { formatter: v => '$' + v.toFixed(2) },
      },
    });
    _portfolioEquityChart.render();
  } catch (e) {
    chartEl.style.display = 'none';
    console.debug('[Portfolio] Equity chart unavailable:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKET DETAIL PANEL
// ═══════════════════════════════════════════════════════════════

function generatePriceHistory(currentPrice, points, stepMs) {
  const step = stepMs || 60000; // default 1 minute spacing
  const data = [];
  const now = Date.now();
  let price = currentPrice + (Math.random() - 0.5) * 20;
  price = Math.max(3, Math.min(97, price));
  for (let i = points; i >= 0; i--) {
    const drift = (currentPrice - price) * 0.02;
    const noise = (Math.random() - 0.5) * 3;
    price = Math.max(1, Math.min(99, price + drift + noise));
    data.push({ x: now - i * step, y: Math.round(price * 10) / 10 });
  }
  // Ensure last point matches current
  data[data.length - 1].y = currentPrice;
  return data;
}

function generateVolumeHistory(baseVol, points, stepMs) {
  const step = stepMs || 60000;
  const data = [];
  const now = Date.now();
  for (let i = points; i >= 0; i--) {
    const v = baseVol * (0.3 + Math.random() * 1.4);
    data.push({ x: now - i * step, y: Math.round(v) });
  }
  return data;
}

// Determine which platforms a market is available on
function marketPlatforms(market) {
  const hasPoly = market.polyPrice != null || market._clobTokenId;
  const hasKalshi = market.kalshiPrice != null || market._kalshiTicker;
  return { hasPoly, hasKalshi };
}

window.openMarketDetail = function(short) {
  const market = charting.edgeData.find(e => e.short === short);
  if (!market) return;

  // Auto-detect correct platform based on availability
  const { hasPoly, hasKalshi } = marketPlatforms(market);
  let defaultPlat;
  if (hasPoly && hasKalshi) {
    // Both available — prefer source platform
    defaultPlat = market.source === 'kalshi' ? 'kalshi' : 'polymarket';
  } else if (hasKalshi) {
    defaultPlat = 'kalshi';
  } else {
    defaultPlat = 'polymarket';
  }

  // Store current market for platform toggle re-renders
  charting._mdMarket = market;
  charting._mdPlatform = defaultPlat;

  renderMarketDetailForPlatform(market, defaultPlat);

  // Wire platform toggle (once) — now uses tvPlatTabs
  const platTabs = document.getElementById('tvPlatTabs');
  if (platTabs && !platTabs._wired) {
    platTabs._wired = true;
    platTabs.addEventListener('click', e => {
      const btn = e.target.closest('.tv-plat-btn');
      if (!btn) return;
      const plat = btn.dataset.mdplat;
      const m = charting._mdMarket;
      if (!m) return;

      // Check if market is available on the requested platform
      const avail = marketPlatforms(m);
      if (plat === 'polymarket' && !avail.hasPoly) {
        showPlatformUnavailable('Polymarket', 'Kalshi');
        return;
      }
      if (plat === 'kalshi' && !avail.hasKalshi) {
        showPlatformUnavailable('Kalshi', 'Polymarket');
        return;
      }

      platTabs.querySelectorAll('.tv-plat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      charting._mdPlatform = plat;
      renderMarketDetailForPlatform(m, plat);
    });
  }

  // Highlight the correct default platform tab and dim unavailable
  if (platTabs) {
    platTabs.querySelectorAll('.tv-plat-btn').forEach(b => {
      b.classList.remove('active', 'tv-plat-btn--unavail');
    });
    const defBtn = platTabs.querySelector(`[data-mdplat="${defaultPlat}"]`);
    if (defBtn) defBtn.classList.add('active');
    // Dim the button for unavailable platform
    if (!hasPoly) {
      const polyBtn = platTabs.querySelector('[data-mdplat="polymarket"]');
      if (polyBtn) polyBtn.classList.add('tv-plat-btn--unavail');
    }
    if (!hasKalshi) {
      const kalshiBtn = platTabs.querySelector('[data-mdplat="kalshi"]');
      if (kalshiBtn) kalshiBtn.classList.add('tv-plat-btn--unavail');
    }
  }

  // Highlight active item in watchlist
  document.querySelectorAll('.tv-wl-item').forEach(el => {
    el.classList.toggle('active', el.textContent.includes(short));
  });
};

// Show message when user tries to switch to unavailable platform
function showPlatformUnavailable(unavailName, availName) {
  const chartEl = document.getElementById('tvMainChart');
  if (!chartEl) return;
  // Show overlay message briefly
  const overlay = document.createElement('div');
  overlay.className = 'tv-plat-unavail-msg';
  overlay.innerHTML = `This contract is only available on <b>${availName}</b>`;
  chartEl.style.position = 'relative';
  chartEl.appendChild(overlay);
  setTimeout(() => overlay.remove(), 2500);
}

function renderMarketDetailForPlatform(market, plat) {
  // Determine price based on platform
  let price, label, chartColor;
  if (plat === 'polymarket' && market.polyPrice != null) {
    price = market.polyPrice;
    label = 'Polymarket';
    chartColor = '#a78bfa';
  } else if (plat === 'kalshi' && market.kalshiPrice != null) {
    price = market.kalshiPrice;
    label = 'Kalshi';
    chartColor = '#5b9cf6';
  } else if (market.polyPrice != null) {
    price = market.polyPrice;
    label = 'Polymarket';
    chartColor = '#a78bfa';
  } else {
    price = market.kalshiPrice || market.price;
    label = 'Kalshi';
    chartColor = '#5b9cf6';
  }

  const changeNum = parseFloat(market.change) || 0;

  // Symbol bar (TradingView inline header)
  const tickerEl = document.getElementById('tvSymbolTicker');
  const nameEl = document.getElementById('tvSymbolName');
  const priceEl = document.getElementById('tvSymbolPrice');
  const changeEl = document.getElementById('tvSymbolChange');
  const sourceEl = document.getElementById('tvSymbolSource');

  const noPrice = Math.round(100 - price);

  if (tickerEl) tickerEl.textContent = market.short;
  if (nameEl) nameEl.textContent = market.name;
  if (priceEl) priceEl.innerHTML = `<span class="tv-yes-tag">YES</span> ${price}c <span class="tv-price-sep">/</span> <span class="tv-no-tag">NO</span> ${noPrice}c`;
  if (changeEl) {
    changeEl.textContent = (changeNum >= 0 ? '+' : '') + changeNum.toFixed(1) + 'c';
    changeEl.className = 'tv-symbol-change ' + (changeNum >= 0 ? 'up' : 'down');
  }
  if (sourceEl) {
    sourceEl.textContent = label;
    sourceEl.setAttribute('data-src', plat);
  }

  // Stats bar — show Yes/No for each platform
  const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  if (market.polyPrice != null) {
    const polyNo = Math.round(100 - market.polyPrice);
    setEl('tvStatPoly', `<span class="tv-yn">Y:</span>${market.polyPrice}c <span class="tv-yn">N:</span>${polyNo}c`);
  } else {
    setEl('tvStatPoly', '\u2014');
  }
  if (market.kalshiPrice != null) {
    const kalshiNo = Math.round(100 - market.kalshiPrice);
    setEl('tvStatKalshi', `<span class="tv-yn">Y:</span>${market.kalshiPrice}c <span class="tv-yn">N:</span>${kalshiNo}c`);
  } else {
    setEl('tvStatKalshi', '\u2014');
  }
  const spread = (market.polyPrice != null && market.kalshiPrice != null)
    ? Math.abs(market.polyPrice - market.kalshiPrice) : null;
  setEl('tvStatSpread', spread != null ? spread + 'c' : '\u2014');
  setEl('tvStatVol', market.vol || '\u2014');
  setEl('tvStatImplied', price + '%');
  setEl('tvStatResolves', formatTimeToRes(market._endDate));
  const ev = ((price / 100) * (100 - price) - ((100 - price) / 100) * price).toFixed(1);
  setEl('tvStatEV', (ev >= 0 ? '+' : '') + ev + 'c');

  // Remove placeholder text
  const placeholder = document.querySelector('.tv-chart-placeholder');
  if (placeholder) placeholder.style.display = 'none';

  // Fetch and render chart
  const volNum = market._volNum || parseFloat((market.vol || '0').replace(/[$MK]/g, '')) * 1e6;
  _fetchAndRenderPriceChart(market, plat, price, changeNum, chartColor, volNum);
}

// ─── Chart state for market detail ──────────────────────────
let _mdChartType = 'candlestick'; // 'candlestick' or 'area'
let _mdChartTf = '5m';     // '1m','5m','15m','30m','1h' (candle interval)
let _mdCandleData = null;   // raw OHLC candles (if available)
let _mdLineData = null;     // line series [{x,y}]
let _mdVolumeData = null;   // volume series [{x,y}]
let _mdChartMeta = null;    // {market, plat, price, changeNum, chartColor, volNum}

// Wire up chart controls (TradingView toolbar IDs)
let _mdControlsWired = false;
function _wireChartControls() {
  if (_mdControlsWired) return;
  _mdControlsWired = true;

  // Chart type toggle (candlestick / area)
  const ctToggle = document.getElementById('tvChartTypeToggle');
  if (ctToggle) {
    ctToggle.addEventListener('click', e => {
      const btn = e.target.closest('.tv-ct-btn');
      if (!btn) return;
      ctToggle.querySelectorAll('.tv-ct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mdChartType = btn.dataset.ct;
      _renderMdChart();
    });
  }

  // Timeframe toggle
  const tfToggle = document.getElementById('tvChartTfToggle');
  if (tfToggle) {
    tfToggle.addEventListener('click', e => {
      const btn = e.target.closest('.tv-tf-btn');
      if (!btn) return;
      tfToggle.querySelectorAll('.tv-tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mdChartTf = btn.dataset.tf;
      if (_mdChartMeta) {
        const m = _mdChartMeta;
        _fetchAndRenderPriceChart(m.market, m.plat, m.price, m.changeNum, m.chartColor, m.volNum);
      }
    });
  }

  // Bottom panel tabs
  const bottomTabs = document.querySelector('.tv-bottom-tabs');
  if (bottomTabs) {
    bottomTabs.addEventListener('click', e => {
      const btn = e.target.closest('.tv-bottom-tab');
      if (!btn) return;
      bottomTabs.querySelectorAll('.tv-bottom-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panel = btn.dataset.bpanel;
      document.querySelectorAll('.tv-bottom-pane').forEach(p => p.classList.remove('active'));
      const target = document.getElementById('tvBp' + panel.charAt(0).toUpperCase() + panel.slice(1));
      if (target) target.classList.add('active');
    });
  }
}

// Async helper — fetches real historical data then renders price + volume charts
async function _fetchAndRenderPriceChart(market, plat, price, changeNum, chartColor, volNum) {
  _wireChartControls();
  _mdChartMeta = { market, plat, price, changeNum, chartColor, volNum };

  // Destroy previous charts
  if (charting.charts.marketDetail) {
    charting.charts.marketDetail.destroy();
    charting.charts.marketDetail = null;
  }
  if (charting.charts.marketDetailVol) {
    charting.charts.marketDetailVol.destroy();
    charting.charts.marketDetailVol = null;
  }

  // Show loading state
  const chartEl = document.getElementById('tvMainChart');
  if (chartEl) chartEl.innerHTML = '<div style="color:#555;font-size:11px;text-align:center;padding:60px 0;font-family:var(--mono)"><div style="display:inline-block;width:18px;height:18px;border:2px solid #222;border-top-color:#00c853;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:8px"></div><br>Loading chart\u2026</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';

  let priceHistory = [];
  let volumeHistory = [];
  let candleData = null; // raw OHLC for candlestick mode
  const LM = typeof MercuryLiveMarkets !== 'undefined' ? MercuryLiveMarkets : null;

  // Candle interval config — each key is a candle period (1m, 5m, 15m, 30m, 1h)
  // clobFidelity: CLOB API granularity (minutes), kalshiPeriod: Kalshi candle period (minutes)
  // clobInterval: how much raw data to fetch from CLOB API (1d, 1w, etc.)
  // lookbackMs: how far back to show (enough for ~100-150 candles)
  // NOTE: CLOB prices-history only supports: 1d, 1w, 1m, 3m, 6m, 1y, max
  const tfMap = {
    '1m':  { clobFidelity: 1,  kalshiPeriod: 1,  clobInterval: '1d',  lookbackMs: 60000 * 120 },      // 2h of 1m candles
    '5m':  { clobFidelity: 1,  kalshiPeriod: 5,  clobInterval: '1d',  lookbackMs: 60000 * 600 },      // 10h of 5m candles
    '15m': { clobFidelity: 1,  kalshiPeriod: 15, clobInterval: '1d',  lookbackMs: 60000 * 1500 },     // 25h of 15m candles
    '30m': { clobFidelity: 10, kalshiPeriod: 30, clobInterval: '1d',  lookbackMs: 60000 * 3600 },     // 2.5d of 30m candles
    '1h':  { clobFidelity: 60, kalshiPeriod: 60, clobInterval: '1w',  lookbackMs: 60000 * 60 * 168 }, // 7d of 1h candles
  };
  const tf = tfMap[_mdChartTf] || tfMap['5m'];
  const cutoff = Date.now() - tf.lookbackMs;

  // Generate OHLC candles from line data by bucketing into time intervals
  function lineToOHLC(points, bucketMs) {
    if (!points || points.length < 3) return null;
    const buckets = new Map();
    for (const p of points) {
      const key = Math.floor(p.x / bucketMs) * bucketMs;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p.y);
    }
    const sortedKeys = [...buckets.keys()].sort((a, b) => a - b);
    if (sortedKeys.length < 2) return null;

    const candles = [];
    let prevClose = null;
    // Walk every bucket from first to last so there are no time gaps
    const firstKey = sortedKeys[0];
    const lastKey = sortedKeys[sortedKeys.length - 1];
    for (let t = firstKey; t <= lastKey; t += bucketMs) {
      const prices = buckets.get(t);
      let open, close, high, low;

      if (prices && prices.length > 0) {
        open = prices[0];
        close = prices[prices.length - 1];
        high = Math.max(...prices);
        low = Math.min(...prices);
      } else if (prevClose != null) {
        // Fill empty bucket with previous close (no gap)
        open = close = high = low = prevClose;
      } else {
        continue;
      }

      // Ensure minimum body size so candles aren't invisible thin lines
      if (Math.abs(close - open) < 0.5) {
        const goingUp = prevClose != null ? close >= prevClose : close >= open;
        if (goingUp) {
          open = Math.round((close - 0.5) * 100) / 100;
        } else {
          open = Math.round((close + 0.5) * 100) / 100;
        }
      }
      open = Math.round(open * 100) / 100;
      close = Math.round(close * 100) / 100;
      prevClose = close;
      candles.push({ t, open, high: Math.max(high, open, close), low: Math.min(low, open, close), close, price: close, volume: 0 });
    }
    return candles.length >= 2 ? candles : null;
  }

  // Bucket size = candle interval (the TF buttons now represent candle period)
  const bucketMap = { '1m': 60000, '5m': 60000*5, '15m': 60000*15, '30m': 60000*30, '1h': 60000*60 };
  const bucketMs = bucketMap[_mdChartTf] || 60000*5;

  // Try real API data first (with 3s overall timeout to avoid blocking UI)
  try {
    const apiFetch = async () => {
      if (plat === 'polymarket' && market._clobTokenId && LM) {
        const hist = await LM.fetchPolyPriceHistory(market._clobTokenId, tf.clobInterval, tf.clobFidelity);
        if (hist.length >= 3) {
          const filtered = cutoff > 0 ? hist.filter(h => h.t >= cutoff) : hist;
          if (filtered.length >= 2) {
            priceHistory = filtered.map(h => ({ x: h.t, y: h.price }));
            candleData = lineToOHLC(priceHistory, bucketMs);
          }
        }
      }
      if (plat === 'kalshi' && market._kalshiTicker && LM) {
        const candles = await LM.fetchKalshiCandlesticks(market._kalshiTicker, tf.kalshiPeriod);
        if (candles.length >= 3) {
          const filtered = cutoff > 0 ? candles.filter(c => c.t >= cutoff) : candles;
          if (filtered.length >= 2) {
            candleData = filtered;
            priceHistory = filtered.map(c => ({ x: c.t, y: c.price }));
            volumeHistory = filtered.filter(c => c.volume > 0).map(c => ({ x: c.t, y: c.volume }));
          }
        }
        if (priceHistory.length < 2) {
          const trades = await LM.fetchKalshiTrades(market._kalshiTicker, 200);
          if (trades.length >= 3) {
            const all = trades.reverse().map(t => ({
              x: new Date(t.time).getTime(),
              y: t.price,
            })).filter(p => p.x > 0 && p.y > 0);
            const filteredTrades = cutoff > 0 ? all.filter(p => p.x >= cutoff) : all;
            if (filteredTrades.length >= 2) {
              priceHistory = filteredTrades;
              candleData = lineToOHLC(priceHistory, bucketMs);
            }
          }
        }
      }
    };
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Chart data timeout')), 3000));
    await Promise.race([apiFetch(), timeout]);
  } catch (e) {
    console.warn('[Mercury] Historical price fetch error:', e.message);
  }

  // Fallback: in-memory live snapshots
  if (priceHistory.length < 5 && LM) {
    const liveHist = LM.getPriceHistory(market.short);
    if (liveHist.length >= 3) {
      priceHistory = liveHist.map(h => ({ x: h.t, y: h.price }));
      if (!candleData) candleData = lineToOHLC(priceHistory, bucketMs);
    }
  }

  // Last resort: generated data — space points at half the candle interval
  const genStep = Math.max(30000, Math.floor(bucketMs / 2)); // at least 30s spacing
  const genPoints = Math.max(120, Math.ceil(tf.lookbackMs / genStep));
  if (priceHistory.length < 3) {
    priceHistory = generatePriceHistory(price, genPoints, genStep);
    if (!candleData) candleData = lineToOHLC(priceHistory, bucketMs);
  }
  if (volumeHistory.length < 3) {
    volumeHistory = generateVolumeHistory(volNum / genPoints, genPoints, genStep);
  }

  // Mark if real data
  const isReal = priceHistory.length >= 5 && priceHistory[0].x > 1e12;
  const dataLabel = document.getElementById('tvDataLabel');
  if (dataLabel) {
    dataLabel.textContent = isReal ? 'LIVE DATA' : '';
  }

  // Enable/disable candlestick button based on OHLC availability
  const candleBtn = document.querySelector('.tv-ct-btn[data-ct="candlestick"]');
  if (candleBtn) {
    candleBtn.disabled = !candleData;
    candleBtn.style.opacity = candleData ? '1' : '0.3';
    candleBtn.title = candleData ? 'Candlestick chart' : 'OHLC data not available for this market';
  }

  // If user requested candlestick but no OHLC, fall back to area
  if (_mdChartType === 'candlestick' && !candleData) {
    _mdChartType = 'area';
    const areaBtn = document.querySelector('.tv-ct-btn[data-ct="area"]');
    if (areaBtn) {
      document.querySelectorAll('.tv-ct-btn').forEach(b => b.classList.remove('active'));
      areaBtn.classList.add('active');
    }
  }

  // Store for re-render on type toggle
  _mdCandleData = candleData;
  _mdLineData = priceHistory;
  _mdVolumeData = volumeHistory;

  _renderMdChart();
}

// Render the market detail chart (called on initial load + type/tf toggle)
function _renderMdChart() {
  if (!_mdChartMeta) return;
  const { changeNum, chartColor } = _mdChartMeta;
  const plat = _mdChartMeta.plat;

  // Destroy previous
  if (charting.charts.marketDetail) {
    charting.charts.marketDetail.destroy();
    charting.charts.marketDetail = null;
  }
  if (charting.charts.marketDetailVol) {
    charting.charts.marketDetailVol.destroy();
    charting.charts.marketDetailVol = null;
  }

  const chartEl = document.getElementById('tvMainChart');
  if (!chartEl) return;
  chartEl.innerHTML = '';

  const lineColor = chartColor || (changeNum >= 0 ? '#00c853' : '#ff1744');
  const seriesName = plat === 'polymarket' ? 'Polymarket' : plat === 'kalshi' ? 'Kalshi' : 'Price';

  const useCandlestick = _mdChartType === 'candlestick' && _mdCandleData && _mdCandleData.length >= 2;

  if (useCandlestick) {
    // ── Candlestick chart ──
    const ohlcSeries = _mdCandleData.map(c => ({
      x: c.t,
      y: [c.open, c.high, c.low, c.close],
    }));

    const allPrices = _mdCandleData.flatMap(c => [c.open, c.high, c.low, c.close]).filter(p => p > 0);
    const priceMin = Math.min(...allPrices);
    const priceMax = Math.max(...allPrices);
    const priceRange = priceMax - priceMin;
    const pad = Math.max(2, priceRange * 0.15);
    const chartOpts = {
      chart: {
        type: 'candlestick',
        height: '100%',
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: true, type: 'x' },
        animations: { enabled: true, speed: 400 },
      },
      series: [{ name: seriesName, data: ohlcSeries }],
      plotOptions: {
        bar: { columnWidth: '92%' },
        candlestick: {
          colors: { upward: '#00c853', downward: '#ff1744' },
          wick: { useFillColor: true },
        },
      },
      stroke: { width: 1 },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#666', fontFamily: 'JetBrains Mono', fontSize: '9px' },
          datetimeFormatter: {
            minute: 'HH:mm',
            hour: 'HH:mm',
            day: _mdChartTf === '1h' ? 'MMM dd HH:mm' : 'HH:mm',
            month: "MMM 'yy",
          },
        },
        axisBorder: { color: '#222' },
        axisTicks: { show: false },
      },
      yaxis: {
        min: Math.max(0, priceMin - pad),
        max: Math.min(100, priceMax + pad),
        tickAmount: 6,
        labels: {
          style: { colors: '#666', fontFamily: 'JetBrains Mono', fontSize: '9px' },
          formatter: v => v.toFixed(0) + 'c',
        },
      },
      grid: { borderColor: '#1a1a1a', strokeDashArray: 3, padding: { left: 8, right: 8, top: 4, bottom: 4 } },
      tooltip: {
        theme: 'dark',
        style: { fontFamily: 'JetBrains Mono', fontSize: '11px' },
        custom: function({ seriesIndex, dataPointIndex, w }) {
          const o = w.globals.seriesCandleO[seriesIndex][dataPointIndex];
          const h = w.globals.seriesCandleH[seriesIndex][dataPointIndex];
          const l = w.globals.seriesCandleL[seriesIndex][dataPointIndex];
          const c = w.globals.seriesCandleC[seriesIndex][dataPointIndex];
          const up = c >= o;
          const color = up ? '#00c853' : '#ff1744';
          const ts = w.globals.seriesX[seriesIndex][dataPointIndex];
          const date = new Date(ts);
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
          return `<div style="padding:8px 12px;font-family:JetBrains Mono,monospace;font-size:11px;line-height:1.6">
            <div style="color:#888;margin-bottom:4px">${dateStr}</div>
            <div>O: <b>${o.toFixed(1)}c</b></div>
            <div>H: <b>${h.toFixed(1)}c</b></div>
            <div>L: <b>${l.toFixed(1)}c</b></div>
            <div>C: <b style="color:${color}">${c.toFixed(1)}c</b></div>
          </div>`;
        },
      },
      dataLabels: { enabled: false },
    };
    charting.charts.marketDetail = new ApexCharts(chartEl, chartOpts);
    charting.charts.marketDetail.render();
  } else {
    // ── Area/line chart ──
    const priceHistory = _mdLineData || [];
    const pVals = priceHistory.map(p => p.y);
    const pMin = Math.min(...pVals);
    const pMax = Math.max(...pVals);
    const pRange = pMax - pMin;
    const pPad = Math.max(3, pRange * 0.12);
    const chartOpts = {
      chart: {
        type: 'area',
        height: '100%',
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: true, type: 'x' },
        animations: { enabled: true, speed: 600 },
      },
      series: [{ name: seriesName, data: priceHistory }],
      stroke: { curve: 'smooth', width: 2.5 },
      colors: [lineColor],
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#666', fontFamily: 'JetBrains Mono', fontSize: '9px' },
          datetimeFormatter: { minute: 'HH:mm', hour: 'HH:mm', day: _mdChartTf === '1h' ? 'MMM dd HH:mm' : 'HH:mm', month: "MMM 'yy" },
        },
        axisBorder: { color: '#222' },
        axisTicks: { show: false },
      },
      yaxis: {
        min: Math.max(0, pMin - pPad),
        max: Math.min(100, pMax + pPad),
        tickAmount: 6,
        labels: {
          style: { colors: '#666', fontFamily: 'JetBrains Mono', fontSize: '9px' },
          formatter: v => v.toFixed(0) + 'c',
        },
      },
      grid: { borderColor: '#1a1a1a', strokeDashArray: 3, padding: { left: 8, right: 8, top: 4, bottom: 4 } },
      tooltip: {
        theme: 'dark',
        x: { format: 'MMM dd HH:mm' },
        y: { formatter: v => v.toFixed(1) + 'c' },
        style: { fontFamily: 'JetBrains Mono', fontSize: '11px' },
      },
      dataLabels: { enabled: false },
    };
    charting.charts.marketDetail = new ApexCharts(chartEl, chartOpts);
    charting.charts.marketDetail.render();
  }

  // Volume mini-chart
  const volChartEl = document.getElementById('tvVolChart');
  const volumeHistory = _mdVolumeData || [];
  if (volChartEl && volumeHistory.length > 0) {
    volChartEl.innerHTML = '';
    const volOpts = {
      chart: {
        type: 'bar', height: 56, background: 'transparent',
        toolbar: { show: false }, sparkline: { enabled: true },
        animations: { enabled: true, speed: 400 },
      },
      series: [{ name: 'Volume', data: volumeHistory }],
      plotOptions: { bar: { columnWidth: '90%' } },
      colors: ['rgba(255,255,255,0.12)'],
      xaxis: { type: 'datetime', labels: { show: false }, axisBorder: { show: false } },
      yaxis: { labels: { show: false } },
      grid: { show: false },
      tooltip: { enabled: false },
      dataLabels: { enabled: false },
    };
    charting.charts.marketDetailVol = new ApexCharts(volChartEl, volOpts);
    charting.charts.marketDetailVol.render();
  }
}

window.closeMarketDetail = function() {
  // No modal to close — chart is inline. Just clear selection.
  charting._mdMarket = null;
  document.querySelectorAll('.tv-wl-item').forEach(el => el.classList.remove('active'));
  if (charting.charts.marketDetail) {
    charting.charts.marketDetail.destroy();
    charting.charts.marketDetail = null;
  }
  if (charting.charts.marketDetailVol) {
    charting.charts.marketDetailVol.destroy();
    charting.charts.marketDetailVol = null;
  }
};

