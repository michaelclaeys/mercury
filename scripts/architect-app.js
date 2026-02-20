/* ================================================================
   MERCURY ARCHITECT APP — Bot Builder Dashboard
   Node editor, bot management, backtesting, templates
   v8 — 2026-02-17
   ================================================================ */
console.log('[Mercury] architect-app.js v8 loaded');

// ═══════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════
let currentUser = null;
let userTier = 'free';

async function initAuth() {
  if (typeof window.requireAuth === 'function') {
    try {
      await window.requireAuth();
      currentUser = typeof window.getCurrentUser === 'function' ? await window.getCurrentUser() : null;
      userTier = typeof window.getUserTier === 'function' ? window.getUserTier(currentUser) : 'free';
    } catch (e) {
      // dev mode fallback
      currentUser = { email: 'dev@local' };
      userTier = 'pro';
    }
  } else {
    currentUser = { email: 'dev@local' };
    userTier = 'pro';
  }

  const avatarEl = document.getElementById('userAvatar');
  const nameEl = document.getElementById('userName');
  const planEl = document.getElementById('userPlan');

  if (currentUser && currentUser.email) {
    if (avatarEl) avatarEl.textContent = currentUser.email.charAt(0).toUpperCase();
    if (nameEl) nameEl.textContent = currentUser.email;
  }
  if (planEl) planEl.textContent = 'Free Plan';

  // Hide sidebar upgrade button — all features are free
  const upgradeSection = document.getElementById('sidebarUpgrade');
  if (upgradeSection) upgradeSection.style.display = 'none';
}

// Funding sidebar link — now uses data-view="funding" (handled by switchView)

// ═══════════════════════════════════════════════════════════════
// ENGINE BASE URL
// ═══════════════════════════════════════════════════════════════
function getEngineBase() {
  if (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) return window.MERCURY_CONFIG.engineBase;
  if (window.location.protocol === 'file:') return 'http://localhost:8778';
  return '';  // same-origin when served from engine
}

// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
let currentView = 'builder';
let selectedBotId = null;

// Canvas state
const canvas = {
  zoom: 1,
  panX: 0,
  panY: 0,
  gridVisible: true,
  isPanning: false,
  maybePanning: false,
  didPan: false, // true if a pan actually happened (suppresses click)
  panStartX: 0,
  panStartY: 0,
  panStartPanX: 0,
  panStartPanY: 0,
  spaceHeld: false,
};

// Node editor
let nodes = [];
let connections = [];
let selectedNodeId = null;
let draggingNodeId = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let connectingFrom = null; // { nodeId, portId, portType }
let tempConnectionLine = null;
let selectedConnectionId = null;
let nextNodeId = 1;
let nextConnId = 1;

// Undo / Redo
let undoStack = [];
let redoStack = [];

// Mock data
let bots = [];
let templates = [];

// Charts
let charts = {};
let logInterval = null;

// ═══════════════════════════════════════════════════════════════
// CUSTOM API PRESETS
// ═══════════════════════════════════════════════════════════════
const API_DATA_PRESETS = {
  'BTC Price (USD)':       { url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', json_path: 'bitcoin.usd' },
  'ETH Price (USD)':       { url: 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd', json_path: 'ethereum.usd' },
  'Fear & Greed Index':    { url: 'https://api.alternative.me/fng/', json_path: 'data.0.value' },
  'ETH Gas Price (Gwei)':  { url: 'https://api.etherscan.io/api?module=gastracker&action=gasoracle', json_path: 'result.ProposeGasPrice' },
  'Gold Price (USD/oz)':   { url: 'https://api.metals.dev/v1/latest?api_key=demo&currency=USD&unit=toz', json_path: 'metals.gold' },
};

// ═══════════════════════════════════════════════════════════════
// NODE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const NODE_TYPES = {
  // TRIGGERS
  'market': {
    category: 'trigger', label: 'Market', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
    ],
  },
  'price-threshold': {
    category: 'trigger', label: 'Price Threshold', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'market', type: 'select', label: 'Market', options: ['Any', 'Polymarket', 'Kalshi'], default: 'Any' },
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'direction', type: 'select', label: 'Direction', options: ['Crosses Above', 'Crosses Below'], default: 'Crosses Above' },
      { key: 'threshold', type: 'number', label: 'Threshold (cents)', default: 50, min: 1, max: 99 },
    ],
  },
  'volume-spike': {
    category: 'trigger', label: 'Volume Spike', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'multiplier', type: 'number', label: 'Spike Multiplier', default: 3, min: 1.5, max: 20 },
      { key: 'window', type: 'select', label: 'Window', options: ['1hr', '4hr', '24hr'], default: '1hr' },
      { key: 'market', type: 'select', label: 'Market', options: ['Any', 'Polymarket', 'Kalshi'], default: 'Any' },
    ],
  },
  'time-based': {
    category: 'trigger', label: 'Time-Based', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'schedule', type: 'select', label: 'Schedule', options: ['Every 1hr', 'Every 4hr', 'Every 12hr', 'Daily 9AM', 'Daily 5PM'], default: 'Every 4hr' },
      { key: 'timezone', type: 'select', label: 'Timezone', options: ['UTC', 'ET', 'PT'], default: 'ET' },
    ],
  },
  'market-event': {
    category: 'trigger', label: 'Market Event', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'event', type: 'select', label: 'Event Type', options: ['New Listing', 'Resolution', 'Volume Surge', 'Price Alert'], default: 'Resolution' },
      { key: 'lead', type: 'select', label: 'Lead Time', options: ['Immediate', '1hr Before', '24hr Before', '48hr Before'], default: '24hr Before' },
    ],
  },
  'probability-cross': {
    category: 'trigger', label: 'Probability Cross', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'direction', type: 'select', label: 'Direction', options: ['Crosses Above', 'Crosses Below'], default: 'Crosses Above' },
      { key: 'level', type: 'number', label: 'Level (cents)', default: 60, min: 1, max: 99 },
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
    ],
  },
  'api-data': {
    category: 'trigger', label: 'Custom API', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'preset', type: 'select', label: 'Data Source', options: ['Custom URL', 'BTC Price (USD)', 'ETH Price (USD)', 'Fear & Greed Index', 'ETH Gas Price (Gwei)', 'Gold Price (USD/oz)'], default: 'Custom URL' },
      { key: 'url', type: 'text', label: 'API URL', default: '', placeholder: 'https://api.example.com/data' },
      { key: 'method', type: 'select', label: 'Method', options: ['GET', 'POST'], default: 'GET' },
      { key: 'headers', type: 'text', label: 'Headers (JSON)', default: '{}', placeholder: '{"Authorization": "Bearer ..."}' },
      { key: 'json_path', type: 'text', label: 'JSON Path', default: '', placeholder: 'result.data.price' },
      { key: 'operator', type: 'select', label: 'Fire When', options: ['>', '<', '==', '!=', 'Crosses Above', 'Crosses Below'], default: '>' },
      { key: 'threshold', type: 'number', label: 'Threshold', default: 0 },
      { key: 'poll_interval', type: 'number', label: 'Poll Interval (sec)', default: 60, min: 5, max: 3600 },
    ],
  },
  'news-alert': {
    category: 'trigger', label: 'News Alert', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'preset', type: 'select', label: 'Alert Source', options: ['NWS Weather Alerts', 'USGS Earthquakes (M4+)', 'Custom URL'], default: 'NWS Weather Alerts' },
      { key: 'url', type: 'text', label: 'Custom API URL', default: '', placeholder: 'https://api.example.com/alerts' },
      { key: 'json_path', type: 'text', label: 'JSON Path', default: '', placeholder: 'data.alerts' },
      { key: 'min_severity', type: 'select', label: 'Min Severity', options: ['Advisory', 'Watch', 'Warning', 'Emergency'], default: 'Warning' },
      { key: 'keyword', type: 'text', label: 'Keyword Filter', default: '', placeholder: 'hurricane, tornado...' },
      { key: 'region', type: 'text', label: 'Region Filter', default: '', placeholder: 'Florida, California...' },
      { key: 'poll_interval', type: 'number', label: 'Poll Interval (sec)', default: 120, min: 30, max: 3600 },
    ],
  },

  // TECHNICAL INDICATORS
  'rsi': {
    category: 'trigger', label: 'RSI', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'period', type: 'number', label: 'Period', default: 14, min: 2, max: 100 },
      { key: 'overbought', type: 'number', label: 'Overbought Level', default: 70, min: 50, max: 95 },
      { key: 'oversold', type: 'number', label: 'Oversold Level', default: 30, min: 5, max: 50 },
      { key: 'signal', type: 'select', label: 'Fire On', options: ['Overbought', 'Oversold', 'Both'], default: 'Both' },
    ],
  },
  'macd': {
    category: 'trigger', label: 'MACD', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'fast', type: 'number', label: 'Fast Period', default: 12, min: 2, max: 50 },
      { key: 'slow', type: 'number', label: 'Slow Period', default: 26, min: 5, max: 100 },
      { key: 'signal_period', type: 'number', label: 'Signal Period', default: 9, min: 2, max: 50 },
      { key: 'crossover', type: 'select', label: 'Fire On', options: ['Bullish Cross', 'Bearish Cross', 'Both'], default: 'Both' },
    ],
  },
  'bollinger': {
    category: 'trigger', label: 'Bollinger Bands', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'period', type: 'number', label: 'Period', default: 20, min: 5, max: 100 },
      { key: 'std_dev', type: 'number', label: 'Std Deviations', default: 2, min: 0.5, max: 4 },
      { key: 'signal', type: 'select', label: 'Fire On', options: ['Upper Break', 'Lower Break', 'Squeeze', 'Both Breaks'], default: 'Both Breaks' },
    ],
  },
  'moving-average': {
    category: 'trigger', label: 'Moving Average', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'fast_period', type: 'number', label: 'Fast Period', default: 10, min: 2, max: 50 },
      { key: 'slow_period', type: 'number', label: 'Slow Period', default: 30, min: 5, max: 200 },
      { key: 'ma_type', type: 'select', label: 'MA Type', options: ['SMA', 'EMA'], default: 'EMA' },
      { key: 'signal', type: 'select', label: 'Fire On', options: ['Golden Cross', 'Death Cross', 'Both'], default: 'Both' },
    ],
  },
  'rate-of-change': {
    category: 'trigger', label: 'Rate of Change', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'period', type: 'number', label: 'Period', default: 12, min: 1, max: 100 },
      { key: 'threshold', type: 'number', label: 'Threshold (%)', default: 5, min: 0.5, max: 50 },
      { key: 'direction', type: 'select', label: 'Direction', options: ['Up', 'Down', 'Both'], default: 'Both' },
    ],
  },
  'pattern': {
    category: 'trigger', label: 'Pattern Detect', color: '#00c853',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'pattern', type: 'select', label: 'Pattern', options: ['Breakout', 'Breakdown', 'Range Bound', 'Trend Reversal', 'Consolidation'], default: 'Breakout' },
      { key: 'lookback', type: 'number', label: 'Lookback Periods', default: 30, min: 5, max: 200 },
      { key: 'sensitivity', type: 'select', label: 'Sensitivity', options: ['Low', 'Medium', 'High'], default: 'Medium' },
    ],
  },

  // CONDITIONS
  'probability-band': {
    category: 'condition', label: 'Probability Band', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'min', type: 'number', label: 'Min Prob (%)', default: 20, min: 0, max: 100 },
      { key: 'max', type: 'number', label: 'Max Prob (%)', default: 80, min: 0, max: 100 },
    ],
  },
  'liquidity-check': {
    category: 'condition', label: 'Liquidity Check', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'minLiquidity', type: 'number', label: 'Min Liquidity ($)', default: 5000, min: 1000 },
      { key: 'depth', type: 'select', label: 'Order Book Depth', options: ['Top of Book', '1% Depth', '5% Depth'], default: '1% Depth' },
    ],
  },
  'portfolio-exposure': {
    category: 'condition', label: 'Portfolio Exposure', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'maxExposure', type: 'number', label: 'Max Exposure (%)', default: 25, min: 1, max: 100 },
      { key: 'scope', type: 'select', label: 'Scope', options: ['Per Contract', 'Per Category', 'Total Portfolio'], default: 'Per Contract' },
    ],
  },
  'correlation': {
    category: 'condition', label: 'Correlation', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'threshold', type: 'number', label: 'Correlation Threshold', default: 0.7, min: 0, max: 1 },
      { key: 'action', type: 'select', label: 'If Correlated', options: ['Block', 'Reduce Size', 'Allow'], default: 'Block' },
    ],
  },
  'time-window': {
    category: 'condition', label: 'Time Window', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'startHour', type: 'number', label: 'Start Hour (0-23)', default: 9, min: 0, max: 23 },
      { key: 'endHour', type: 'number', label: 'End Hour (0-23)', default: 17, min: 0, max: 23 },
      { key: 'timezone', type: 'select', label: 'Timezone', options: ['UTC', 'ET', 'PT', 'CT', 'GMT', 'CET'], default: 'ET' },
      { key: 'days', type: 'select', label: 'Days', options: ['Every Day', 'Weekdays Only', 'Weekends Only', 'Mon/Wed/Fri', 'Tue/Thu'], default: 'Every Day' },
    ],
  },
  'spread-check': {
    category: 'condition', label: 'Spread Check', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'maxSpread', type: 'number', label: 'Max Bid-Ask Spread (cents)', default: 3, min: 1, max: 50 },
    ],
  },
  'momentum': {
    category: 'condition', label: 'Momentum', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'direction', type: 'select', label: 'Direction', options: ['Bullish', 'Bearish', 'Any Strong Move'], default: 'Bullish' },
      { key: 'period', type: 'select', label: 'Period', options: ['1hr', '4hr', '12hr', '24hr', '7d'], default: '24hr' },
      { key: 'minChange', type: 'number', label: 'Min Change (cents)', default: 5, min: 1, max: 50 },
    ],
  },
  'volatility': {
    category: 'condition', label: 'Volatility', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'range', type: 'select', label: 'Volatility', options: ['Low', 'Medium', 'High', 'Extreme'], default: 'Medium' },
      { key: 'period', type: 'select', label: 'Period', options: ['1hr', '4hr', '24hr', '7d'], default: '24hr' },
      { key: 'action', type: 'select', label: 'Pass When', options: ['Within Range', 'Above Range', 'Below Range'], default: 'Within Range' },
    ],
  },
  'logic-gate': {
    category: 'condition', label: 'Logic Gate', color: '#60a5fa',
    inputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'mode', type: 'select', label: 'Mode', options: ['AND (both)', 'OR (either)', 'XOR (one only)', 'NAND (not both)'], default: 'AND (both)' },
    ],
  },
  'price-range': {
    category: 'condition', label: 'Price Range', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'min', type: 'number', label: 'Min Price (cents)', default: 10, min: 1, max: 99 },
      { key: 'max', type: 'number', label: 'Max Price (cents)', default: 90, min: 1, max: 99 },
      { key: 'action', type: 'select', label: 'Pass When', options: ['Inside Range', 'Outside Range'], default: 'Inside Range' },
    ],
  },
  'volume-filter': {
    category: 'condition', label: 'Volume Filter', color: '#60a5fa',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'pass', label: 'Pass' }, { id: 'fail', label: 'Fail' }],
    properties: [
      { key: 'minVolume', type: 'number', label: 'Min 24h Volume ($)', default: 10000, min: 100 },
      { key: 'maxVolume', type: 'number', label: 'Max 24h Volume ($)', default: 0, min: 0 },
    ],
  },

  // EXECUTION
  'market-order': {
    category: 'execution', label: 'Market Order', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Filled' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'amount', type: 'number', label: 'Amount ($)', default: 25, min: 1 },
      { key: 'platform', type: 'select', label: 'Platform', options: ['Auto', 'Polymarket', 'Kalshi'], default: 'Auto' },
    ],
  },
  'limit-order': {
    category: 'execution', label: 'Limit Order', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Filled' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'limitPrice', type: 'number', label: 'Limit Price (cents)', default: 55, min: 1, max: 99 },
      { key: 'amount', type: 'number', label: 'Amount ($)', default: 25, min: 1 },
      { key: 'expiry', type: 'select', label: 'Expiry', options: ['GTC', '1hr', '4hr', '24hr'], default: 'GTC' },
    ],
  },
  'scaled-entry': {
    category: 'execution', label: 'Scaled Entry', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Complete' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'totalAmount', type: 'number', label: 'Total Amount ($)', default: 100, min: 10 },
      { key: 'tranches', type: 'number', label: 'Tranches', default: 5, min: 2, max: 20 },
      { key: 'priceRange', type: 'number', label: 'Price Range (cents)', default: 10, min: 1, max: 50 },
    ],
  },
  'dca': {
    category: 'execution', label: 'DCA', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Executed' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'amountPer', type: 'number', label: 'Amount Per Buy ($)', default: 10, min: 1 },
      { key: 'interval', type: 'select', label: 'Interval', options: ['Every 1hr', 'Every 4hr', 'Every 12hr', 'Daily'], default: 'Every 4hr' },
      { key: 'maxBuys', type: 'number', label: 'Max Buys', default: 10, min: 1, max: 100 },
    ],
  },
  'close-position': {
    category: 'execution', label: 'Close Position', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Closed' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'amount', type: 'select', label: 'Amount', options: ['100% (Full)', '75%', '50%', '25%', 'Custom'], default: '100% (Full)' },
      { key: 'customPct', type: 'number', label: 'Custom %', default: 100, min: 1, max: 100 },
      { key: 'urgency', type: 'select', label: 'Urgency', options: ['Market (Instant)', 'Limit (Best Price)', 'TWAP (Spread Out)'], default: 'Market (Instant)' },
    ],
  },
  'hedge': {
    category: 'execution', label: 'Hedge', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Hedged' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'strategy', type: 'select', label: 'Hedge Strategy', options: ['Buy Opposite Side', 'Correlated Market', 'Partial Close + Opposite'], default: 'Buy Opposite Side' },
      { key: 'ratio', type: 'number', label: 'Hedge Ratio (%)', default: 100, min: 10, max: 200 },
      { key: 'platform', type: 'select', label: 'Platform', options: ['Same', 'Polymarket', 'Kalshi'], default: 'Same' },
    ],
  },
  'twap': {
    category: 'execution', label: 'TWAP', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Complete' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'totalAmount', type: 'number', label: 'Total Amount ($)', default: 500, min: 10 },
      { key: 'duration', type: 'select', label: 'Duration', options: ['5min', '15min', '30min', '1hr', '4hr'], default: '30min' },
      { key: 'slices', type: 'number', label: 'Slices', default: 10, min: 2, max: 100 },
    ],
  },
  'conditional-order': {
    category: 'execution', label: 'Conditional Order', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Filled' }],
    properties: [
      { key: 'contract', type: 'contract-input', label: 'Contract', default: null },
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'amount', type: 'number', label: 'Amount ($)', default: 50, min: 1 },
      { key: 'condition', type: 'select', label: 'Execute When', options: ['Price Hits Level', 'Volume Exceeds', 'Spread Narrows Below', 'After Delay'], default: 'Price Hits Level' },
      { key: 'conditionValue', type: 'number', label: 'Condition Value', default: 50 },
    ],
  },
  'rebalance': {
    category: 'execution', label: 'Rebalance', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Rebalanced' }],
    properties: [
      { key: 'target', type: 'select', label: 'Target Allocation', options: ['Equal Weight', 'By Conviction', 'Risk Parity', 'Custom Weights'], default: 'Equal Weight' },
      { key: 'threshold', type: 'number', label: 'Rebalance Threshold (%)', default: 5, min: 1, max: 50 },
      { key: 'maxTrades', type: 'number', label: 'Max Trades Per Rebalance', default: 5, min: 1, max: 20 },
    ],
  },

  // RISK
  'stop-loss': {
    category: 'risk', label: 'Stop Loss', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Position' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'type', type: 'select', label: 'Type', options: ['Percentage', 'Fixed Amount', 'Probability Level'], default: 'Percentage' },
      { key: 'value', type: 'number', label: 'Value', default: 10 },
    ],
  },
  'take-profit': {
    category: 'risk', label: 'Take Profit', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Position' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'type', type: 'select', label: 'Type', options: ['Percentage', 'Fixed Amount', 'Probability Level'], default: 'Percentage' },
      { key: 'value', type: 'number', label: 'Value', default: 20 },
    ],
  },
  'position-limit': {
    category: 'risk', label: 'Position Limit', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'OK' }, { id: 'fail', label: 'Blocked' }],
    properties: [
      { key: 'maxPositions', type: 'number', label: 'Max Positions', default: 3, min: 1, max: 50 },
      { key: 'maxPerContract', type: 'number', label: 'Max Per Contract ($)', default: 100, min: 10 },
    ],
  },
  'portfolio-cap': {
    category: 'risk', label: 'Portfolio Cap', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'OK' }, { id: 'fail', label: 'Blocked' }],
    properties: [
      { key: 'maxCapital', type: 'number', label: 'Max Capital ($)', default: 1000, min: 100 },
      { key: 'action', type: 'select', label: 'On Limit', options: ['Block New Trades', 'Close Smallest', 'Notify Only'], default: 'Block New Trades' },
    ],
  },
  'max-drawdown': {
    category: 'risk', label: 'Max Drawdown', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Monitor' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'maxDD', type: 'number', label: 'Max Drawdown (%)', default: 10, min: 1, max: 100 },
      { key: 'action', type: 'select', label: 'Action', options: ['Kill All Bots', 'Pause All Bots', 'Notify Only'], default: 'Pause All Bots' },
    ],
  },
  'trailing-stop': {
    category: 'risk', label: 'Trailing Stop', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Position' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'type', type: 'select', label: 'Trail Type', options: ['Percentage', 'Fixed Cents', 'ATR-Based'], default: 'Percentage' },
      { key: 'value', type: 'number', label: 'Trail Value', default: 5 },
      { key: 'activation', type: 'number', label: 'Activate After Gain (%)', default: 0, min: 0 },
    ],
  },
  'time-exit': {
    category: 'risk', label: 'Time Exit', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Position' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'maxHold', type: 'select', label: 'Max Hold Time', options: ['1hr', '4hr', '12hr', '24hr', '48hr', '7d', '30d'], default: '24hr' },
      { key: 'action', type: 'select', label: 'Action', options: ['Close All', 'Close If Profitable', 'Close If Losing', 'Tighten Stop'], default: 'Close All' },
    ],
  },
  'daily-loss-limit': {
    category: 'risk', label: 'Daily Loss Limit', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Monitor' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'maxLoss', type: 'number', label: 'Max Daily Loss ($)', default: 100, min: 1 },
      { key: 'action', type: 'select', label: 'Action', options: ['Stop Trading Today', 'Pause 1hr', 'Reduce Size 50%', 'Notify Only'], default: 'Stop Trading Today' },
      { key: 'resetTime', type: 'select', label: 'Reset Time', options: ['Midnight UTC', 'Midnight ET', '9AM ET'], default: 'Midnight ET' },
    ],
  },
  'cooldown': {
    category: 'risk', label: 'Cooldown', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'OK' }, { id: 'fail', label: 'Wait' }],
    properties: [
      { key: 'after', type: 'select', label: 'After', options: ['Any Trade', 'Loss', 'Win', 'Stop Loss Hit', 'Take Profit Hit'], default: 'Any Trade' },
      { key: 'duration', type: 'select', label: 'Wait Duration', options: ['5min', '15min', '30min', '1hr', '4hr', '24hr'], default: '1hr' },
    ],
  },
  'size-scaler': {
    category: 'risk', label: 'Size Scaler', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'Sized' }],
    properties: [
      { key: 'method', type: 'select', label: 'Sizing Method', options: ['Kelly Criterion', 'Fixed Fractional', 'Volatility Scaled', 'Confidence Based'], default: 'Fixed Fractional' },
      { key: 'riskPct', type: 'number', label: 'Risk Per Trade (%)', default: 2, min: 0.1, max: 50 },
      { key: 'maxSize', type: 'number', label: 'Max Position ($)', default: 500, min: 10 },
    ],
  },

  // UTILITY
  'alert': {
    category: 'utility', label: 'Alert', color: '#fbbf24',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Pass' }],
    properties: [
      { key: 'channel', type: 'select', label: 'Channel', options: ['Dashboard', 'Email', 'Webhook', 'Telegram', 'Discord'], default: 'Dashboard' },
      { key: 'message', type: 'text', label: 'Message', default: 'Strategy alert triggered' },
      { key: 'webhookUrl', type: 'text', label: 'Webhook URL', default: '' },
    ],
  },
  'delay': {
    category: 'utility', label: 'Delay', color: '#fbbf24',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'out', label: 'Output' }],
    properties: [
      { key: 'duration', type: 'select', label: 'Duration', options: ['10sec', '30sec', '1min', '5min', '15min', '30min', '1hr'], default: '5min' },
      { key: 'cancelIf', type: 'select', label: 'Cancel If', options: ['Never', 'Signal Reverses', 'Price Changes >5%'], default: 'Never' },
    ],
  },
  'note': {
    category: 'utility', label: 'Note', color: '#fbbf24',
    inputs: [],
    outputs: [],
    properties: [
      { key: 'text', type: 'text', label: 'Note', default: 'Strategy notes...' },
    ],
  },
  'splitter': {
    category: 'utility', label: 'Splitter', color: '#fbbf24',
    inputs: [{ id: 'in', label: 'Input' }],
    outputs: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }],
    properties: [
      { key: 'mode', type: 'select', label: 'Mode', options: ['Duplicate (send to all)', 'Round Robin', 'Random', 'Weighted'], default: 'Duplicate (send to all)' },
    ],
  },
};

const CATEGORY_LABELS = {
  trigger: 'TRIGGER', condition: 'CONDITION', execution: 'EXEC', risk: 'RISK', utility: 'UTIL',
};

// ═══════════════════════════════════════════════════════════════
// DOM CACHE
// ═══════════════════════════════════════════════════════════════
const el = {};

function cacheElements() {
  el.sidebar = document.getElementById('sidebar');
  el.sidebarOverlay = document.getElementById('sidebarOverlay');
  el.canvasContainer = document.getElementById('canvasContainer');
  el.canvasViewport = document.getElementById('canvasViewport');
  el.connectionsLayer = document.getElementById('connectionsLayer');
  el.nodeInspector = document.getElementById('nodeInspector');
  el.inspectorBody = document.getElementById('inspectorBody');
  el.inspectorTitle = document.getElementById('inspectorTitle');
  // Agent panel (replaces old AI terminal)
  el.agentPanel = document.getElementById('agentPanel');
  el.agentTabContent = document.getElementById('agentTabContent');
  el.tabAgent = document.getElementById('tabAgent');
  el.agentMessages = document.getElementById('agentMessages');
  el.agentInput = document.getElementById('agentInput');
  el.agentSend = document.getElementById('agentSend');
  el.agentStatusBar = document.getElementById('agentStatusBar');
  // Floating palette
  el.floatingPalette = document.getElementById('floatingPalette');
  el.btnPaletteToggle = document.getElementById('btnPaletteToggle');
  el.btnPaletteClose = document.getElementById('btnPaletteClose');
  el.mercuryScriptCode = document.getElementById('mercuryScriptCode');
  el.mercuryScriptPanel = document.getElementById('mercuryScriptPanel');
  el.botsGrid = document.getElementById('botsGrid');
  el.templatesGrid = document.getElementById('templatesGrid');
  el.zoomLabel = document.getElementById('zoomLabel');
  el.strategyName = document.getElementById('strategyName');
  el.toolbarStatus = document.getElementById('toolbarStatus');
  el.toast = document.getElementById('toast');
  el.toastMessage = document.getElementById('toastMessage');
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Mercury] DOMContentLoaded fired');
  cacheElements();

  function bootApp() {
    console.log('[Mercury] bootApp() starting');

    try { setupEventListeners(); }
    catch (e) { console.error('[Mercury] setupEventListeners failed:', e); }

    // Check for #charting hash to deep-link into charting view
    const hashView = window.location.hash.replace('#', '');
    try {
      if (hashView === 'charting') { switchView('charting'); }
      else if (hashView === 'catalyst') { switchView('catalyst'); }
      else if (hashView === 'bonding-arb') { switchView('bonding-arb'); }
      else if (hashView === 'funding') { switchView('funding'); }
      else { switchView('builder'); }
    } catch (e) { console.error('[Mercury] switchView failed:', e); }

    // Initialize strategy manager (tabs, multi-strategy storage)
    try { initStrategyManager(); }
    catch (e) { console.error('[Mercury] initStrategyManager failed:', e); }

    // Show wizard for first-time users, otherwise load default strategy
    try {
      if (!localStorage.getItem('mercury_wizard_done')) {
        showWizard();
      } else {
        // Try restoring auto-saved strategy, fall back to default
        if (!restoreAutoSave()) {
          loadDefaultStrategy();
        }
        // Safety net: if restore succeeded but canvas is still empty, load default
        if (nodes.length === 0) {
          loadDefaultStrategy();
        }
        maybeStartArchitectTour();
      }
    } catch (e) {
      console.error('[Mercury] Strategy restore/load failed:', e);
      try { loadDefaultStrategy(); } catch (e2) { console.error('[Mercury] loadDefaultStrategy failed:', e2); }
    }

    try { updateMercuryScript(); } catch (e) {}
    try { updateStatusBar(); } catch (e) {}

    // Hide agent tip if previously dismissed
    if (localStorage.getItem('mercury_agent_tip_dismissed')) {
      const tip = document.getElementById('canvasAgentTip');
      if (tip) tip.style.display = 'none';
    }

    if (!localStorage.getItem('mercury_palette_seen')) {
      try { showPaletteTooltip(); } catch (e) {}
    }

    console.log('[Mercury] bootApp() done — nodes on canvas:', nodes.length);

    // Check Kalshi connection status (non-blocking)
    try { checkKalshiConnectionStatus(); } catch (e) {}

    // Final safety net: if canvas is STILL empty after everything, place Market node
    setTimeout(() => {
      if (nodes.length === 0) {
        console.log('[Mercury] Canvas empty after init — placing default Market node');
        try { loadDefaultStrategy(); } catch (e) { console.error('[Mercury] Final safety loadDefault failed:', e); }
      }
    }, 500);
  }

  initAuth()
    .then(() => initMockData())
    .then(() => bootApp())
    .catch(err => {
      console.warn('[Mercury] Init error, booting anyway:', err);
      bootApp();
    });
});

