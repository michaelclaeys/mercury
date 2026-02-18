/* ================================================================
   MERCURY RESEARCH — Edge-Finding Platform + Terminal
   Research: edge scanner, market scanner, news feed
   Terminal: order book, volume, bot logs, chat
   ================================================================ */

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════

const research = {
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

const RESEARCH_MARKETS = [
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
  { name: 'Trump 2028 Nominee', short: 'TRUMP28', price: 34, vol: '$4.2M', polyPrice: 34, kalshiPrice: 37, tf: '1Y' },
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
  { name: 'Super Bowl Winner', short: 'SB', price: 55, vol: '$12.1M', polyPrice: 55, kalshiPrice: 54, tf: '1W' },
  { name: 'NBA Champion 2026', short: 'NBA26', price: 31, vol: '$7.8M', polyPrice: 31, kalshiPrice: 33, tf: '1Y' },
  { name: 'NBA MVP 2026', short: 'NBAMVP', price: 38, vol: '$3.2M', polyPrice: 38, kalshiPrice: 36, tf: '1Y' },
  { name: 'World Cup 2026 Winner', short: 'WC26', price: 18, vol: '$14.2M', polyPrice: 18, kalshiPrice: 20, tf: '1Y' },
  { name: 'World Cup 2026 Top Scorer', short: 'WCTOP', price: 12, vol: '$4.8M', polyPrice: 12, kalshiPrice: 14, tf: '1Y' },
  { name: 'MLB World Series 2026', short: 'MLB26', price: 14, vol: '$3.4M', polyPrice: 14, kalshiPrice: 16, tf: '1Y' },
  { name: 'UFC 310 Main Event', short: 'UFC310', price: 58, vol: '$1.8M', polyPrice: 58, kalshiPrice: 56, tf: '1W' },
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
  { name: 'Gold > $2500/oz', short: 'GOLD25', price: 71, vol: '$2.3M', polyPrice: 71, kalshiPrice: 69, tf: '1M' },
  { name: 'Gold > $3000/oz', short: 'GOLD30', price: 28, vol: '$1.7M', polyPrice: 28, kalshiPrice: 30, tf: '1Y' },
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

// ═══════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════

function initResearchDashboard() {
  if (research.isActive) return;
  research.isActive = true;
  research.initializedTabs = {};

  // Show tutorial for first-time visitors
  maybeShowResearchTutorial();

  initResearchTabs();
  initTicker();
  initKillSwitch();
  startResearchClock();

  // Init Edge Scanner (default tab, visible immediately)
  initEdgeScanner();

  // Start live data connection
  initLiveDataConnection();
}

function maybeShowResearchTutorial() {
  if (localStorage.getItem('mercury_research_tutorial_done')) return;
  const overlay = document.getElementById('researchTutorial');
  if (!overlay) return;
  overlay.classList.add('active');

  const closeBtn = document.getElementById('researchTutorialClose');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    dismissResearchTutorial();
    startResearchTour(true);
  });
}

function dismissResearchTutorial() {
  const overlay = document.getElementById('researchTutorial');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_research_tutorial_done', '1');
}