// ═══════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchView(viewName, params) {

  if (logInterval) { clearInterval(logInterval); logInterval = null; }
  stopEngineLogPolling();

  // Teardown charting dashboard when leaving
  if (typeof teardownChartingDashboard === 'function') teardownChartingDashboard();
  // Teardown catalyst view when leaving
  if (typeof teardownCatalystView === 'function') teardownCatalystView();
  // Teardown bonding arb view when leaving
  if (typeof teardownBondingArbView === 'function') teardownBondingArbView();
  // Teardown portfolio view when leaving
  if (typeof teardownPortfolioView === 'function') teardownPortfolioView();
  // Teardown funding view when leaving
  if (typeof teardownFundingView === 'function') teardownFundingView();

  // Play transition scoped to main content area (not sub-navigation like bot-detail)
  const transitionViews = ['builder', 'my-bots', 'backtest', 'templates', 'charting', 'portfolio', 'bonding-arb', 'catalyst', 'funding'];
  if (transitionViews.includes(viewName) && viewName !== currentView && typeof playMercuryTransition === 'function') {
    const mainContent = document.querySelector('.main-content');
    playMercuryTransition({ container: mainContent });
  }

  currentView = viewName;

  document.querySelectorAll('.app-view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });

  const target = document.getElementById('view-' + viewName);
  if (target) {
    target.classList.add('active');
    target.style.display = 'flex';
  }

  document.querySelectorAll('.sidebar-nav .nav-item[data-view]').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update logo sub-text based on current view
  const logoSub = document.querySelector('.logo-sub');
  if (logoSub) {
    const subTexts = { charting: 'Charting', portfolio: 'Portfolio', 'bonding-arb': 'Bonding Arb', catalyst: 'Catalyst', funding: 'Funding' };
    logoSub.textContent = subTexts[viewName] || 'Architect';
  }

  // Clean up when leaving bot detail view
  if (viewName !== 'bot-detail') {
    selectedBotId = null;
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    stopEngineLogPolling();
  }

  switch (viewName) {
    case 'builder':
      requestAnimationFrame(() => applyCanvasTransform());
      break;
    case 'my-bots':
      renderBots();
      break;
    case 'bot-detail':
      if (params && params.botId) {
        selectedBotId = params.botId;
        renderBotDetail(params.botId);
      }
      break;
    case 'backtest':
      populateBacktestStrategies();
      break;
    case 'templates':
      renderTemplates();
      break;
    case 'charting':
      // Charting is locked — show Coming Soon overlay, don't init dashboard
      break;
    case 'portfolio':
      if (typeof initPortfolioView === 'function') initPortfolioView();
      break;
    case 'bonding-arb':
      if (typeof initBondingArbView === 'function') initBondingArbView();
      break;
    case 'catalyst':
      if (typeof initCatalystView === 'function') initCatalystView();
      break;
    case 'funding':
      if (typeof initFundingView === 'function') initFundingView();
      break;
  }
}

// ═══════════════════════════════════════════════════════════════
// EVENT LISTENERS
// ═══════════════════════════════════════════════════════════════
function setupEventListeners() {
  // Sidebar nav
  document.querySelectorAll('.nav-item[data-view]').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchView(item.dataset.view);
      closeSidebarMobile();
    });
  });

  // Mobile menu
  document.getElementById('mobileMenuBtn').addEventListener('click', toggleSidebar);
  el.sidebarOverlay.addEventListener('click', toggleSidebar);

  // Charting waitlist form
  const waitlistForm = document.getElementById('chartingWaitlistForm');
  if (waitlistForm) {
    waitlistForm.addEventListener('submit', e => {
      e.preventDefault();
      const emailInput = document.getElementById('chartingWaitlistEmail');
      const msg = document.getElementById('chartingWaitlistMsg');
      const btn = waitlistForm.querySelector('.charting-lock-btn');
      if (emailInput && emailInput.value) {
        btn.disabled = true;
        btn.textContent = 'Joining...';
        // Simulate API call — replace with real endpoint
        setTimeout(() => {
          emailInput.style.display = 'none';
          btn.style.display = 'none';
          if (msg) msg.textContent = "You're on the list — we'll notify you at launch.";
        }, 800);
      }
    });
  }

  // Palette group toggles
  document.querySelectorAll('.palette-group-header').forEach(header => {
    header.addEventListener('click', () => {
      header.parentElement.classList.toggle('open');
    });
  });

  // Palette search
  document.getElementById('paletteSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.palette-item').forEach(item => {
      const nameEl = item.querySelector('.palette-item-name');
      const name = nameEl ? nameEl.textContent.toLowerCase() : '';
      item.style.display = name.includes(q) ? '' : 'none';
    });
    if (q) {
      document.querySelectorAll('.palette-group').forEach(g => g.classList.add('open'));
    }
  });

  // Palette drag
  document.querySelectorAll('.palette-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      e.dataTransfer.setData('node-type', item.dataset.nodeType);
      e.dataTransfer.effectAllowed = 'copy';
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', () => item.classList.remove('dragging'));
  });

  // Canvas drop
  el.canvasContainer.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  el.canvasContainer.addEventListener('drop', e => {
    e.preventDefault();
    const nodeType = e.dataTransfer.getData('node-type');
    if (!nodeType || !NODE_TYPES[nodeType]) return;
    const pos = screenToCanvas(e.clientX, e.clientY);
    pushUndo();
    createNode(nodeType, snapToGrid(pos.x), snapToGrid(pos.y));
    updateAllConnections();
    updateMercuryScript();
  });

  // Canvas pan & zoom
  el.canvasContainer.addEventListener('mousedown', onCanvasMouseDown);
  window.addEventListener('mousemove', onCanvasMouseMove);
  window.addEventListener('mouseup', onCanvasMouseUp);
  el.canvasContainer.addEventListener('wheel', onCanvasWheel, { passive: false });

  // Canvas click (deselect or cancel connection — suppressed after panning)
  el.canvasContainer.addEventListener('click', e => {
    if (canvas.didPan) {
      canvas.didPan = false;
      return; // suppress click that follows a pan drag
    }
    if (e.target === el.canvasContainer || e.target === el.canvasViewport ||
        e.target === el.connectionsLayer) {
      if (connectingFrom) {
        cancelConnection();
      } else {
        deselectNode();
        deselectConnection();
      }
    }
  });

  // Toolbar buttons (only bind if they exist in DOM)
  const btnCommit = document.getElementById('btnCommit');
  const btnDeploy = document.getElementById('btnDeploy');
  if (btnCommit) btnCommit.addEventListener('click', openCommitModal);
  if (btnDeploy) btnDeploy.addEventListener('click', openDeployModal);

  // Strategy name auto-save
  if (el.strategyName) {
    el.strategyName.addEventListener('input', () => autoSaveStrategy());
  }

  // Export / Import buttons
  const btnExport = document.getElementById('btnExportStrategy');
  const btnImport = document.getElementById('btnImportStrategy');
  if (btnExport) btnExport.addEventListener('click', exportStrategy);
  if (btnImport) btnImport.addEventListener('click', importStrategy);

  // Script overlay buttons
  const btnCopyScript = document.getElementById('btnCopyScript');
  const btnSwitchToNodes = document.getElementById('btnSwitchToNodes');
  if (btnCopyScript) btnCopyScript.addEventListener('click', () => {
    if (activeScript) {
      navigator.clipboard.writeText(activeScript).then(() => showToast('Script copied to clipboard'));
    }
  });
  if (btnSwitchToNodes) btnSwitchToNodes.addEventListener('click', () => {
    hideScriptOverlay();
    if (nodes.length === 0) loadDefaultStrategy();
    updateMercuryScript();
    autoSaveStrategy();
    showToast('Switched to node editor');
  });

  // Inspector
  document.getElementById('inspectorClose').addEventListener('click', deselectNode);
  document.getElementById('btnDeleteNode').addEventListener('click', () => {
    if (selectedNodeId) { pushUndo(); deleteNode(selectedNodeId); }
  });
  document.getElementById('btnDuplicateNode').addEventListener('click', duplicateSelectedNode);

  // Agent panel
  if (el.agentSend) el.agentSend.addEventListener('click', handleAgentInput);
  if (el.agentInput) el.agentInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAgentInput();
  });

  // Agent panel tab
  if (el.tabAgent) el.tabAgent.addEventListener('click', () => switchAgentTab('agent'));

  // Floating palette
  if (el.btnPaletteToggle) el.btnPaletteToggle.addEventListener('click', () => toggleFloatingPalette(true));
  if (el.btnPaletteClose) el.btnPaletteClose.addEventListener('click', () => toggleFloatingPalette(false));

  // Commit modal
  document.getElementById('commitModalClose').addEventListener('click', closeCommitModal);
  document.getElementById('commitCancel').addEventListener('click', closeCommitModal);
  document.getElementById('commitConfirm').addEventListener('click', confirmCommit);
  document.getElementById('commitModal').addEventListener('click', e => {
    if (e.target.id === 'commitModal') closeCommitModal();
  });

  // Connect account modal
  const connectClose = document.getElementById('connectModalClose');
  const connectCancel = document.getElementById('connectCancel');
  const connectConfirm = document.getElementById('connectConfirm');
  const connectModal = document.getElementById('connectAccountModal');
  if (connectClose) connectClose.addEventListener('click', closeConnectModal);
  if (connectCancel) connectCancel.addEventListener('click', closeConnectModal);
  if (connectConfirm) connectConfirm.addEventListener('click', confirmConnect);
  if (connectModal) connectModal.addEventListener('click', e => {
    if (e.target.id === 'connectAccountModal') closeConnectModal();
  });

  // MercuryScript panel toggle
  document.getElementById('btnScriptToggle').addEventListener('click', toggleScriptPanel);
  const scriptPanel = document.getElementById('mercuryScriptPanel');
  const scriptHeader = scriptPanel ? scriptPanel.querySelector('.mercuryscript-header') : null;
  if (scriptHeader) scriptHeader.addEventListener('click', toggleScriptPanel);

  // Deploy modal
  document.getElementById('deployModalClose').addEventListener('click', closeDeployModal);
  document.getElementById('deployCancel').addEventListener('click', closeDeployModal);
  document.getElementById('deployConfirm').addEventListener('click', confirmDeploy);
  document.getElementById('deployModal').addEventListener('click', e => {
    if (e.target.id === 'deployModal') closeDeployModal();
  });

  // Live Review Modal listeners
  var lrClose = document.getElementById('liveReviewClose');
  var lrCancel = document.getElementById('liveReviewCancel');
  var lrCheckbox = document.getElementById('lrTermsCheckbox');
  var lrConfirm = document.getElementById('liveReviewConfirm');

  if (lrClose) lrClose.addEventListener('click', function() {
    document.getElementById('liveReviewModal').classList.remove('open');
  });
  if (lrCancel) lrCancel.addEventListener('click', function() {
    document.getElementById('liveReviewModal').classList.remove('open');
  });
  if (lrCheckbox) lrCheckbox.addEventListener('change', function() {
    if (lrConfirm) {
      lrConfirm.disabled = !lrCheckbox.checked;
      lrConfirm.style.opacity = lrCheckbox.checked ? '1' : '0.4';
      lrConfirm.style.cursor = lrCheckbox.checked ? 'pointer' : 'not-allowed';
    }
  });
  if (lrConfirm) lrConfirm.addEventListener('click', function() {
    // If terms not yet accepted, require checkbox; if already accepted, allow directly
    var alreadyAccepted = localStorage.getItem('mercury_live_terms_accepted') === '1';
    if (!alreadyAccepted && (!lrCheckbox || !lrCheckbox.checked)) return;
    // Save terms acceptance for future deploys
    if (!alreadyAccepted) localStorage.setItem('mercury_live_terms_accepted', '1');
    document.getElementById('liveReviewModal').classList.remove('open');
    var s = showLiveReviewModal._pendingStrategy;
    var bn = showLiveReviewModal._pendingBotName;
    var pl = showLiveReviewModal._pendingPlatform;
    var cap = showLiveReviewModal._pendingCapital;
    if (s) {
      // Apply live risk config overrides
      _applyLiveConfigOverrides(s);
      _executeDeploy(s, bn, pl, cap, 'live', true);
    }
  });

  // Bot detail
  document.getElementById('detailBack').addEventListener('click', () => switchView('my-bots'));
  document.getElementById('btnPauseBot').addEventListener('click', () => toggleBotStatus('paused'));
  document.getElementById('btnRestartBot').addEventListener('click', () => toggleBotStatus('live'));
  document.getElementById('btnKillBot').addEventListener('click', killBot);
  document.getElementById('btnDeleteBot').addEventListener('click', deleteBot);
  document.getElementById('btnEditStrategy').addEventListener('click', () => {
    switchView('builder');
    showToast('Strategy loaded into builder');
  });

  // CSV export buttons
  const btnExportTrades = document.getElementById('btnExportTrades');
  if (btnExportTrades) btnExportTrades.addEventListener('click', () => exportBotCSV('trades'));
  const btnExportLogs = document.getElementById('btnExportLogs');
  if (btnExportLogs) btnExportLogs.addEventListener('click', () => exportBotCSV('logs'));

  // Backtest
  document.getElementById('btnRunBacktest').addEventListener('click', runBacktest);

  // My Bots
  document.getElementById('btnNewBot').addEventListener('click', () => switchView('builder'));
  document.getElementById('botSort').addEventListener('change', renderBots);
  document.querySelectorAll('#botFilters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#botFilters .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderBots();
    });
  });

  // Templates
  document.querySelectorAll('#templateFilters .filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#templateFilters .filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderTemplates();
    });
  });

  // Toast close
  document.getElementById('toastClose').addEventListener('click', () => {
    el.toast.classList.remove('show');
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
}

// ═══════════════════════════════════════════════════════════════
// CANVAS — PAN & ZOOM
// ═══════════════════════════════════════════════════════════════
const PAN_THRESHOLD = 4; // px — must move this far before it counts as a pan (vs a click)

function onCanvasMouseDown(e) {
  // Middle mouse or space+left: always pan
  if (e.button === 1 || (e.button === 0 && canvas.spaceHeld)) {
    e.preventDefault();
    canvas.isPanning = true;
    canvas.panStartX = e.clientX;
    canvas.panStartY = e.clientY;
    canvas.panStartPanX = canvas.panX;
    canvas.panStartPanY = canvas.panY;
    el.canvasContainer.classList.add('panning');
    return;
  }

  // Left-click on empty canvas background: start potential pan
  if (e.button === 0 && (
    e.target === el.canvasContainer ||
    e.target === el.canvasViewport ||
    e.target === el.connectionsLayer
  )) {
    canvas.maybePanning = true;
    canvas.panStartX = e.clientX;
    canvas.panStartY = e.clientY;
    canvas.panStartPanX = canvas.panX;
    canvas.panStartPanY = canvas.panY;
  }
}

/** Find the nearest port to screen coordinates (px). Returns { nodeId, portId, portType, dist, dotEl } or null. */
function findNearestPort(screenX, screenY, excludeNodeId, wantType) {
  let best = null;
  let bestDist = Infinity;
  const SNAP_RADIUS = 30; // px on screen

  nodes.forEach(node => {
    if (node.id === excludeNodeId) return;
    if (!node.domElement) return;
    const def = NODE_TYPES[node.type];
    if (!def) return;

    const checkPorts = (ports, portType) => {
      if (wantType && portType !== wantType) return;
      ports.forEach(port => {
        const dotEl = node.domElement.querySelector(
          `.node-port-${portType === 'output' ? 'out' : 'in'}[data-port="${port.id}"] .port-dot`
        );
        if (!dotEl) return;
        const rect = dotEl.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dist = Math.hypot(screenX - cx, screenY - cy);
        if (dist < SNAP_RADIUS && dist < bestDist) {
          bestDist = dist;
          best = { nodeId: node.id, portId: port.id, portType, dist, dotEl };
        }
      });
    };

    checkPorts(def.inputs, 'input');
    checkPorts(def.outputs, 'output');
  });

  return best;
}

/** Clear all connection-mode highlights */
function clearPortHighlights() {
  document.querySelectorAll('.port-dot.drop-target').forEach(d => d.classList.remove('drop-target'));
  document.querySelectorAll('.canvas-node.connect-target').forEach(n => n.classList.remove('connect-target'));
}

function onCanvasMouseMove(e) {
  // Promote maybe-pan to real pan once threshold is crossed
  if (canvas.maybePanning && !canvas.isPanning) {
    const dx = e.clientX - canvas.panStartX;
    const dy = e.clientY - canvas.panStartY;
    if (Math.abs(dx) > PAN_THRESHOLD || Math.abs(dy) > PAN_THRESHOLD) {
      canvas.isPanning = true;
      canvas.didPan = true;
      canvas.maybePanning = false;
      el.canvasContainer.classList.add('panning');
    }
  }

  if (canvas.isPanning) {
    canvas.panX = canvas.panStartPanX + (e.clientX - canvas.panStartX);
    canvas.panY = canvas.panStartPanY + (e.clientY - canvas.panStartY);
    applyCanvasTransform();
    return;
  }

  if (draggingNodeId) {
    const pos = screenToCanvas(e.clientX, e.clientY);
    const node = nodes.find(n => n.id === draggingNodeId);
    if (node) {
      node.x = snapToGrid(pos.x - dragOffsetX);
      node.y = snapToGrid(pos.y - dragOffsetY);
      node.domElement.style.left = node.x + 'px';
      node.domElement.style.top = node.y + 'px';
      updateAllConnections();
      updateMercuryScript();
    }
    return;
  }

  if (connectingFrom && tempConnectionLine) {
    const pos = screenToCanvas(e.clientX, e.clientY);
    const fromNode = nodes.find(n => n.id === connectingFrom.nodeId);
    if (fromNode) {
      // Highlight nearest valid target port & snap wire to it
      clearPortHighlights();
      const wantType = connectingFrom.portType === 'output' ? 'input' : 'output';
      const nearest = findNearestPort(e.clientX, e.clientY, connectingFrom.nodeId, wantType);
      if (nearest && nearest.dotEl) {
        nearest.dotEl.classList.add('drop-target');
        const targetNode = nodes.find(n => n.id === nearest.nodeId);
        if (targetNode) {
          const snapPos = getPortPosition(targetNode, nearest.portId, nearest.portType);
          const fromPos = getPortPosition(fromNode, connectingFrom.portId, connectingFrom.portType);
          tempConnectionLine.setAttribute('d', calcBezierPath(fromPos.x, fromPos.y, snapPos.x, snapPos.y));
          return;
        }
      }
      const fromPos = getPortPosition(fromNode, connectingFrom.portId, connectingFrom.portType);
      tempConnectionLine.setAttribute('d', calcBezierPath(fromPos.x, fromPos.y, pos.x, pos.y));
    }
  }
}

function onCanvasMouseUp(e) {
  // End panning (real or aborted maybe-pan)
  if (canvas.isPanning) {
    canvas.isPanning = false;
    el.canvasContainer.classList.remove('panning');
  }
  canvas.maybePanning = false;

  if (draggingNodeId) {
    const node = nodes.find(n => n.id === draggingNodeId);
    if (node && node.domElement) node.domElement.classList.remove('dragging');
    draggingNodeId = null;
    autoSaveStrategy();
  }

  // For drag-to-connect: try proximity snap on mouseup
  // For click-to-connect: don't cancel here (user will click the target port)
  if (connectingFrom && draggingNodeId === null) {
    const wantType = connectingFrom.portType === 'output' ? 'input' : 'output';
    const nearest = findNearestPort(e.clientX, e.clientY, connectingFrom.nodeId, wantType);
    if (nearest) {
      endConnection(nearest.nodeId, nearest.portId, nearest.portType);
    }
    // Don't cancel — connection stays active for click-to-connect mode
  }
}

function onCanvasWheel(e) {
  if (!el.canvasContainer.contains(e.target)) return;
  e.preventDefault();

  const rect = el.canvasContainer.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const oldZoom = canvas.zoom;
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  const newZoom = Math.max(0.25, Math.min(2, oldZoom + delta));

  // Zoom centered on cursor
  canvas.panX = mouseX - (mouseX - canvas.panX) * (newZoom / oldZoom);
  canvas.panY = mouseY - (mouseY - canvas.panY) * (newZoom / oldZoom);
  canvas.zoom = newZoom;

  applyCanvasTransform();
  updateMercuryScript();
}

function setZoom(val) {
  const rect = el.canvasContainer.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const oldZoom = canvas.zoom;
  const newZoom = Math.max(0.25, Math.min(2, val));

  canvas.panX = cx - (cx - canvas.panX) * (newZoom / oldZoom);
  canvas.panY = cy - (cy - canvas.panY) * (newZoom / oldZoom);
  canvas.zoom = newZoom;

  applyCanvasTransform();
  updateMercuryScript();
}

function applyCanvasTransform() {
  el.canvasViewport.style.transform =
    `translate(${canvas.panX}px, ${canvas.panY}px) scale(${canvas.zoom})`;
  if (el.zoomLabel) el.zoomLabel.textContent = Math.round(canvas.zoom * 100) + '%';
}

function toggleGrid() {
  canvas.gridVisible = !canvas.gridVisible;
  el.canvasViewport.classList.toggle('grid-visible', canvas.gridVisible);
  const btnGrid = document.getElementById('btnGridToggle');
  if (btnGrid) btnGrid.classList.toggle('active', canvas.gridVisible);
}

function screenToCanvas(sx, sy) {
  const rect = el.canvasContainer.getBoundingClientRect();
  return {
    x: (sx - rect.left - canvas.panX) / canvas.zoom,
    y: (sy - rect.top - canvas.panY) / canvas.zoom,
  };
}

function snapToGrid(val) {
  return Math.round(val / 20) * 20;
}

/** Fit all nodes into view with padding */
function fitToView() {
  if (nodes.length === 0) return;
  const rect = el.canvasContainer.getBoundingClientRect();
  const PAD = 60;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  nodes.forEach(n => {
    const w = n.domElement ? n.domElement.offsetWidth : 180;
    const h = n.domElement ? n.domElement.offsetHeight : 100;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + w);
    maxY = Math.max(maxY, n.y + h);
  });

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const scaleX = (rect.width - PAD * 2) / contentW;
  const scaleY = (rect.height - PAD * 2) / contentH;
  const newZoom = Math.max(0.25, Math.min(1.5, Math.min(scaleX, scaleY)));

  canvas.zoom = newZoom;
  canvas.panX = (rect.width - contentW * newZoom) / 2 - minX * newZoom;
  canvas.panY = (rect.height - contentH * newZoom) / 2 - minY * newZoom;
  applyCanvasTransform();
}
window.fitToView = fitToView;

// ═══════════════════════════════════════════════════════════════
// NODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function createNode(type, x, y, propOverrides, idOverride) {
  const def = NODE_TYPES[type];
  if (!def) return null;

  const id = idOverride || ('node-' + (nextNodeId++));
  const props = {};
  def.properties.forEach(p => {
    props[p.key] = propOverrides && propOverrides[p.key] !== undefined ? propOverrides[p.key] : p.default;
  });

  const node = { id, type, x, y, properties: props, domElement: null };

  // Create DOM
  const div = document.createElement('div');
  div.className = 'canvas-node';
  div.id = id;
  div.style.left = x + 'px';
  div.style.top = y + 'px';
  div.dataset.category = def.category;

  div.innerHTML = buildNodeHTML(node, def);
  node.domElement = div;

  el.canvasViewport.appendChild(div);

  // Node drag
  div.addEventListener('mousedown', e => {
    if (e.target.closest('.node-port')) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = screenToCanvas(e.clientX, e.clientY);
    dragOffsetX = pos.x - node.x;
    dragOffsetY = pos.y - node.y;
    draggingNodeId = id;
    div.classList.add('dragging');
    pushUndo();
    selectNode(id);
  });

  // Node click select
  div.addEventListener('click', e => {
    if (e.target.closest('.node-port')) return; // handled by port click
    e.stopPropagation();
    selectNode(id);
  });

  // Port interactions — click-to-connect + drag-to-connect
  bindPortEvents(div, id);

  nodes.push(node);
  autoSaveStrategy();
  return node;
}

function buildNodeHTML(node, def) {
  let html = '';

  // Header
  html += `<div class="node-header">
    <span class="node-category-dot" style="background:${def.color}"></span>
    <span class="node-type-label">${CATEGORY_LABELS[def.category]}</span>
    <span class="node-name">${def.label}</span>
  </div>`;

  // Input ports
  if (def.inputs.length > 0) {
    html += '<div class="node-ports node-ports-in">';
    def.inputs.forEach(port => {
      const connected = connections.some(c => c.toNodeId === node.id && c.toPortId === port.id);
      html += `<div class="node-port node-port-in" data-port="${port.id}" data-node="${node.id}">
        <span class="port-dot ${connected ? 'connected' : ''}"></span>
        <span class="port-label">${port.label}</span>
      </div>`;
    });
    html += '</div>';
  }

  // Body (property preview)
  html += '<div class="node-body">';
  const previewProps = def.properties.slice(0, 3);
  previewProps.forEach(p => {
    const val = node.properties[p.key];
    let display;
    if (p.type === 'contract-input') {
      if (val && typeof val === 'object' && (val.question || val.series_label)) {
        const name = val.series_label || val.question;
        const seriesTag = val.series_ticker && !val.series_label ? ` [${val.series_ticker}]` : '';
        display = name.length > 24 ? name.slice(0, 24) + '...' + seriesTag : name + seriesTag;
      } else if (typeof val === 'string' && val) {
        display = val.length > 28 ? val.slice(0, 28) + '...' : val;
      } else {
        display = '--';
      }
    } else {
      display = val !== undefined && val !== null && val !== '' ? val : '--';
    }
    html += `<div class="node-prop-row">
      <span class="node-prop-key">${p.label}</span>
      <span class="node-prop-val">${display}</span>
    </div>`;
  });
  html += '</div>';

  // Output ports
  if (def.outputs.length > 0) {
    html += '<div class="node-ports node-ports-out">';
    def.outputs.forEach(port => {
      const connected = connections.some(c => c.fromNodeId === node.id && c.fromPortId === port.id);
      html += `<div class="node-port node-port-out" data-port="${port.id}" data-node="${node.id}">
        <span class="port-label">${port.label}</span>
        <span class="port-dot ${connected ? 'connected' : ''}"></span>
      </div>`;
    });
    html += '</div>';
  }

  return html;
}

/** Bind port event handlers (click-to-connect + drag-to-connect) */
function bindPortEvents(container, nodeId) {
  container.querySelectorAll('.node-port').forEach(portEl => {
    // Click: start or complete connection
    portEl.addEventListener('click', e => {
      e.stopPropagation();
      const portId = portEl.dataset.port;
      const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';

      if (connectingFrom) {
        // Complete the connection
        endConnection(nodeId, portId, portType);
      } else {
        // Start a new connection
        startConnection(nodeId, portId, portType);
      }
    });

    // Mousedown: also start connection (for drag-to-connect)
    portEl.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      // Don't re-start if already connecting (click mode)
      if (connectingFrom) return;
      const portId = portEl.dataset.port;
      const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
      startConnection(nodeId, portId, portType);
    });

    // Mouseup on port: complete if dragging
    portEl.addEventListener('mouseup', e => {
      if (connectingFrom) {
        const portId = portEl.dataset.port;
        const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
        endConnection(nodeId, portId, portType);
      }
    });
  });
}

function refreshNodeDOM(node) {
  const def = NODE_TYPES[node.type];
  if (!def || !node.domElement) return;
  node.domElement.innerHTML = buildNodeHTML(node, def);
  bindPortEvents(node.domElement, node.id);
}

function deleteNode(nodeId) {
  const idx = nodes.findIndex(n => n.id === nodeId);
  if (idx === -1) return;

  const node = nodes[idx];
  if (node.domElement) node.domElement.remove();
  nodes.splice(idx, 1);

  // Remove connections
  connections = connections.filter(c => {
    if (c.fromNodeId === nodeId || c.toNodeId === nodeId) {
      if (c.svgPath) c.svgPath.remove(); if (c.hitArea) c.hitArea.remove();
      return false;
    }
    return true;
  });

  if (selectedNodeId === nodeId) deselectNode();
  updateAllConnections();
  updateMercuryScript();
  autoSaveStrategy();
}

function selectNode(nodeId) {
  deselectNode();
  deselectConnection();
  selectedNodeId = nodeId;
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  node.domElement.classList.add('selected');
  renderInspector(nodeId);
  el.nodeInspector.style.display = 'flex';
}

function deselectNode() {
  if (selectedNodeId) {
    const node = nodes.find(n => n.id === selectedNodeId);
    if (node && node.domElement) node.domElement.classList.remove('selected');
  }
  selectedNodeId = null;
  el.nodeInspector.style.display = 'none';
}

function duplicateSelectedNode() {
  if (!selectedNodeId) return;
  const orig = nodes.find(n => n.id === selectedNodeId);
  if (!orig) return;
  pushUndo();
  const newNode = createNode(orig.type, orig.x + 40, orig.y + 40, { ...orig.properties });
  if (newNode) {
    selectNode(newNode.id);
    updateMercuryScript();
    showToast('Node duplicated');
  }
}

// ═══════════════════════════════════════════════════════════════
// CONNECTIONS
// ═══════════════════════════════════════════════════════════════
function startConnection(nodeId, portId, portType) {
  connectingFrom = { nodeId, portId, portType };

  const svgNS = 'http://www.w3.org/2000/svg';
  tempConnectionLine = document.createElementNS(svgNS, 'path');
  tempConnectionLine.classList.add('temp-connection');
  el.connectionsLayer.appendChild(tempConnectionLine);

  // Show connection mode UI
  showConnectModeBanner();
  highlightValidTargets(nodeId, portType);
}

function cancelConnection() {
  clearPortHighlights();
  hideConnectModeBanner();
  if (tempConnectionLine) { tempConnectionLine.remove(); tempConnectionLine = null; }
  connectingFrom = null;
}

function endConnection(nodeId, portId, portType) {
  if (!connectingFrom) return;

  // Must be output -> input
  let fromNodeId, fromPortId, toNodeId, toPortId;
  if (connectingFrom.portType === 'output' && portType === 'input') {
    fromNodeId = connectingFrom.nodeId;
    fromPortId = connectingFrom.portId;
    toNodeId = nodeId;
    toPortId = portId;
  } else if (connectingFrom.portType === 'input' && portType === 'output') {
    fromNodeId = nodeId;
    fromPortId = portId;
    toNodeId = connectingFrom.nodeId;
    toPortId = connectingFrom.portId;
  } else {
    cancelConnection();
    return;
  }

  // No self-connection
  if (fromNodeId === toNodeId) {
    cancelConnection();
    return;
  }

  // No duplicate
  const exists = connections.some(c =>
    c.fromNodeId === fromNodeId && c.fromPortId === fromPortId &&
    c.toNodeId === toNodeId && c.toPortId === toPortId
  );

  if (!exists) {
    pushUndo();
    addConnection(fromNodeId, fromPortId, toNodeId, toPortId);
    showToast('Connected!');
  }

  clearPortHighlights();
  hideConnectModeBanner();
  if (tempConnectionLine) { tempConnectionLine.remove(); tempConnectionLine = null; }
  connectingFrom = null;
}

/** Show a banner telling the user they're in connection mode */
function showConnectModeBanner() {
  hideConnectModeBanner();
  const banner = document.createElement('div');
  banner.id = 'connectModeBanner';
  banner.className = 'connect-mode-banner';
  banner.innerHTML = 'Click a port on another node to connect &nbsp;<kbd>Esc</kbd> to cancel <button class="connect-mode-close" onclick="cancelConnection()">&times;</button>';
  document.body.appendChild(banner);
}

function hideConnectModeBanner() {
  const banner = document.getElementById('connectModeBanner');
  if (banner) banner.remove();
}

/** Highlight all valid target nodes (those with ports of the opposite type) */
function highlightValidTargets(sourceNodeId, sourcePortType) {
  const wantType = sourcePortType === 'output' ? 'input' : 'output';
  nodes.forEach(node => {
    if (node.id === sourceNodeId || !node.domElement) return;
    const def = NODE_TYPES[node.type];
    if (!def) return;
    const hasPorts = wantType === 'input' ? def.inputs.length > 0 : def.outputs.length > 0;
    if (hasPorts) {
      node.domElement.classList.add('connect-target');
    }
  });
}

function addConnection(fromNodeId, fromPortId, toNodeId, toPortId) {
  const id = 'conn-' + (nextConnId++);
  const fromNode = nodes.find(n => n.id === fromNodeId);
  const nodeDef = fromNode ? NODE_TYPES[fromNode.type] : null;
  const category = nodeDef ? nodeDef.category : '';

  const svgNS = 'http://www.w3.org/2000/svg';

  // Invisible fat hit-area path (easy to click)
  const hitArea = document.createElementNS(svgNS, 'path');
  hitArea.classList.add('connection-hit-area');
  el.connectionsLayer.appendChild(hitArea);

  // Visible thin path
  const path = document.createElementNS(svgNS, 'path');
  path.classList.add('connection-path');
  if (category) path.classList.add(category);
  path.id = id;
  el.connectionsLayer.appendChild(path);

  // Click on either the visible path or the wide hit area
  const onClick = e => {
    e.stopPropagation();
    selectConnection(id);
  };
  path.addEventListener('click', onClick);
  hitArea.addEventListener('click', onClick);

  const conn = { id, fromNodeId, fromPortId, toNodeId, toPortId, svgPath: path, hitArea };
  connections.push(conn);

  updateConnectionPath(conn);
  updatePortDots();
  autoSaveStrategy();
  return conn;
}

function selectConnection(connId) {
  deselectConnection();
  deselectNode();
  selectedConnectionId = connId;
  const conn = connections.find(c => c.id === connId);
  if (conn && conn.svgPath) {
    conn.svgPath.classList.add('selected-conn');
  }
  showToast('Connection selected — press Delete to remove');
}

function deselectConnection() {
  if (selectedConnectionId) {
    const conn = connections.find(c => c.id === selectedConnectionId);
    if (conn && conn.svgPath) conn.svgPath.classList.remove('selected-conn');
  }
  selectedConnectionId = null;
}

function deleteConnection(connId) {
  const idx = connections.findIndex(c => c.id === connId);
  if (idx === -1) return;
  const conn = connections[idx];
  if (conn.svgPath) conn.svgPath.remove();
  if (conn.hitArea) conn.hitArea.remove();
  connections.splice(idx, 1);
  if (selectedConnectionId === connId) selectedConnectionId = null;
  updatePortDots();
  updateMercuryScript();
  autoSaveStrategy();
  showToast('Connection removed');
}

function updateConnectionPath(conn) {
  const fromNode = nodes.find(n => n.id === conn.fromNodeId);
  const toNode = nodes.find(n => n.id === conn.toNodeId);
  if (!fromNode || !toNode || !conn.svgPath) return;

  const from = getPortPosition(fromNode, conn.fromPortId, 'output');
  const to = getPortPosition(toNode, conn.toPortId, 'input');

  const d = calcBezierPath(from.x, from.y, to.x, to.y);
  conn.svgPath.setAttribute('d', d);
  if (conn.hitArea) conn.hitArea.setAttribute('d', d);
}

function updateAllConnections() {
  connections.forEach(c => updateConnectionPath(c));
}

function getPortPosition(node, portId, portType) {
  if (!node.domElement) return { x: node.x, y: node.y };

  const portEl = node.domElement.querySelector(
    `.node-port-${portType === 'output' ? 'out' : 'in'}[data-port="${portId}"] .port-dot`
  );

  if (!portEl) {
    // Fallback: approximate
    const w = node.domElement.offsetWidth || 180;
    const h = node.domElement.offsetHeight || 80;
    return {
      x: node.x + (portType === 'output' ? w : 0),
      y: node.y + h / 2,
    };
  }

  const nodeRect = node.domElement.getBoundingClientRect();
  const portRect = portEl.getBoundingClientRect();
  const zoom = canvas.zoom || 1;

  return {
    x: node.x + (portRect.left + portRect.width / 2 - nodeRect.left) / zoom,
    y: node.y + (portRect.top + portRect.height / 2 - nodeRect.top) / zoom,
  };
}

function calcBezierPath(x1, y1, x2, y2) {
  const dx = Math.abs(x2 - x1);
  const offset = Math.max(60, dx * 0.4);
  return `M ${x1} ${y1} C ${x1 + offset} ${y1}, ${x2 - offset} ${y2}, ${x2} ${y2}`;
}

function updatePortDots() {
  nodes.forEach(node => {
    if (!node.domElement) return;
    node.domElement.querySelectorAll('.port-dot').forEach(dot => {
      const portEl = dot.parentElement;
      const portId = portEl.dataset.port;
      const isOut = portEl.classList.contains('node-port-out');
      const isConnected = connections.some(c =>
        isOut ? (c.fromNodeId === node.id && c.fromPortId === portId)
              : (c.toNodeId === node.id && c.toPortId === portId)
      );
      dot.classList.toggle('connected', isConnected);
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// MERCURYSCRIPT GENERATOR
// ═══════════════════════════════════════════════════════════════
function updateMercuryScript() {
  if (!el.mercuryScriptCode) return;

  // If a script strategy is active, show that instead of node pseudocode
  if (activeScript) {
    el.mercuryScriptCode.innerHTML =
      '<span class="ms-comment"># AI-generated strategy script</span>\n' +
      '<span class="ms-comment"># ' + escapeHtml(activeScriptName || 'AI Strategy') + '</span>\n\n' +
      escapeHtml(activeScript);
    return;
  }

  if (nodes.length === 0) {
    el.mercuryScriptCode.innerHTML = '<span class="ms-comment"># No nodes yet — drag nodes or ask AI to build a strategy</span>';
    return;
  }

  let script = '';
  const stratName = el.strategyName.value || 'untitled_strategy';
  script += `<span class="ms-comment"># MercuryScript — ${esc(stratName)}</span>\n`;
  script += `<span class="ms-comment"># ${nodes.length} nodes, ${connections.length} connections</span>\n\n`;

  // Find root nodes (no inputs connected)
  const rootNodes = nodes.filter(n => {
    const def = NODE_TYPES[n.type];
    return def && def.inputs.length === 0;
  });

  const visited = new Set();

  function scriptNode(node, indent) {
    if (visited.has(node.id)) return '';
    visited.add(node.id);

    const def = NODE_TYPES[node.type];
    if (!def) return '';

    const pad = '  '.repeat(indent);
    let out = '';

    const cat = def.category;
    const catTag = cat === 'trigger' ? 'ms-keyword' : cat === 'condition' ? 'ms-operator' : cat === 'execution' ? 'ms-function' : 'ms-type';

    if (cat === 'trigger') {
      out += `${pad}<span class="${catTag}">when</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${esc(val)}</span>`;
        if (p.type === 'contract-input') {
          const q = val && typeof val === 'object' ? val.question : val;
          return `<span class="ms-string">"${esc(q || 'any')}"</span>`;
        }
        return `<span class="ms-string">"${esc(val)}"</span>`;
      }).join(', ');
      out += paramStr + '):\n';
    } else if (cat === 'condition') {
      out += `${pad}<span class="${catTag}">if</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${esc(val)}</span>`;
        if (p.type === 'contract-input') {
          const q = val && typeof val === 'object' ? val.question : val;
          return `<span class="ms-string">"${esc(q || 'any')}"</span>`;
        }
        return `<span class="ms-string">"${esc(val)}"</span>`;
      }).join(', ');
      out += paramStr + '):\n';
    } else if (cat === 'execution') {
      out += `${pad}<span class="${catTag}">execute</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${esc(val)}</span>`;
        if (p.type === 'contract-input') {
          const q = val && typeof val === 'object' ? val.question : val;
          return `<span class="ms-string">"${esc(q || 'any')}"</span>`;
        }
        return `<span class="ms-string">"${esc(val)}"</span>`;
      }).join(', ');
      out += paramStr + ')\n';
    } else if (cat === 'risk') {
      out += `${pad}<span class="${catTag}">guard</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${esc(val)}</span>`;
        if (p.type === 'contract-input') {
          const q = val && typeof val === 'object' ? val.question : val;
          return `<span class="ms-string">"${esc(q || 'any')}"</span>`;
        }
        return `<span class="ms-string">"${esc(val)}"</span>`;
      }).join(', ');
      out += paramStr + ')\n';
    }

    // Follow connections
    const outConns = connections.filter(c => c.fromNodeId === node.id);
    outConns.forEach(c => {
      const target = nodes.find(n => n.id === c.toNodeId);
      if (target) {
        out += scriptNode(target, indent + 1);
      }
    });

    return out;
  }

  if (rootNodes.length > 0) {
    rootNodes.forEach(rn => {
      script += scriptNode(rn, 0);
      script += '\n';
    });
  } else {
    // No root nodes, just list all
    nodes.forEach(n => {
      script += scriptNode(n, 0);
    });
  }

  // Version
  const versionEl = document.getElementById('scriptVersion');
  const commitCount = getCommitHistory().length;
  if (versionEl) versionEl.textContent = 'v0.' + (commitCount + 1);

  el.mercuryScriptCode.innerHTML = script || '<span class="ms-comment"># Empty strategy</span>';
}

function toggleScriptPanel() {
  el.mercuryScriptPanel.classList.toggle('collapsed');
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY COMPILER
// ═══════════════════════════════════════════════════════════════

/**
 * Compile the current canvas into a portable strategy JSON.
 * Walks the graph from trigger (root) nodes, follows connections,
 * and categorizes each node into the pipeline.
 * Returns { strategy, errors } where errors is an array of strings.
 */
function compileStrategy() {
  const errors = [];
  const stratName = (el.strategyName ? el.strategyName.value : '') || 'untitled_strategy';

  // Script-based strategy (AI agent) — bypass node compilation
  if (activeScript) {
    const assetConfig = activeScriptAsset || window._agentAssetConfig || {
      asset_type: 'prediction_market', symbol: '', platform: 'Auto',
    };
    const strategy = {
      version: 1,
      name: stratName,
      compiled_at: new Date().toISOString(),
      node_count: 0,
      connection_count: 0,
      pipeline: { triggers: [], conditions: [], executions: [], risk: [] },
      layout: { nodes: [], connections: [] },
      config: {
        platform: assetConfig.platform || 'Auto',
        capital: 10000,
        mode: 'paper',
        asset: assetConfig,
      },
      script: activeScript,
    };
    return { strategy, errors: [] };
  }

  if (nodes.length === 0) {
    errors.push('Canvas is empty — add nodes to build a strategy');
    return { strategy: null, errors };
  }

  // Categorize nodes
  const triggerNodes = [];
  const conditionNodes = [];
  const executionNodes = [];
  const riskNodes = [];

  nodes.forEach(n => {
    const def = NODE_TYPES[n.type];
    if (!def) return;
    switch (def.category) {
      case 'trigger': triggerNodes.push(n); break;
      case 'condition': conditionNodes.push(n); break;
      case 'execution': executionNodes.push(n); break;
      case 'risk': riskNodes.push(n); break;
    }
  });

  // Validation
  if (triggerNodes.length === 0) {
    errors.push('No trigger node — add at least one trigger (green) to start the pipeline');
  }
  if (executionNodes.length === 0) {
    errors.push('No execution node — add at least one execution node (white) to place orders');
  }

  // Check connectivity: every non-trigger node should have at least one incoming connection
  nodes.forEach(n => {
    const def = NODE_TYPES[n.type];
    if (!def || def.inputs.length === 0) return; // triggers have no inputs
    const hasIncoming = connections.some(c => c.toNodeId === n.id);
    if (!hasIncoming) {
      errors.push(`"${def.label}" (${n.id}) is disconnected — connect it to the pipeline`);
    }
  });

  // Check that triggers connect to something
  triggerNodes.forEach(n => {
    const def = NODE_TYPES[n.type];
    const hasOutgoing = connections.some(c => c.fromNodeId === n.id);
    if (!hasOutgoing) {
      errors.push(`Trigger "${def.label}" (${n.id}) has no outgoing connection`);
    }
  });

  // Build wiring map: for each node, which nodes feed into it and via which port
  function getIncomingWires(nodeId) {
    return connections
      .filter(c => c.toNodeId === nodeId)
      .map(c => ({ fromNode: c.fromNodeId, fromPort: c.fromPortId, toPort: c.toPortId }));
  }

  // Serialize a node for the pipeline
  function serializeNode(n) {
    const def = NODE_TYPES[n.type];
    const params = {};
    def.properties.forEach(p => {
      let val = n.properties[p.key];
      // Normalize select values to snake_case for backend
      if (p.type === 'select' && typeof val === 'string') {
        params[p.key] = val;
      } else {
        params[p.key] = val;
      }
    });

    const wires = getIncomingWires(n.id);
    const entry = {
      id: n.id,
      type: n.type,
      params,
    };

    // Add wiring info (except for triggers which have no inputs)
    if (wires.length > 0) {
      entry.wiredFrom = wires.map(w => {
        const portSuffix = w.fromPort !== 'out' ? '.' + w.fromPort : '';
        return w.fromNode + portSuffix;
      });
    }

    return entry;
  }

  // Build the pipeline
  const pipeline = {
    triggers: triggerNodes.map(n => serializeNode(n)),
    conditions: conditionNodes.map(n => serializeNode(n)),
    executions: executionNodes.map(n => serializeNode(n)),
    risk: riskNodes.map(n => serializeNode(n)),
  };

  // Extract asset config from node parameters
  const assetConfig = extractAssetConfig(nodes);

  // Build full strategy object
  const strategy = {
    version: 1,
    name: stratName,
    compiled_at: new Date().toISOString(),
    node_count: nodes.length,
    connection_count: connections.length,
    pipeline,
    // Canvas layout (for re-import)
    layout: {
      nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, properties: { ...n.properties } })),
      connections: connections.map(c => ({
        fromNodeId: c.fromNodeId, fromPortId: c.fromPortId,
        toNodeId: c.toNodeId, toPortId: c.toPortId,
      })),
    },
    config: {
      platform: 'Auto',
      capital: 10000,
      mode: 'paper',
      asset: assetConfig,
    },
  };

  return { strategy, errors };
}

/**
 * Scan canvas nodes to infer what asset/market this strategy targets.
 * Returns an AssetConfig object matching the backend model.
 */
function extractAssetConfig(nodeList) {
  const config = {
    asset_type: 'prediction_market',
    symbol: '',
    platform: 'Auto',
    market_id: null,
    token_id: null,
    kalshi_ticker: null,
  };

  // 1. Check contract-input nodes for prediction market IDs + series info
  for (const n of nodeList) {
    const contract = n.properties && n.properties.contract;
    if (contract && typeof contract === 'object') {
      if (contract.market_id) config.market_id = contract.market_id;
      if (contract.token_id) config.token_id = contract.token_id;
      if (contract.kalshi_ticker) {
        config.kalshi_ticker = contract.kalshi_ticker;
        config.platform = 'Kalshi';
      }
      if (contract.series_ticker) config.series_ticker = contract.series_ticker;
      if (contract.auto_rollover) config.auto_rollover = true;
      if (config.market_id && !config.kalshi_ticker) config.platform = 'Polymarket';
      return config; // Prediction market takes priority
    }
  }

  // 2. Check api-data nodes for asset presets
  const PRESET_MAP = {
    'BTC Price (USD)':  { asset_type: 'crypto', symbol: 'BTC' },
    'ETH Price (USD)':  { asset_type: 'crypto', symbol: 'ETH' },
    'Gold Price (USD/oz)': { asset_type: 'stocks', symbol: 'GOLD' },
  };
  for (const n of nodeList) {
    if (n.type === 'api-data') {
      const preset = n.properties && n.properties.preset;
      if (preset && PRESET_MAP[preset]) {
        Object.assign(config, PRESET_MAP[preset]);
        return config;
      }
    }
  }

  // 3. Check news-alert nodes for weather presets
  for (const n of nodeList) {
    if (n.type === 'news-alert') {
      const preset = n.properties && n.properties.preset;
      if (preset === 'NWS Weather Alerts') {
        config.asset_type = 'weather';
        config.symbol = 'NYC_TEMP'; // Default city
        return config;
      }
    }
  }

  // 4. Fallback: check if AI agent set an asset config
  if (window._agentAssetConfig && window._agentAssetConfig.symbol) {
    Object.assign(config, window._agentAssetConfig);
    return config;
  }

  return config;
}

/**
 * Validate a strategy without compiling. Returns array of error strings.
 */
function validateStrategy() {
  const { errors } = compileStrategy();
  return errors;
}

/**
 * Export the current strategy as a downloadable .mercury JSON file.
 */
function exportStrategy() {
  const { strategy, errors } = compileStrategy();

  // Allow export even with warnings, but not if canvas is empty
  if (!strategy) {
    showToast(errors[0] || 'Nothing to export', 'error');
    return;
  }

  const json = JSON.stringify(strategy, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (strategy.name || 'strategy') + '.mercury.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast('Strategy exported: ' + a.download);
}

/**
 * Import a .mercury JSON file and rebuild the canvas.
 */
function importStrategy() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.mercury.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const strategy = JSON.parse(ev.target.result);
        loadStrategyFromJSON(strategy);
        showToast('Imported: ' + (strategy.name || file.name));
      } catch (err) {
        showToast('Invalid strategy file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

/**
 * Load a strategy JSON onto the canvas, rebuilding all nodes and connections.
 */
function loadStrategyFromJSON(strategy) {
  if (!strategy) {
    showToast('Invalid strategy file', 'error');
    return;
  }

  pushUndo();

  // Script-based strategy
  if (strategy.script) {
    clearCanvas();
    if (strategy.config && strategy.config.asset) {
      activeScriptAsset = strategy.config.asset;
      window._agentAssetConfig = strategy.config.asset;
    }
    showScriptOverlay(strategy.script, strategy.name || 'Imported Script');
    if (strategy.config) window._lastImportedConfig = strategy.config;
    return;
  }

  // Node-based strategy
  if (!strategy.layout) {
    showToast('Invalid strategy format — missing layout data', 'error');
    return;
  }

  hideScriptOverlay();
  _suppressAutoSave = true;
  clearCanvas();

  // Rebuild nodes from layout (pass saved ID so event closures are correct)
  strategy.layout.nodes.forEach(ns => {
    createNode(ns.type, ns.x, ns.y, ns.properties, ns.id);
  });

  // Rebuild connections
  strategy.layout.connections.forEach(cs => {
    addConnection(cs.fromNodeId, cs.fromPortId, cs.toNodeId, cs.toPortId);
  });

  _suppressAutoSave = false;

  // Restore strategy name
  if (strategy.name && el.strategyName) {
    el.strategyName.value = strategy.name;
  }

  // Update config if present
  if (strategy.config) {
    window._lastImportedConfig = strategy.config;
  }

  deselectNode();
  updateMercuryScript();
  autoSaveStrategy();

  // Center canvas on the loaded nodes
  if (nodes.length > 0) {
    const avgX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    canvas.panX = -(avgX - 400);
    canvas.panY = -(avgY - 250);
    applyCanvasTransform();
  }
}

/**
 * Auto-save current strategy to localStorage.
 */
let _suppressAutoSave = false;
const AUTOSAVE_VERSION = 4; // Bump to invalidate old autosaves

function autoSaveStrategy() {
  if (_suppressAutoSave) return;
  if (nodes.length === 0 && !activeScript) {
    localStorage.removeItem('mercury_autosave');
    return;
  }

  const state = {
    v: AUTOSAVE_VERSION,
    name: el.strategyName ? el.strategyName.value : 'untitled_strategy',
    nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, properties: { ...n.properties } })),
    connections: connections.map(c => ({
      fromNodeId: c.fromNodeId, fromPortId: c.fromPortId,
      toNodeId: c.toNodeId, toPortId: c.toPortId,
    })),
    nextNodeId,
    nextConnId,
    savedAt: Date.now(),
    // Script strategy state
    script: activeScript || null,
    scriptName: activeScriptName || null,
    scriptAsset: activeScriptAsset || null,
  };

  localStorage.setItem('mercury_autosave', JSON.stringify(state));
}

/**
 * Restore auto-saved strategy from localStorage.
 * Returns true if a strategy was restored.
 */
function restoreAutoSave() {
  const saved = localStorage.getItem('mercury_autosave');
  if (!saved) return false;

  try {
    const state = JSON.parse(saved);

    // Discard autosaves from older versions
    if ((state.v || 0) < AUTOSAVE_VERSION) {
      localStorage.removeItem('mercury_autosave');
      return false;
    }

    // Restore script-based strategy
    if (state.script) {
      activeScriptAsset = state.scriptAsset || null;
      if (activeScriptAsset) window._agentAssetConfig = activeScriptAsset;
      showScriptOverlay(state.script, state.scriptName || state.name || 'AI Strategy');
      return true;
    }

    if (!state.nodes || state.nodes.length === 0) return false;

    // Verify all saved node types are still valid
    const allValid = state.nodes.every(ns => NODE_TYPES[ns.type]);
    if (!allValid) {
      localStorage.removeItem('mercury_autosave');
      return false;
    }

    _suppressAutoSave = true;

    // Clear current canvas
    nodes.forEach(n => { if (n.domElement) n.domElement.remove(); });
    connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); if (c.hitArea) c.hitArea.remove(); });
    nodes = [];
    connections = [];

    nextNodeId = state.nextNodeId || 1;
    nextConnId = state.nextConnId || 1;

    // Recreate nodes (pass saved ID so event handler closures capture the correct ID)
    state.nodes.forEach(ns => {
      createNode(ns.type, ns.x, ns.y, ns.properties, ns.id);
    });

    // Recreate connections
    state.connections.forEach(cs => {
      addConnection(cs.fromNodeId, cs.fromPortId, cs.toNodeId, cs.toPortId);
    });

    _suppressAutoSave = false;

    // Restore name
    if (state.name && el.strategyName) {
      el.strategyName.value = state.name;
    }

    deselectNode();
    updateMercuryScript();
    return true;
  } catch (e) {
    _suppressAutoSave = false;
    console.warn('Failed to restore autosave:', e);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════
// MULTI-STRATEGY MANAGER
// ═══════════════════════════════════════════════════════════════

const STRATEGIES_KEY = 'mercury_strategies';
let activeStrategyId = null;
let openStrategyIds = []; // tabs currently open

function getStrategiesList() {
  try {
    return JSON.parse(localStorage.getItem(STRATEGIES_KEY) || '[]');
  } catch (e) { return []; }
}

function saveStrategiesList(list) {
  localStorage.setItem(STRATEGIES_KEY, JSON.stringify(list));
}

/** Snapshot current canvas into a strategy object */
function snapshotStrategy() {
  return {
    name: el.strategyName ? el.strategyName.value : 'untitled_strategy',
    nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, properties: { ...n.properties } })),
    connections: connections.map(c => ({
      fromNodeId: c.fromNodeId, fromPortId: c.fromPortId,
      toNodeId: c.toNodeId, toPortId: c.toPortId,
    })),
    nextNodeId,
    nextConnId,
  };
}

/** Save the active strategy to the strategies list */
function persistActiveStrategy() {
  if (!activeStrategyId) return;
  const list = getStrategiesList();
  const idx = list.findIndex(s => s.id === activeStrategyId);
  if (idx === -1) return;

  const snap = snapshotStrategy();
  list[idx].name = snap.name;
  list[idx].data = snap;
  list[idx].updatedAt = Date.now();
  saveStrategiesList(list);
}

/** Load a strategy by ID onto the canvas */
function loadStrategyById(id) {
  // Save current work first
  if (activeStrategyId) persistActiveStrategy();

  const list = getStrategiesList();
  const entry = list.find(s => s.id === id);
  if (!entry || !entry.data) return;

  _suppressAutoSave = true;
  clearCanvas();

  const state = entry.data;
  nextNodeId = state.nextNodeId || 1;
  nextConnId = state.nextConnId || 1;

  state.nodes.forEach(ns => {
    createNode(ns.type, ns.x, ns.y, ns.properties, ns.id);
  });

  state.connections.forEach(cs => {
    addConnection(cs.fromNodeId, cs.fromPortId, cs.toNodeId, cs.toPortId);
  });

  _suppressAutoSave = false;

  if (state.name && el.strategyName) {
    el.strategyName.value = state.name;
  }

  activeStrategyId = id;

  // Add to open tabs if not already there
  if (!openStrategyIds.includes(id)) {
    openStrategyIds.push(id);
  }

  deselectNode();
  updateMercuryScript();
  autoSaveStrategy();
  renderStrategyTabs();

  // Center canvas
  if (nodes.length > 0) {
    const avgX = nodes.reduce((s, n) => s + n.x, 0) / nodes.length;
    const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
    canvas.panX = -(avgX - 400);
    canvas.panY = -(avgY - 250);
    applyCanvasTransform();
  }
}

/** Create a brand new strategy and switch to it */
function createNewStrategy() {
  // Save current work
  if (activeStrategyId) persistActiveStrategy();

  const id = 'strat_' + Date.now();
  const entry = {
    id,
    name: 'untitled_strategy',
    data: { name: 'untitled_strategy', nodes: [], connections: [], nextNodeId: 1, nextConnId: 1 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const list = getStrategiesList();
  list.unshift(entry);
  saveStrategiesList(list);

  // Clear canvas for new strategy
  _suppressAutoSave = true;
  clearCanvas();
  nextNodeId = 1;
  nextConnId = 1;
  _suppressAutoSave = false;

  if (el.strategyName) el.strategyName.value = 'untitled_strategy';
  activeStrategyId = id;
  openStrategyIds.push(id);

  updateMercuryScript();
  renderStrategyTabs();
}

/** Close a tab (doesn't delete the strategy, just removes from open tabs) */
function closeStrategyTab(id) {
  // Save before closing
  if (id === activeStrategyId) persistActiveStrategy();

  openStrategyIds = openStrategyIds.filter(sid => sid !== id);

  if (id === activeStrategyId) {
    // Switch to another open tab, or create new
    if (openStrategyIds.length > 0) {
      loadStrategyById(openStrategyIds[openStrategyIds.length - 1]);
    } else {
      createNewStrategy();
    }
  } else {
    renderStrategyTabs();
  }
}

/** Delete a strategy permanently */
function deleteStrategy(id) {
  let list = getStrategiesList();
  list = list.filter(s => s.id !== id);
  saveStrategiesList(list);
  openStrategyIds = openStrategyIds.filter(sid => sid !== id);

  if (id === activeStrategyId) {
    if (openStrategyIds.length > 0) {
      loadStrategyById(openStrategyIds[openStrategyIds.length - 1]);
    } else if (list.length > 0) {
      loadStrategyById(list[0].id);
    } else {
      createNewStrategy();
    }
  }
  renderStrategyTabs();
  renderStrategyBrowser();
}

/** Render the strategy tabs in the bar */
function renderStrategyTabs() {
  const tabsEl = document.getElementById('strategyTabs');
  if (!tabsEl) return;

  const list = getStrategiesList();
  tabsEl.innerHTML = '';

  openStrategyIds.forEach(id => {
    const entry = list.find(s => s.id === id);
    if (!entry) return;

    const tab = document.createElement('button');
    tab.className = 'strategy-tab' + (id === activeStrategyId ? ' active' : '');
    tab.innerHTML =
      '<span class="strategy-tab-dot"></span>' +
      '<span class="strategy-tab-name">' + esc(entry.name || 'untitled') + '</span>' +
      '<span class="strategy-tab-close" title="Close">&times;</span>';

    tab.addEventListener('click', (e) => {
      if (e.target.classList.contains('strategy-tab-close')) {
        e.stopPropagation();
        closeStrategyTab(id);
        return;
      }
      if (id !== activeStrategyId) {
        loadStrategyById(id);
      }
    });

    tabsEl.appendChild(tab);
  });
}

/** Render the strategy browser dropdown */
function renderStrategyBrowser() {
  let browser = document.querySelector('.strategy-browser');
  if (!browser) {
    browser = document.createElement('div');
    browser.className = 'strategy-browser';
    // Append to canvas-area (not strategy-bar which has overflow:hidden and clips the dropdown)
    const canvasArea = document.querySelector('.canvas-area');
    if (canvasArea) {
      canvasArea.appendChild(browser);
    }
  }

  const list = getStrategiesList();

  let html = '<div class="strategy-browser-header"><span>My Strategies</span><span>' + list.length + ' saved</span></div>';

  if (list.length === 0) {
    html += '<div class="strategy-browser-empty">No saved strategies yet</div>';
  } else {
    html += '<div class="strategy-browser-list">';
    list.forEach(entry => {
      const dateStr = entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : '';
      html +=
        '<div class="strategy-browser-item' + (entry.id === activeStrategyId ? ' active' : '') + '" data-id="' + escapeAttr(entry.id) + '">' +
          '<span class="strategy-browser-item-name">' + esc(entry.name || 'untitled') + '</span>' +
          '<span class="strategy-browser-item-date">' + esc(dateStr) + '</span>' +
          '<span class="strategy-browser-item-delete" data-delete="' + escapeAttr(entry.id) + '" title="Delete">&times;</span>' +
        '</div>';
    });
    html += '</div>';
  }

  browser.innerHTML = html;

  // Bind events
  browser.querySelectorAll('.strategy-browser-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.dataset.delete) {
        e.stopPropagation();
        deleteStrategy(e.target.dataset.delete);
        return;
      }
      const id = item.dataset.id;
      loadStrategyById(id);
      browser.classList.remove('open');
    });
  });
}

function toggleStrategyBrowser() {
  let browser = document.querySelector('.strategy-browser');
  if (!browser) {
    renderStrategyBrowser();
    browser = document.querySelector('.strategy-browser');
  }
  const opening = !browser.classList.contains('open');
  browser.classList.toggle('open');
  if (opening) {
    renderStrategyBrowser();
    // Position relative to the button
    const btn = document.getElementById('btnBrowseStrategies');
    if (btn && browser) {
      const btnRect = btn.getBoundingClientRect();
      const parentRect = browser.parentElement.getBoundingClientRect();
      browser.style.top = (btnRect.bottom - parentRect.top) + 'px';
      browser.style.right = (parentRect.right - btnRect.right) + 'px';
    }
  }
}

/** Initialize strategy manager — migrate from single autosave if needed */
function initStrategyManager() {
  // Wire up buttons first — must happen regardless of strategy list state
  const btnNew = document.getElementById('btnNewStrategy');
  const btnBrowse = document.getElementById('btnBrowseStrategies');
  if (btnNew) btnNew.addEventListener('click', createNewStrategy);
  if (btnBrowse) btnBrowse.addEventListener('click', toggleStrategyBrowser);

  // Close browser on outside click
  document.addEventListener('click', (e) => {
    const browser = document.querySelector('.strategy-browser');
    if (browser && browser.classList.contains('open')) {
      if (!e.target.closest('.strategy-browser') && !e.target.closest('#btnBrowseStrategies')) {
        browser.classList.remove('open');
      }
    }
  });

  const list = getStrategiesList();

  // Migrate existing autosave to strategy list
  if (list.length === 0) {
    const saved = localStorage.getItem('mercury_autosave');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.nodes && state.nodes.length > 0) {
          const id = 'strat_' + Date.now();
          list.push({
            id,
            name: state.name || 'untitled_strategy',
            data: state,
            createdAt: state.savedAt || Date.now(),
            updatedAt: state.savedAt || Date.now(),
          });
          saveStrategiesList(list);
          activeStrategyId = id;
          openStrategyIds = [id];
          renderStrategyTabs();
          return;
        }
      } catch (e) {}
    }
    // No existing work — create a blank strategy
    createNewStrategy();
    return;
  }

  // Open the most recently updated strategy
  const sorted = [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  activeStrategyId = sorted[0].id;
  openStrategyIds = [activeStrategyId];
  renderStrategyTabs();
}