function startResearchTour(force) {
  console.log('[Research Tour] startResearchTour called, force =', !!force);
  if (!force && localStorage.getItem('mercury_research_tour_done')) {
    console.log('[Research Tour] Already completed — skipping');
    return;
  }
  if (!window.MercuryTour) {
    console.log('[Research Tour] MercuryTour engine not loaded');
    return;
  }

  // Clear previous completion if forcing
  if (force) {
    localStorage.removeItem('mercury_research_tour_done');
  }

  // Make sure we're on the Overview tab so tour elements are visible
  switchResearchTab('edge');

  setTimeout(() => {
    const tour = window.MercuryTour.create({
      steps: [
        {
          selector: '#researchTopbar',
          title: 'Live Status Bar',
          text: 'Real-time ticker tape scrolling every tracked market. The clock shows UTC time and the Kill All button instantly halts all running bots in an emergency.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '#researchTabBar',
          title: 'Research Tabs',
          text: 'Six specialized views: Overview for edge scanning, Crypto for BTC/ETH markets, Markets for the full contract scanner, News for live market headlines, Bonding Arb for risk-free yield, and Terminal for execution.',
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
          selector: '#rtab-edge .research-scroll',
          title: 'Markets & Spreads',
          text: 'Top markets by volume and a live cross-platform comparison table. Click any market card to see full price history, volume charts, and probability timelines. Watch for 3c+ spreads — potential arbitrage.',
          position: 'top',
          padding: 6,
        },
        {
          selector: '.research-tab[data-rtab="crypto"]',
          title: 'Crypto Dashboard',
          text: 'Live BTC and ETH prices from Binance, plus 15-min and 1-hour crypto prediction markets on Kalshi and Polymarket with cross-platform spread detection.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.research-tab[data-rtab="markets"]',
          title: 'Market Scanner',
          text: 'Full sortable table of every contract we track. Sort by divergence, volume, 24h change, or name. Click any row to drill into detailed stats and historical data.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.research-tab[data-rtab="news"]',
          title: 'News',
          text: 'Live news feed from Reuters, Bloomberg, and crypto sources with sentiment tags.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.research-tab[data-rtab="bonding"]',
          title: 'Bonding Arb',
          text: 'Find near-certain outcomes (95-99c) close to resolution. Buy at 97c, collect $1 when it resolves — like a short-term bond. Sort by annualized yield to find the best risk-free returns.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '.research-tab[data-rtab="terminal"]',
          title: 'Terminal',
          text: 'Full execution dashboard: live order book, volume heatmap, trade logs, and an AI research chat. Ask it anything — "what\'s the edge on BTC?", "show biggest spreads", "find underpriced contracts".',
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
      storageKey: 'mercury_research_tour_done',
    });
    tour.start();
  }, 600);
}

// Expose for manual console use (no-arg wrapper that forces)
window.rerunResearchTour = function() { startResearchTour(true); };

// Reset and immediately re-show tutorial + tour
window.resetResearchTutorial = function() {
  localStorage.removeItem('mercury_research_tutorial_done');
  localStorage.removeItem('mercury_research_tour_done');
  // Immediately show the tutorial overlay if we're on Research
  const overlay = document.getElementById('researchTutorial');
  if (overlay) {
    overlay.classList.add('active');
    console.log('[Mercury] Research tutorial re-shown');
  } else {
    console.log('[Mercury] Research tutorial reset — navigate to Research to see it');
  }
};

function teardownResearchDashboard() {
  if (!research.isActive) return;
  research.isActive = false;

  // Clear ALL intervals (global + tab)
  research.intervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  research.intervals = [];
  research.tabIntervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  research.tabIntervals = [];

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
  research.activeTab = 'edge';
}

// Global interval — persists across tab switches (ticker, clock, live polling)
function addResearchInterval(fn, ms) {
  research.intervals.push(setInterval(fn, ms));
}

// Tab-scoped interval — cleared when switching to a different tab
function addTabInterval(fn, ms) {
  research.tabIntervals.push(setInterval(fn, ms));
}

// Clear only tab-scoped intervals (called on tab switch)
function clearTabIntervals() {
  research.tabIntervals.forEach(id => { clearInterval(id); clearTimeout(id); });
  research.tabIntervals = [];
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
  if (tabName === research.activeTab) return; // No-op if same tab

  // ── Clear previous tab's intervals + mark for re-init ──
  clearTabIntervals();
  if (research.activeTab) {
    research.initializedTabs[research.activeTab] = false;
  }

  // Destroy tab-scoped charts to free memory
  if (research.activeTab === 'terminal') {
    if (research.charts.volume) { research.charts.volume.destroy(); research.charts.volume = null; }
  }

  research.activeTab = tabName;

  document.querySelectorAll('.research-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.rtab === tabName);
  });
  document.querySelectorAll('.research-tab-panel').forEach(p => {
    p.classList.toggle('active', p.id === 'rtab-' + tabName);
  });

  // Init the new tab (re-creates its intervals fresh)
  if (tabName === 'markets' && !research.initializedTabs.markets) {
    research.initializedTabs.markets = true;
    initMarketScanner();
  }
  if (tabName === 'news' && !research.initializedTabs.news) {
    research.initializedTabs.news = true;
    initNewsFeed();
    initBiggestMovers();
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

  // Start with mock data for instant render, replaced by live when available
  research.tickerData = RESEARCH_MARKETS.map(m => ({
    name: m.short,
    price: m.price,
    delta: '0.0',
    _prevPrice: m.price,
  }));

  let tickerBuilt = false; // track whether DOM has been built

  // Build DOM elements once — never replace innerHTML again (prevents animation snap)
  function buildTicker() {
    const items = [...research.tickerData, ...research.tickerData];
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
    const data = research.tickerData;
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
    if (!research.liveMarkets || !research.edgeData || research.edgeData.length === 0) return;
    const prevLen = research.tickerData.length;
    const live = research.edgeData.slice(0, 40).map(m => {
      const prev = research.tickerData.find(t => t.name === m.short);
      const prevPrice = prev ? prev.price : m.price;
      const delta = m.change || (m.price - prevPrice).toFixed(1);
      return { name: m.short, price: m.price, delta: String(delta), _prevPrice: prevPrice };
    });
    if (live.length > 0) research.tickerData = live;
    // Rebuild DOM only if item count changed (first live load), otherwise update in-place
    if (live.length !== prevLen || !tickerBuilt) {
      buildTicker();
    } else {
      updateTickerInPlace();
    }
  }

  // Check for live data every 5s — if live, use real; if not, do small random drift
  addResearchInterval(() => {
    if (research.liveMarkets) {
      refreshTickerFromLive();
    } else {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const idx = Math.floor(Math.random() * research.tickerData.length);
        const t = research.tickerData[idx];
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
  research.edgeTimeframe = 'all';
  research.edgePlatform = 'all';
  research.edgeSearch = '';
  research.edgeCategory = 'all';
  research.edgeSort = 'volume';
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

  // Platform filter buttons
  const platTabs = document.getElementById('edgePlatformTabs');
  if (platTabs) {
    platTabs.addEventListener('click', e => {
      const btn = e.target.closest('.plat-btn');
      if (!btn) return;
      platTabs.querySelectorAll('.plat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      research.edgePlatform = btn.dataset.plat;
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
        research.edgeSearch = searchInput.value.trim().toLowerCase();
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
      research.edgeCategory = catSelect.value;
      renderEdgeCards();
    });
  }

  // Sort select
  const sortSelect = document.getElementById('edgeSortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      research.edgeSort = sortSelect.value;
      renderEdgeCards();
    });
  }

  renderEdgeCards();
  renderArbTable();
  updateResearchMetrics();

  // Init bonding arb section (now inline in overview)
  initBondingArb();

  // Try live public APIs first — Polymarket + Kalshi
  loadLivePublicMarkets();
  addResearchInterval(loadLivePublicMarkets, 30000);

  // Also try bridge (localhost engine) as secondary source
  loadLiveMarkets();
  addResearchInterval(loadLiveMarkets, 60000);

  // Simulate price shifts for mock data only (when live APIs are offline)
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
  }, 15000);
}

// ═══════════════════════════════════════════════════════════════
// LIVE PUBLIC API LOADING (Polymarket + Kalshi)
// ═══════════════════════════════════════════════════════════════

async function loadLivePublicMarkets() {
  if (!research.isActive) return;
  if (typeof MercuryLiveMarkets === 'undefined') return;

  try {
    const markets = await MercuryLiveMarkets.fetchAllMarkets();
    if (!markets || markets.length === 0) return;

    console.log(`[Mercury] Live data: ${markets.length} markets from Polymarket + Kalshi`);
    research.liveMarkets = true;

    // Store previous prices for delta calculation
    const prevPrices = {};
    research.edgeData.forEach(e => { prevPrices[e.short] = e.price; });

    research.edgeData = markets.map(m => {
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
    research.arbData = research.edgeData
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
    research.tickerData = research.edgeData.slice(0, 60).map(m => ({
      name: m.short,
      price: m.price,
      delta: m.change,
    }));
    const track = document.getElementById('tickerTrack');
    if (track) renderLiveTicker(track);

    renderEdgeCards();
    renderArbTable();
    updateResearchMetrics();
  } catch (e) {
    console.warn('[Mercury] Live market load failed:', e.message);
  }
}

function renderLiveTicker(track) {
  // Update existing DOM in-place to preserve CSS animation (no innerHTML rebuild)
  const spans = track.querySelectorAll('.ticker-item');
  const data = research.tickerData;
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

function updateResearchMetrics() {
  const mktCount = research.edgeData.length;
  const totalVol = research.edgeData.reduce((s, e) => s + (e._volNum || 0), 0);
  const topSpread = research.arbData.length > 0 ? research.arbData[0].spread : 0;

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
  if (moverEl && research.edgeData.length > 0) {
    const sorted = [...research.edgeData]
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

  // Show/hide LIVE badge
  const liveBadge = document.getElementById('edgeLiveBadge');
  if (liveBadge) liveBadge.style.display = research.liveMarkets ? 'inline-block' : 'none';
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
  const container = document.getElementById('edgeResearchCards');
  if (!container) return;

  // Filter by timeframe
  const tf = research.edgeTimeframe || 'all';
  let filtered = tf === 'all'
    ? [...research.edgeData]
    : research.edgeData.filter(e => e.tf === tf);

  // Filter by platform
  const plat = research.edgePlatform || 'all';
  if (plat === 'polymarket') {
    filtered = filtered.filter(e => e.polyPrice != null);
  } else if (plat === 'kalshi') {
    filtered = filtered.filter(e => e.kalshiPrice != null);
  }

  // Filter by search query
  const searchQ = research.edgeSearch || '';
  if (searchQ) {
    filtered = filtered.filter(e =>
      (e.name || '').toLowerCase().includes(searchQ) ||
      (e.short || '').toLowerCase().includes(searchQ)
    );
  }

  // Filter by category
  const cat = research.edgeCategory || 'all';
  if (cat !== 'all') {
    filtered = filtered.filter(e => classifyMarketCategory(e.name) === cat);
  }

  // Sort
  const sortMode = research.edgeSort || 'volume';
  let sorted;
  if (sortMode === 'spread') {
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

  let html = `<div class="edge-table-header">
    <span class="edge-col">Market</span>
    <span class="edge-col">Price</span>
    <span class="edge-col">Resolves</span>
    <span class="edge-col">Volume</span>
    <span class="edge-col">Source</span>
    <span class="edge-col">Poly</span>
    <span class="edge-col">Kalshi</span>
    <span class="edge-col">Spread</span>
  </div>`;

  if (sorted.length === 0) {
    const emptyMsg = searchQ ? 'No markets matching \u201c' + esc(searchQ) + '\u201d' : 'No markets in this filter';
    html += `<div style="padding: 12px 16px; color: var(--dim); font-size: 10px;">${emptyMsg}</div>`;
  } else {
    html += sorted.map(e => {
      const polyStr = e.polyPrice != null ? `${e.polyPrice}c` : '\u2014';
      const kalshiStr = e.kalshiPrice != null ? `${e.kalshiPrice}c` : '\u2014';
      const spread = (e.polyPrice != null && e.kalshiPrice != null)
        ? Math.abs(e.polyPrice - e.kalshiPrice) : null;
      const spreadStr = spread != null ? `${spread}c` : '\u2014';
      let sourceTag, sourceClass;
      if (e.polyPrice != null && e.kalshiPrice != null) {
        sourceTag = 'P+K'; sourceClass = 'edge-source-both';
      } else if (e.source === 'kalshi') {
        sourceTag = 'K'; sourceClass = 'edge-source-kalshi';
      } else if (e.source === 'polymarket') {
        sourceTag = 'P'; sourceClass = 'edge-source-polymarket';
      } else {
        sourceTag = research.liveMarkets ? '\u25cf' : (e.change || '\u2014');
        sourceClass = research.liveMarkets ? 'edge-source-live' : 'edge-source-mock';
      }

      const safeShort = (e.short || '').replace(/'/g, "\\'");

      // Event row with expandable sub-markets
      if (e.isEvent && e.subMarkets && e.subMarkets.length > 1) {
        const eventId = 'evt_' + safeShort;
        const resolves = formatTimeToRes(e._endDate);
        let rowHtml = `<div class="edge-row edge-row--event" data-event-id="${eventId}" onclick="toggleEventSubs('${eventId}')">
          <span class="edge-row-name">
            <span class="edge-expand-icon">\u25B6</span>
            ${esc(e.name)}
            <span class="edge-sub-count">${e.subCount} mkts</span>
            <span class="edge-row-short">${esc(e.short)}</span>
          </span>
          <span class="edge-row-val">${displayPrice(e)}c</span>
          <span class="edge-row-val edge-row-resolves">${resolves}</span>
          <span class="edge-row-vol-val">${e.vol}</span>
          <span class="edge-row-val ${sourceClass}">${sourceTag}</span>
          <span class="edge-row-val">${polyStr}</span>
          <span class="edge-row-val">${kalshiStr}</span>
          <span class="edge-row-spread ${spread >= 2 ? 'notable' : ''}">${spreadStr}</span>
        </div>`;

        // Sub-market rows (hidden by default)
        rowHtml += `<div class="edge-sub-container" id="${eventId}">`;
        const subs = [...e.subMarkets].sort((a, b) => b.price - a.price).slice(0, 20);
        rowHtml += subs.map(sm => {
          const smPolyStr = sm.source === 'polymarket' ? sm.price + 'c' : (sm.polyPrice != null ? sm.polyPrice + 'c' : '\u2014');
          const smKalshiStr = sm.source === 'kalshi' ? sm.price + 'c' : (sm.kalshiPrice != null ? sm.kalshiPrice + 'c' : '\u2014');
          const smSrc = sm.source === 'kalshi' ? 'K' : (sm.kalshiPrice != null && sm.source === 'polymarket' ? 'P+K' : 'P');
          const smSrcClass = smSrc === 'P+K' ? 'edge-source-both' : (sm.source === 'kalshi' ? 'edge-source-kalshi' : 'edge-source-polymarket');
          return `<div class="edge-sub-row">
            <span class="edge-row-name">${esc(sm.name)}</span>
            <span class="edge-row-val">${sm.price}c</span>
            <span class="edge-row-vol-val">${sm.vol || '\u2014'}</span>
            <span class="edge-row-val ${smSrcClass}">${smSrc}</span>
            <span class="edge-row-val">${smPolyStr}</span>
            <span class="edge-row-val">${smKalshiStr}</span>
            <span class="edge-row-spread">\u2014</span>
          </div>`;
        }).join('');
        if (e.subCount > 20) {
          rowHtml += `<div class="edge-sub-row" style="justify-content:center;color:var(--dim);font-size:9px;">+ ${e.subCount - 20} more outcomes</div>`;
        }
        rowHtml += '</div>';
        return rowHtml;
      }

      // Regular flat market row
      const resolves = formatTimeToRes(e._endDate);
      return `<div class="edge-row" onclick="openMarketDetail('${safeShort}');" style="cursor:pointer;">
        <span class="edge-row-name">${esc(e.name)} <span class="edge-row-short">${esc(e.short)}</span></span>
        <span class="edge-row-val">${displayPrice(e)}c</span>
        <span class="edge-row-val edge-row-resolves">${resolves}</span>
        <span class="edge-row-vol-val">${e.vol}</span>
        <span class="edge-row-val ${sourceClass}">${sourceTag}</span>
        <span class="edge-row-val">${polyStr}</span>
        <span class="edge-row-val">${kalshiStr}</span>
        <span class="edge-row-spread ${spread >= 2 ? 'notable' : ''}">${spreadStr}</span>
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
  addTabInterval(pollCryptoData, 10000);
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

  addTabInterval(() => {
    if (research.liveMarkets) return; // Skip mock drift when live
    research.marketData.forEach(m => {
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
  if (!research.edgeData || research.edgeData.length === 0) {
    body.innerHTML = '<div class="mover-empty">Waiting for market data...</div>';
    return;
  }

  // Sort by absolute change, take top movers
  const sorted = [...research.edgeData]
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

  addTabInterval(() => {
    buyData.shift(); sellData.shift(); categories.shift();
    const t = new Date();
    categories.push(t.getHours() + ':' + String(t.getMinutes()).padStart(2, '0'));
    buyData.push(Math.floor(Math.random() * 400 + 100));
    sellData.push(-Math.floor(Math.random() * 350 + 80));
    if (research.charts.volume) {
      research.charts.volume.updateOptions({ xaxis: { categories } });
      research.charts.volume.updateSeries([{ data: buyData }, { data: sellData }]);
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

function initResearchLogs() {
  const container = document.getElementById('researchLogs');
  if (!container) return;

  // Seed with mock logs
  for (let i = 0; i < 15; i++) {
    appendResearchLog(container, false);
  }

  // Mock log generation — fixed interval instead of recursive setTimeout chain
  addTabInterval(() => {
    if (!research.isActive) return;
    appendResearchLog(container, true);
  }, 2500);

  // Also poll live bot logs if bridge is up
  if (research.liveConnected) {
    addTabInterval(pollLiveBotLogs, 5000);
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
    response = 'Market correlations (estimated):\n\n+0.72: Fed Rate Cut / BTC > $100K\n+0.68: Fed Rate Cut Jun / ETH > $5K\n+0.61: AI Regulation / Nvidia > $200\n+0.58: S&P 6000 / US GDP > 3%\n-0.54: Recession 2027 / BTC > $100K\n-0.51: Oil > $100 / US EV Sales > 30%\n-0.48: US Debt Ceiling / SpaceX Mars\n+0.45: Trump 2028 / Recession 2027\n+0.42: Gold > $2500 / 10Y Treasury > 5%\n-0.39: Government Shutdown / S&P 6000\n\nTracking correlations across ' + (research.edgeData ? research.edgeData.length : RESEARCH_MARKETS.length) + ' markets. When correlated markets move out of sync, it may signal a trading opportunity.';
  } else {
    const mktCount = research.edgeData ? research.edgeData.length : RESEARCH_MARKETS.length;
    const totalVol = research.edgeData
      ? research.edgeData.reduce((s, e) => s + (e._volNum || 0), 0)
      : RESEARCH_MARKETS.reduce((s, m) => s + parseFloat(m.vol.replace(/[$M]/g, '')), 0);
    response = `Market overview:\n\n${mktCount} markets tracked | Combined volume: $${totalVol.toFixed(1)}M/24h\n\nAsk about specific markets (btc, fed, etc.), spreads, volume, correlations, or arbitrage.`;
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

// ═══════════════════════════════════════════════════════════════
// BONDING ARB — Markets at >=97% resolution probability
// ═══════════════════════════════════════════════════════════════

function initBondingArb() {
  renderBondingArb();
  // Refresh every 30 seconds (global — bonding arb is now inline in overview tab)
  addResearchInterval(renderBondingArb, 30000);
}

function renderBondingArb() {
  // Simulated near-resolution markets (replace with live API data)
  const bondingMarkets = [
    { market: 'Will Biden be US President on Feb 28, 2026?', platform: 'polymarket', price: 0.99, days: 12, vol: 1240000 },
    { market: 'Will BTC be above $50K on Mar 1, 2026?', platform: 'polymarket', price: 0.98, days: 13, vol: 890000 },
    { market: 'Will the Fed hold rates in March 2026?', platform: 'kalshi', price: 0.97, days: 28, vol: 560000 },
    { market: 'Will Super Bowl LX happen before March?', platform: 'polymarket', price: 0.99, days: 3, vol: 2100000 },
    { market: 'Will ETH be above $2K on Feb 28?', platform: 'kalshi', price: 0.98, days: 12, vol: 340000 },
    { market: 'Will S&P 500 close above 4000 in Feb?', platform: 'kalshi', price: 0.99, days: 12, vol: 420000 },
    { market: 'Will gold be above $1800/oz in Feb?', platform: 'polymarket', price: 0.97, days: 12, vol: 180000 },
    { market: 'Will Taylor Swift Eras Tour continue in 2026?', platform: 'polymarket', price: 0.98, days: 45, vol: 750000 },
  ];

  // Add jitter to simulate live data
  const markets = bondingMarkets.map(m => ({
    ...m,
    price: Math.min(0.995, m.price + (Math.random() - 0.3) * 0.005),
    vol: Math.round(m.vol * (0.9 + Math.random() * 0.2)),
  }));

  const sortSelect = document.getElementById('bondingSortSelect');
  const platformSelect = document.getElementById('bondingPlatformSelect');
  const sortBy = sortSelect ? sortSelect.value : 'yield';
  const platformFilter = platformSelect ? platformSelect.value : 'all';

  let filtered = markets;
  if (platformFilter !== 'all') {
    filtered = filtered.filter(m => m.platform === platformFilter);
  }

  // Calculate yield: (1 - price) / price * (365 / days)
  filtered = filtered.map(m => {
    const rawYield = (1 - m.price) / m.price;
    const annualized = m.days > 0 ? rawYield * (365 / m.days) : 0;
    return { ...m, rawYield, annualized };
  });

  // Sort
  if (sortBy === 'yield') filtered.sort((a, b) => b.annualized - a.annualized);
  else if (sortBy === 'prob') filtered.sort((a, b) => b.price - a.price);
  else if (sortBy === 'volume') filtered.sort((a, b) => b.vol - a.vol);
  else if (sortBy === 'days') filtered.sort((a, b) => a.days - b.days);

  // Update metrics
  const countEl = document.getElementById('bondingCount');
  const yieldEl = document.getElementById('bondingAvgYield');
  const liqEl = document.getElementById('bondingTotalLiq');
  const daysEl = document.getElementById('bondingAvgDays');

  if (countEl) countEl.textContent = filtered.length;
  if (yieldEl && filtered.length > 0) {
    const avgYield = filtered.reduce((s, m) => s + m.annualized, 0) / filtered.length;
    yieldEl.textContent = (avgYield * 100).toFixed(1) + '%';
  }
  if (liqEl) {
    const totalVol = filtered.reduce((s, m) => s + m.vol, 0);
    liqEl.textContent = '$' + (totalVol / 1e6).toFixed(1) + 'M';
  }
  if (daysEl && filtered.length > 0) {
    const avgDays = filtered.reduce((s, m) => s + m.days, 0) / filtered.length;
    daysEl.textContent = Math.round(avgDays) + 'd';
  }

  // Render table
  const tbody = document.getElementById('bondingTableBody');
  if (!tbody) return;

  tbody.innerHTML = filtered.map(m => {
    const prob = (m.price * 100).toFixed(1) + '%';
    const yieldPct = (m.annualized * 100).toFixed(1) + '%';
    const volStr = m.vol >= 1e6 ? '$' + (m.vol / 1e6).toFixed(1) + 'M' : '$' + (m.vol / 1e3).toFixed(0) + 'K';
    return `<div class="bonding-row">
      <span class="bonding-col bonding-col--market">${m.market}</span>
      <span class="bonding-col bonding-col--platform">${m.platform}</span>
      <span class="bonding-col bonding-col--price">${m.price.toFixed(2)}c</span>
      <span class="bonding-col bonding-col--prob">${prob}</span>
      <span class="bonding-col bonding-col--yield">${yieldPct}</span>
      <span class="bonding-col bonding-col--days">${m.days}d</span>
      <span class="bonding-col bonding-col--vol">${volStr}</span>
      <span class="bonding-col bonding-col--action"><button class="bonding-action-btn" onclick="showToast('Bonding arb — connect account to trade', 'info')">Buy YES</button></span>
    </div>`;
  }).join('');

  // Wire sort/filter change handlers (once)
  if (!research._bondingWired) {
    research._bondingWired = true;
    if (sortSelect) sortSelect.addEventListener('change', renderBondingArb);
    if (platformSelect) platformSelect.addEventListener('change', renderBondingArb);
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKET DETAIL PANEL
// ═══════════════════════════════════════════════════════════════

function generatePriceHistory(currentPrice, points) {
  const data = [];
  const now = Date.now();
  let price = currentPrice + (Math.random() - 0.5) * 20;
  price = Math.max(3, Math.min(97, price));
  for (let i = points; i >= 0; i--) {
    const drift = (currentPrice - price) * 0.02;
    const noise = (Math.random() - 0.5) * 3;
    price = Math.max(1, Math.min(99, price + drift + noise));
    data.push({ x: now - i * 3600000, y: Math.round(price * 10) / 10 });
  }
  // Ensure last point matches current
  data[data.length - 1].y = currentPrice;
  return data;
}

function generateVolumeHistory(baseVol, points) {
  const data = [];
  const now = Date.now();
  for (let i = points; i >= 0; i--) {
    const v = baseVol * (0.3 + Math.random() * 1.4);
    data.push({ x: now - i * 3600000, y: Math.round(v) });
  }
  return data;
}

window.openMarketDetail = function(short) {
  const market = research.edgeData.find(e => e.short === short);
  if (!market) return;

  const modal = document.getElementById('marketDetailModal');
  if (!modal) return;

  // Determine default platform from market source
  const defaultPlat = market.source === 'kalshi' ? 'kalshi' : 'polymarket';

  // Store current market for platform toggle re-renders
  research._mdMarket = market;
  research._mdPlatform = defaultPlat;

  renderMarketDetailForPlatform(market, defaultPlat);

  // Wire platform toggle (once)
  const platTabs = document.getElementById('mdPlatTabs');
  if (platTabs && !platTabs._wired) {
    platTabs._wired = true;
    platTabs.addEventListener('click', e => {
      const btn = e.target.closest('.md-plat-btn');
      if (!btn) return;
      platTabs.querySelectorAll('.md-plat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const plat = btn.dataset.mdplat;
      research._mdPlatform = plat;
      if (research._mdMarket) {
        renderMarketDetailForPlatform(research._mdMarket, plat);
      }
    });
  }

  // Highlight the correct default platform tab
  if (platTabs) {
    platTabs.querySelectorAll('.md-plat-btn').forEach(b => b.classList.remove('active'));
    const defBtn = platTabs.querySelector(`[data-mdplat="${defaultPlat}"]`);
    if (defBtn) defBtn.classList.add('active');
  }

  modal.classList.add('open');
};

function renderMarketDetailForPlatform(market, plat) {
  // Determine price based on platform (no 'combined' — pick best available)
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

  // Header
  document.getElementById('mdName').textContent = market.name;
  document.getElementById('mdShort').textContent = market.short;
  document.getElementById('mdPrice').textContent = price + 'c';
  const changeNum = parseFloat(market.change) || 0;
  const changeEl = document.getElementById('mdChange');
  changeEl.textContent = (changeNum >= 0 ? '+' : '') + changeNum.toFixed(1) + 'c';
  changeEl.className = 'md-change ' + (changeNum >= 0 ? 'up' : 'down');

  // Platform label
  const platLabel = document.getElementById('mdPlatformLabel');
  if (platLabel) platLabel.textContent = label;

  // Stats
  document.getElementById('mdVol').textContent = market.vol;
  document.getElementById('mdPoly').textContent = market.polyPrice != null ? market.polyPrice + 'c' : '\u2014';
  document.getElementById('mdKalshi').textContent = market.kalshiPrice != null ? market.kalshiPrice + 'c' : '\u2014';
  const spread = (market.polyPrice != null && market.kalshiPrice != null)
    ? Math.abs(market.polyPrice - market.kalshiPrice) : null;
  document.getElementById('mdSpread').textContent = spread != null ? spread + 'c' : '\u2014';
  document.getElementById('mdImplied').textContent = price + '%';
  document.getElementById('mdTimeframe').textContent = market.tf || '\u2014';

  // Time-to-resolution
  const resolvesEl = document.getElementById('mdResolvesIn');
  if (resolvesEl) {
    const ttr = formatTimeToRes(market._endDate);
    resolvesEl.textContent = ttr;
    resolvesEl.style.color = ttr === 'Ended' ? 'var(--red)' : '';
  }

  // Calculate extra analytics based on selected platform price
  const noPrice = 100 - price;
  document.getElementById('mdNoPrice').textContent = noPrice + 'c';
  const ev = ((price / 100) * (100 - price) - (noPrice / 100) * price).toFixed(1);
  document.getElementById('mdEV').textContent = (ev >= 0 ? '+' : '') + ev + 'c';
  const kelly = price > 0 && price < 100
    ? (((price / 100) * (100 / price - 1) - (1 - price / 100)) / ((100 / price) - 1) * 100).toFixed(1)
    : '0.0';
  document.getElementById('mdKelly').textContent = kelly + '%';

  // Fetch REAL historical price data, then render chart
  const volNum = market._volNum || parseFloat(market.vol.replace(/[$MK]/g, '')) * 1e6;
  _fetchAndRenderPriceChart(market, plat, price, changeNum, chartColor, volNum);

}

// ─── Chart state for market detail ──────────────────────────
let _mdChartType = 'candlestick'; // 'candlestick' or 'area'
let _mdChartTf = '24h';    // '1h','6h','24h','7d','max'
let _mdCandleData = null;   // raw OHLC candles (if available)
let _mdLineData = null;     // line series [{x,y}]
let _mdVolumeData = null;   // volume series [{x,y}]
let _mdChartMeta = null;    // {market, plat, price, changeNum, chartColor, volNum}

// Wire up chart controls (called once from initResearchDashboard or on first open)
let _mdControlsWired = false;
function _wireChartControls() {
  if (_mdControlsWired) return;
  _mdControlsWired = true;

  const ctToggle = document.getElementById('mdChartTypeToggle');
  if (ctToggle) {
    ctToggle.addEventListener('click', e => {
      const btn = e.target.closest('.md-ct-btn');
      if (!btn) return;
      ctToggle.querySelectorAll('.md-ct-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mdChartType = btn.dataset.ct;
      _renderMdChart();
    });
  }

  const tfToggle = document.getElementById('mdChartTfToggle');
  if (tfToggle) {
    tfToggle.addEventListener('click', e => {
      const btn = e.target.closest('.md-tf-btn');
      if (!btn) return;
      tfToggle.querySelectorAll('.md-tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _mdChartTf = btn.dataset.tf;
      // Re-fetch with new timeframe
      if (_mdChartMeta) {
        const m = _mdChartMeta;
        _fetchAndRenderPriceChart(m.market, m.plat, m.price, m.changeNum, m.chartColor, m.volNum);
      }
    });
  }
}

// Async helper — fetches real historical data then renders price + volume charts
async function _fetchAndRenderPriceChart(market, plat, price, changeNum, chartColor, volNum) {
  _wireChartControls();
  _mdChartMeta = { market, plat, price, changeNum, chartColor, volNum };

  // Destroy previous charts
  if (research.charts.marketDetail) {
    research.charts.marketDetail.destroy();
    research.charts.marketDetail = null;
  }
  if (research.charts.marketDetailVol) {
    research.charts.marketDetailVol.destroy();
    research.charts.marketDetailVol = null;
  }

  // Show loading state
  const chartEl = document.getElementById('mdPriceChart');
  if (chartEl) chartEl.innerHTML = '<div style="color:#444;font-size:0.65rem;text-align:center;padding:40px 0;">Loading price history...</div>';

  let priceHistory = [];
  let volumeHistory = [];
  let candleData = null; // raw OHLC for candlestick mode
  const LM = typeof MercuryLiveMarkets !== 'undefined' ? MercuryLiveMarkets : null;

  // Map timeframe to CLOB fidelity (minutes) and Kalshi period (minutes)
  const tfMap = {
    '1h':  { clobFidelity: 1,  kalshiPeriod: 1,  clobInterval: '1h',  cutoffMs: 3600000 },
    '6h':  { clobFidelity: 5,  kalshiPeriod: 5,  clobInterval: '6h',  cutoffMs: 21600000 },
    '24h': { clobFidelity: 60, kalshiPeriod: 60, clobInterval: '1d',  cutoffMs: 86400000 },
    '7d':  { clobFidelity: 60, kalshiPeriod: 60, clobInterval: '1w',  cutoffMs: 604800000 },
    'max': { clobFidelity: 60, kalshiPeriod: 60, clobInterval: 'max', cutoffMs: 0 },
  };
  const tf = tfMap[_mdChartTf] || tfMap['24h'];
  const cutoff = tf.cutoffMs > 0 ? Date.now() - tf.cutoffMs : 0;

  // Generate OHLC candles from line data by bucketing into time intervals
  function lineToOHLC(points, bucketMs) {
    if (!points || points.length < 3) return null;
    const buckets = new Map();
    for (const p of points) {
      const key = Math.floor(p.x / bucketMs) * bucketMs;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p.y);
    }
    const candles = [];
    for (const [t, prices] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
      candles.push({
        t,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        price: prices[prices.length - 1],
        volume: 0,
      });
    }
    return candles.length >= 3 ? candles : null;
  }

  // Bucket size for OHLC generation from line data
  const bucketMap = { '1h': 60000*5, '6h': 60000*15, '24h': 60000*60, '7d': 60000*240, 'max': 60000*360 };
  const bucketMs = bucketMap[_mdChartTf] || 60000*60;

  // Try real API data first
  try {
    if (plat === 'polymarket' && market._clobTokenId && LM) {
      const hist = await LM.fetchPolyPriceHistory(market._clobTokenId, tf.clobInterval, tf.clobFidelity);
      if (hist.length >= 5) {
        const filtered = cutoff > 0 ? hist.filter(h => h.t >= cutoff) : hist;
        priceHistory = filtered.map(h => ({ x: h.t, y: h.price }));
        // Generate OHLC candles from line data for candlestick mode
        candleData = lineToOHLC(priceHistory, bucketMs);
      }
    }
    if (plat === 'kalshi' && market._kalshiTicker && LM) {
      // Fetch candlesticks (gives native OHLC)
      const candles = await LM.fetchKalshiCandlesticks(market._kalshiTicker, tf.kalshiPeriod);
      if (candles.length >= 5) {
        const filtered = cutoff > 0 ? candles.filter(c => c.t >= cutoff) : candles;
        candleData = filtered;
        priceHistory = filtered.map(c => ({ x: c.t, y: c.price }));
        volumeHistory = filtered.filter(c => c.volume > 0).map(c => ({ x: c.t, y: c.volume }));
      } else {
        const trades = await LM.fetchKalshiTrades(market._kalshiTicker, 200);
        if (trades.length >= 5) {
          const all = trades.reverse().map(t => ({
            x: new Date(t.time).getTime(),
            y: t.price,
          })).filter(p => p.x > 0 && p.y > 0);
          priceHistory = cutoff > 0 ? all.filter(p => p.x >= cutoff) : all;
          candleData = lineToOHLC(priceHistory, bucketMs);
        }
      }
    }
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

  // Last resort: generated data
  if (priceHistory.length < 3) {
    priceHistory = generatePriceHistory(price, 72);
    if (!candleData) candleData = lineToOHLC(priceHistory, bucketMs);
  }
  if (volumeHistory.length < 3) {
    volumeHistory = generateVolumeHistory(volNum / 72, 72);
  }

  // Bail if modal was closed while loading
  if (!research._mdMarket) return;

  // Mark if real data
  const isReal = priceHistory.length >= 5 && priceHistory[0].x > 1e12;
  const platLabel = document.getElementById('mdPlatformLabel');
  if (platLabel) {
    const base = plat === 'polymarket' ? 'Polymarket' : 'Kalshi';
    platLabel.textContent = base + (isReal ? ' — LIVE DATA' : '');
  }

  // Enable/disable candlestick button based on OHLC availability
  const candleBtn = document.querySelector('.md-ct-btn[data-ct="candlestick"]');
  if (candleBtn) {
    candleBtn.disabled = !candleData;
    candleBtn.style.opacity = candleData ? '1' : '0.3';
    candleBtn.title = candleData ? 'Candlestick chart' : 'OHLC data not available for this market';
  }

  // If user requested candlestick but no OHLC, fall back to area
  if (_mdChartType === 'candlestick' && !candleData) {
    _mdChartType = 'area';
    const areaBtn = document.querySelector('.md-ct-btn[data-ct="area"]');
    if (areaBtn) {
      document.querySelectorAll('.md-ct-btn').forEach(b => b.classList.remove('active'));
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
  if (research.charts.marketDetail) {
    research.charts.marketDetail.destroy();
    research.charts.marketDetail = null;
  }
  if (research.charts.marketDetailVol) {
    research.charts.marketDetailVol.destroy();
    research.charts.marketDetailVol = null;
  }

  const chartEl = document.getElementById('mdPriceChart');
  if (!chartEl) return;
  chartEl.innerHTML = '';

  const lineColor = chartColor || (changeNum >= 0 ? '#00c853' : '#ff1744');
  const seriesName = plat === 'polymarket' ? 'Polymarket' : plat === 'kalshi' ? 'Kalshi' : 'Price';

  const useCandlestick = _mdChartType === 'candlestick' && _mdCandleData && _mdCandleData.length >= 5;

  if (useCandlestick) {
    // ── Candlestick chart ──
    const ohlcSeries = _mdCandleData.map(c => ({
      x: c.t,
      y: [c.open, c.high, c.low, c.close],
    }));

    const allPrices = _mdCandleData.flatMap(c => [c.open, c.high, c.low, c.close]).filter(p => p > 0);
    const chartOpts = {
      chart: {
        type: 'candlestick',
        height: 220,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: true, type: 'x' },
        animations: { enabled: true, speed: 400 },
      },
      series: [{ name: seriesName, data: ohlcSeries }],
      plotOptions: {
        candlestick: {
          colors: { upward: '#00c853', downward: '#ff1744' },
          wick: { useFillColor: true },
        },
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' },
          datetimeFormatter: { hour: 'HH:mm', day: 'MMM dd', month: "MMM 'yy" },
        },
        axisBorder: { color: '#1a1a1a' },
        axisTicks: { show: false },
      },
      yaxis: {
        min: Math.max(0, Math.min(...allPrices) - 3),
        max: Math.min(100, Math.max(...allPrices) + 3),
        labels: {
          style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' },
          formatter: v => v.toFixed(0) + 'c',
        },
      },
      grid: { borderColor: '#1a1a1a', strokeDashArray: 3, padding: { left: 4, right: 4 } },
      tooltip: {
        theme: 'dark',
        style: { fontFamily: 'JetBrains Mono', fontSize: '10px' },
      },
      dataLabels: { enabled: false },
    };
    research.charts.marketDetail = new ApexCharts(chartEl, chartOpts);
    research.charts.marketDetail.render();
  } else {
    // ── Area/line chart ──
    const priceHistory = _mdLineData || [];
    const chartOpts = {
      chart: {
        type: 'area',
        height: 220,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: true, type: 'x' },
        animations: { enabled: true, speed: 600 },
      },
      series: [{ name: seriesName, data: priceHistory }],
      stroke: { curve: 'smooth', width: 2 },
      colors: [lineColor],
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] },
      },
      xaxis: {
        type: 'datetime',
        labels: {
          style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' },
          datetimeFormatter: { hour: 'HH:mm', day: 'MMM dd', month: "MMM 'yy" },
        },
        axisBorder: { color: '#1a1a1a' },
        axisTicks: { show: false },
      },
      yaxis: {
        min: Math.max(0, Math.min(...priceHistory.map(p => p.y)) - 5),
        max: Math.min(100, Math.max(...priceHistory.map(p => p.y)) + 5),
        labels: {
          style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '8px' },
          formatter: v => v.toFixed(0) + 'c',
        },
      },
      grid: { borderColor: '#1a1a1a', strokeDashArray: 3, padding: { left: 4, right: 4 } },
      tooltip: {
        theme: 'dark',
        x: { format: 'MMM dd HH:mm' },
        y: { formatter: v => v.toFixed(1) + 'c' },
        style: { fontFamily: 'JetBrains Mono', fontSize: '10px' },
      },
      dataLabels: { enabled: false },
    };
    research.charts.marketDetail = new ApexCharts(chartEl, chartOpts);
    research.charts.marketDetail.render();
  }

  // Volume mini-chart
  const volChartEl = document.getElementById('mdVolChart');
  const volumeHistory = _mdVolumeData || [];
  if (volChartEl && volumeHistory.length > 0) {
    volChartEl.innerHTML = '';
    const volOpts = {
      chart: {
        type: 'bar', height: 80, background: 'transparent',
        toolbar: { show: false }, sparkline: { enabled: true },
        animations: { enabled: true, speed: 400 },
      },
      series: [{ name: 'Volume', data: volumeHistory }],
      plotOptions: { bar: { columnWidth: '70%' } },
      colors: ['rgba(255,255,255,0.12)'],
      xaxis: { type: 'datetime', labels: { show: false }, axisBorder: { show: false } },
      yaxis: { labels: { show: false } },
      grid: { show: false },
      tooltip: { enabled: false },
      dataLabels: { enabled: false },
    };
    research.charts.marketDetailVol = new ApexCharts(volChartEl, volOpts);
    research.charts.marketDetailVol.render();
  }
}

window.closeMarketDetail = function() {
  const modal = document.getElementById('marketDetailModal');
  if (modal) modal.classList.remove('open');
  research._mdMarket = null;
  if (research.charts.marketDetail) {
    research.charts.marketDetail.destroy();
    research.charts.marketDetail = null;
  }
  if (research.charts.marketDetailVol) {
    research.charts.marketDetailVol.destroy();
    research.charts.marketDetailVol = null;
  }
};