// Hook into autoSaveStrategy to also persist to strategy list
const _origAutoSave = autoSaveStrategy;
autoSaveStrategy = function() {
  _origAutoSave();
  persistActiveStrategy();
  // Update tab name if it changed
  const tabsEl = document.getElementById('strategyTabs');
  if (tabsEl && activeStrategyId) {
    const activeTab = tabsEl.querySelector('.strategy-tab.active .strategy-tab-name');
    if (activeTab && el.strategyName) {
      activeTab.textContent = el.strategyName.value || 'untitled';
    }
  }
};

// ═══════════════════════════════════════════════════════════════
// INSPECTOR
// ═══════════════════════════════════════════════════════════════
function renderInspector(nodeId) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const def = NODE_TYPES[node.type];
  if (!def) return;

  el.inspectorTitle.textContent = def.label;

  let html = '<div class="inspector-section">';
  html += `<div class="inspector-section-title">Configuration</div>`;

  // Helper hint for api-data nodes
  if (node.type === 'api-data') {
    const isCustom = node.properties.preset === 'Custom URL' || !node.properties.preset;
    if (isCustom) {
      html += `<div class="api-hint">Enter any REST API URL below. The bot will poll it and fire when the extracted value matches your condition.</div>`;
    } else {
      html += `<div class="api-hint">Using preset: <strong>${node.properties.preset}</strong> — URL and path are auto-filled. Change to "Custom URL" to use your own API.</div>`;
    }
  }
  if (node.type === 'news-alert') {
    const isCustom = node.properties.preset === 'Custom URL';
    if (isCustom) {
      html += `<div class="api-hint">Enter any alert/event API URL. The bot will poll it and fire when alerts match your severity and keyword filters.</div>`;
    } else {
      html += `<div class="api-hint">Using <strong>${esc(node.properties.preset)}</strong> — real-time data from a free public API. No API key required.</div>`;
    }
  }

  const isApiPresetActive = node.type === 'api-data' && node.properties.preset && node.properties.preset !== 'Custom URL';
  const isNewsPresetActive = node.type === 'news-alert' && node.properties.preset && node.properties.preset !== 'Custom URL';

  def.properties.forEach(p => {
    const val = node.properties[p.key];
    // Hide URL/method/headers/json_path when a preset is active (they're auto-managed)
    const isAutoField = isApiPresetActive && ['url', 'method', 'headers', 'json_path'].includes(p.key);
    const isNewsAutoField = isNewsPresetActive && ['url', 'json_path'].includes(p.key);
    if (isAutoField || isNewsAutoField) return;  // Skip these fields when preset is selected

    html += `<div class="inspector-field">`;
    html += `<label class="field-label">${p.label}</label>`;

    if (p.type === 'contract-input') {
      const contract = val;
      const inputId = `contract-input-${nodeId}-${p.key}`;
      if (contract && (contract.question || contract.series_label)) {
        const displayName = contract.series_label || contract.question;
        const truncQ = displayName.length > 55 ? displayName.slice(0, 55) + '...' : displayName;
        const priceStr = contract.price != null ? `${contract.price}c` : '';
        const srcBadge = contract.source === 'kalshi'
          ? '<span class="contract-badge contract-badge--kalshi">K</span>'
          : contract.source === 'polymarket'
          ? '<span class="contract-badge contract-badge--poly">P</span>'
          : '';
        const seriesBadge = contract.series_ticker
          ? `<span class="contract-series-badge">${esc(contract.series_ticker)}</span>`
          : '';
        html += `<div class="contract-input-resolved">
          <div class="contract-input-name">${srcBadge} ${esc(truncQ)}</div>
          <div class="contract-input-meta">
            ${seriesBadge}
            ${priceStr ? `<span class="contract-input-price">${esc(priceStr)}</span>` : ''}
          </div>
          ${contract.series_ticker ? `<label class="contract-rollover-toggle">
            <input type="checkbox" ${contract.auto_rollover !== false ? 'checked' : ''}
              onchange="onContractRolloverToggle('${escapeAttr(nodeId)}','${escapeAttr(p.key)}',this.checked)">
            Auto-rollover
          </label>` : ''}
          <button class="contract-input-clear" onclick="clearContract('${escapeAttr(nodeId)}','${escapeAttr(p.key)}')">Clear</button>
        </div>`;
      } else {
        const nid = escapeAttr(nodeId);
        const pk = escapeAttr(p.key);
        html += `<div class="contract-input-field">
          <input type="text" id="${inputId}" class="field-input contract-input-text"
            placeholder="Search markets... bitcoin, weather, S&amp;P 500"
            autocomplete="off"
            oninput="onContractSearchInput('${nid}','${pk}',this)"
            onkeydown="onContractSearchKey(event,'${nid}','${pk}',this)"
            onfocus="onContractSearchInput('${nid}','${pk}',this)">
        </div>
        <div class="contract-quick-picks">
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXBTCD')">BTC</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXETHD')">ETH</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXSOLD')">SOL</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXINX')">S&P</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXNASDAQ100')">NASDAQ</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXHIGHNY')">Weather</button>
          <button class="quick-pick" onclick="selectQuickPick('${nid}','${pk}','KXWTIW')">Oil</button>
        </div>`;
      }
    } else if (p.type === 'select') {
      html += `<select class="field-select" data-prop="${escapeAttr(p.key)}" onchange="onInspectorChange('${escapeAttr(nodeId)}','${escapeAttr(p.key)}',this.value)">`;
      p.options.forEach(opt => {
        html += `<option ${val === opt ? 'selected' : ''}>${esc(opt)}</option>`;
      });
      html += '</select>';
    } else if (p.type === 'number') {
      html += `<input class="field-input" type="number" data-prop="${escapeAttr(p.key)}" value="${escapeAttr(val)}"
        ${p.min !== undefined ? 'min="' + p.min + '"' : ''}
        ${p.max !== undefined ? 'max="' + p.max + '"' : ''}
        onchange="onInspectorChange('${escapeAttr(nodeId)}','${escapeAttr(p.key)}',this.value)">`;
    } else {
      const placeholder = p.placeholder ? ` placeholder="${escapeAttr(p.placeholder)}"` : '';
      html += `<input class="field-input" type="text" data-prop="${escapeAttr(p.key)}" value="${escapeAttr(val || '')}"${placeholder}
        onchange="onInspectorChange('${escapeAttr(nodeId)}','${escapeAttr(p.key)}',this.value)">`;
    }

    html += '</div>';
  });

  // Test API button for api-data nodes
  if (node.type === 'api-data') {
    html += `<div class="inspector-field" style="margin-top:8px">
      <button class="api-test-btn" onclick="testApiDataNode('${escapeAttr(nodeId)}')">Test API</button>
      <div id="apiTestResult" class="api-test-result" style="display:none"></div>
    </div>`;
  }

  html += '</div>';

  // Info section
  html += '<div class="inspector-section">';
  html += '<div class="inspector-section-title">Info</div>';
  html += `<div class="inspector-field">
    <label class="field-label">Node ID</label>
    <div style="font-size:10px;color:var(--dim);padding:4px 0">${nodeId}</div>
  </div>`;
  html += `<div class="inspector-field">
    <label class="field-label">Category</label>
    <div style="font-size:10px;color:${def.color};padding:4px 0;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">${def.category}</div>
  </div>`;

  const inputConns = connections.filter(c => c.toNodeId === nodeId);
  const outputConns = connections.filter(c => c.fromNodeId === nodeId);
  html += `<div class="inspector-field">
    <label class="field-label">Connections</label>
    <div style="font-size:10px;color:var(--silver);padding:4px 0">${inputConns.length} in / ${outputConns.length} out</div>
  </div>`;

  html += '</div>';

  el.inspectorBody.innerHTML = html;
}

// Global handler for inspector changes
window.onInspectorChange = function(nodeId, key, value) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const def = NODE_TYPES[node.type];
  const propDef = def.properties.find(p => p.key === key);
  if (propDef && propDef.type === 'number') value = parseFloat(value);
  node.properties[key] = value;

  // Auto-fill URL + json_path when a preset is selected on api-data nodes
  if (node.type === 'api-data' && key === 'preset') {
    if (value === 'Custom URL') {
      node.properties.url = '';
      node.properties.json_path = '';
      renderInspector(nodeId);
    } else {
      const preset = API_DATA_PRESETS[value];
      if (preset) {
        node.properties.url = preset.url;
        node.properties.json_path = preset.json_path;
        renderInspector(nodeId);
      }
    }
  }

  // Auto-fill URL + json_path when a preset is selected on news-alert nodes
  if (node.type === 'news-alert' && key === 'preset') {
    const NEWS_ALERT_PRESETS = {
      'NWS Weather Alerts': { url: 'https://api.weather.gov/alerts/active', json_path: 'features' },
      'USGS Earthquakes (M4+)': { url: 'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=4&limit=10&orderby=time', json_path: 'features' },
    };
    if (value === 'Custom URL') {
      node.properties.url = '';
      node.properties.json_path = '';
      renderInspector(nodeId);
    } else {
      const preset = NEWS_ALERT_PRESETS[value];
      if (preset) {
        node.properties.url = preset.url;
        node.properties.json_path = preset.json_path;
        renderInspector(nodeId);
      }
    }
  }

  refreshNodeDOM(node);
  autoSaveStrategy();
};

// Test API handler for api-data nodes
window.testApiDataNode = async function(nodeId) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const resultEl = document.getElementById('apiTestResult');
  if (!resultEl) return;

  const url = node.properties.url || '';
  const method = node.properties.method || 'GET';
  const headers = node.properties.headers || '{}';
  const jsonPath = node.properties.json_path || '';

  if (!url) {
    resultEl.style.display = 'block';
    resultEl.className = 'api-test-result api-test-error';
    resultEl.textContent = 'Enter a URL first';
    return;
  }

  resultEl.style.display = 'block';
  resultEl.className = 'api-test-result';
  resultEl.textContent = 'Testing...';

  try {
    const data = await engineBridge.testApiUrl(url, method, headers, jsonPath);
    if (data.ok) {
      resultEl.className = 'api-test-result api-test-success';
      const val = data.extracted;
      const display = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
      resultEl.textContent = jsonPath ? `${jsonPath} = ${display}` : display;
    } else {
      resultEl.className = 'api-test-result api-test-error';
      resultEl.textContent = data.error || 'Request failed';
    }
  } catch (e) {
    resultEl.className = 'api-test-result api-test-error';
    resultEl.textContent = e.message || 'Connection failed';
  }
};

// ═══════════════════════════════════════════════════════════════
// CONTRACT PICKER
// ═══════════════════════════════════════════════════════════════

let _contractPickerOpen = false;
// ── Contract Input (direct ticker/URL resolve) ─────────────

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/'/g, '&#39;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`/g, '&#96;');
}

// ═══════════════════════════════════════════════════════════════
// CONTRACT SEARCH — live typeahead + quick-pick chips
// ═══════════════════════════════════════════════════════════════

let _contractSearchTimer = null;
let _contractSearchActiveNode = null;  // {nodeId, propKey}
let _contractSearchResults = [];       // cached results for current dropdown
let _contractSearchHighlight = -1;     // keyboard nav index

function _storeContractOnNode(nodeId, propKey, r) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  node.properties[propKey] = {
    market_id: r.market_id || '',
    token_id: r.token_id || '',
    question: r.question || '',
    price: r.price != null ? r.price : null,
    source: r.source || 'unknown',
    kalshi_ticker: r.kalshi_ticker || '',
    series_ticker: r.series_ticker || '',
    series_label: r.series_label || '',
    auto_rollover: !!r.auto_rollover,
    close_time: r.close_time || '',
    outcome_prices: r.outcome_prices || null,
  };
  renderInspector(nodeId);
  refreshNodeDOM(node);
  autoSaveStrategy();
}

window.onContractSearchInput = function(nodeId, propKey, inputEl) {
  const query = inputEl.value.trim();
  clearTimeout(_contractSearchTimer);
  _contractSearchHighlight = -1;

  if (query.length < 2) {
    _hideContractDropdown();
    return;
  }

  _contractSearchTimer = setTimeout(async () => {
    try {
      const resp = await engineBridge.searchMarkets(query);
      if (!resp || !resp.results || !resp.results.length) {
        _showContractDropdownEmpty(inputEl);
        return;
      }
      _contractSearchActiveNode = { nodeId, propKey };
      _contractSearchResults = resp.results;
      _showContractDropdown(resp.results, inputEl);
    } catch (e) {
      _hideContractDropdown();
    }
  }, 350);
};

window.onContractSearchKey = function(event, nodeId, propKey, inputEl) {
  const dd = document.getElementById('contract-search-dropdown');
  const visible = dd && dd.style.display !== 'none';

  if (event.key === 'Escape') {
    _hideContractDropdown();
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    if (visible && _contractSearchHighlight >= 0 && _contractSearchHighlight < _contractSearchResults.length) {
      selectContractResult(_contractSearchHighlight);
    } else {
      // Resolve raw input as a direct ticker/URL
      const input = inputEl.value.trim();
      if (input) _resolveDirectInput(nodeId, propKey, input);
    }
    return;
  }
  if (visible && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    event.preventDefault();
    const n = _contractSearchResults.length;
    if (event.key === 'ArrowDown') _contractSearchHighlight = Math.min(_contractSearchHighlight + 1, n - 1);
    else _contractSearchHighlight = Math.max(_contractSearchHighlight - 1, 0);
    _highlightDropdownItem();
  }
};

async function _resolveDirectInput(nodeId, propKey, input) {
  _hideContractDropdown();
  try {
    const resp = await engineBridge.resolveContract(input);
    if (!resp || resp.error) {
      showToast(resp?.error || 'Could not resolve contract', 'error');
      return;
    }
    _storeContractOnNode(nodeId, propKey, resp);
  } catch (e) {
    showToast('Resolution failed: ' + e.message, 'error');
  }
}

function _showContractDropdown(results, anchorEl) {
  let dd = document.getElementById('contract-search-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'contract-search-dropdown';
    dd.className = 'contract-search-dropdown';
    document.body.appendChild(dd);
  }

  let html = '';
  results.forEach((r, i) => {
    const srcBadge = r.source === 'kalshi'
      ? '<span class="contract-badge contract-badge--kalshi">K</span>'
      : '<span class="contract-badge contract-badge--poly">P</span>';
    const q = r.series_label || r.question || '';
    const truncQ = q.length > 50 ? q.slice(0, 50) + '\u2026' : q;
    const priceStr = r.price != null ? `<span class="contract-input-price">${r.price}c</span>` : '';
    const seriesTag = r.series_ticker
      ? `<span class="contract-series-badge">${esc(r.series_ticker)}</span>` : '';
    html += `<div class="contract-search-result" data-idx="${i}" onclick="selectContractResult(${i})"
      onmouseenter="_contractSearchHighlight=${i};_highlightDropdownItem()">
      <div class="contract-search-result-name">${srcBadge} ${esc(truncQ)}</div>
      <div class="contract-search-result-meta">${seriesTag} ${priceStr}</div>
    </div>`;
  });

  dd.innerHTML = html;

  // Position below the input
  const rect = anchorEl.getBoundingClientRect();
  dd.style.top = (rect.bottom + 2) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = Math.max(rect.width, 280) + 'px';
  dd.style.display = 'block';
}

function _showContractDropdownEmpty(anchorEl) {
  let dd = document.getElementById('contract-search-dropdown');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'contract-search-dropdown';
    dd.className = 'contract-search-dropdown';
    document.body.appendChild(dd);
  }
  dd.innerHTML = '<div class="contract-search-empty">No markets found</div>';
  const rect = anchorEl.getBoundingClientRect();
  dd.style.top = (rect.bottom + 2) + 'px';
  dd.style.left = rect.left + 'px';
  dd.style.width = Math.max(rect.width, 280) + 'px';
  dd.style.display = 'block';
}

function _hideContractDropdown() {
  const dd = document.getElementById('contract-search-dropdown');
  if (dd) dd.style.display = 'none';
}

function _highlightDropdownItem() {
  const dd = document.getElementById('contract-search-dropdown');
  if (!dd) return;
  dd.querySelectorAll('.contract-search-result').forEach((el, i) => {
    el.classList.toggle('highlighted', i === _contractSearchHighlight);
  });
}

window.selectContractResult = async function(index) {
  const r = _contractSearchResults[index];
  if (!r || !_contractSearchActiveNode) return;

  const { nodeId, propKey } = _contractSearchActiveNode;
  _hideContractDropdown();

  // If it's a series placeholder, resolve to get the current active contract
  if (r._is_series && r.series_ticker) {
    try {
      const resp = await engineBridge.resolveContract(r.series_ticker);
      if (resp && !resp.error) {
        _storeContractOnNode(nodeId, propKey, { ...resp, auto_rollover: true });
      } else {
        showToast(resp?.error || 'Could not find active contract', 'error');
      }
    } catch (e) {
      showToast('Resolution failed: ' + e.message, 'error');
    }
  } else {
    _storeContractOnNode(nodeId, propKey, r);
  }
};

window.selectQuickPick = async function(nodeId, propKey, seriesTicker) {
  _hideContractDropdown();
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;

  // Find the button to show loading state
  const picks = document.querySelectorAll('.contract-quick-picks .quick-pick');
  picks.forEach(b => { b.disabled = true; });

  try {
    const resp = await engineBridge.resolveContract(seriesTicker);
    if (!resp || resp.error) {
      showToast(resp?.error || 'Could not find active contract', 'error');
      return;
    }
    _storeContractOnNode(nodeId, propKey, { ...resp, auto_rollover: true });
  } catch (e) {
    showToast('Resolution failed: ' + e.message, 'error');
  } finally {
    picks.forEach(b => { b.disabled = false; });
  }
};

window.onContractRolloverToggle = function(nodeId, propKey, checked) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node || !node.properties[propKey]) return;
  node.properties[propKey].auto_rollover = checked;
  autoSaveStrategy();
};

window.clearContract = function(nodeId, propKey) {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  node.properties[propKey] = null;
  renderInspector(nodeId);
  refreshNodeDOM(node);
  autoSaveStrategy();
};

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('.contract-input-field') && !e.target.closest('.contract-search-dropdown')) {
    _hideContractDropdown();
  }
});

// ═══════════════════════════════════════════════════════════════
// UNDO / REDO
// ═══════════════════════════════════════════════════════════════
function getState() {
  return {
    nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, properties: { ...n.properties } })),
    connections: connections.map(c => ({
      id: c.id, fromNodeId: c.fromNodeId, fromPortId: c.fromPortId,
      toNodeId: c.toNodeId, toPortId: c.toPortId,
    })),
    nextNodeId, nextConnId,
  };
}

function restoreState(state) {
  // Clear current
  nodes.forEach(n => { if (n.domElement) n.domElement.remove(); });
  connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); if (c.hitArea) c.hitArea.remove(); });
  nodes = [];
  connections = [];

  nextNodeId = state.nextNodeId;
  nextConnId = state.nextConnId;

  // Recreate nodes (pass saved ID so event closures are correct)
  state.nodes.forEach(ns => {
    createNode(ns.type, ns.x, ns.y, ns.properties, ns.id);
  });

  // Recreate connections
  state.connections.forEach(cs => {
    addConnection(cs.fromNodeId, cs.fromPortId, cs.toNodeId, cs.toPortId);
  });

  deselectNode();
  updateMercuryScript();
}

function pushUndo() {
  undoStack.push(getState());
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateUndoButtons();
}

function undo() {
  if (undoStack.length === 0) return;
  redoStack.push(getState());
  restoreState(undoStack.pop());
  updateUndoButtons();
}

function redo() {
  if (redoStack.length === 0) return;
  undoStack.push(getState());
  restoreState(redoStack.pop());
  updateUndoButtons();
}

function updateUndoButtons() {
  const btnUndo = document.getElementById('btnUndo');
  const btnRedo = document.getElementById('btnRedo');
  if (btnUndo) btnUndo.disabled = undoStack.length === 0;
  if (btnRedo) btnRedo.disabled = redoStack.length === 0;
}

// ═══════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════════════
function onKeyDown(e) {
  if (currentView !== 'builder') return;

  // Don't intercept when typing in inputs
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === ' ') {
    e.preventDefault();
    canvas.spaceHeld = true;
    el.canvasContainer.style.cursor = 'grab';
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
    e.preventDefault();
    redo();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    openCommitModal();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    e.preventDefault();
    exportStrategy();
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedConnectionId) {
      e.preventDefault();
      pushUndo();
      deleteConnection(selectedConnectionId);
    } else if (selectedNodeId) {
      e.preventDefault();
      pushUndo();
      deleteNode(selectedNodeId);
    }
  }

  if (e.key === 'Escape') {
    if (connectingFrom) {
      cancelConnection();
    } else {
      deselectNode();
    }
  }
}

function onKeyUp(e) {
  if (e.key === ' ') {
    canvas.spaceHeld = false;
    el.canvasContainer.style.cursor = '';
  }
}

// ═══════════════════════════════════════════════════════════════
// MOBILE SIDEBAR
// ═══════════════════════════════════════════════════════════════
function toggleSidebar() {
  el.sidebar.classList.toggle('open');
  el.sidebarOverlay.classList.toggle('open');
}

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    el.sidebar.classList.remove('open');
    el.sidebarOverlay.classList.remove('open');
  }
}

// ═══════════════════════════════════════════════════════════════
// COMMIT / DEPLOY
// ═══════════════════════════════════════════════════════════════
// Persist commit history per strategy in localStorage
function getCommitHistory() {
  const key = 'mercury_commits_' + (activeStrategyId || 'default');
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function saveCommitHistory(history) {
  const key = 'mercury_commits_' + (activeStrategyId || 'default');
  // Keep max 20 commits per strategy to avoid bloating localStorage
  localStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
}

function openCommitModal() {
  // Update diff display
  const diffEl = document.getElementById('commitDiff');
  if (activeScript) {
    const lineCount = activeScript.split('\n').filter(l => l.trim()).length;
    diffEl.innerHTML = `<div class="commit-diff-line added">+ Script strategy (${lineCount} lines)</div>` +
      `<div class="commit-diff-line added">+ ${escapeHtml(activeScriptName || 'AI Strategy')}</div>`;
  } else {
    diffEl.innerHTML = `<div class="commit-diff-line added">+ ${nodes.length} node${nodes.length !== 1 ? 's' : ''}</div>` +
      `<div class="commit-diff-line added">+ ${connections.length} connection${connections.length !== 1 ? 's' : ''}</div>`;
  }

  // Update history
  const commitHistory = getCommitHistory();
  const historyEl = document.getElementById('commitHistory');
  if (commitHistory.length === 0) {
    historyEl.innerHTML = '<div class="commit-entry" style="color:var(--muted);font-style:italic;">No commits yet</div>';
  } else {
    historyEl.innerHTML = commitHistory.slice(0, 8).map(c =>
      `<div class="commit-entry" data-hash="${escapeAttr(c.hash)}" style="cursor:pointer;" title="Click to restore this version">
        <span class="commit-hash">${esc(c.hash)}</span>
        <span class="commit-msg">${esc(c.message)}</span>
        <span class="commit-time">${esc(timeAgo(new Date(c.time).toISOString()))}</span>
      </div>`
    ).join('');
    // Bind restore on click
    historyEl.querySelectorAll('.commit-entry[data-hash]').forEach(entry => {
      entry.addEventListener('click', () => {
        const hash = entry.dataset.hash;
        const commit = commitHistory.find(c => c.hash === hash);
        if (commit && commit.snapshot) {
          if (confirm('Restore strategy to commit "' + (commit.message || hash) + '"?')) {
            loadStrategyFromSnapshot(commit.snapshot);
            closeCommitModal();
            showToast('Restored: ' + (commit.message || hash));
          }
        }
      });
    });
  }

  document.getElementById('commitMessage').value = '';
  document.getElementById('commitModal').classList.add('open');
  setTimeout(() => document.getElementById('commitMessage').focus(), 100);
}

function closeCommitModal() {
  document.getElementById('commitModal').classList.remove('open');
}

function confirmCommit() {
  const msg = document.getElementById('commitMessage').value.trim() || 'Update strategy';
  const hash = Math.random().toString(36).substr(2, 6);

  // Snapshot current state
  const snapshot = snapshotStrategy();
  const commitHistory = getCommitHistory();
  commitHistory.unshift({ hash, message: msg, time: Date.now(), snapshot });
  saveCommitHistory(commitHistory);

  el.toolbarStatus.textContent = 'COMMITTED';
  el.toolbarStatus.classList.add('saved');
  showToast('Committed: ' + msg);

  // Also persist the strategy
  persistActiveStrategy();

  // Update version
  const versionEl = document.getElementById('scriptVersion');
  if (versionEl) versionEl.textContent = 'v0.' + commitHistory.length;

  closeCommitModal();
  setTimeout(() => {
    el.toolbarStatus.textContent = 'DRAFT';
    el.toolbarStatus.classList.remove('saved');
  }, 2000);
}

/** Restore a strategy from a commit snapshot */
function loadStrategyFromSnapshot(snapshot) {
  _suppressAutoSave = true;
  clearCanvas();
  nextNodeId = snapshot.nextNodeId || 1;
  nextConnId = snapshot.nextConnId || 1;
  if (snapshot.nodes) {
    snapshot.nodes.forEach(ns => createNode(ns.type, ns.x, ns.y, ns.properties, ns.id));
  }
  if (snapshot.connections) {
    snapshot.connections.forEach(cs => addConnection(cs.fromNodeId, cs.fromPortId, cs.toNodeId, cs.toPortId));
  }
  if (snapshot.name && el.strategyName) el.strategyName.value = snapshot.name;
  _suppressAutoSave = false;
  updateMercuryScript();
  autoSaveStrategy();
}

function openDeployModal() {
  // Script strategies skip node validation
  if (!activeScript) {
    const errors = validateStrategy();
    if (errors.length > 0) {
      showToast(errors[0], 'error');
      console.warn('[Mercury Compiler] Validation errors:', errors);
      return;
    }
  }

  const name = el.strategyName.value || 'untitled_strategy';
  document.getElementById('deployBotName').value = name;
  applyTierToDeployModal();
  updateDeployModeUI();
  document.getElementById('deployModal').classList.add('open');

  // Listen for mode changes
  const modeSelect = document.getElementById('deployMode');
  modeSelect.removeEventListener('change', updateDeployModeUI);
  modeSelect.addEventListener('change', updateDeployModeUI);
}

function updateDeployModeUI() {
  const mode = document.getElementById('deployMode').value;
  const statusEl = document.getElementById('deployExchangeStatus');
  const warningEl = document.getElementById('deployLiveWarning');
  const confirmBtn = document.getElementById('deployConfirm');

  if (mode === 'live') {
    if (statusEl) statusEl.style.display = '';
    if (warningEl) warningEl.style.display = '';
    if (confirmBtn) { confirmBtn.textContent = 'Deploy Live'; confirmBtn.classList.add('deploy-live-btn'); }
    // Fetch exchange status
    checkDeployExchangeStatus();
  } else {
    if (statusEl) statusEl.style.display = 'none';
    if (warningEl) warningEl.style.display = 'none';
    if (confirmBtn) { confirmBtn.textContent = 'Deploy Bot'; confirmBtn.classList.remove('deploy-live-btn'); }
  }
}

async function checkDeployExchangeStatus() {
  try {
    const resp = await fetch(`${getEngineBase()}/api/health`);
    if (!resp.ok) return;
    const data = await resp.json();

    const polyDot = document.getElementById('deployPolyDot');
    const polyLabel = document.getElementById('deployPolyLabel');
    const kalshiDot = document.getElementById('deployKalshiDot');
    const kalshiLabel = document.getElementById('deployKalshiLabel');

    if (data.wallet_manager === 'ready') {
      // Check if wallet exists
      try {
        const wr = await fetch(`${getEngineBase()}/api/wallet/polymarket`);
        if (wr.ok) {
          if (polyDot) { polyDot.classList.remove('disconnected'); polyDot.classList.add('connected'); }
          if (polyLabel) polyLabel.textContent = 'Wallet Ready';
        } else {
          if (polyDot) { polyDot.classList.add('disconnected'); polyDot.classList.remove('connected'); }
          if (polyLabel) polyLabel.textContent = 'No Wallet — Create in Funding';
        }
      } catch (e) {
        if (polyLabel) polyLabel.textContent = 'No Wallet';
      }
    } else {
      if (polyDot) { polyDot.classList.add('disconnected'); polyDot.classList.remove('connected'); }
      if (polyLabel) polyLabel.textContent = 'Not Configured';
    }

    // Check per-user Kalshi credentials
    try {
      const kr = await (window.fetchWithAuth || fetch)(`${getEngineBase()}/api/kalshi/credentials`);
      if (kr.ok) {
        const kd = await kr.json();
        if (kd.connected) {
          if (kalshiDot) { kalshiDot.classList.remove('disconnected'); kalshiDot.classList.add('connected'); }
          if (kalshiLabel) kalshiLabel.textContent = 'Connected (' + (kd.api_key_masked || 'API key') + ')';
        } else {
          if (kalshiDot) { kalshiDot.classList.add('disconnected'); kalshiDot.classList.remove('connected'); }
          if (kalshiLabel) kalshiLabel.textContent = 'Not Connected — Add in sidebar';
        }
      } else {
        if (kalshiDot) { kalshiDot.classList.add('disconnected'); kalshiDot.classList.remove('connected'); }
        if (kalshiLabel) kalshiLabel.textContent = 'Not Connected';
      }
    } catch (e) {
      if (kalshiDot) { kalshiDot.classList.add('disconnected'); kalshiDot.classList.remove('connected'); }
      if (kalshiLabel) kalshiLabel.textContent = 'Not Connected';
    }
  } catch (e) {
    console.warn('[Deploy] Engine health check failed:', e);
  }
}

function applyTierToDeployModal() {
  // All features are free — no tier gating needed
}

function closeDeployModal() {
  document.getElementById('deployModal').classList.remove('open');
}

function confirmDeploy() {
  const botName = document.getElementById('deployBotName').value || 'Unnamed Bot';
  const platform = document.getElementById('deployPlatform').value;
  const capital = document.getElementById('deployCapital').value;
  const mode = document.getElementById('deployMode').value;

  // Compile strategy first (need it for both paper and live)
  const { strategy, errors } = compileStrategy();

  if (!strategy) {
    closeDeployModal();
    showToast(errors[0] || 'Compilation failed', 'error');
    return;
  }

  // Attach deploy config
  strategy.config = {
    platform,
    capital: parseFloat(capital) || 10000,
    mode: mode || 'paper',
    asset: strategy.config.asset || { asset_type: 'prediction_market', symbol: '', platform: 'Auto' },
  };

  if (mode === 'live') {
    // Show the live review modal instead of deploying immediately
    closeDeployModal();
    showLiveReviewModal(strategy, botName, platform, capital);
    return;
  }

  // Paper mode — deploy directly
  closeDeployModal();
  _executeDeploy(strategy, botName, platform, capital, mode, false);
}

function showLiveReviewModal(strategy, botName, platform, capital) {
  // Populate summary
  var lrBotName = document.getElementById('lrBotName');
  var lrPlatform = document.getElementById('lrPlatform');
  var lrCapital = document.getElementById('lrCapital');
  if (lrBotName) lrBotName.textContent = botName;
  if (lrPlatform) lrPlatform.textContent = platform;
  if (lrCapital) lrCapital.textContent = '$' + parseFloat(capital).toLocaleString();

  // Populate live config with sensible defaults based on capital
  var cap = parseFloat(capital) || 1000;
  var defaultTradeSize = Math.max(10, Math.min(Math.round(cap * 0.025), 250)); // 2.5% of capital, capped at $250
  var lrTradeSizeEl = document.getElementById('lrTradeSize');
  var lrMaxPosEl = document.getElementById('lrMaxPositions');
  var lrStopLossEl = document.getElementById('lrStopLoss');
  var lrDailyLimitEl = document.getElementById('lrDailyLimit');
  if (lrTradeSizeEl) lrTradeSizeEl.value = defaultTradeSize;
  if (lrMaxPosEl) lrMaxPosEl.value = 3;
  if (lrStopLossEl) lrStopLossEl.value = 10;
  if (lrDailyLimitEl) lrDailyLimitEl.value = Math.max(25, Math.round(cap * 0.05)); // 5% of capital

  // Populate risk controls
  var riskDiv = document.getElementById('lrRiskParams');
  if (riskDiv) {
    var riskNodes = (strategy.pipeline && strategy.pipeline.risk) || [];
    if (riskNodes.length === 0) {
      riskDiv.innerHTML = '<div style="color:var(--red,#ff4444);font-weight:600;padding:8px;background:rgba(255,68,68,0.1);border-radius:6px;">⚠ NO RISK CONTROLS — This strategy has no stop-loss, position limits, or other risk management. Deploying without risk controls is extremely dangerous.</div>';
    } else {
      riskDiv.innerHTML = riskNodes.map(function(r) {
        var label = (r.type || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
        var params = r.params || {};
        var details = Object.keys(params).map(function(k) {
          return '<span style="color:rgba(255,255,255,0.5);">' + esc(k.replace(/([A-Z])/g, ' $1').trim()) + ':</span> <span style="color:rgba(255,255,255,0.9);">' + esc(String(params[k])) + '</span>';
        }).join(' &nbsp;·&nbsp; ');
        return '<div style="padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;border-left:3px solid rgba(0,200,150,0.5);"><span style="font-weight:600;color:rgba(255,255,255,0.9);">' + esc(label) + '</span><div style="margin-top:4px;">' + details + '</div></div>';
      }).join('');
    }
  }

  // Populate execution rules
  var execDiv = document.getElementById('lrExecParams');
  if (execDiv) {
    var execNodes = (strategy.pipeline && strategy.pipeline.executions) || [];
    if (execNodes.length === 0) {
      execDiv.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:6px;">No execution nodes</div>';
    } else {
      execDiv.innerHTML = execNodes.map(function(e) {
        var label = (e.type || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
        var params = e.params || {};
        var details = Object.keys(params).map(function(k) {
          return '<span style="color:rgba(255,255,255,0.5);">' + esc(k.replace(/([A-Z])/g, ' $1').trim()) + ':</span> <span style="color:rgba(255,255,255,0.9);">' + esc(String(params[k])) + '</span>';
        }).join(' &nbsp;·&nbsp; ');
        return '<div style="padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;border-left:3px solid rgba(0,150,255,0.5);"><span style="font-weight:600;color:rgba(255,255,255,0.9);">' + esc(label) + '</span><div style="margin-top:4px;">' + details + '</div></div>';
      }).join('');
    }
  }

  // Populate triggers
  var trigDiv = document.getElementById('lrTriggerParams');
  if (trigDiv) {
    var trigNodes = (strategy.pipeline && strategy.pipeline.triggers) || [];
    if (trigNodes.length === 0) {
      trigDiv.innerHTML = '<div style="color:rgba(255,255,255,0.4);padding:6px;">No triggers</div>';
    } else {
      trigDiv.innerHTML = trigNodes.map(function(t) {
        var label = (t.type || 'unknown').replace(/-/g, ' ').replace(/\b\w/g, function(c){ return c.toUpperCase(); });
        var params = t.params || {};
        var details = Object.keys(params).filter(function(k) { return params[k] !== '' && params[k] != null; }).map(function(k) {
          return '<span style="color:rgba(255,255,255,0.5);">' + esc(k.replace(/([A-Z])/g, ' $1').trim()) + ':</span> <span style="color:rgba(255,255,255,0.9);">' + esc(String(params[k])) + '</span>';
        }).join(' &nbsp;·&nbsp; ');
        return '<div style="padding:8px 10px;background:rgba(255,255,255,0.04);border-radius:6px;margin-bottom:4px;border-left:3px solid rgba(255,200,0,0.5);"><span style="font-weight:600;color:rgba(255,255,255,0.9);">' + esc(label) + '</span>' + (details ? '<div style="margin-top:4px;">' + details + '</div>' : '') + '</div>';
      }).join('');
    }
  }

  // Check if terms were previously accepted
  var termsAlreadyAccepted = localStorage.getItem('mercury_live_terms_accepted') === '1';
  var termsSection = document.getElementById('lrTermsSection');
  var termsAcceptedBanner = document.getElementById('lrTermsAccepted');
  var checkbox = document.getElementById('lrTermsCheckbox');
  var confirmBtn = document.getElementById('liveReviewConfirm');

  if (termsAlreadyAccepted) {
    // Hide terms + checkbox, show accepted banner, enable button directly
    if (termsSection) termsSection.style.display = 'none';
    if (termsAcceptedBanner) termsAcceptedBanner.style.display = '';
    if (confirmBtn) {
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    }
  } else {
    // Show terms + checkbox, hide accepted banner, disable button
    if (termsSection) termsSection.style.display = '';
    if (termsAcceptedBanner) termsAcceptedBanner.style.display = 'none';
    if (checkbox) checkbox.checked = false;
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.4';
      confirmBtn.style.cursor = 'not-allowed';
    }
  }

  // Store strategy data for when user confirms
  showLiveReviewModal._pendingStrategy = strategy;
  showLiveReviewModal._pendingBotName = botName;
  showLiveReviewModal._pendingPlatform = platform;
  showLiveReviewModal._pendingCapital = capital;

  // Show modal
  document.getElementById('liveReviewModal').classList.add('open');
}

function _applyLiveConfigOverrides(strategy) {
  var tradeSize = parseFloat(document.getElementById('lrTradeSize')?.value) || 25;
  var maxPos = parseInt(document.getElementById('lrMaxPositions')?.value) || 3;
  var stopLoss = parseFloat(document.getElementById('lrStopLoss')?.value) || 10;
  var dailyLimit = parseFloat(document.getElementById('lrDailyLimit')?.value) || 100;

  if (!strategy.pipeline) return;

  // Override execution node amounts
  var execs = strategy.pipeline.executions || [];
  execs.forEach(function(node) {
    if (node.params) {
      if (node.params.amount != null) node.params.amount = tradeSize;
      if (node.params.totalAmount != null) node.params.totalAmount = tradeSize;
      if (node.params.amountPer != null) node.params.amountPer = tradeSize;
    }
  });

  // Override risk node params
  var risks = strategy.pipeline.risk || [];
  risks.forEach(function(node) {
    if (!node.params) return;
    if (node.type === 'stop-loss') {
      node.params.type = 'Percentage';
      node.params.value = stopLoss;
    }
    if (node.type === 'trailing-stop') {
      node.params.value = stopLoss;
    }
    if (node.type === 'position-limit') {
      node.params.maxPositions = maxPos;
      node.params.maxPerContract = tradeSize * 2;
    }
    if (node.type === 'daily-loss-limit') {
      node.params.maxLoss = dailyLimit;
    }
    if (node.type === 'portfolio-cap') {
      // Keep portfolio cap proportional — 10x trade size or existing, whichever is smaller
      var proposed = tradeSize * 10;
      if (node.params.maxCapital != null && proposed < node.params.maxCapital) {
        node.params.maxCapital = proposed;
      }
    }
  });

  console.log('[Mercury] Applied live config: tradeSize=$' + tradeSize + ', maxPos=' + maxPos + ', stopLoss=' + stopLoss + '%, dailyLimit=$' + dailyLimit);
}

function _executeDeploy(strategy, botName, platform, capital, mode, termsAccepted) {
  console.log('[Mercury Compiler] Strategy compiled successfully:');
  console.log(JSON.stringify(strategy, null, 2));

  runCompilerAnimation(botName, platform, mode, async () => {
    try {
      const result = await engineBridge.deployBot(
        strategy, botName, platform, parseFloat(capital) || 10000, mode || 'paper', termsAccepted
      );
      console.log('[Mercury Engine] Deploy response:', result);
      autoSaveStrategy();
      showToast('Bot "' + botName + '" deployed — ' + (mode === 'paper' ? 'paper trading' : 'LIVE'));
      switchView('my-bots');
    } catch (e) {
      console.error('[Mercury Engine] Deploy failed:', e);
      const newBot = createMockBot(botName, 'Custom', 'live', platform, parseFloat(capital));
      newBot.compiledStrategy = strategy;
      newBot._local = true;
      bots.unshift(newBot);
      updateStatusBar();
      autoSaveStrategy();
      showToast('Engine offline — bot created locally (no live trading)', 'warn');
      switchView('my-bots');
    }
  });
}

function runCompilerAnimation(botName, platform, mode, onComplete) {
  const overlay = document.getElementById('compilerOverlay');
  const output = document.getElementById('compilerOutput');
  output.innerHTML = '';
  overlay.classList.add('active');

  const lines = [
    { tag: 'SYSTEM', tagClass: 'tag-system', text: 'Initializing Mercury Runtime v2.4.1...' },
    { tag: 'SYSTEM', tagClass: 'tag-system', text: 'Loading strategy graph (' + nodes.length + ' nodes, ' + connections.length + ' edges)...' },
    { tag: 'COMPILE', tagClass: 'tag-compile', text: 'Parsing trigger chain...' },
    { tag: 'COMPILE', tagClass: 'tag-compile', text: 'Validating execution flow... <span class="status-ok">[OK]</span>' },
    { tag: 'COMPILE', tagClass: 'tag-compile', text: 'Compiling risk parameters... <span class="status-ok">[OK]</span>' },
    { tag: 'COMPILE', tagClass: 'tag-compile', text: 'Generating execution bytecode... <span class="status-ok">[OK]</span>' },
    { tag: 'RISK', tagClass: 'tag-risk', text: 'Running pre-flight risk check...' },
    { tag: 'RISK', tagClass: 'tag-risk', text: 'Max drawdown limit: <span class="status-ok">PASS</span>' },
    { tag: 'RISK', tagClass: 'tag-risk', text: 'Position size validation: <span class="status-ok">PASS</span>' },
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'Establishing connection to ' + esc(platform) + '...' },
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'Handshake with ' + esc(platform) + ' node... <span class="status-ok">[OK]</span>' },
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'API key verified — low latency' },
    { tag: 'DEPLOY', tagClass: 'tag-deploy', text: 'Deploying "' + esc(botName) + '" in ' + esc(mode) + ' mode...' },
    { tag: 'DEPLOY', tagClass: 'tag-deploy', text: 'Registering market listeners...' },
    { tag: 'LIVE', tagClass: 'tag-live', text: '■ Bot "' + esc(botName) + '" is LIVE — monitoring ' + esc(platform) },
  ];

  let i = 0;
  const interval = setInterval(() => {
    if (i >= lines.length) {
      clearInterval(interval);
      setTimeout(() => {
        overlay.classList.remove('active');
        if (onComplete) onComplete();
      }, 1200);
      return;
    }
    const line = lines[i];
    const div = document.createElement('div');
    div.className = 'compiler-line';
    div.innerHTML = `[<span class="tag ${line.tagClass}">${line.tag}</span>] ${line.text}`;
    div.style.animationDelay = '0s';
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    i++;
  }, 180 + Math.random() * 120);
}

// ═══════════════════════════════════════════════════════════════
// CONNECT ACCOUNT
// ═══════════════════════════════════════════════════════════════
let connectedAccounts = { polymarket: false, kalshi: false };
let connectingPlatform = null;

window.openConnectModal = function(platform) {
  connectingPlatform = platform;
  document.getElementById('connectModalTitle').textContent = 'Connect ' + platform.charAt(0).toUpperCase() + platform.slice(1);
  document.getElementById('connectPlatformBadge').textContent = platform.toUpperCase();

  // Show wallet section only for Polymarket, hide API section for Polymarket
  const walletSection = document.getElementById('connectWalletSection');
  const apiSection = document.getElementById('connectApiSection');
  const connectFooter = document.querySelector('#connectAccountModal .modal-footer');
  if (walletSection) {
    walletSection.style.display = platform === 'polymarket' ? 'block' : 'none';
  }
  if (apiSection) {
    apiSection.style.display = platform === 'polymarket' ? 'none' : 'block';
  }
  if (connectFooter) {
    // Hide Connect/Cancel footer for Polymarket (wallet has its own buttons)
    connectFooter.style.display = platform === 'polymarket' ? 'none' : 'flex';
  }

  // For Kalshi, clear API fields
  if (platform !== 'polymarket') {
    document.getElementById('connectApiKey').value = '';
    const pemEl = document.getElementById('connectPrivateKeyPem');
    if (pemEl) pemEl.value = '';
  }

  // Show modal immediately — no blocking
  document.getElementById('connectAccountModal').classList.add('open');

  // Load wallet state async (non-blocking)
  if (platform === 'polymarket' && window.walletService) {
    updateWalletUI(null); // show create state immediately
    window.walletService.getWallet().then(wallet => {
      updateWalletUI(wallet);
    }).catch(() => {
      updateWalletUI(null);
    });
  }
};

function updateWalletUI(wallet) {
  const createState = document.getElementById('walletStateCreate');
  const activeState = document.getElementById('walletStateActive');
  if (!createState || !activeState) return;

  if (wallet && wallet.address) {
    createState.style.display = 'none';
    activeState.style.display = 'block';
    document.getElementById('walletAddress').textContent = wallet.address;
    refreshWalletBalance();
  } else {
    createState.style.display = 'block';
    activeState.style.display = 'none';
  }
}

async function refreshWalletBalance() {
  if (!window.walletService || !window.walletService.hasWallet) return;
  try {
    const balance = await window.walletService.getBalance();
    document.getElementById('walletBalanceUsdc').textContent =
      '$' + (balance.usdc || 0).toFixed(2);
    document.getElementById('walletBalancePositions').textContent =
      '$' + (balance.positions_value || 0).toFixed(2);
    document.getElementById('walletBalancePending').textContent =
      '$' + (balance.pending_deposits || 0).toFixed(2);
  } catch (e) {
    document.getElementById('walletBalanceUsdc').textContent = '$0.00';
    document.getElementById('walletBalancePositions').textContent = '$0.00';
    document.getElementById('walletBalancePending').textContent = '$0.00';
  }
}

window.createManagedWallet = async function() {
  const btn = document.getElementById('createWalletBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = 'Creating wallet...';
  }
  try {
    const wallet = await window.walletService.getOrCreateWallet();
    updateWalletUI(wallet);

    // Mark Polymarket as connected in sidebar
    connectedAccounts.polymarket = true;
    const row = document.getElementById('accountPolymarket');
    if (row) {
      const dot = row.querySelector('.account-dot');
      if (dot) { dot.classList.remove('disconnected'); dot.classList.add('connected'); }
      const abtn = row.querySelector('.account-btn');
      if (abtn) { abtn.textContent = 'Wallet Active'; abtn.classList.add('connected'); }
    }
    updateStatusBar();
    showToast('Trading wallet created — deposit USDC to start');
  } catch (e) {
    showToast('Failed to create wallet: ' + e.message, 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Create Trading Wallet';
    }
  }
};

window.copyWalletAddress = function() {
  const addr = window.walletService?.walletAddress;
  if (!addr) return;
  navigator.clipboard.writeText(addr).then(() => {
    showToast('Address copied to clipboard');
  }).catch(() => {
    const temp = document.createElement('textarea');
    temp.value = addr;
    document.body.appendChild(temp);
    temp.select();
    document.execCommand('copy');
    document.body.removeChild(temp);
    showToast('Address copied to clipboard');
  });
};

window.openDepositInfo = function() {
  const addr = window.walletService?.walletAddress || '—';
  document.getElementById('depositAddress').textContent = addr;
  document.getElementById('depositInfoModal').classList.add('open');
};

window.closeDepositInfo = function() {
  document.getElementById('depositInfoModal').classList.remove('open');
};

window.openWithdrawModal = async function() {
  document.getElementById('withdrawAddress').value = '';
  document.getElementById('withdrawAmount').value = '';

  const available = window.walletService?.balance?.usdc || 0;
  document.getElementById('withdrawAvailable').textContent = '$' + available.toFixed(2);

  // Check cooldown
  const cooldownMsg = document.getElementById('withdrawCooldownMsg');
  try {
    const check = await window.walletService.checkWithdrawalEligibility();
    if (!check.allowed) {
      cooldownMsg.style.display = 'flex';
      document.getElementById('withdrawCooldownText').textContent = check.reason ||
        'Withdrawal cooldown active. ' + Math.ceil((check.cooldown_remaining_seconds || 0) / 3600) + 'h remaining.';
      document.getElementById('withdrawConfirmBtn').disabled = true;
    } else {
      cooldownMsg.style.display = 'none';
      document.getElementById('withdrawConfirmBtn').disabled = false;
    }
  } catch {
    cooldownMsg.style.display = 'none';
    document.getElementById('withdrawConfirmBtn').disabled = false;
  }

  document.getElementById('withdrawModal').classList.add('open');
};

window.closeWithdrawModal = function() {
  document.getElementById('withdrawModal').classList.remove('open');
};

window.setMaxWithdraw = function() {
  const available = window.walletService?.balance?.usdc || 0;
  document.getElementById('withdrawAmount').value = available.toFixed(2);
};

window.confirmWithdraw = async function() {
  const address = document.getElementById('withdrawAddress').value.trim();
  const amount = parseFloat(document.getElementById('withdrawAmount').value);
  const btn = document.getElementById('withdrawConfirmBtn');

  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    showToast('Invalid Polygon address', 'error');
    return;
  }
  if (!amount || amount < 1) {
    showToast('Minimum withdrawal is $1.00 USDC', 'error');
    return;
  }

  const available = window.walletService?.balance?.usdc || 0;
  if (amount > available) {
    showToast('Insufficient balance', 'error');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Processing...';
  try {
    const result = await window.walletService.requestWithdrawal(address, amount);
    showToast('Withdrawal submitted — TX: ' + (result.tx_hash || 'pending').slice(0, 12) + '...');
    closeWithdrawModal();
    refreshWalletBalance();
  } catch (e) {
    showToast('Withdrawal failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Withdraw';
  }
};

window.viewWalletHistory = function() {
  const addr = window.walletService?.walletAddress;
  if (addr) {
    window.open('https://polygonscan.com/address/' + addr, '_blank');
  } else {
    showToast('No wallet address available', 'info');
  }
};

function closeConnectModal() {
  document.getElementById('connectAccountModal').classList.remove('open');
  connectingPlatform = null;
}

/* ── Profile / Account Settings Modal ── */
window.openProfileModal = function() {
  const modal = document.getElementById('profileModal');
  if (!modal) return;
  // Populate fields
  const emailEl = document.getElementById('profileEmail');
  const planEl = document.getElementById('profilePlan');
  const upgradeBtn = document.getElementById('profileUpgradeBtn');
  if (currentUser && currentUser.email) {
    emailEl.textContent = currentUser.email;
  }
  planEl.textContent = 'Free';
  if (upgradeBtn) upgradeBtn.style.display = 'none';
  document.getElementById('profileNewPw').value = '';
  document.getElementById('profileConfirmPw').value = '';
  const msg = document.getElementById('profilePwMsg');
  msg.style.display = 'none';
  modal.classList.add('open');
};

window.closeProfileModal = function() {
  document.getElementById('profileModal').classList.remove('open');
};

window.profileUpgrade = function() {
  // All features are free — no upgrade needed
};

window.changePassword = async function() {
  const newPw = document.getElementById('profileNewPw').value;
  const confirmPw = document.getElementById('profileConfirmPw').value;
  const msg = document.getElementById('profilePwMsg');
  msg.style.display = 'block';

  if (!newPw || newPw.length < 6) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (newPw !== confirmPw) {
    msg.style.color = 'var(--red)';
    msg.textContent = 'Passwords do not match.';
    return;
  }
  try {
    if (window.supabaseClient) {
      const { error } = await window.supabaseClient.auth.updateUser({ password: newPw });
      if (error) throw error;
      msg.style.color = 'var(--green)';
      msg.textContent = 'Password updated.';
      document.getElementById('profileNewPw').value = '';
      document.getElementById('profileConfirmPw').value = '';
    }
  } catch (e) {
    msg.style.color = 'var(--red)';
    msg.textContent = e.message || 'Failed to update password.';
  }
};

// Close modals on overlay click
document.addEventListener('click', function(e) {
  if (e.target.id === 'profileModal') closeProfileModal();
  if (e.target.id === 'depositInfoModal') closeDepositInfo();
  if (e.target.id === 'withdrawModal') closeWithdrawModal();
});

async function confirmConnect() {
  if (!connectingPlatform) return;

  if (connectingPlatform === 'kalshi') {
    const apiKey = document.getElementById('connectApiKey').value.trim();
    const pemEl = document.getElementById('connectPrivateKeyPem');
    const pem = pemEl ? pemEl.value.trim() : '';

    if (!apiKey) { showToast('Please enter your Kalshi API key', 'error'); return; }
    if (!pem || !pem.includes('PRIVATE KEY')) {
      showToast('Please paste your RSA private key in PEM format', 'error'); return;
    }

    // Show loading state
    const confirmBtn = document.getElementById('connectConfirm');
    const prevText = confirmBtn.textContent;
    confirmBtn.textContent = 'Verifying...';
    confirmBtn.disabled = true;

    try {
      const base = (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) || 'http://localhost:8778';
      const resp = await (window.fetchWithAuth || fetch)(`${base}/api/kalshi/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, private_key_pem: pem }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.detail || 'Connection failed');
      }

      connectedAccounts.kalshi = true;
      _updateKalshiSidebarDot(true, data.api_key_masked);
      closeConnectModal();
      showToast('Kalshi connected — balance: $' + (data.balance / 100).toFixed(2));
    } catch (e) {
      showToast('Kalshi: ' + (e.message || 'Connection failed'), 'error');
    } finally {
      confirmBtn.textContent = prevText;
      confirmBtn.disabled = false;
    }
    return;
  }

  // Polymarket handled by managed wallet flow (separate buttons)
  closeConnectModal();
}

function _updateKalshiSidebarDot(connected, label) {
  const row = document.getElementById('accountKalshi');
  if (!row) return;
  const dot = row.querySelector('.account-dot');
  const btn = row.querySelector('.account-btn');
  if (connected) {
    dot.classList.remove('disconnected');
    dot.classList.add('connected');
    if (btn) { btn.textContent = label || 'Connected'; btn.classList.add('connected'); }
  } else {
    dot.classList.remove('connected');
    dot.classList.add('disconnected');
    if (btn) { btn.textContent = 'Connect Account'; btn.classList.remove('connected'); btn.onclick = function() { window.openConnectModal('kalshi'); }; }
  }
  updateStatusBar();
}

async function checkKalshiConnectionStatus() {
  try {
    const base = (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) || 'http://localhost:8778';
    const resp = await (window.fetchWithAuth || fetch)(`${base}/api/kalshi/credentials`);
    if (!resp.ok) return;
    const data = await resp.json();
    if (data.connected) {
      connectedAccounts.kalshi = true;
      _updateKalshiSidebarDot(true, data.api_key_masked);
    }
  } catch (_) { /* engine offline — ignore */ }
}

// ═══════════════════════════════════════════════════════════════
// QUICK PROMPTS (replaces old useSuggestion)
// ═══════════════════════════════════════════════════════════════
window.useQuickPrompt = function(text) {
  if (el.agentInput) el.agentInput.value = text;
  handleAgentInput();
};

// ═══════════════════════════════════════════════════════════════
// AGENT PANEL (replaces old AI Terminal)
// ═══════════════════════════════════════════════════════════════
let agentHistory = [];

// ── Active script state (for AI-generated script strategies) ──
let activeScript = null;       // The Python script string
let activeScriptName = null;   // Strategy name from agent
let activeScriptAsset = null;  // Asset config { asset_type, symbol, platform }

/**
 * Show a Python script on the canvas overlay.
 * Hides the node viewport and displays syntax-highlighted code.
 */
function showScriptOverlay(script, name) {
  const overlay = document.getElementById('scriptOverlay');
  const codeEl = document.getElementById('scriptOverlayCode');
  const viewport = document.getElementById('canvasViewport');
  if (!overlay || !codeEl) return;

  activeScript = script;
  activeScriptName = name || 'AI Strategy';

  // Update strategy name input
  if (el.strategyName) el.strategyName.value = activeScriptName;

  // Syntax-highlight the Python code
  codeEl.innerHTML = highlightPython(script);

  // Show overlay, hide canvas viewport
  overlay.style.display = 'flex';
  if (viewport) viewport.style.display = 'none';

  // Hide node palette + agent tip
  const palette = document.getElementById('floatingPalette');
  const paletteBtn = document.getElementById('btnPaletteToggle');
  const agentTip = document.getElementById('canvasAgentTip');
  if (palette) palette.style.display = 'none';
  if (paletteBtn) paletteBtn.style.display = 'none';
  if (agentTip) agentTip.style.display = 'none';

  // Update MercuryScript panel to show the script too
  if (el.mercuryScriptCode) {
    el.mercuryScriptCode.innerHTML =
      '<span class="ms-comment"># AI-generated strategy script</span>\n' +
      '<span class="ms-comment"># ' + escapeHtml(activeScriptName) + '</span>\n\n' +
      escapeHtml(script);
  }

  autoSaveStrategy();
}

/**
 * Hide the script overlay and restore the node editor canvas.
 */
function hideScriptOverlay() {
  const overlay = document.getElementById('scriptOverlay');
  const viewport = document.getElementById('canvasViewport');
  if (overlay) overlay.style.display = 'none';
  if (viewport) viewport.style.display = '';

  // Restore palette button
  const paletteBtn = document.getElementById('btnPaletteToggle');
  if (paletteBtn) paletteBtn.style.display = '';

  activeScript = null;
  activeScriptName = null;
  activeScriptAsset = null;
}

/**
 * Simple Python syntax highlighter — produces HTML with span classes.
 */
function highlightPython(code) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const lines = code.split('\n');
  return lines.map(line => {
    let out = esc(line);
    // Comments
    out = out.replace(/(#.*)$/, '<span class="py-comment">$1</span>');
    // Strings (double and single quoted)
    out = out.replace(/((?:f)?&quot;[^&]*?&quot;|(?:f)?&#x27;[^&]*?&#x27;)/g, '<span class="py-string">$1</span>');
    out = out.replace(/((?:f)?"[^"]*?"|(?:f)?'[^']*?')/g, '<span class="py-string">$1</span>');
    // Keywords
    out = out.replace(/\b(async|await|def|if|elif|else|for|while|return|import|from|not|and|or|in|is|True|False)\b/g,
      '<span class="py-keyword">$1</span>');
    // None
    out = out.replace(/\b(None)\b/g, '<span class="py-none">$1</span>');
    // Numbers
    out = out.replace(/\b(\d+\.?\d*)\b/g, '<span class="py-number">$1</span>');
    // ctx. references
    out = out.replace(/\b(ctx)\./g, '<span class="py-ctx">$1</span>.');
    return out;
  }).join('\n');
}

async function handleAgentInput() {
  const text = (el.agentInput ? el.agentInput.value : '').trim();
  if (!text) return;

  addAgentMessage(text, 'user');
  el.agentInput.value = '';

  // Hide quick prompts after first message
  const quickPrompts = document.getElementById('agentQuickPrompts');
  if (quickPrompts) quickPrompts.style.display = 'none';

  // Add to history
  agentHistory.push({ role: 'user', content: text });

  // Show typing indicator
  const typingDiv = document.createElement('div');
  typingDiv.className = 'agent-msg assistant agent-typing';
  typingDiv.innerHTML = '<div class="agent-msg-label">MERCURY AI</div><span class="typing-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
  if (el.agentMessages) {
    el.agentMessages.appendChild(typingDiv);
    el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
  }

  try {
    const response = await engineBridge.agentChat(text, agentHistory.slice(-10), userTier);
    // Remove typing indicator
    if (typingDiv.parentNode) typingDiv.remove();

    // Show text response
    if (response.message) {
      addAgentMessage(response.message, 'assistant');
      agentHistory.push({ role: 'assistant', content: response.message });
    }

    // Update usage indicator
    if (response.usage) updateAgentUsageIndicator(response.usage);

    // Script-based strategy from agent (new path)
    if (response.script) {
      pushUndo();
      clearCanvas();

      const scriptName = response.strategy_name || 'AI Strategy';

      // Store asset config from agent
      if (response.asset) {
        activeScriptAsset = {
          asset_type: response.asset.asset_type || 'prediction_market',
          symbol: response.asset.symbol || '',
          platform: response.asset.platform || 'Auto',
        };
        window._agentAssetConfig = activeScriptAsset;
      }

      showScriptOverlay(response.script, scriptName);

      // Show strategy card in chat
      const lineCount = response.script.split('\n').filter(l => l.trim()).length;
      addStrategyCard({
        name: scriptName,
        nodes: lineCount + ' lines',
        market: (activeScriptAsset && activeScriptAsset.symbol) || 'Auto',
        edge: '',
        script: '',
      });
    }

    // Node-based strategy (legacy path — kept for backwards compatibility)
    if (response.strategy && !response.script) {
      const s = response.strategy;
      pushUndo();
      clearCanvas();
      hideScriptOverlay();

      if (s.asset) {
        window._agentAssetConfig = {
          asset_type: s.asset.asset_type || 'prediction_market',
          symbol: s.asset.symbol || '',
          platform: s.asset.platform || 'Auto',
        };
      }

      const nodeIds = [];
      for (const node of s.nodes) {
        const created = createNode(node.type, node.x || 100, node.y || 150, node.properties || {});
        nodeIds.push(created.id);
      }
      for (const conn of (s.connections || [])) {
        const fromId = nodeIds[conn.fromIndex];
        const toId = nodeIds[conn.toIndex];
        if (fromId && toId) {
          addConnection(fromId, conn.fromPort || 'out', toId, conn.toPort || 'in');
        }
      }
      updateMercuryScript();

      addStrategyCard({
        name: s.name || 'AI Strategy',
        nodes: s.nodes.length,
        market: s.market || 'Prediction Markets',
        edge: s.edge || '',
        script: '',
      });
    }
  } catch (err) {
    // Remove typing indicator
    if (typingDiv.parentNode) typingDiv.remove();

    if (err.rateLimited) {
      if (err.rateLimitType === 'rate_limit_tokens') {
        addAgentMessage(
          'Daily token limit reached. Resets at midnight UTC.',
          'assistant'
        );
      } else {
        addAgentMessage('Slow down — too many messages. Wait a moment and try again.', 'assistant');
      }
      if (err.usage) updateAgentUsageIndicator(err.usage);
    } else {
      console.warn('Agent API unavailable, falling back to simulation:', err.message);
      simulateAgentResponse(text);
      agentHistory.push({ role: 'assistant', content: '(simulated response)' });
    }
  }
}

function addAgentMessage(content, type) {
  if (!el.agentMessages) return;

  if (type === 'strategy-card') {
    addStrategyCard(content);
    return;
  }

  const div = document.createElement('div');
  div.className = 'agent-msg ' + type;

  if (type === 'assistant') {
    div.innerHTML = '<div class="agent-msg-label">MERCURY AI</div>' + escapeHtml(content);
  } else {
    div.textContent = content;
  }

  el.agentMessages.appendChild(div);
  el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
}

function updateAgentUsageIndicator(usage) {
  let indicator = document.getElementById('agentUsageIndicator');
  if (!indicator) {
    const inputArea = document.querySelector('.agent-input-area');
    if (!inputArea) return;
    indicator = document.createElement('div');
    indicator.id = 'agentUsageIndicator';
    indicator.className = 'agent-usage-indicator';
    inputArea.insertBefore(indicator, inputArea.firstChild);
  }

  const pct = Math.min(100, Math.round((usage.tokens_used / usage.tokens_limit) * 100));
  const remaining = usage.tokens_remaining.toLocaleString();

  let barColor = 'var(--green)';
  if (pct > 75) barColor = '#f59e0b';
  if (pct > 90) barColor = 'var(--red, #ef4444)';

  indicator.innerHTML = `
    <div class="usage-bar-track">
      <div class="usage-bar-fill" style="width:${pct}%; background:${barColor}"></div>
    </div>
    <span class="usage-bar-label">${remaining} tokens remaining</span>
  `;
  indicator.style.display = '';
}

function addStrategyCard(data) {
  if (!el.agentMessages) return;
  // data = { name, nodes, market, edge, script }
  const isScript = !!activeScript;
  const card = document.createElement('div');
  card.className = 'agent-strategy-card';
  card.innerHTML = `
    <div class="strategy-card-header">
      <span class="strategy-card-name">${escapeHtml(data.name)}</span>
      <span class="strategy-card-meta">${escapeHtml(String(data.nodes))}</span>
    </div>
    <div class="strategy-card-body">
      <div class="strategy-card-stats">
        <div class="strategy-card-stat">
          <span class="strategy-card-stat-label">Market</span>
          <span class="strategy-card-stat-value">${escapeHtml(data.market)}</span>
        </div>
        <div class="strategy-card-stat">
          <span class="strategy-card-stat-label">Type</span>
          <span class="strategy-card-stat-value">${isScript ? 'Script' : 'Node Graph'}</span>
        </div>
      </div>
    </div>
    <div class="strategy-card-actions">
      <button class="strategy-card-btn primary" onclick="openDeployModal()">Deploy</button>
      <button class="strategy-card-btn" onclick="exportStrategy()">Export</button>
    </div>
  `;
  el.agentMessages.appendChild(card);
  el.agentMessages.scrollTop = el.agentMessages.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function simulateAgentResponse(userText) {
  const lower = userText.toLowerCase();

  if (lower.includes('election') || lower.includes('misprice')) {
    addAgentMessage('Scanning Polymarket election contracts for mispricing... I found 3 opportunities with estimated edge above 8%. Building a strategy to capture the highest-conviction play.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('probability-cross', 100, 150, { direction: 'Crosses Above', level: 55 });
      const n2 = createNode('liquidity-check', 380, 150, { minLiquidity: 10000, depth: '1% Depth' });
      const n3 = createNode('market-order', 660, 100, { side: 'Buy YES', amount: 500, platform: 'Polymarket' });
      const n4 = createNode('stop-loss', 660, 300, { type: 'Percentage', value: 15 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      addConnection(n3.id, 'out', n4.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Election Momentum Alpha',
        nodes: 4,
        market: 'Polymarket',
        edge: '+12.3%',
        script: 'when prob_cross(0.55) {\n  if liquidity > 10000 {\n    execute market_buy(500)\n    guard stop_loss(0.15)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('arb') || lower.includes('arbitrage')) {
    addAgentMessage('Analyzing cross-platform price discrepancies between Polymarket and Kalshi... Found exploitable spread on 2 contracts. Building arbitrage strategy.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('price-threshold', 100, 100, { threshold: 5, market: 'Polymarket' });
      const n2 = createNode('price-threshold', 100, 280, { threshold: 5, market: 'Kalshi' });
      const n3 = createNode('correlation', 380, 180, { threshold: 0.8 });
      const n4 = createNode('market-order', 660, 130, { side: 'Buy YES', platform: 'Polymarket', amount: 300 });
      const n5 = createNode('market-order', 660, 280, { side: 'Buy NO', platform: 'Kalshi', amount: 300 });
      addConnection(n1.id, 'out', n3.id, 'in');
      addConnection(n3.id, 'pass', n4.id, 'in');
      addConnection(n3.id, 'pass', n5.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Cross-Platform Arbitrage',
        nodes: 5,
        market: 'Multi-Platform',
        edge: '+8.7%',
        script: 'when price_delta(poly, kalshi) > 5c {\n  if correlation < 0.8 {\n    execute market_buy(poly, 300)\n    execute market_buy_no(kalshi, 300)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('momentum') || lower.includes('volume')) {
    addAgentMessage('Building a momentum strategy with volume confirmation and scaled entry. This targets contracts with sudden volume spikes and favorable probability positioning.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('volume-spike', 100, 150, { multiplier: 3, window: '1hr' });
      const n2 = createNode('probability-band', 380, 150, { min: 30, max: 70 });
      const n3 = createNode('scaled-entry', 660, 150, { totalAmount: 500, tranches: 5 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Volume Momentum Scalper',
        nodes: 3,
        market: 'Polymarket',
        edge: '+15.1%',
        script: 'when volume_spike(3x, "1hr") {\n  if prob_band(0.30, 0.70) {\n    execute scaled_entry(500, 5)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('buy') && lower.includes('stop')) {
    addAgentMessage('Creating a strategy with a Probability Cross trigger, Liquidity Check, Market Order execution, and Stop Loss protection. Building now...', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('probability-cross', 100, 150, { direction: 'Crosses Above', level: 60 });
      const n2 = createNode('liquidity-check', 380, 150, { minLiquidity: 50000 });
      const n3 = createNode('market-order', 660, 100, { side: 'Buy YES', amount: 200 });
      const n4 = createNode('stop-loss', 660, 300, { type: 'Percentage', value: 15 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      addConnection(n3.id, 'out', n4.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Probability Breakout + Stop',
        nodes: 4,
        market: 'Auto',
        edge: '+10.5%',
        script: 'when prob_cross(0.60) {\n  if liquidity > 50000 {\n    execute market_buy(200)\n    guard stop_loss(0.15)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('dca') || lower.includes('dollar cost')) {
    addAgentMessage('Setting up a DCA accumulation strategy with time-based triggers and portfolio exposure limits. Perfect for steady conviction plays.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('time-based', 100, 150, { schedule: 'Daily 9AM' });
      const n2 = createNode('portfolio-exposure', 380, 150, { maxExposure: 25 });
      const n3 = createNode('dca', 660, 150, { amountPer: 50, interval: 'Daily', maxBuys: 20 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'DCA Accumulator',
        nodes: 3,
        market: 'Auto',
        edge: '+7.2%',
        script: 'when schedule("Daily 9AM", "ET") {\n  if portfolio_exposure < 25% {\n    execute dca(50, "Daily", 20)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('fear') || lower.includes('greed') || lower.includes('api') || lower.includes('custom data') || lower.includes('external') || lower.includes('gold') || lower.includes('gas price')) {
    addAgentMessage('Building a strategy using external data feeds. This uses the Custom API trigger to pull real-time data and fire when your conditions are met.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('api-data', 100, 150, { preset: 'Fear & Greed Index', url: 'https://api.alternative.me/fng/', json_path: 'data.0.value', operator: '<', threshold: 25, poll_interval: 300, method: 'GET', headers: '{}' });
      const n2 = createNode('portfolio-exposure', 380, 150, { maxExposure: 30, scope: 'Total Portfolio' });
      const n3 = createNode('market-order', 660, 100, { side: 'Buy YES', amount: 25, platform: 'Auto' });
      const n4 = createNode('stop-loss', 660, 300, { type: 'Percentage', value: 10 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      addConnection(n3.id, 'out', n4.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Fear & Greed Contrarian',
        nodes: 4,
        market: 'Polymarket',
        edge: '+11.4%',
        script: 'when api_data("Fear & Greed Index") < 25 {\n  if portfolio_exposure < 30% {\n    execute market_buy(25)\n    guard stop_loss(10%)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('social') || lower.includes('buzz') || lower.includes('twitter') || lower.includes('mention') || lower.includes('trending') || lower.includes('viral')) {
    addAgentMessage('Building a social media spike detection strategy. This uses the API Data node to monitor a custom social data source and triggers when your threshold is exceeded. You can point the API Data node at any social analytics API.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('api-data', 100, 150, { preset: 'Custom URL', url: '', json_path: '', operator: '>', threshold: 100, poll_interval: 60 });
      const n2 = createNode('probability-band', 380, 150, { min: 20, max: 70 });
      const n3 = createNode('market-order', 660, 100, { side: 'Buy YES', amount: 100, platform: 'Auto' });
      const n4 = createNode('stop-loss', 660, 300, { type: 'Percentage', value: 15 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      addConnection(n3.id, 'out', n4.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Social Data Trigger',
        nodes: 4,
        market: 'Auto',
        edge: '+14.6%',
        script: 'when api_data("custom_social_url") > threshold {\n  if prob_band(20, 70) {\n    execute market_buy(100)\n    guard stop_loss(15%)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('hurricane') || lower.includes('weather') || lower.includes('earthquake') || lower.includes('disaster') || lower.includes('nws') || lower.includes('usgs') || lower.includes('seismic') || lower.includes('tornado') || lower.includes('tsunami')) {
    addAgentMessage('Building an external event trigger strategy. This monitors real government alert feeds (NWS for weather, USGS for earthquakes) and fires when events match your severity threshold. Combined with social buzz to confirm market impact before entry.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('news-alert', 100, 100, { preset: 'NWS Weather Alerts', min_severity: 'Warning', keyword: 'hurricane', region: '', poll_interval: 120 });
      const n2 = createNode('api-data', 100, 320, { preset: 'Custom URL', url: '', json_path: '', operator: '>', threshold: 50, poll_interval: 120 });
      const n3 = createNode('probability-band', 400, 200, { min: 15, max: 60 });
      const n4 = createNode('market-order', 680, 130, { side: 'Buy YES', amount: 200, platform: 'Auto' });
      const n5 = createNode('stop-loss', 680, 330, { type: 'Percentage', value: 20 });
      addConnection(n1.id, 'out', n3.id, 'in');
      addConnection(n2.id, 'out', n3.id, 'in');
      addConnection(n3.id, 'pass', n4.id, 'in');
      addConnection(n4.id, 'out', n5.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Disaster Event Trader',
        nodes: 5,
        market: 'Kalshi',
        edge: '+18.3%',
        script: 'when nws_alert("hurricane", severity >= Warning)\n  AND social_buzz("hurricane", spike > 200%) {\n  if prob_band(15, 60) {\n    execute market_buy(200)\n    guard stop_loss(20%)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('rsi') || lower.includes('macd') || lower.includes('bollinger') || lower.includes('moving average') || lower.includes('technical') || lower.includes('indicator') || lower.includes('rate of change') || lower.includes('pattern detect') || lower.includes('overbought') || lower.includes('oversold')) {
    addAgentMessage('Building a technical analysis strategy using probability curve indicators. RSI and MACD analyze the probability momentum, with momentum confirmation and a trailing stop to lock in profits.', 'assistant');
    setTimeout(() => {
      pushUndo();
      clearCanvas();
      const n1 = createNode('rsi', 100, 100, { period: 14, overbought: 70, oversold: 30, signal: 'Oversold' });
      const n2 = createNode('momentum', 380, 100, { direction: 'Bullish', period: '4hr', minChange: 3 });
      const n3 = createNode('market-order', 660, 100, { side: 'Buy YES', amount: 150, platform: 'Auto' });
      const n4 = createNode('trailing-stop', 660, 300, { type: 'Percentage', value: 8, activation: 5 });
      addConnection(n1.id, 'out', n2.id, 'in');
      addConnection(n2.id, 'pass', n3.id, 'in');
      addConnection(n3.id, 'out', n4.id, 'in');
      updateMercuryScript();
      addStrategyCard({
        name: 'Technical Probability Trader',
        nodes: 4,
        market: 'Multi-Platform',
        edge: '+15.7%',
        script: 'when rsi(14, oversold <= 30) {\n  if momentum(bullish, 4hr, +3c) {\n    execute market_buy(150)\n    guard trailing_stop(8%, activate: +5%)\n  }\n}',
      });
    }, 1200);
  } else if (lower.includes('edge') || lower.includes('find') || lower.includes('scan')) {
    addAgentMessage('Running a full market scan across Polymarket and Kalshi... Analyzing 847 active contracts for statistical edge. Found 5 contracts with probability mispricing > 5c based on historical resolution patterns.', 'assistant');
    setTimeout(() => {
      addStrategyCard({
        name: 'Market Scanner Alpha',
        nodes: 4,
        market: 'Multi-Platform',
        edge: '+9.8%',
        script: 'scan markets(poly, kalshi) {\n  filter mispricing > 5c\n  rank by edge desc\n  take top(5)\n}',
      });
    }, 1000);
  } else if (lower.includes('build') || lower.includes('deploy') || lower.includes('create')) {
    addAgentMessage('I can build and deploy strategies for you. What kind of strategy are you looking for? Here are some ideas:\n\n- Momentum plays on volume spikes\n- Cross-platform arbitrage\n- Election contract mispricing\n- DCA accumulation\n- Event-driven resolution trades\n\nDescribe your thesis and I\'ll design the optimal node graph.', 'assistant');
  } else {
    addAgentMessage('I can help you build and deploy prediction market strategies. Try something like:\n\n- "Find mispriced election contracts"\n- "Build a momentum strategy with volume confirmation"\n- "Set up cross-platform arbitrage"\n- "Create a DCA strategy for daily buys"\n- "Scan for edge across all markets"', 'assistant');
  }
}

// ═══════════════════════════════════════════════════════════════
// STRATEGY CARD ACTIONS (globals)
// ═══════════════════════════════════════════════════════════════
window.deployFromCard = function() {
  document.getElementById('deployModal').classList.add('open');
  document.getElementById('deployBotName').value = document.getElementById('strategyName').value;
};

window.backtestFromCard = function() {
  switchView('backtest');
};

window.editFromCard = function() {
  showToast('Canvas is on the left — drag nodes to edit');
};

// ═══════════════════════════════════════════════════════════════
// FLOATING PALETTE
// ═══════════════════════════════════════════════════════════════
function toggleFloatingPalette(open) {
  const palette = el.floatingPalette;
  const toggle = el.btnPaletteToggle;
  if (!palette || !toggle) return;
  if (open) {
    palette.classList.add('open');
    toggle.style.display = 'none';
  } else {
    palette.classList.remove('open');
    toggle.style.display = 'flex';
  }
}

// ═══════════════════════════════════════════════════════════════
// AGENT TAB SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchAgentTab(tabName) {
  if (el.tabAgent) el.tabAgent.classList.toggle('active', tabName === 'agent');
  if (el.agentTabContent) {
    el.agentTabContent.style.display = tabName === 'agent' ? 'flex' : 'none';
    el.agentTabContent.classList.toggle('active', tabName === 'agent');
  }
}

// ═══════════════════════════════════════════════════════════════
// AGENT STATUS BAR
// ═══════════════════════════════════════════════════════════════
async function updateStatusBar() {
  const statusBots = document.getElementById('statusBots');
  const statusPoly = document.getElementById('statusPoly');
  const statusKalshi = document.getElementById('statusKalshi');

  // Try fetching live stats from engine
  let liveBots = bots.filter(b => b.status === 'live').length;
  let engineOnline = false;
  try {
    const stats = await engineBridge.getStats();
    if (stats) {
      liveBots = stats.bots_live || 0;
      engineOnline = true;
    }
  } catch { /* engine offline — use local count */ }

  updateEngineStatus(engineOnline);

  if (statusBots) {
    const dot = statusBots.querySelector('.status-dot');
    const label = statusBots.querySelector('span:last-child');
    if (dot) dot.className = 'status-dot ' + (liveBots > 0 ? 'live' : 'disconnected');
    if (label) label.textContent = liveBots + ' Bot' + (liveBots !== 1 ? 's' : '') + ' Live';
  }
  if (statusPoly) {
    const connected = connectedAccounts.polymarket;
    const dot = statusPoly.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }
  if (statusKalshi) {
    const connected = connectedAccounts.kalshi;
    const dot = statusKalshi.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  }
}

// Periodic engine status polling (every 30s)
setInterval(() => { try { updateStatusBar(); } catch {} }, 30000);

function updateEngineStatus(connected) {
  const statusEngine = document.getElementById('statusEngine');
  if (statusEngine) {
    const dot = statusEngine.querySelector('.status-dot');
    const label = statusEngine.querySelector('span:last-child');
    if (dot) dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
    if (label) label.textContent = connected ? 'Engine Live' : 'Engine Offline';
  }
}

function clearCanvas() {
  nodes.forEach(n => { if (n.domElement) n.domElement.remove(); });
  connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); if (c.hitArea) c.hitArea.remove(); });
  nodes = [];
  connections = [];
  selectedNodeId = null;
  draggingNodeId = null;
  connectingFrom = null;
  if (typeof tempConnectionLine !== 'undefined' && tempConnectionLine) {
    tempConnectionLine.remove();
    tempConnectionLine = null;
  }
  deselectNode();
  // Don't clear script state here — showScriptOverlay/hideScriptOverlay handle that
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT STRATEGY (loaded on first open)
// ═══════════════════════════════════════════════════════════════
function loadDefaultStrategy() {
  const market = createNode('market', 120, 180);
  const exec = createNode('market-order', 520, 180, { side: 'Buy YES', amount: 25, platform: 'Polymarket' });
  const risk = createNode('stop-loss', 520, 360, { type: 'Percentage', value: 15 });

  if (market && exec) addConnection(market.id, 'out', exec.id, 'in');
  if (exec && risk) addConnection(exec.id, 'out', risk.id, 'in');

  el.strategyName.value = 'my_strategy';

  // Select the Market node and show the configure prompt
  setTimeout(() => {
    canvas.panX = 80;
    canvas.panY = 20;
    applyCanvasTransform();
    updateMercuryScript();
    if (market) {
      selectNode(market.id);
      showMarketPrompt(market);
    }
  }, 150);
}

function showMarketPrompt(marketNode) {
  // Remove existing prompt if any
  const existing = document.getElementById('marketPrompt');
  if (existing) existing.remove();

  const prompt = document.createElement('div');
  prompt.id = 'marketPrompt';
  prompt.className = 'market-prompt';

  // Position above the Market node on the canvas
  const nodeEl = marketNode.domElement;
  if (nodeEl) {
    const rect = nodeEl.getBoundingClientRect();
    prompt.style.position = 'fixed';
    prompt.style.left = rect.left + 'px';
    prompt.style.top = (rect.top - 60) + 'px';
  }

  prompt.innerHTML = `
    <span class="market-prompt-text">Click this node and pick a contract to get started</span>
    <button class="market-prompt-dismiss" onclick="dismissMarketPrompt()">&times;</button>
  `;
  document.body.appendChild(prompt);

  // Also show a brief canvas hint
  showCanvasHints();

  // Auto-dismiss after 8 seconds
  setTimeout(() => dismissMarketPrompt(), 8000);
}

/** Show brief hints on the canvas for new users */
function showCanvasHints() {
  if (localStorage.getItem('mercury_hints_seen')) return;

  const hint = document.createElement('div');
  hint.id = 'canvasHints';
  hint.className = 'canvas-hints';
  hint.innerHTML = `
    <div class="canvas-hint-title">Quick tips</div>
    <div class="canvas-hint-item">Click a node to select and configure it</div>
    <div class="canvas-hint-item">Click a port (circle on a node) to start connecting, then click another port</div>
    <div class="canvas-hint-item">Drag nodes to rearrange them</div>
    <div class="canvas-hint-item">Drag from the Node Palette on the left to add new nodes</div>
    <button class="canvas-hint-dismiss" onclick="dismissCanvasHints()">Got it</button>
  `;
  document.body.appendChild(hint);
}

window.dismissCanvasHints = function() {
  const el = document.getElementById('canvasHints');
  if (el) el.remove();
  localStorage.setItem('mercury_hints_seen', '1');
};

window.dismissMarketPrompt = function() {
  const el = document.getElementById('marketPrompt');
  if (el) el.remove();
};

// ═══════════════════════════════════════════════════════════════
// MY BOTS VIEW
// ═══════════════════════════════════════════════════════════════
async function renderBots() {
  const filter = document.querySelector('#botFilters .filter-tab.active')?.dataset.filter || 'all';
  const sort = document.getElementById('botSort')?.value || 'updated';

  // Try fetching real bots from engine
  let engineBots = [];
  try {
    const raw = await engineBridge.listBots();
    if (Array.isArray(raw)) {
      engineBots = raw.map(normalizeEngineBotToLocal);
    }
  } catch (e) {
    console.warn('[Mercury] Engine offline — showing local bots only');
  }

  // Merge: engine bots first, then any local-only bots not in the engine
  const engineIds = new Set(engineBots.map(b => b.id));
  const localOnly = bots.filter(b => b._local && !engineIds.has(b.id));
  const allBots = [...engineBots, ...localOnly];

  let filtered = filter === 'all' ? [...allBots] : allBots.filter(b => b.status === filter);

  // Sort
  filtered.sort((a, b) => {
    if (sort === 'pnl') return (b.metrics?.pnl || 0) - (a.metrics?.pnl || 0);
    if (sort === 'winrate') return (b.metrics?.winRate || 0) - (a.metrics?.winRate || 0);
    if (sort === 'name') return (a.name || '').localeCompare(b.name || '');
    return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
  });

  document.getElementById('botCount').textContent = filtered.length + ' bot' + (filtered.length !== 1 ? 's' : '');

  if (filtered.length === 0) {
    el.botsGrid.innerHTML = `<div class="bots-empty">
      <div class="bots-empty-icon">&#9632;</div>
      <div class="bots-empty-text">No bots found. Create one in the Builder.</div>
    </div>`;
    return;
  }

  el.botsGrid.innerHTML = filtered.map(bot => {
    const pnl = bot.metrics?.pnl || 0;
    const pnlClass = pnl >= 0 ? 'positive' : 'negative';
    const pnlSign = pnl >= 0 ? '+' : '';
    const winRate = bot.metrics?.winRate || 0;
    const volume = bot.metrics?.volume || 0;

    return `<div class="bot-card" data-bot-id="${escapeAttr(bot.id)}" onclick="switchView('bot-detail',{botId:'${escapeAttr(bot.id)}'})">
      <div class="bot-card-header">
        <div>
          <div class="bot-card-name">${esc(bot.name)}</div>
          <div class="bot-card-type">${esc(bot.strategyType || 'Custom')}</div>
          <div class="bot-card-market">${esc(bot.market || bot.platform || '')}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="bot-mode-badge bot-mode-badge--${esc(bot.mode || 'paper')}">${bot.mode === 'live' ? 'LIVE' : 'PAPER'}</span>
          <span class="status-badge ${esc(bot.status)}">${esc(bot.status)}${bot._local ? ' (local)' : ''}</span>
        </div>
      </div>
      <div class="bot-card-metrics">
        <div class="bot-metric">
          <span class="bot-metric-label">Win Rate</span>
          <span class="bot-metric-value">${winRate.toFixed(1)}%</span>
        </div>
        <div class="bot-metric">
          <span class="bot-metric-label">P&L</span>
          <span class="bot-metric-value ${pnlClass}">${pnlSign}$${Math.abs(pnl).toLocaleString()}</span>
        </div>
        <div class="bot-metric">
          <span class="bot-metric-label">Volume</span>
          <span class="bot-metric-value">$${(volume / 1000).toFixed(1)}K</span>
        </div>
      </div>
      <div class="bot-card-sparkline">${renderSparklineSVG(bot.sparklineData, pnlClass === 'positive' ? '#00c853' : '#ff1744')}</div>
      <div class="bot-card-footer">
        <span class="bot-card-updated">${bot.updatedAt ? timeAgo(bot.updatedAt) : bot.mode || ''}</span>
      </div>
    </div>`;
  }).join('');

}

/** Convert engine bot summary to the shape the frontend expects */
function normalizeEngineBotToLocal(eb) {
  const status = (eb.status || 'starting').toLowerCase();
  // Map engine statuses to frontend statuses
  const statusMap = { starting: 'live', live: 'live', paused: 'paused', stopped: 'draft', error: 'error' };
  return {
    id: eb.id,
    name: eb.name,
    strategyType: eb.strategy_type || 'Custom',
    status: statusMap[status] || status,
    market: eb.platform || 'Auto',
    platform: eb.platform,
    mode: eb.mode,
    contract: '',
    createdAt: eb.created_at || new Date().toISOString(),
    updatedAt: eb.started_at || eb.created_at || new Date().toISOString(),
    metrics: {
      winRate: eb.win_rate || 0,
      pnl: eb.pnl || 0,
      pnlPercent: eb.pnl_pct || 0,
      totalTrades: eb.total_trades || 0,
      volume: (eb.total_trades || 0) * (eb.initial_capital || 0) * 0.1,
      sharpe: eb.sharpe || 0,
      maxDrawdown: eb.max_drawdown || 0,
      openPositions: eb.positions_count || 0,
    },
    sparklineData: eb.spark_data || [],
    trades: [],
    positions: [],
    logs: [],
    _engine: true,  // marker: this bot came from the engine
  };
}

function renderSparklineSVG(data, color) {
  if (!data || data.length < 2) return '';
  const w = 280; const h = 30;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);

  const points = data.map((v, i) => `${i * step},${h - ((v - min) / range) * h}`).join(' ');

  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>
  </svg>`;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  return Math.floor(hrs / 24) + 'd ago';
}

// ═══════════════════════════════════════════════════════════════
// BOT DETAIL VIEW
// ═══════════════════════════════════════════════════════════════
async function renderBotDetail(botId) {
  // Try fetching from engine first
  let bot = null;
  let isEngine = false;

  if (botId.startsWith('bot-')) {
    try {
      const detail = await engineBridge.getBot(botId);
      if (detail) {
        bot = normalizeEngineBotDetail(detail);
        isEngine = true;
      }
    } catch (e) {
      console.warn('[Mercury] Could not fetch bot from engine:', e.message);
    }
  }

  // Fall back to local bots
  if (!bot) {
    bot = bots.find(b => b.id === botId);
  }
  if (!bot) return;

  document.getElementById('detailBotName').textContent = bot.name;
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = bot.status + (isEngine ? '' : ' (local)');
  statusEl.className = 'status-badge ' + esc(bot.status);

  // Mode badge (remove old one first to avoid duplicates)
  const existingBadge = statusEl.parentElement.querySelector('.bot-mode-badge');
  if (existingBadge) existingBadge.remove();
  const modeTag = bot.mode === 'live'
    ? '<span class="bot-mode-badge bot-mode-badge--live">LIVE</span>'
    : '<span class="bot-mode-badge bot-mode-badge--paper">PAPER</span>';
  statusEl.insertAdjacentHTML('beforebegin', modeTag);

  // Metrics
  const m = bot.metrics || {};
  const winRate = m.winRate || 0;
  const pnl = m.pnl || 0;
  const volume = m.volume || 0;
  const sharpe = m.sharpe || 0;
  const maxDD = m.maxDrawdown || 0;
  const openPos = m.openPositions || 0;

  document.getElementById('detailMetrics').innerHTML = [
    { label: 'Win Rate', value: winRate.toFixed(1) + '%', cls: winRate >= 50 ? 'positive' : 'negative' },
    { label: 'P&L', value: (pnl >= 0 ? '+$' : '-$') + Math.abs(pnl).toLocaleString(), cls: pnl >= 0 ? 'positive' : 'negative' },
    { label: 'Capital', value: '$' + (m.currentCapital || volume).toLocaleString(), cls: '' },
    { label: 'Sharpe', value: sharpe.toFixed(2), cls: sharpe >= 1 ? 'positive' : '' },
    { label: 'Max DD', value: maxDD.toFixed(1) + '%', cls: 'negative' },
    { label: 'Positions', value: openPos, cls: '' },
  ].map(c => `<div class="detail-metric-card">
    <span class="detail-metric-label">${c.label}</span>
    <span class="detail-metric-value ${c.cls}">${c.value}</span>
  </div>`).join('');

  // Performance chart
  renderPerfChart(bot);

  // Positions
  const positions = bot.positions || [];
  document.getElementById('positionCount').textContent = positions.length;
  document.getElementById('positionsBody').innerHTML = positions.map(p => {
    const posPnl = p.unrealized_pnl != null ? p.unrealized_pnl : (p.pnl || 0);
    const pnlCls = posPnl >= 0 ? 'positive' : 'negative';
    return `<div class="data-table-row positions-row">
      <span class="data-table-cell bright">${esc(p.contract || p.contract_id || '')}</span>
      <span class="data-table-cell">${esc(p.side || '')}</span>
      <span class="data-table-cell">${p.qty || p.quantity || ''}</span>
      <span class="data-table-cell">${p.entry || p.entry_price || ''}c</span>
      <span class="data-table-cell ${pnlCls}">${posPnl >= 0 ? '+' : ''}$${posPnl.toFixed(2)}</span>
    </div>`;
  }).join('');

  // Trades
  const trades = bot.trades || [];
  document.getElementById('tradeCount').textContent = trades.length + ' trades';
  document.getElementById('tradesBody').innerHTML = trades.slice(0, 30).map(t => {
    const tPnl = t.pnl || 0;
    const pnlCls = tPnl >= 0 ? 'positive' : 'negative';
    return `<div class="data-table-row trades-row">
      <span class="data-table-cell muted">${formatTime(t.timestamp || t.executed_at || '')}</span>
      <span class="data-table-cell ${(t.side || '').toUpperCase() === 'BUY' ? 'positive' : 'negative'}">${esc((t.side || '').toUpperCase())}</span>
      <span class="data-table-cell bright">${esc(t.contract || t.contract_id || '')}</span>
      <span class="data-table-cell">${t.price || ''}c</span>
      <span class="data-table-cell">$${t.amount || ''}</span>
      <span class="data-table-cell ${pnlCls}">${tPnl >= 0 ? '+' : ''}$${tPnl.toFixed(2)}</span>
    </div>`;
  }).join('');

  // Logs
  renderBotLogs(bot);

  // If engine bot, poll for live updates instead of fake simulation
  if (isEngine) {
    startEngineLogPolling(botId);
  } else {
    startLogSimulation(bot);
  }
}

/** Convert engine bot detail response to the shape the frontend expects */
function normalizeEngineBotDetail(d) {
  const statusMap = { starting: 'live', live: 'live', paused: 'paused', stopped: 'draft', error: 'error' };
  const status = statusMap[(d.status || '').toLowerCase()] || d.status;
  return {
    id: d.id,
    name: d.name,
    strategyType: d.strategy_type || 'Custom',
    status,
    market: d.platform || 'Auto',
    platform: d.platform,
    mode: d.mode,
    contract: '',
    createdAt: d.created_at || new Date().toISOString(),
    updatedAt: d.started_at || d.created_at || new Date().toISOString(),
    metrics: {
      winRate: d.win_rate || 0,
      pnl: d.pnl || 0,
      pnlPercent: d.pnl_pct || 0,
      totalTrades: d.total_trades || 0,
      volume: (d.total_trades || 0) * (d.initial_capital || 0) * 0.1,
      currentCapital: d.current_capital || d.initial_capital || 0,
      sharpe: d.sharpe || 0,
      maxDrawdown: d.max_drawdown || 0,
      openPositions: d.positions_count || (d.positions || []).length,
    },
    sparklineData: d.spark_data || d.equity_history || [],
    trades: d.trades || [],
    positions: d.positions || [],
    logs: (d.logs || []).map(l => ({
      timestamp: l.timestamp || l.ts,
      level: l.level,
      message: l.message || l.msg,
    })),
    _engine: true,
  };
}

function renderPerfChart(bot) {
  if (charts.detailPerf) { charts.detailPerf.destroy(); charts.detailPerf = null; }

  const sparkData = bot.sparklineData || [];
  if (sparkData.length < 2) return; // Need at least 2 points

  const data = sparkData.map((v, i) => ({
    x: Date.now() - (sparkData.length - 1 - i) * 3600000,
    y: v,
  }));

  charts.detailPerf = new ApexCharts(document.getElementById('detailPerfChart'), {
    chart: {
      type: 'area', height: 260,
      background: 'transparent',
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, easing: 'easeinout', speed: 600 },
    },
    series: [{ name: 'P&L', data }],
    stroke: { curve: 'smooth', width: 1.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0,
        stops: [0, 100],
      },
    },
    colors: [(bot.metrics?.pnl || 0) >= 0 ? '#00c853' : '#ff1744'],
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '9px' } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '9px' },
        formatter: v => '$' + v.toFixed(0),
      },
    },
    grid: {
      borderColor: '#1a1a1a',
      strokeDashArray: 3,
      xaxis: { lines: { show: false } },
    },
    tooltip: { theme: 'dark' },
    dataLabels: { enabled: false },
  });

  charts.detailPerf.render();
}

function renderBotLogs(bot) {
  const logsEl = document.getElementById('botLogs');
  if (!logsEl) return;
  const logs = bot.logs || [];
  logsEl.innerHTML = logs.map(l =>
    `<div class="log-entry">
      <span class="log-time">${formatTime(l.timestamp)}</span>
      <span class="log-level ${esc(l.level || 'info')}">${esc(l.level || 'info')}</span>
      <span class="log-message">${esc(l.message || '')}</span>
    </div>`
  ).join('');
  logsEl.scrollTop = logsEl.scrollHeight;
}

function startLogSimulation(bot) {
  if (logInterval) clearInterval(logInterval);
  if (bot.status !== 'live') return;

  const logsEl = document.getElementById('botLogs');
  if (!logsEl) return;
  const messages = [
    { level: 'info', msg: 'Heartbeat OK — latency 8ms' },
    { level: 'info', msg: 'Market scan complete — 0 new signals' },
    { level: 'signal', msg: 'Probability shift detected: +2.3c on ' + esc(bot.contract) },
    { level: 'info', msg: 'Order book depth: $' + (Math.random() * 100 + 50).toFixed(0) + 'K' },
    { level: 'info', msg: 'Position P&L update: ' + (Math.random() > 0.5 ? '+' : '-') + '$' + (Math.random() * 50).toFixed(2) },
    { level: 'trade', msg: 'Fill: BUY YES x $' + (Math.random() * 100 + 10).toFixed(0) + ' @ ' + (Math.random() * 30 + 40).toFixed(0) + 'c' },
    { level: 'info', msg: 'Risk check passed — exposure at ' + (Math.random() * 20 + 5).toFixed(1) + '%' },
    { level: 'warn', msg: 'Liquidity thin — spread widened to ' + (Math.random() * 3 + 1).toFixed(1) + 'c' },
  ];

  logInterval = setInterval(() => {
    const m = messages[Math.floor(Math.random() * messages.length)];
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${formatTime(new Date().toISOString())}</span>
      <span class="log-level ${m.level}">${m.level}</span>
      <span class="log-message">${esc(m.msg)}</span>`;
    logsEl.appendChild(entry);
    logsEl.scrollTop = logsEl.scrollHeight;

    // Keep log size reasonable
    while (logsEl.children.length > 100) logsEl.removeChild(logsEl.firstChild);
  }, 3000 + Math.random() * 4000);
}

// Engine live log polling (replaces fake simulation for engine bots)
let _engineLogPollId = null;
let _lastLogCount = 0;
let _pollInFlight = false;

function startEngineLogPolling(botId) {
  stopEngineLogPolling();
  _lastLogCount = 0;
  _pollInFlight = false;

  const poll = async () => {
    // Guard: skip if previous poll still running
    if (_pollInFlight) return;
    _pollInFlight = true;

    try {
      const logs = await engineBridge.getBotLogs(botId, 100);
      if (!Array.isArray(logs)) return;

      // Only render new logs
      if (logs.length > _lastLogCount) {
        const newLogs = logs.slice(_lastLogCount);
        const logsEl = document.getElementById('botLogs');
        if (!logsEl) return;

        for (const l of newLogs) {
          const entry = document.createElement('div');
          entry.className = 'log-entry';
          entry.innerHTML = `<span class="log-time">${formatTime(l.timestamp || l.ts || '')}</span>
            <span class="log-level ${esc(l.level || 'info')}">${esc(l.level || 'info')}</span>
            <span class="log-message">${esc(l.message || l.msg || '')}</span>`;
          logsEl.appendChild(entry);
        }
        logsEl.scrollTop = logsEl.scrollHeight;
        while (logsEl.children.length > 200) logsEl.removeChild(logsEl.firstChild);
        _lastLogCount = logs.length;
      }

      // Also refresh metrics + positions + trades
      try {
        const detail = await engineBridge.getBot(botId);
        if (detail) {
          const bot = normalizeEngineBotDetail(detail);
          const m = bot.metrics;
          const metricsEl = document.getElementById('detailMetrics');
          if (metricsEl) {
            metricsEl.innerHTML = [
              { label: 'Win Rate', value: (m.winRate || 0).toFixed(1) + '%', cls: (m.winRate || 0) >= 50 ? 'positive' : 'negative' },
              { label: 'P&L', value: ((m.pnl || 0) >= 0 ? '+$' : '-$') + Math.abs(m.pnl || 0).toLocaleString(), cls: (m.pnl || 0) >= 0 ? 'positive' : 'negative' },
              { label: 'Capital', value: '$' + (m.currentCapital || 0).toLocaleString(), cls: '' },
              { label: 'Sharpe', value: (m.sharpe || 0).toFixed(2), cls: (m.sharpe || 0) >= 1 ? 'positive' : '' },
              { label: 'Max DD', value: (m.maxDrawdown || 0).toFixed(1) + '%', cls: 'negative' },
              { label: 'Positions', value: m.openPositions || 0, cls: '' },
            ].map(c => `<div class="detail-metric-card">
              <span class="detail-metric-label">${c.label}</span>
              <span class="detail-metric-value ${c.cls}">${c.value}</span>
            </div>`).join('');
          }

          // Update positions table
          const positions = bot.positions || [];
          const posCountEl = document.getElementById('positionCount');
          const posBody = document.getElementById('positionsBody');
          if (posCountEl) posCountEl.textContent = positions.length;
          if (posBody) {
            posBody.innerHTML = positions.map(p => {
              const posPnl = p.unrealized_pnl != null ? p.unrealized_pnl : (p.pnl || 0);
              const pnlCls = posPnl >= 0 ? 'positive' : 'negative';
              return `<div class="data-table-row positions-row">
                <span class="data-table-cell bright">${esc(p.contract || p.contract_id || '')}</span>
                <span class="data-table-cell">${esc(p.side || '')}</span>
                <span class="data-table-cell">${p.qty || p.quantity || ''}</span>
                <span class="data-table-cell">${p.entry || p.entry_price || ''}c</span>
                <span class="data-table-cell ${pnlCls}">${posPnl >= 0 ? '+' : ''}$${posPnl.toFixed(2)}</span>
              </div>`;
            }).join('');
          }

          // Update trades table
          const trades = bot.trades || [];
          const tradeCountEl = document.getElementById('tradeCount');
          const tradesBody = document.getElementById('tradesBody');
          if (tradeCountEl) tradeCountEl.textContent = trades.length + ' trades';
          if (tradesBody) {
            tradesBody.innerHTML = trades.slice(0, 30).map(t => {
              const tPnl = t.pnl || 0;
              const pnlCls = tPnl >= 0 ? 'positive' : 'negative';
              return `<div class="data-table-row trades-row">
                <span class="data-table-cell muted">${formatTime(t.timestamp || t.executed_at || '')}</span>
                <span class="data-table-cell ${(t.side || '').toUpperCase() === 'BUY' ? 'positive' : 'negative'}">${esc((t.side || '').toUpperCase())}</span>
                <span class="data-table-cell bright">${esc(t.contract || t.contract_id || '')}</span>
                <span class="data-table-cell">${t.price || ''}c</span>
                <span class="data-table-cell">$${t.amount || ''}</span>
                <span class="data-table-cell ${pnlCls}">${tPnl >= 0 ? '+' : ''}$${tPnl.toFixed(2)}</span>
              </div>`;
            }).join('');
          }

          // Update performance chart if equity data changed
          if (bot.sparklineData && bot.sparklineData.length > 1) {
            renderPerfChart(bot);
          }
        }
      } catch { /* metrics refresh is best-effort */ }
    } catch (e) {
      console.warn('[Mercury] Log poll error:', e.message);
    } finally {
      _pollInFlight = false;
    }
  };

  poll(); // immediate
  _engineLogPollId = setInterval(poll, 5000);
}

function stopEngineLogPolling() {
  if (_engineLogPollId) {
    clearInterval(_engineLogPollId);
    _engineLogPollId = null;
  }
  _pollInFlight = false;
}

async function toggleBotStatus(newStatus) {
  if (!selectedBotId) return;

  const btn = newStatus === 'paused'
    ? document.getElementById('btnPauseBot')
    : document.getElementById('btnRestartBot');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = newStatus === 'paused' ? 'Pausing...' : 'Restarting...'; }

  // Try engine first
  try {
    if (newStatus === 'paused') {
      await engineBridge.pauseBot(selectedBotId);
    } else {
      await engineBridge.resumeBot(selectedBotId);
    }
    showToast('Bot ' + (newStatus === 'paused' ? 'paused' : 'resumed'));
    renderBotDetail(selectedBotId);
    return;
  } catch (e) {
    console.warn('[Mercury] Engine toggle failed:', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }

  // Fallback to local
  const bot = bots.find(b => b.id === selectedBotId);
  if (!bot) return;
  bot.status = newStatus;
  renderBotDetail(selectedBotId);
  showToast('Bot ' + (newStatus === 'paused' ? 'paused' : 'restarted'));
}

async function killBot() {
  if (!selectedBotId) return;

  const btn = document.getElementById('btnKillBot');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Stopping...'; }

  // Try engine first
  try {
    await engineBridge.stopBot(selectedBotId);
    showToast('Bot stopped');
    if (logInterval) { clearInterval(logInterval); logInterval = null; }
    stopEngineLogPolling();
    switchView('my-bots');
    return;
  } catch (e) {
    console.warn('[Mercury] Engine stop failed:', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }

  // Fallback to local
  const bot = bots.find(b => b.id === selectedBotId);
  if (!bot) return;
  bot.status = 'draft';
  if (logInterval) { clearInterval(logInterval); logInterval = null; }
  showToast('Bot killed — moved to draft');
  switchView('my-bots');
}

async function deleteBot() {
  if (!selectedBotId) return;
  if (!confirm('Delete this bot permanently? This cannot be undone.')) return;

  const btn = document.getElementById('btnDeleteBot');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Deleting...'; }

  // Try engine first
  try {
    await engineBridge.deleteBot(selectedBotId);
  } catch (e) {
    console.warn('[Mercury] Engine delete failed:', e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }

  // Also remove from local bots array
  bots = bots.filter(b => b.id !== selectedBotId);
  if (logInterval) { clearInterval(logInterval); logInterval = null; }
  stopEngineLogPolling();
  showToast('Bot deleted');
  switchView('my-bots');
}

// ═══════════════════════════════════════════════════════════════
// CSV EXPORT
// ═══════════════════════════════════════════════════════════════
async function exportBotCSV(type) {
  if (!selectedBotId) return;
  const btn = document.getElementById(type === 'trades' ? 'btnExportTrades' : 'btnExportLogs');
  const prevText = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Exporting...'; }

  try {
    const base = getEngineBase();
    const _fetch = typeof window.fetchWithAuth === 'function' ? window.fetchWithAuth : fetch;
    const resp = await _fetch(`${base}/api/bots/${selectedBotId}/export/${type}`);
    if (!resp.ok) throw new Error('Export failed');
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (selectedBotId + '_' + type + '.csv').replace(/[^a-zA-Z0-9._-]/g, '_');
    // Use filename from Content-Disposition if available
    const disp = resp.headers.get('Content-Disposition');
    if (disp) {
      const match = disp.match(/filename="?([^"]+)"?/);
      if (match) a.download = match[1];
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast(type.charAt(0).toUpperCase() + type.slice(1) + ' exported');
  } catch (e) {
    // Fallback: export from local data in the rendered view
    try {
      _exportLocalCSV(type);
    } catch {
      showToast('Export failed: ' + e.message, 'error');
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevText; }
  }
}

function _exportLocalCSV(type) {
  let csv = '';
  if (type === 'trades') {
    const rows = document.querySelectorAll('#tradesBody .data-table-row');
    csv = 'Time,Side,Contract,Price,Amount,PnL\n';
    rows.forEach(r => {
      const cells = r.querySelectorAll('.data-table-cell');
      csv += Array.from(cells).map(c => '"' + c.textContent.trim().replace(/"/g, '""') + '"').join(',') + '\n';
    });
  } else {
    const entries = document.querySelectorAll('#botLogs .log-entry');
    csv = 'Time,Level,Message\n';
    entries.forEach(e => {
      const time = e.querySelector('.log-time')?.textContent || '';
      const badge = e.querySelector('.log-badge')?.textContent || '';
      const msg = e.querySelector('.log-msg')?.textContent || '';
      csv += '"' + time + '","' + badge + '","' + msg.replace(/"/g, '""') + '"\n';
    });
  }
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (selectedBotId || 'bot') + '_' + type + '.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast(type.charAt(0).toUpperCase() + type.slice(1) + ' exported (local data)');
}

// ═══════════════════════════════════════════════════════════════
// BACKTEST VIEW
// ═══════════════════════════════════════════════════════════════
function populateBacktestStrategies() {
  const sel = document.getElementById('btStrategy');
  sel.innerHTML = '<option value="current">Current Builder Strategy</option>';
  bots.forEach(b => {
    sel.innerHTML += `<option value="${esc(b.id)}">${esc(b.name)}</option>`;
  });
}

// ── Backtest Panel — Strategy Picker + Market Browser ───────────

let _btMarkets = [];
let _btLiveLoaded = false;
let _btActiveFilter = 'all';
let _btUploadedStrategy = null;

async function loadBacktestMarkets() {
  const listEl = document.getElementById('btMarketList');
  if (!listEl) return;
  const base = getEngineBase();
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 25000);
    const resp = await fetch(`${base}/api/markets/browse`, { signal: controller.signal });
    clearTimeout(tid);
    if (resp.ok) {
      const data = await resp.json();
      const live = (data.markets || []).filter(m => m && m.name);
      for (const m of live) {
        if (m.source === 'kalshi') {
          _btMarkets.push({
            name: m.name,
            value: '',
            source: m.category || 'kalshi',
            price: m.price,
            recurring: true,
            meta: { platform: 'Kalshi', kalshi_ticker: m.ticker, series_ticker: m.series_ticker || '', underlying_asset: m.underlying_asset || '' },
          });
        } else if (m.source === 'polymarket') {
          _btMarkets.push({
            name: m.name,
            value: '',
            source: m.category || 'polymarket',
            price: m.price,
            recurring: true,
            meta: { platform: 'Polymarket', market_id: m.market_id, token_id: m.token_id, condition_id: m.condition_id, underlying_asset: m.underlying_asset || '', poly_series_key: m.series_key || '' },
          });
        } else if (m.asset) {
          // Data feed markets (crypto, stocks, weather, economic)
          _btMarkets.push({
            name: m.name,
            value: m.asset,
            source: m.source,
            meta: {},
          });
        }
      }
      _btLiveLoaded = true;
      console.log(`[Backtest] Loaded ${live.length} live markets (total: ${_btMarkets.length})`);
    }
  } catch (e) {
    console.warn('[Backtest] Failed to load live markets:', e.message || e);
  }
  renderMarketList();
}

function renderMarketList() {
  const listEl = document.getElementById('btMarketList');
  if (!listEl) return;
  const searchEl = document.getElementById('btMarketSearch');
  const q = (searchEl ? searchEl.value : '').toLowerCase().trim();
  const filter = _btActiveFilter;

  const filtered = _btMarkets.filter(m => {
    if (filter !== 'all') {
      // 'kalshi'/'polymarket' filters match by platform, others by category
      if (filter === 'kalshi' || filter === 'polymarket') {
        const plat = (m.meta && m.meta.platform || '').toLowerCase();
        if (plat !== filter) return false;
      } else if (m.source !== filter) {
        return false;
      }
    }
    if (q && !m.name.toLowerCase().includes(q) && !(m.value && m.value.toLowerCase().includes(q))) return false;
    return true;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="bt-market-loading">No markets found</div>';
    return;
  }

  // Group by source — Kalshi recurring shown first in Kalshi group
  const groups = {};
  const groupOrder = ['kalshi', 'polymarket', 'crypto', 'stocks', 'economic', 'weather'];
  const groupLabels = {
    kalshi: 'Kalshi',
    polymarket: 'Polymarket',
    crypto: 'Crypto',
    stocks: 'Stocks & Indices',
    economic: 'Economic',
    weather: 'Weather',
  };
  for (const m of filtered) {
    const g = m.source || 'other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(m);
  }
  // Sort each group: recurring prediction markets first, then data feeds, then by name
  for (const g of groupOrder) {
    if (groups[g]) {
      groups[g].sort((a, b) => {
        if (a.recurring && !b.recurring) return -1;
        if (!a.recurring && b.recurring) return 1;
        return (a.name || '').localeCompare(b.name || '');
      });
    }
  }

  let html = '';
  for (const g of groupOrder) {
    if (!groups[g] || groups[g].length === 0) continue;
    html += `<div class="bt-market-group">${esc(groupLabels[g] || g)} (${groups[g].length})</div>`;
    for (const m of groups[g]) {
      const metaStr = JSON.stringify(m.meta || {});
      const priceStr = typeof m.price === 'number' && m.price > 0 ? m.price.toFixed(0) + 'c' : '';
      const recurTag = m.recurring ? ' recurring' : '';
      const platformTag = m.meta && m.meta.platform ? m.meta.platform : m.source;
      html += `<div class="bt-market-row${recurTag}" data-value="${esc(m.value || '')}" data-meta="${esc(metaStr)}" data-source="${esc(m.source)}" onclick="selectBacktestMarket(this)">
        <span class="bt-market-name">${esc(m.name)}</span>
        ${priceStr ? `<span class="bt-market-price">${priceStr}</span>` : ''}
        <span class="bt-market-tag ${esc(platformTag.toLowerCase())}">${esc(platformTag)}</span>
      </div>`;
    }
  }

  listEl.innerHTML = html;
  if (!_btLiveLoaded) {
    listEl.insertAdjacentHTML('beforeend', '<div class="bt-market-loading" style="padding:12px;">Loading Kalshi & Polymarket contracts...</div>');
  }
}

window.selectBacktestMarket = function(el) {
  // Remove old selection
  const listEl = document.getElementById('btMarketList');
  if (listEl) listEl.querySelectorAll('.bt-market-row.selected').forEach(r => r.classList.remove('selected'));
  el.classList.add('selected');

  // Set hidden inputs
  const hidden = document.getElementById('btAsset');
  const metaHidden = document.getElementById('btAssetMeta');
  if (hidden) hidden.value = el.dataset.value || '';
  if (metaHidden) metaHidden.value = el.dataset.meta || '{}';

  // Show selected market
  const selEl = document.getElementById('btSelectedMarket');
  if (selEl) {
    const name = el.querySelector('.bt-market-name')?.textContent || '';
    selEl.innerHTML = `<span class="bt-sel-label">Selected Market</span>${esc(name)}`;
    selEl.classList.add('visible');
  }
};

function initBacktestPanel() {
  // Strategy picker
  const picker = document.getElementById('btStrategyPicker');
  const fileInput = document.getElementById('btFileUpload');
  if (picker) {
    // Populate with saved strategies
    const saved = typeof getStrategiesList === 'function' ? getStrategiesList() : [];
    for (const s of saved) {
      const opt = document.createElement('option');
      opt.value = 'saved_' + s.id;
      opt.textContent = s.name || 'Untitled';
      picker.insertBefore(opt, picker.querySelector('option[value="upload"]'));
    }

    picker.addEventListener('change', () => {
      if (picker.value === 'upload' && fileInput) {
        fileInput.click();
        picker.value = _btUploadedStrategy ? 'uploaded' : 'current';
      } else {
        _btUploadedStrategy = null;
        updateStrategyInfo();
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (!data.pipeline) { showToast('Invalid strategy file — missing pipeline', 'error'); return; }
          _btUploadedStrategy = data;
          // Add "Uploaded" option if not exists
          if (!picker.querySelector('option[value="uploaded"]')) {
            const opt = document.createElement('option');
            opt.value = 'uploaded';
            opt.textContent = (data.name || file.name) + ' (uploaded)';
            picker.insertBefore(opt, picker.querySelector('option[value="upload"]'));
          } else {
            picker.querySelector('option[value="uploaded"]').textContent = (data.name || file.name) + ' (uploaded)';
          }
          picker.value = 'uploaded';
          updateStrategyInfo();
          showToast(`Strategy loaded: ${data.name || file.name}`, 'success');
        } catch (err) {
          showToast('Invalid JSON: ' + err.message, 'error');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  // Filter tabs
  const filterContainer = document.getElementById('btMarketFilters');
  if (filterContainer) {
    filterContainer.addEventListener('click', (e) => {
      const tab = e.target.closest('.bt-filter-tab');
      if (!tab) return;
      filterContainer.querySelectorAll('.bt-filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      _btActiveFilter = tab.dataset.filter || 'all';
      renderMarketList();
    });
  }

  // Search
  const searchEl = document.getElementById('btMarketSearch');
  if (searchEl) {
    searchEl.addEventListener('input', () => renderMarketList());
  }

  // Initial render with static markets, then fetch live
  renderMarketList();
  loadBacktestMarkets();
  updateStrategyInfo();
}

function updateStrategyInfo() {
  const infoEl = document.getElementById('btStrategyInfo');
  if (!infoEl) return;
  const picker = document.getElementById('btStrategyPicker');
  const val = picker ? picker.value : 'current';

  if (val === 'uploaded' && _btUploadedStrategy) {
    const s = _btUploadedStrategy;
    infoEl.textContent = `${s.node_count || '?'} nodes | ${s.name || 'Unnamed'}`;
  } else if (val === 'current') {
    infoEl.textContent = `${nodes.length} nodes on canvas`;
  } else if (val.startsWith('saved_')) {
    const saved = typeof getStrategiesList === 'function' ? getStrategiesList() : [];
    const id = val.replace('saved_', '');
    const found = saved.find(s => s.id === id);
    if (found && found.data) {
      infoEl.textContent = `${(found.data.nodes || []).length} nodes | ${found.name || 'Unnamed'}`;
    }
  } else {
    infoEl.textContent = '';
  }
}

// Initialize when page loads
setTimeout(initBacktestPanel, 200);

function getBacktestStrategy() {
  const picker = document.getElementById('btStrategyPicker');
  const val = picker ? picker.value : 'current';

  if (val === 'uploaded' && _btUploadedStrategy) {
    return { strategy: _btUploadedStrategy, errors: [] };
  }

  if (val.startsWith('saved_')) {
    const saved = typeof getStrategiesList === 'function' ? getStrategiesList() : [];
    const id = val.replace('saved_', '');
    const found = saved.find(s => s.id === id);
    if (found && found.data) {
      // Load strategy data onto canvas temporarily for compilation
      const prevNodes = [...nodes];
      const prevConns = [...connections];
      nodes = found.data.nodes || [];
      connections = found.data.connections || [];
      const result = compileStrategy();
      nodes = prevNodes;
      connections = prevConns;
      return result;
    }
    return { strategy: null, errors: ['Saved strategy not found'] };
  }

  // Default: current canvas
  return compileStrategy();
}

async function runBacktest() {
  const { strategy, errors } = getBacktestStrategy();
  if (!strategy) {
    showToast(errors[0] || 'Build a strategy first — add at least a trigger and execution node', 'error');
    return;
  }

  const overlay = document.getElementById('btResultsOverlay');
  const running = document.getElementById('backtestRunning');
  const results = document.getElementById('backtestResults');
  // Show the results overlay (hides setup panel)
  overlay.style.display = 'flex';
  running.style.display = 'flex';
  results.style.display = 'none';

  const capital = parseFloat(document.getElementById('btCapital').value) || 10000;
  const days = parseInt(document.getElementById('btPeriod').value) || 90;
  const interval = document.getElementById('btInterval')?.value || 'auto';

  // Read selected market from hidden inputs
  let asset = document.getElementById('btAsset')?.value || null;
  let platform = 'Auto';
  let marketId = null;
  let tokenId = null;
  let kalshiTicker = null;
  let seriesTicker = null;
  let polySeriesKey = null;

  const metaEl = document.getElementById('btAssetMeta');
  if (metaEl && metaEl.value && metaEl.value !== '{}') {
    try {
      const meta = JSON.parse(metaEl.value);
      if (meta.platform) platform = meta.platform;
      if (meta.market_id) marketId = meta.market_id;
      if (meta.token_id) tokenId = meta.token_id;
      if (meta.kalshi_ticker) kalshiTicker = meta.kalshi_ticker;
      if (meta.series_ticker) seriesTicker = meta.series_ticker;
      if (meta.poly_series_key) polySeriesKey = meta.poly_series_key;
      // Underlying asset is now a fallback — series history takes priority
      if (meta.underlying_asset) asset = meta.underlying_asset;
    } catch (_) {}
  }

  // Also check strategy nodes for contract info
  if (!marketId && !tokenId && !kalshiTicker) {
    const allNodes = [...(strategy.pipeline.triggers || []), ...(strategy.pipeline.executions || [])];
    for (const n of allNodes) {
      const c = n.params?.contract;
      if (c && typeof c === 'object') {
        tokenId = c.token_id || tokenId;
        marketId = c.market_id || marketId;
        kalshiTicker = c.kalshi_ticker || kalshiTicker;
        break;
      }
    }
  }

  const base = getEngineBase();
  try {
    const resp = await fetch(`${base}/api/backtest/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy,
        period_days: days,
        capital,
        market_id: marketId,
        token_id: tokenId,
        kalshi_ticker: kalshiTicker,
        series_ticker: seriesTicker,
        poly_series_key: polySeriesKey,
        platform,
        asset,
        interval,
      }),
    });

    running.style.display = 'none';

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      showToast(`Backtest failed: ${err.detail || resp.statusText}`, 'error');
      overlay.style.display = 'none';
      return;
    }

    const data = await resp.json();
    renderBacktestResults(data, strategy, capital);
    results.style.display = 'block';
  } catch (e) {
    running.style.display = 'none';
    overlay.style.display = 'none';
    showToast(`Engine unreachable — start Mercury Engine on port 8778`, 'error');
    console.error('Backtest error:', e);
  }
}

window.showBacktestSetup = function() {
  const overlay = document.getElementById('btResultsOverlay');
  if (overlay) overlay.style.display = 'none';
};

function renderBacktestResults(data, strategy, capital) {
  const totalReturn = data.total_return_pct || 0;
  const sharpe = data.sharpe_ratio || 0;
  const winRate = data.win_rate || 0;
  const maxDD = data.max_drawdown || 0;
  const avgTrade = data.avg_trade || 0;
  const totalTrades = data.total_trades || 0;
  const equityData = data.equity_curve || [];
  const trades = (data.trades || []).slice(0, 50);
  const dataSource = data.data_source || 'Unknown';
  const dataPoints = data.data_points || 0;

  const container = document.getElementById('backtestResults');
  const nodeCount = strategy.node_count || 0;

  // Detect data quality
  const srcLower = dataSource.toLowerCase();
  const isSynthetic = srcLower.includes('synthetic');
  const isLimited = dataPoints > 0 && dataPoints < 50;
  const hasNoData = dataPoints === 0 && totalTrades === 0;

  let dataWarning = '';
  if (isSynthetic) {
    dataWarning = `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.25);border-radius:6px;font-size:11px;color:#ef5350;">
      <strong>Warning:</strong> No real historical data available for this market. Results are based on synthetic price data derived from BTC movements and may not reflect actual market behavior.
    </div>`;
  } else if (hasNoData) {
    dataWarning = `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(244,67,54,0.1);border:1px solid rgba(244,67,54,0.25);border-radius:6px;font-size:11px;color:#ef5350;">
      <strong>Warning:</strong> No data points were returned for this market. The strategy may not have matched any signals, or historical data may be unavailable.
    </div>`;
  } else if (isLimited) {
    dataWarning = `<div style="margin-bottom:10px;padding:8px 12px;background:rgba(255,152,0,0.1);border:1px solid rgba(255,152,0,0.25);border-radius:6px;font-size:11px;color:#ffa726;">
      <strong>Limited data:</strong> Only ${dataPoints} data points available. This market may not have enough history for a reliable backtest.
    </div>`;
  }

  container.innerHTML = `
    ${dataWarning}
    <div style="margin-bottom:12px;padding:8px 12px;background:rgba(255,193,7,0.08);border:1px solid rgba(255,193,7,0.15);border-radius:6px;font-size:11px;color:#888;">
      Backtest for <strong style="color:#ccc">${esc(strategy.name || 'Unnamed')}</strong> &middot; ${nodeCount} nodes &middot; ${esc(dataSource)} &middot; ${dataPoints} data points
    </div>
    <div class="backtest-stats">
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Total Return</span>
        <span class="backtest-stat-value ${totalReturn >= 0 ? 'positive' : 'negative'}">${totalReturn >= 0 ? '+' : ''}${totalReturn.toFixed(1)}%</span>
      </div>
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Sharpe Ratio</span>
        <span class="backtest-stat-value">${sharpe.toFixed(2)}</span>
      </div>
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Win Rate</span>
        <span class="backtest-stat-value">${winRate.toFixed(1)}%</span>
      </div>
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Max Drawdown</span>
        <span class="backtest-stat-value negative">${maxDD.toFixed(1)}%</span>
      </div>
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Avg Trade</span>
        <span class="backtest-stat-value ${avgTrade >= 0 ? 'positive' : 'negative'}">$${avgTrade.toFixed(2)}</span>
      </div>
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Total Trades</span>
        <span class="backtest-stat-value">${totalTrades}</span>
      </div>
    </div>
    <div class="detail-chart-card">
      <div class="card-header">
        <span class="card-title">Equity Curve</span>
        <span class="card-meta">$${capital.toLocaleString()} initial &rarr; $${(data.final_equity || capital).toLocaleString()}</span>
      </div>
      <div class="card-body">
        <div id="backtestChart" style="width:100%;height:280px;"></div>
      </div>
    </div>
    <div class="detail-card">
      <div class="card-header">
        <span class="card-title">Trades</span>
        <span class="card-meta">${trades.length}${trades.length < totalTrades ? ' of ' + totalTrades : ''} shown</span>
      </div>
      <div class="card-body">
        <div class="data-table-header trades-header">
          <span>Time</span>
          <span>Side</span>
          <span>Contract</span>
          <span>Price</span>
          <span>Amount</span>
          <span>P&L</span>
        </div>
        ${trades.length === 0 ? '<div style="padding:16px;text-align:center;color:#555;font-size:12px;">No trades executed during backtest period</div>' : ''}
        ${trades.map(t => {
          const side = (t.side || '').toUpperCase();
          return `<div class="data-table-row trades-row">
          <span class="data-table-cell muted">${formatTime(t.timestamp)}</span>
          <span class="data-table-cell ${side.includes('BUY') ? 'positive' : 'negative'}">${esc(side)}</span>
          <span class="data-table-cell bright">${esc(t.contract || '-')}</span>
          <span class="data-table-cell">${typeof t.price === 'number' ? t.price.toFixed(1) + 'c' : t.price}</span>
          <span class="data-table-cell">$${typeof t.amount === 'number' ? t.amount.toFixed(2) : t.amount}</span>
          <span class="data-table-cell ${(t.pnl || 0) >= 0 ? 'positive' : 'negative'}">${(t.pnl || 0) >= 0 ? '+' : ''}$${(t.pnl || 0).toFixed(2)}</span>
        </div>`;
        }).join('')}
      </div>
    </div>
    ${_renderFundingChecklist(totalReturn, sharpe, maxDD, winRate, totalTrades, isSynthetic)}`;

  // Animate funding checklist items (slot-machine reveal)
  setTimeout(() => {
    document.querySelectorAll('.fund-check-row[data-delay]').forEach(row => {
      const delay = parseInt(row.dataset.delay) || 0;
      setTimeout(() => row.classList.add('fund-check-row--visible'), delay);
    });
  }, 400);

  // Render equity chart
  setTimeout(() => {
    if (charts.backtestEquity) { charts.backtestEquity.destroy(); }
    const chartColor = totalReturn >= 0 ? '#00c853' : '#ff1744';
    charts.backtestEquity = new ApexCharts(document.getElementById('backtestChart'), {
      chart: {
        type: 'area', height: 280,
        background: 'transparent',
        toolbar: { show: false },
        zoom: { enabled: false },
      },
      series: [{ name: 'Equity', data: equityData }],
      stroke: { curve: 'smooth', width: 1.5 },
      fill: {
        type: 'gradient',
        gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0, stops: [0, 100] },
      },
      colors: [chartColor],
      xaxis: {
        type: 'datetime',
        labels: { style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '9px' } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: {
        labels: {
          style: { colors: '#444', fontFamily: 'JetBrains Mono', fontSize: '9px' },
          formatter: v => '$' + v.toFixed(0),
        },
      },
      grid: { borderColor: '#1a1a1a', strokeDashArray: 3, xaxis: { lines: { show: false } } },
      tooltip: { theme: 'dark' },
      dataLabels: { enabled: false },
    });
    charts.backtestEquity.render();
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// FUNDING CHECKLIST — shown in backtest results & deploy modal
// ═══════════════════════════════════════════════════════════════

function _renderFundingChecklist(totalReturn, sharpe, maxDD, winRate, totalTrades, isSynthetic) {
  // Base criteria (Starter tier) + $5K tier thresholds shown as stretch goals
  const checks = [
    { label: 'Positive total return', detail: totalReturn > 0 ? '+' + totalReturn.toFixed(1) + '%' : totalReturn.toFixed(1) + '%', pass: totalReturn > 0 },
    { label: 'Max drawdown under 10%', detail: Math.abs(maxDD).toFixed(1) + '% drawdown', pass: Math.abs(maxDD) < 10 },
    { label: 'Sharpe ratio above 0.75', detail: 'Sharpe ' + sharpe.toFixed(2) + (sharpe >= 1.25 ? ' \u2605' : ''), pass: sharpe > 0.75 },
    { label: 'Win rate above 50%', detail: winRate.toFixed(1) + '% wins', pass: winRate > 50 },
    { label: 'Minimum 25 trades', detail: totalTrades + ' trades', pass: totalTrades >= 25 },
    { label: 'Real market data (not synthetic)', detail: isSynthetic ? 'Synthetic data' : 'Real data', pass: !isSynthetic },
    { label: '60-day live track record', detail: 'Deploy live to start', pass: false, pending: true },
  ];
  // $5K elite check: Sharpe >= 1.25 (shown as star on the Sharpe row)
  const eliteReady = sharpe >= 1.25 && winRate > 50 && totalReturn > 0 && Math.abs(maxDD) < 10 && totalTrades >= 25 && !isSynthetic;

  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  const pct = Math.round((passed / total) * 100);

  const rows = checks.map((c, i) => {
    const icon = c.pending
      ? '<span class="fund-check-icon fund-check-icon--pending">\u25CB</span>'
      : c.pass
        ? '<span class="fund-check-icon fund-check-icon--pass">\u2713</span>'
        : '<span class="fund-check-icon fund-check-icon--fail">\u2717</span>';
    return `<div class="fund-check-row" data-delay="${150 + i * 120}">
      ${icon}
      <span class="fund-check-label">${c.label}</span>
      <span class="fund-check-detail">${c.detail}</span>
    </div>`;
  }).join('');

  return `<div class="detail-card fund-check-card">
    <div class="card-header">
      <span class="card-title" style="color:rgba(255,215,0,0.85);">Path to Funding</span>
      <span class="card-meta">${passed}/${total} criteria met &mdash; get up to $5,000</span>
    </div>
    <div class="card-body">
      <div class="fund-check-bar-track">
        <div class="fund-check-bar-fill" style="width:${pct}%"></div>
      </div>
      <div class="fund-check-list">${rows}</div>
      <div class="fund-check-footer">
        ${passed === total - 1 && checks[checks.length - 1].pending
          ? (eliteReady
            ? '<span class="fund-check-cta">\u2605 Elite-tier metrics \u2014 deploy live for 60 days to qualify for <strong style="color:rgba(255,215,0,0.85);">$5,000 funding</strong> \u2192</span>'
            : '<span class="fund-check-cta">Deploy this strategy live to complete the final step \u2192</span>')
          : passed >= total - 2
            ? '<span class="fund-check-cta">Almost there \u2014 keep refining and <a href="/funding.html" style="color:rgba(255,215,0,0.85);">apply for funding</a></span>'
            : '<span class="fund-check-cta">Optimize your strategy to meet funding requirements \u2014 <a href="/funding.html" style="color:rgba(255,215,0,0.85);">learn more</a></span>'
        }
      </div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════
// TEMPLATES VIEW
// ═══════════════════════════════════════════════════════════════
function renderTemplates() {
  const filter = document.querySelector('#templateFilters .filter-tab.active')?.dataset.filter || 'all';
  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter);

  el.templatesGrid.innerHTML = filtered.map(t => {
    return `<div class="template-card">
      <div class="template-card-header">
        <div>
          <div class="template-card-name">${esc(t.name)}</div>
          <div class="template-difficulty">${esc(t.difficulty)} &middot; ${t.nodeCount} nodes</div>
        </div>
        <span class="template-category ${esc(t.category)}">${esc(t.category.replace('-', ' '))}</span>
      </div>
      <div class="template-description">${esc(t.description)}</div>
      <div class="template-preview">${renderTemplatePreview(t)}</div>
      <div class="template-card-footer">
        <button class="toolbar-btn" onclick="loadTemplate('${escapeAttr(t.id)}')">Use Template</button>
      </div>
    </div>`;
  }).join('');
}

function renderTemplatePreview(template) {
  const w = 280; const h = 60;
  let svg = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">`;

  // Scale nodes to fit
  const nodes = template.nodes;
  if (!nodes || nodes.length === 0) return '<svg></svg>';

  const minX = Math.min(...nodes.map(n => n.x));
  const maxX = Math.max(...nodes.map(n => n.x + 160));
  const minY = Math.min(...nodes.map(n => n.y));
  const maxY = Math.max(...nodes.map(n => n.y + 60));
  const worldW = maxX - minX || 1;
  const worldH = maxY - minY || 1;
  const scale = Math.min((w - 20) / worldW, (h - 10) / worldH);
  const offX = (w - worldW * scale) / 2;
  const offY = (h - worldH * scale) / 2;

  // Connections
  if (template.connections) {
    template.connections.forEach(c => {
      const from = nodes[c.from];
      const to = nodes[c.to];
      if (!from || !to) return;
      const x1 = offX + (from.x + 160 - minX) * scale;
      const y1 = offY + (from.y + 30 - minY) * scale;
      const x2 = offX + (to.x - minX) * scale;
      const y2 = offY + (to.y + 30 - minY) * scale;
      const cx = (x1 + x2) / 2;
      svg += `<path d="M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2}" stroke="#333" stroke-width="1" fill="none" stroke-dasharray="3 2"/>`;
    });
  }

  // Nodes
  nodes.forEach(n => {
    const def = NODE_TYPES[n.type];
    const color = def ? def.color : '#444';
    const nx = offX + (n.x - minX) * scale;
    const ny = offY + (n.y - minY) * scale;
    const nw = 160 * scale;
    const nh = 50 * scale;
    svg += `<rect x="${nx}" y="${ny}" width="${nw}" height="${nh}" fill="#0f0f0f" stroke="${color}" stroke-width="0.5" opacity="0.8"/>`;
  });

  svg += '</svg>';
  return svg;
}

window.loadTemplate = function(templateId) {
  const template = templates.find(t => t.id === templateId);
  if (!template) return;

  pushUndo();
  clearCanvas();

  const nodeMap = {};
  template.nodes.forEach((nd, idx) => {
    const node = createNode(nd.type, nd.x, nd.y, nd.properties);
    if (node) nodeMap[idx] = node;
  });

  if (template.connections) {
    template.connections.forEach(c => {
      const from = nodeMap[c.from];
      const to = nodeMap[c.to];
      if (from && to) addConnection(from.id, c.fromPort, to.id, c.toPort);
    });
  }

  el.strategyName.value = template.name.toLowerCase().replace(/\s+/g, '_');
  switchView('builder');
  showToast('Template "' + template.name + '" loaded');

  setTimeout(() => {
    canvas.panX = 80;
    canvas.panY = 20;
    applyCanvasTransform();
    updateMercuryScript();
  }, 100);
};

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
function showToast(message, type) {
  // Friendlier messages for common engine errors
  let msg = message;
  if (typeof msg === 'string') {
    if (/fetch|NetworkError|Failed to fetch/i.test(msg)) msg = 'Cannot reach engine — is Mercury Engine running?';
    else if (/HTTP 401|Unauthorized/i.test(msg)) msg = 'Session expired — please log in again';
    else if (/HTTP 503|Service Unavailable/i.test(msg)) msg = 'Engine is starting up — try again in a moment';
    else if (/HTTP 429|Too Many/i.test(msg)) msg = 'Too many requests — slow down';
  }
  el.toastMessage.textContent = msg;
  el.toast.className = 'toast show' + (type ? ' ' + type : '');
  const duration = type === 'error' ? 5000 : type === 'warn' ? 4000 : 3000;
  setTimeout(() => { el.toast.classList.remove('show'); }, duration);
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatTime(iso) {
  if (!iso) return '--:--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--:--';
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return h + ':' + m + ':' + s;
}

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════
async function initMockData() {
  // Start with empty local bots — real bots come from the engine
  bots = [];

  // Check engine connection
  try {
    const health = await engineBridge.checkHealth();
    if (health) {
      console.log('[Mercury Engine] Connected:', health);
      updateEngineStatus(true);
    } else {
      throw new Error('offline');
    }
  } catch {
    console.warn('[Mercury Engine] Offline — features limited to local mode');
    updateEngineStatus(false);
    // Populate demo bots so the UI isn't empty when engine is off
    bots = [
      createMockBot('Rate Cut Momentum', 'Momentum', 'live', 'Polymarket', 10000),
      createMockBot('Election Arbitrage', 'Arbitrage', 'live', 'Multi-Platform', 25000),
      createMockBot('Reversion Scanner', 'Mean Reversion', 'paused', 'Kalshi', 5000),
      createMockBot('Event Catalyst', 'Event-Driven', 'live', 'Polymarket', 8000),
    ];
    bots.forEach(b => b._local = true);
  }

  templates = [
    // ─── MOMENTUM ──────────────────────────────────────────
    {
      id: 'tmpl-1', name: 'BTC Bullish Momentum', category: 'momentum',
      description: 'Buys BTC-up contracts when price momentum turns positive. Checks every hour, enters with $250 market orders, and uses a trailing stop to lock in gains while staying in the trend.',
      difficulty: 'Beginner', nodeCount: 4,
      nodes: [
        { type: 'price-threshold', x: 80, y: 150, properties: { direction: 'Crosses Above', threshold: 55 } },
        { type: 'momentum', x: 340, y: 150, properties: { direction: 'Bullish', period: '1hr', minChange: 3 } },
        { type: 'market-order', x: 600, y: 150, properties: { side: 'Buy YES', amount: 250 } },
        { type: 'trailing-stop', x: 860, y: 150, properties: { type: 'Percentage', value: 10, activation: 5 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-2', name: 'BTC Bearish Momentum', category: 'momentum',
      description: 'Profits from BTC drops by buying NO on BTC-up contracts when momentum turns negative. Mirror of the bullish strategy — great for hedging or playing both sides.',
      difficulty: 'Beginner', nodeCount: 4,
      nodes: [
        { type: 'price-threshold', x: 80, y: 150, properties: { direction: 'Crosses Below', threshold: 45 } },
        { type: 'momentum', x: 340, y: 150, properties: { direction: 'Bearish', period: '1hr', minChange: 3 } },
        { type: 'market-order', x: 600, y: 150, properties: { side: 'Buy NO', amount: 250 } },
        { type: 'trailing-stop', x: 860, y: 150, properties: { type: 'Percentage', value: 10, activation: 5 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-3', name: 'Trend Rider', category: 'momentum',
      description: 'Catches breakouts with volume confirmation. When a contract breaks above 60c on a volume spike, enters a $500 scaled entry across 3 tranches for better fills. High-volume strategy.',
      difficulty: 'Intermediate', nodeCount: 5,
      nodes: [
        { type: 'probability-cross', x: 80, y: 100, properties: { direction: 'Crosses Above', level: 60 } },
        { type: 'volume-spike', x: 80, y: 280, properties: { multiplier: 3, window: '1hr' } },
        { type: 'liquidity-check', x: 360, y: 180, properties: { minLiquidity: 25000 } },
        { type: 'scaled-entry', x: 640, y: 180, properties: { totalAmount: 500, tranches: 3 } },
        { type: 'stop-loss', x: 900, y: 180, properties: { type: 'Percentage', value: 12 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 3, fromPort: 'out', to: 4, toPort: 'in' },
      ],
    },
    // ─── MEAN REVERSION ────────────────────────────────────
    {
      id: 'tmpl-4', name: 'BTC Buy the Dip', category: 'mean-reversion',
      description: 'Buys BTC-up contracts when RSI goes oversold (<30). Prediction markets overshoot on short-term dips — this strategy dollar-cost averages in during panic for a bounce.',
      difficulty: 'Beginner', nodeCount: 4,
      nodes: [
        { type: 'rsi', x: 80, y: 150, properties: { period: 14, oversold: 30, signal: 'Oversold' } },
        { type: 'price-range', x: 340, y: 150, properties: { min: 20, max: 45, action: 'Inside Range' } },
        { type: 'dca', x: 600, y: 150, properties: { amountPer: 100, interval: 'Every 1hr', maxBuys: 10 } },
        { type: 'stop-loss', x: 860, y: 150, properties: { type: 'Percentage', value: 15 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-5', name: 'BTC Fade the Rally', category: 'mean-reversion',
      description: 'Sells into overbought BTC-up contracts (RSI > 70) by buying NO. When everyone is euphoric, probability overshoots — this catches the pullback for quick profit.',
      difficulty: 'Beginner', nodeCount: 4,
      nodes: [
        { type: 'rsi', x: 80, y: 150, properties: { period: 14, overbought: 70, signal: 'Overbought' } },
        { type: 'price-range', x: 340, y: 150, properties: { min: 55, max: 80, action: 'Inside Range' } },
        { type: 'market-order', x: 600, y: 150, properties: { side: 'Buy NO', amount: 200 } },
        { type: 'take-profit', x: 860, y: 150, properties: { type: 'Percentage', value: 8 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-6', name: 'Fear & Greed Contrarian', category: 'mean-reversion',
      description: 'Uses the Fear & Greed Index as a buy signal. When fear is extreme (<20), buys undervalued contracts. Scales in across 5 tranches for better average price. High conviction, high volume.',
      difficulty: 'Intermediate', nodeCount: 4,
      nodes: [
        { type: 'api-data', x: 80, y: 150, properties: { preset: 'Fear & Greed Index', operator: '<', threshold: 20 } },
        { type: 'price-range', x: 340, y: 150, properties: { min: 15, max: 45, action: 'Inside Range' } },
        { type: 'scaled-entry', x: 600, y: 150, properties: { totalAmount: 500, tranches: 5 } },
        { type: 'stop-loss', x: 860, y: 150, properties: { type: 'Percentage', value: 18 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    // ─── BOND ARB ──────────────────────────────────────────
    {
      id: 'tmpl-7', name: 'Auto Bond Buyer', category: 'bond-arb',
      description: 'Automatically buys bonds (contracts >92c) every 2 hours when liquidity is sufficient. The safest strategy on the platform — like earning yield on a savings account. Set it and forget it.',
      difficulty: 'Beginner', nodeCount: 5,
      nodes: [
        { type: 'time-based', x: 80, y: 150, properties: { schedule: 'Every 2hr' } },
        { type: 'probability-band', x: 320, y: 80, properties: { min: 92, max: 99 } },
        { type: 'liquidity-check', x: 320, y: 250, properties: { minLiquidity: 10000 } },
        { type: 'limit-order', x: 600, y: 150, properties: { side: 'Buy YES', limitPrice: 95, amount: 500 } },
        { type: 'portfolio-cap', x: 860, y: 150, properties: { maxCapital: 5000, action: 'Block New Trades' } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 3, fromPort: 'out', to: 4, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-8', name: 'Aggressive Bond Farmer', category: 'bond-arb',
      description: 'High-volume bonding: checks every hour, buys contracts above 90c with $1,000 limit orders. Maximizes yield by accepting slightly lower-probability bonds. Portfolio cap prevents overexposure.',
      difficulty: 'Beginner', nodeCount: 5,
      nodes: [
        { type: 'time-based', x: 80, y: 150, properties: { schedule: 'Every 1hr' } },
        { type: 'probability-band', x: 320, y: 80, properties: { min: 90, max: 99 } },
        { type: 'liquidity-check', x: 320, y: 250, properties: { minLiquidity: 5000 } },
        { type: 'limit-order', x: 600, y: 150, properties: { side: 'Buy YES', limitPrice: 93, amount: 1000 } },
        { type: 'portfolio-cap', x: 860, y: 150, properties: { maxCapital: 10000, action: 'Block New Trades' } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 3, fromPort: 'out', to: 4, toPort: 'in' },
      ],
    },
    // ─── DCA / ACCUMULATION ────────────────────────────────
    {
      id: 'tmpl-9', name: 'Hourly DCA Machine', category: 'dca',
      description: 'Buys $50 every hour into your chosen contract, rain or shine. 100 max buys means up to $5,000 deployed over 4 days. Simple, consistent, high total volume. The workhorse strategy.',
      difficulty: 'Beginner', nodeCount: 3,
      nodes: [
        { type: 'time-based', x: 100, y: 180, properties: { schedule: 'Every 1hr' } },
        { type: 'dca', x: 420, y: 180, properties: { amountPer: 50, interval: 'Every 1hr', maxBuys: 100 } },
        { type: 'portfolio-cap', x: 740, y: 180, properties: { maxCapital: 5000, action: 'Block New Trades' } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'out', to: 2, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-10', name: 'Smart DCA (Buy Dips Only)', category: 'dca',
      description: 'Like the Hourly DCA but only buys when momentum is bearish — times your entries during pullbacks for a better average price. Checks every 2 hours during market hours.',
      difficulty: 'Intermediate', nodeCount: 5,
      nodes: [
        { type: 'time-based', x: 80, y: 150, properties: { schedule: 'Every 2hr', timezone: 'ET' } },
        { type: 'time-window', x: 320, y: 80, properties: { startHour: 8, endHour: 22, timezone: 'ET', days: 'All Days' } },
        { type: 'momentum', x: 320, y: 250, properties: { direction: 'Bearish', period: '4hr', minChange: 2 } },
        { type: 'dca', x: 600, y: 150, properties: { amountPer: 75, interval: 'Every 2hr', maxBuys: 60 } },
        { type: 'portfolio-cap', x: 860, y: 150, properties: { maxCapital: 5000, action: 'Block New Trades' } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 3, fromPort: 'out', to: 4, toPort: 'in' },
      ],
    },
    // ─── EVENT-DRIVEN ──────────────────────────────────────
    {
      id: 'tmpl-11', name: 'Resolution Sniper', category: 'event-driven',
      description: 'Buys high-probability contracts in the final 48 hours before resolution. Markets approaching certainty (75-95c) in the last 2 days are essentially free money with a short time horizon.',
      difficulty: 'Beginner', nodeCount: 4,
      nodes: [
        { type: 'market-event', x: 80, y: 150, properties: { event: 'Resolution', lead: '48hr Before' } },
        { type: 'probability-band', x: 340, y: 150, properties: { min: 75, max: 95 } },
        { type: 'market-order', x: 600, y: 150, properties: { side: 'Buy YES', amount: 300 } },
        { type: 'stop-loss', x: 860, y: 150, properties: { type: 'Probability Level', value: 60 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-12', name: 'Volume Spike Catcher', category: 'event-driven',
      description: 'Detects sudden volume surges (3x normal) and rides the wave with $300 market orders. Tight trailing stop (8%) locks in gains. Fast in, fast out — generates volume on every market-moving event.',
      difficulty: 'Intermediate', nodeCount: 4,
      nodes: [
        { type: 'volume-spike', x: 80, y: 150, properties: { multiplier: 3, window: '1hr' } },
        { type: 'liquidity-check', x: 340, y: 150, properties: { minLiquidity: 20000 } },
        { type: 'market-order', x: 600, y: 150, properties: { side: 'Buy YES', amount: 300 } },
        { type: 'trailing-stop', x: 860, y: 150, properties: { type: 'Percentage', value: 8, activation: 4 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
  ];
}

function createMockBot(name, strategyType, status, market, capital) {
  const id = 'bot-' + Math.random().toString(36).substr(2, 6);
  const isLive = status === 'live';
  const pnl = isLive ? (Math.random() - 0.2) * capital * 0.3 : (status === 'paused' ? (Math.random() - 0.3) * capital * 0.15 : 0);
  const winRate = status === 'draft' ? 0 : 50 + Math.random() * 30;
  const totalTrades = status === 'draft' ? 0 : Math.floor(20 + Math.random() * 100);
  const vol = status === 'draft' ? 0 : Math.floor(capital * (1 + Math.random() * 3));

  const contracts = [
    'Fed Rate Cut Mar 2026', 'BTC > $100K', 'Trump 2028 Nominee',
    'Recession by 2027', 'AI Regulation 2026', 'SpaceX Mars 2030',
    'Nvidia > $200', 'US Debt Ceiling',
  ];

  const sparkData = [];
  let val = capital;
  for (let i = 0; i < 20; i++) {
    val += val * ((Math.random() - 0.4) * 0.025);
    sparkData.push(Math.round(val));
  }

  const tradesList = [];
  for (let i = 0; i < Math.min(totalTrades, 30); i++) {
    tradesList.push({
      timestamp: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      side: Math.random() > 0.5 ? 'BUY' : 'SELL',
      contract: contracts[Math.floor(Math.random() * contracts.length)],
      type: Math.random() > 0.5 ? 'YES' : 'NO',
      amount: Math.floor(50 + Math.random() * 300),
      price: Math.floor(20 + Math.random() * 60),
      pnl: (Math.random() - 0.35) * 80,
      status: 'filled',
    });
  }
  tradesList.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const positions = isLive ? Array.from({ length: Math.floor(1 + Math.random() * 4) }, () => ({
    contract: contracts[Math.floor(Math.random() * contracts.length)],
    side: Math.random() > 0.5 ? 'YES' : 'NO',
    qty: Math.floor(1 + Math.random() * 10),
    entry: Math.floor(30 + Math.random() * 40),
    pnl: (Math.random() - 0.3) * 60,
  })) : [];

  const logs = [];
  const logMessages = [
    { level: 'info', msg: 'Bot initialized — connected to ' + market },
    { level: 'info', msg: 'Loaded strategy: ' + name },
    { level: 'info', msg: 'Market scan started — monitoring ' + contracts[Math.floor(Math.random() * contracts.length)] },
    { level: 'signal', msg: 'Signal detected: probability shift on ' + contracts[Math.floor(Math.random() * contracts.length)] },
    { level: 'trade', msg: 'Order filled: BUY YES x $150 @ 62c' },
    { level: 'info', msg: 'Risk check passed — all within limits' },
    { level: 'info', msg: 'Heartbeat OK — latency 6ms' },
    { level: 'warn', msg: 'Spread widened to 3.2c — adjusting limits' },
    { level: 'trade', msg: 'Stop loss triggered — SELL YES x $150 @ 54c — P&L: -$12.00' },
    { level: 'info', msg: 'Position closed — realized P&L: +$28.40' },
  ];
  for (let i = 0; i < 12; i++) {
    const m = logMessages[Math.floor(Math.random() * logMessages.length)];
    logs.push({
      timestamp: new Date(Date.now() - (12 - i) * 300000 - Math.random() * 60000).toISOString(),
      level: m.level,
      message: m.msg,
    });
  }

  return {
    id, name, strategyType, status, market,
    contract: contracts[Math.floor(Math.random() * contracts.length)],
    createdAt: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString(),
    updatedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    metrics: {
      winRate,
      pnl: Math.round(pnl * 100) / 100,
      pnlPercent: capital > 0 ? (pnl / capital * 100) : 0,
      totalTrades,
      volume: vol,
      sharpe: 0.5 + Math.random() * 2,
      maxDrawdown: -(3 + Math.random() * 15),
      openPositions: positions.length,
    },
    sparklineData: sparkData,
    trades: tradesList,
    positions,
    logs,
  };
}

// ═══════════════════════════════════════════════════════════════
// ARCHITECT SPOTLIGHT TOUR (runs after wizard)
// ═══════════════════════════════════════════════════════════════

function maybeStartArchitectTour(force) {
  console.log('[Tour] maybeStartArchitectTour called, force =', !!force);
  if (!force && localStorage.getItem('mercury_arch_tour_done')) {
    console.log('[Tour] Already completed — skipping');
    return;
  }
  if (!window.MercuryTour) {
    console.log('[Tour] MercuryTour engine not loaded');
    return;
  }

  console.log('[Tour] Starting in 600ms...');
  setTimeout(() => {
    // Remove existing tour overlay if forcing restart
    if (force) {
      const existing = document.querySelector('.tour-overlay');
      if (existing) existing.remove();
      localStorage.removeItem('mercury_arch_tour_done');
    }

    const tour = window.MercuryTour.create({
      steps: [
        {
          selector: '.sidebar-nav',
          title: 'Navigation',
          text: 'Switch between views here — Agent, My Bots, Backtest, Templates, and Charting. Each one gives you a different tool for building and managing strategies.',
          position: 'right',
          padding: 6,
        },
        {
          selector: '#strategyBar',
          title: 'Strategy Tabs',
          text: 'Create multiple strategies and switch between them instantly. Click "New" for a blank canvas or "My Strategies" to browse all your saved work.',
          position: 'bottom',
          padding: 4,
        },
        {
          selector: '#canvasContainer',
          title: 'Strategy Canvas',
          text: 'This is where your strategy lives. Right-click to add blocks, then drag between ports to connect them. Triggers flow into logic, logic into execution, execution into risk.',
          position: 'bottom',
          padding: 6,
        },
        {
          selector: '.agent-input-area',
          title: 'Mercury Agent',
          text: 'Describe what you want in plain English and the AI builds the entire strategy for you. Try "buy YES on any market where probability crosses 60% and Fear & Greed is above 50".',
          position: 'top',
          padding: 6,
        },
        {
          selector: '.nav-item[data-view="charting"]',
          title: 'Charting',
          text: 'Live market feeds, order books, cross-platform data, and custom API integration across Polymarket and Kalshi — all the data you need to find edge before you build.',
          position: 'right',
          padding: 4,
        },
        {
          selector: '.sidebar-accounts',
          title: 'Connected Accounts',
          text: 'Connect your Polymarket and Kalshi accounts here. Paper trading works without an account — connect when you\'re ready to go live.',
          position: 'right',
          padding: 6,
        },
        {
          selector: '.nav-item--funding',
          title: 'Mercury Funding',
          text: 'Pro users with profitable strategies can apply for up to $5,000 in funded trading capital. Build your track record, then apply here.',
          position: 'right',
          padding: 4,
        },
        {
          selector: '.builder-toolbar',
          title: 'Toolbar',
          text: 'Name your strategy, deploy it, import/export strategies, and access the tutorial again from here. When your strategy is ready, hit Deploy.',
          position: 'bottom',
          padding: 4,
        },
      ],
      storageKey: 'mercury_arch_tour_done',
    });
    console.log('[Tour] Calling tour.start()');
    tour.start();
  }, 600);
}

// Expose for manual testing from console: startTour()
window.startTour = function() { maybeStartArchitectTour(true); };

// ═══════════════════════════════════════════════════════════════
// TUTORIAL (first-time users)
// ═══════════════════════════════════════════════════════════════

function showWizard() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) {
    overlay.classList.add('active');
    wizardGoToStep(1);
  }
}

window.reopenTutorial = function() {
  showWizard();
};

window.hideWizard = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  if (nodes.length === 0) loadDefaultStrategy();
  maybeStartArchitectTour();
};

window.wizardGoToStep = function(step) {
  document.querySelectorAll('.wizard-step').forEach(s => {
    const sStep = parseInt(s.dataset.step);
    s.classList.toggle('active', sStep === step);
    s.classList.toggle('done', sStep < step);
  });
  document.querySelectorAll('.wizard-page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('wizStep' + step);
  if (page) page.classList.add('active');
};

// Step 6 actions — how to start building
window.tutStartBlank = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  maybeStartArchitectTour();
};

window.tutStartTemplate = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  switchView('templates');
  maybeStartArchitectTour();
};

window.tutStartAgent = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  // Focus the agent input so user can start typing
  if (el.agentInput) {
    el.agentInput.focus();
    el.agentInput.placeholder = 'Describe the bot you want to build...';
  }
  maybeStartArchitectTour();
};

// ═══════════════════════════════════════════════════════════════
// PALETTE TOOLTIP
// ═══════════════════════════════════════════════════════════════

function showPaletteTooltip() {
  const tooltip = document.getElementById('paletteTooltip');
  if (!tooltip) return;
  tooltip.classList.add('visible');
  localStorage.setItem('mercury_palette_seen', '1');

  // Dismiss on click anywhere or after 4 seconds
  const dismiss = () => {
    tooltip.classList.remove('visible');
    document.removeEventListener('click', dismiss);
  };
  setTimeout(dismiss, 4000);
  document.addEventListener('click', dismiss);
}
