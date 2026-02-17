/**
 * Mercury Analytics Dashboard - v2.0
 * ApexCharts, animations, interactive tables, summary bar
 */

// ========== AUTHENTICATION ==========
let currentUser = null;
let userTier = 'free';

async function initAuth() {
    const session = await window.requireAuth();
    if (!session) return;

    currentUser = await window.getCurrentUser();
    userTier = window.getUserTier(currentUser);

    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const userPlanEl = document.getElementById('userPlan');

    if (currentUser && currentUser.email) {
        if (userNameEl) userNameEl.textContent = currentUser.email;
        if (userAvatarEl) userAvatarEl.textContent = currentUser.email.charAt(0).toUpperCase();
    }

    if (userPlanEl) {
        userPlanEl.textContent = userTier.charAt(0).toUpperCase() + userTier.slice(1) + ' Plan';
    }

    console.log('User authenticated:', currentUser.email, '| Tier:', userTier);
}

// ========== CONFIGURATION ==========
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:')
    ? 'http://localhost:8000/api'
    : 'https://mercury-backend.onrender.com/api';
const GEX_REFRESH_INTERVAL = 60 * 1000; // GEX data refresh — 60s
const PRICE_HISTORY_FETCH_INTERVAL = 5 * 60 * 1000; // CoinGecko backfill — 5 min

let currentAsset = 'BTC';
let refreshTimer = null;
let priceHistoryTimer = null;
let countdownTimer = null;
let secondsUntilUpdate = 60;
let isLoading = false;
let isAdvancedMode = false;
let dashboardData = null;
let priceHistory = [];
let isFirstLoad = true;
let previousMetrics = null;
let previousSignals = {}; // track previous GEX per strike for change arrows
let gexHistory = []; // Array of { timestamp, data } snapshots for replay
const MAX_GEX_SNAPSHOTS = 500;

// WebSocket live tick state
let tickSocket = null;
let tickReconnectTimer = null;
let lastTickPrice = null;
let tickThrottleTimer = null;
const TICK_THROTTLE_MS = 1000; // update chart at most every 1s for smooth perf
// Session starts at 9:30 AM ET each day
function getSessionStart() {
  var now = new Date();
  var session = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 30, 0, 0);
  if (now < session) session.setDate(session.getDate() - 1);
  return session.getTime();
}
let replayActive = false;
let replayPlaying = false;
let replayInterval = null;
let replayPosition = 100; // percentage 0-100
let currentView = 'price';
let activeOverlays = new Set();

const elements = {};

// ApexCharts instances
let charts = {
  price: null,
  dealerGex: null,
  gammaProfile: null,
  vannaHeatmap: null,
  charmCurve: null,
  spotVol: null
};

// Shared ApexCharts dark theme — terminal brutalist
const APEX_THEME = {
  chart: {
    background: 'transparent',
    foreColor: '#444444',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    toolbar: { show: false },
    animations: {
      enabled: true,
      easing: 'linear',
      speed: 300,
      animateGradually: { enabled: false },
      dynamicAnimation: { enabled: true, speed: 800 }
    },
    selection: { enabled: false },
    zoom: { enabled: false },
  },
  theme: { mode: 'dark' },
  grid: {
    borderColor: 'rgba(255,255,255,0.04)',
    strokeDashArray: 0,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
  },
  tooltip: {
    theme: 'dark',
    style: { fontSize: '11px', fontFamily: "'JetBrains Mono', monospace" },
  },
  xaxis: {
    labels: { style: { colors: '#909090', fontSize: '10px' } },
    axisBorder: { show: false },
    axisTicks: { show: false },
    crosshairs: { show: true, stroke: { color: 'rgba(255,255,255,0.1)', width: 1, dashArray: 4 } }
  },
  yaxis: {
    labels: { style: { colors: '#909090', fontSize: '10px', fontWeight: 500 } }
  }
};

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  initAuth().then(() => {
    init();
  });
});

function cacheElements() {
  elements.loadingOverlay = document.getElementById('loadingOverlay');
  elements.lastUpdated = document.getElementById('lastUpdated');
  elements.nextUpdate = document.getElementById('nextUpdate');
  elements.refreshBtn = document.getElementById('refreshBtn');
  elements.errorToast = document.getElementById('errorToast');
  elements.levelsTableBody = document.getElementById('levelsTableBody');
  elements.advancedTableBody = document.getElementById('advancedTableBody');
  elements.simpleModeSection = document.getElementById('simpleModeSection');
  elements.advancedModeSection = document.getElementById('advancedModeSection');
  elements.advancedModeToggle = document.getElementById('advancedModeToggle');
  elements.regimeBanner = document.getElementById('regimeBanner');
  elements.regimeValue = document.getElementById('regimeValue');
  elements.regimeDescription = document.getElementById('regimeDescription');
  elements.netGexValue = document.getElementById('netGexValue');
  elements.netGexDesc = document.getElementById('netGexDesc');
  elements.netVannaValue = document.getElementById('netVannaValue');
  elements.netVannaDesc = document.getElementById('netVannaDesc');
  elements.netCharmValue = document.getElementById('netCharmValue');
  elements.netCharmDesc = document.getElementById('netCharmDesc');
  elements.maxPainValue = document.getElementById('maxPainValue');
  elements.maxPainDesc = document.getElementById('maxPainDesc');
  elements.tierBadge = document.getElementById('tierBadge');
  elements.refreshRate = document.getElementById('refreshRate');
  elements.zeroGammaStrike = document.getElementById('zeroGammaStrike');
  elements.gexConcentration = document.getElementById('gexConcentration');
  elements.gexConcentrationFill = document.getElementById('gexConcentrationFill');
  elements.marketStatus = document.getElementById('marketStatus');
  elements.marketStatusDesc = document.getElementById('marketStatusDesc');
  elements.dealerGexInsight = document.getElementById('dealerGexInsight');
}

async function init() {
  setupEventListeners();
  startLiveClock();
  await loadDashboardData();
  startAutoRefresh();
  startCountdown();
}

function setupEventListeners() {
  document.querySelectorAll('.asset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.dataset.asset === 'ETH') return;
      document.querySelectorAll('.asset-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentAsset = e.target.dataset.asset;
      loadDashboardData();
    });
  });

  elements.refreshBtn.addEventListener('click', () => {
    elements.refreshBtn.classList.add('spinning');
    loadDashboardData().finally(() => {
      setTimeout(() => elements.refreshBtn.classList.remove('spinning'), 300);
    });
    resetCountdown();
  });

  if (elements.advancedModeToggle) {
    elements.advancedModeToggle.addEventListener('change', (e) => {
      isAdvancedMode = e.target.checked;
      toggleAdvancedMode();
    });
  }

  elements.errorToast.querySelector('.toast-close').addEventListener('click', () => {
    elements.errorToast.classList.remove('show');
  });

  // No timeframe buttons — session auto-starts at 9:30 AM

  // Replay mode controls
  const replayToggle = document.getElementById('replayToggleBtn');
  const replayBar = document.getElementById('replayBar');
  const replaySlider = document.getElementById('replaySlider');
  const replayPlayBtn = document.getElementById('replayPlayBtn');
  const replayCloseBtn = document.getElementById('replayCloseBtn');

  if (replayToggle) {
    replayToggle.addEventListener('click', () => {
      if (replayActive) {
        exitReplay();
      } else {
        enterReplay();
      }
    });
  }

  if (replayPlayBtn) {
    replayPlayBtn.addEventListener('click', () => {
      if (replayPlaying) {
        pauseReplay();
      } else {
        playReplay();
      }
    });
  }

  if (replaySlider) {
    replaySlider.addEventListener('input', (e) => {
      replayPosition = parseInt(e.target.value);
      updateReplayChart();
    });
  }

  if (replayCloseBtn) {
    replayCloseBtn.addEventListener('click', () => {
      exitReplay();
    });
  }

  // View switching / overlay toggles
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      var view = e.target.dataset.view;
      if (view === 'price') {
        activeOverlays.clear();
        switchChartView('price');
        updateOverlayTabs();
      } else if (view === 'spotVol') {
        activeOverlays.clear();
        switchChartView('spotVol');
        updateOverlayTabs();
      } else {
        toggleOverlay(view);
      }
    });
  });
}

function switchChartView(view) {
  currentView = view;

  // Update tab active states (overlay-aware)
  updateOverlayTabs();

  // Map view names to container IDs
  var viewMap = {
    price: 'priceView',
    dealerGex: 'dealerGexView',
    gamma: 'gammaView',
    vanna: 'vannaView',
    charm: 'charmView',
    spotVol: 'spotVolView'
  };

  // Hide all chart views (use className to override skeleton !important)
  document.querySelectorAll('.chart-view').forEach(function(el) {
    el.style.display = 'none';
    el.classList.remove('active-view');
  });

  // Show selected
  var target = document.getElementById(viewMap[view]);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active-view');
  }

  // Hide/show replay bar (only for price view)
  var replayToggle = document.getElementById('replayToggleBtn');
  if (replayToggle) replayToggle.style.display = (view === 'price') ? 'flex' : 'none';
  if (view !== 'price' && replayActive) exitReplay();

  // Trigger chart resize for the newly visible chart
  if (view === 'price' && charts.price) charts.price.updateOptions({}, false, false);
  if (view === 'dealerGex' && charts.dealerGex) charts.dealerGex.updateOptions({}, false, false);
  if (view === 'gamma' && charts.gammaProfile) charts.gammaProfile.updateOptions({}, false, false);
  if (view === 'vanna' && charts.vannaHeatmap) charts.vannaHeatmap.updateOptions({}, false, false);
  if (view === 'charm' && charts.charmCurve) charts.charmCurve.updateOptions({}, false, false);
  if (view === 'spotVol' && charts.spotVol) charts.spotVol.updateOptions({}, false, false);
}

// ========== INTERPOLATION — $250 GRANULARITY ==========
// Creates synthetic GEX levels between real strikes via linear interpolation
function interpolateStrikes(signals, interval) {
  if (!signals || signals.length < 2) return signals;
  interval = interval || 250;

  var sorted = [...signals].sort(function(a, b) { return a.strike - b.strike; });
  var result = [];

  for (var i = 0; i < sorted.length; i++) {
    // Always include the real strike
    result.push({ ...sorted[i], interpolated: false });

    // Interpolate between this strike and the next
    if (i < sorted.length - 1) {
      var s0 = sorted[i];
      var s1 = sorted[i + 1];
      var gap = s1.strike - s0.strike;
      var steps = Math.floor(gap / interval);

      for (var step = 1; step < steps; step++) {
        var t = step / steps; // 0..1 fraction between s0 and s1
        var strike = s0.strike + step * interval;

        // Linear interpolation of all greek values
        result.push({
          strike: strike,
          gex: s0.gex + t * (s1.gex - s0.gex),
          vanna: s0.vanna + t * (s1.vanna - s0.vanna),
          charm: s0.charm + t * (s1.charm - s0.charm),
          open_interest: Math.round(s0.open_interest + t * (s1.open_interest - s0.open_interest)),
          volume: Math.round((s0.volume || 0) + t * ((s1.volume || 0) - (s0.volume || 0))),
          type: s0.type,
          gex_score: s0.gex_score + t * (s1.gex_score - s0.gex_score),
          interpolated: true
        });
      }
    }
  }
  return result;
}

// ========== OVERLAY SYSTEM ==========
function toggleOverlay(overlay) {
  if (activeOverlays.has(overlay)) {
    activeOverlays.delete(overlay);
  } else {
    activeOverlays.add(overlay);
  }
  if (currentView !== 'price') {
    switchChartView('price');
  }
  updateOverlayTabs();
  if (dashboardData) updateChart(dashboardData);
}

function updateOverlayTabs() {
  document.querySelectorAll('.view-tab').forEach(function(t) {
    var view = t.dataset.view;
    if (view === 'price') {
      t.classList.toggle('active', currentView === 'price');
    } else if (view === 'spotVol') {
      t.classList.toggle('active', currentView === 'spotVol');
    } else {
      t.classList.toggle('active', activeOverlays.has(view));
    }
  });
}

function buildOverlayAnnotations(data) {
  var signals = data.signals || [];
  if (signals.length === 0) return [];
  var annotations = [];
  var btcPrice = data.btc_price;
  var bandWidth = btcPrice * 0.003; // thin band for each strike

  // GEX overlay: top 8 strikes as heatmap bands
  if (activeOverlays.has('dealerGex')) {
    var topGex = [...signals].sort(function(a, b) { return Math.abs(b.gex) - Math.abs(a.gex); }).slice(0, 8);
    var maxGex = Math.abs(topGex[0].gex) || 1;
    topGex.forEach(function(s, i) {
      var isPos = s.gex >= 0;
      var intensity = Math.abs(s.gex) / maxGex;
      var alpha = (0.06 + intensity * 0.22).toFixed(2);
      var rgb = isPos ? '0, 200, 83' : '255, 23, 68';
      annotations.push({
        y: s.strike - bandWidth, y2: s.strike + bandWidth,
        fillColor: 'rgba(' + rgb + ', ' + alpha + ')',
        borderColor: 'transparent',
        label: { text: '' }
      });
      // Only label the top 2
      if (i < 2) {
        annotations.push({
          y: s.strike, borderColor: 'rgba(' + rgb + ', 0.25)', strokeDashArray: 0,
          label: { text: (s.strike/1000).toFixed(0) + 'K ' + formatCompact(s.gex),
                   borderColor: 'transparent', position: 'right', offsetX: -4,
                   style: { color: isPos ? '#00c853' : '#ff1744', background: 'rgba(0,0,0,0.85)',
                            fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                            padding: { left: 4, right: 4, top: 1, bottom: 1 } } }
        });
      }
    });
  }

  // Vanna overlay: top 8 as heatmap bands (blue/pink)
  if (activeOverlays.has('vanna')) {
    var topV = [...signals].sort(function(a, b) { return Math.abs(b.vanna) - Math.abs(a.vanna); }).slice(0, 8);
    var maxV = Math.abs(topV[0].vanna) || 1;
    topV.forEach(function(s, i) {
      var isPos = s.vanna >= 0;
      var intensity = Math.abs(s.vanna) / maxV;
      var alpha = (0.05 + intensity * 0.18).toFixed(2);
      var rgb = isPos ? '96, 165, 250' : '244, 114, 182';
      annotations.push({
        y: s.strike - bandWidth, y2: s.strike + bandWidth,
        fillColor: 'rgba(' + rgb + ', ' + alpha + ')',
        borderColor: 'transparent',
        label: { text: '' }
      });
      if (i < 2) {
        var val = (s.vanna / 1e6).toFixed(1);
        annotations.push({
          y: s.strike, borderColor: 'rgba(' + rgb + ', 0.2)', strokeDashArray: 0,
          label: { text: (s.strike/1000).toFixed(0) + 'K $' + (isPos ? '+' : '') + val + 'M',
                   borderColor: 'transparent', position: 'right', offsetX: -4,
                   style: { color: isPos ? '#60a5fa' : '#ff1744', background: 'rgba(0,0,0,0.85)',
                            fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                            padding: { left: 4, right: 4, top: 1, bottom: 1 } } }
        });
      }
    });
  }

  // Charm overlay: top 8 as heatmap bands (gold/pink)
  if (activeOverlays.has('charm')) {
    var topC = [...signals].sort(function(a, b) { return Math.abs(b.charm) - Math.abs(a.charm); }).slice(0, 8);
    var maxC = Math.abs(topC[0].charm) || 1;
    topC.forEach(function(s, i) {
      var isPos = s.charm >= 0;
      var intensity = Math.abs(s.charm) / maxC;
      var alpha = (0.05 + intensity * 0.18).toFixed(2);
      var rgb = isPos ? '251, 191, 36' : '244, 114, 182';
      annotations.push({
        y: s.strike - bandWidth, y2: s.strike + bandWidth,
        fillColor: 'rgba(' + rgb + ', ' + alpha + ')',
        borderColor: 'transparent',
        label: { text: '' }
      });
      if (i < 2) {
        var val = (s.charm / 1e6).toFixed(1);
        annotations.push({
          y: s.strike, borderColor: 'rgba(' + rgb + ', 0.2)', strokeDashArray: 0,
          label: { text: (s.strike/1000).toFixed(0) + 'K $' + (isPos ? '+' : '') + val + 'M',
                   borderColor: 'transparent', position: 'left', offsetX: 4,
                   style: { color: isPos ? '#fbbf24' : '#ff1744', background: 'rgba(0,0,0,0.85)',
                            fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600,
                            padding: { left: 4, right: 4, top: 1, bottom: 1 } } }
        });
      }
    });
  }

  return annotations;
}

function toggleAdvancedMode() {
  if (isAdvancedMode) {
    elements.advancedModeSection.style.display = 'block';
    if (dashboardData) updateAdvancedTable(dashboardData);
  } else {
    elements.advancedModeSection.style.display = 'none';
  }
}

function filterLevels(filter) {
  if (!dashboardData) return;
  const filteredData = {
    ...dashboardData,
    signals: dashboardData.signals.filter(level => {
      if (filter === 'all') return true;
      if (filter === 'support') return level.type === 'support';
      if (filter === 'resistance') return level.type === 'resistance';
      return true;
    })
  };
  if (isAdvancedMode) {
    updateAdvancedTable(filteredData);
  } else {
    updateLevelsTable(filteredData);
  }
}

// ========== DATA LOADING ==========
async function loadDashboardData() {
  if (isLoading) return;
  isLoading = true;

  try {
    const response = await window.fetchWithAuth(API_BASE_URL + '/dashboard');
    if (!response.ok) throw new Error('API returned ' + response.status);

    const data = await response.json();
    dashboardData = data;

    // Store GEX snapshot for replay
    gexHistory.push({ timestamp: Date.now(), data: JSON.parse(JSON.stringify(data)) });
    if (gexHistory.length > MAX_GEX_SNAPSHOTS) gexHistory.shift();

    // Seed price history on first load (WebSocket handles live ticks after this)
    if (isFirstLoad) fetchPriceHistory();

    if (elements.tierBadge) {
      elements.tierBadge.textContent = data.tier.toUpperCase();
      elements.tierBadge.className = 'tier-badge ' + data.tier;
    }
    if (elements.refreshRate) {
      elements.refreshRate.textContent = 'Updates every ' + data.refresh_rate;
    }

    updateSummaryBar(data);
    updateRegimeBanner(data);
    updateMetrics(data);
    updateAnalyticsCards(data);
    renderGammaField(data);
    updateGexAnalysisSection(data);

    // Regime glow on overview card
    var overviewCard = document.querySelector('.overview-card');
    if (overviewCard) {
      overviewCard.classList.remove('regime-positive', 'regime-negative');
      overviewCard.classList.add(data.metrics.net_gex >= 0 ? 'regime-positive' : 'regime-negative');
    }
    // Regime shimmer on summary bar
    var summaryBar = document.getElementById('summaryBar');
    if (summaryBar) {
      summaryBar.classList.remove('regime-pos', 'regime-neg');
      summaryBar.classList.add(data.metrics.net_gex >= 0 ? 'regime-pos' : 'regime-neg');
    }

    updateKeyLevelsPanel(data);
    if (isAdvancedMode) {
      updateAdvancedTable(data);
    }

    updateChart(data);
    renderDealerGexChart(data);
    renderGammaProfileChart(data);
    renderVannaHeatmap(data);
    renderCharmCurve(data);
    renderSpotVolChart(data);

    updateLastUpdated(data.last_updated);

    // Show price chart via data-loaded attribute (overrides skeleton-hidden !important)
    const chartWrapper = document.querySelector('.chart-wrapper');
    if (chartWrapper) chartWrapper.setAttribute('data-loaded', 'true');

    isFirstLoad = false;

  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load data. Backend may be starting up.');
  } finally {
    isLoading = false;
    showLoading(false);
    resetCountdown();
  }
}

// ========== REPLAY MODE ==========
async function enterReplay() {
  // Fetch price data first if we don't have it yet
  if (priceHistory.length === 0) {
    await fetchPriceHistory();
  }
  if (priceHistory.length === 0) return; // still nothing after fetch

  replayActive = true;
  replayPosition = 100;
  const bar = document.getElementById('replayBar');
  const toggle = document.getElementById('replayToggleBtn');
  const slider = document.getElementById('replaySlider');
  if (bar) bar.style.display = 'flex';
  if (toggle) toggle.classList.add('active');
  if (slider) slider.value = 100;
  updateReplayTimeLabel(priceHistory[priceHistory.length - 1][0]);
}

function exitReplay() {
  replayActive = false;
  replayPlaying = false;
  clearInterval(replayInterval);
  replayInterval = null;
  replayPosition = 100;
  const bar = document.getElementById('replayBar');
  const toggle = document.getElementById('replayToggleBtn');
  if (bar) bar.style.display = 'none';
  if (toggle) toggle.classList.remove('active');
  setReplayIcons(false);
  // Restore full chart
  if (dashboardData) updateChart(dashboardData);
}

function playReplay() {
  if (priceHistory.length === 0) return;
  replayPlaying = true;
  setReplayIcons(true);
  // If at the end, start from 10%
  if (replayPosition >= 100) replayPosition = 10;
  const slider = document.getElementById('replaySlider');
  replayInterval = setInterval(() => {
    replayPosition += 0.5;
    if (replayPosition >= 100) {
      replayPosition = 100;
      pauseReplay();
    }
    if (slider) slider.value = replayPosition;
    updateReplayChart();
  }, 50);
}

function pauseReplay() {
  replayPlaying = false;
  clearInterval(replayInterval);
  replayInterval = null;
  setReplayIcons(false);
}

function setReplayIcons(playing) {
  const iconPlay = document.getElementById('replayIconPlay');
  const iconPause = document.getElementById('replayIconPause');
  if (iconPlay) iconPlay.style.display = playing ? 'none' : 'block';
  if (iconPause) iconPause.style.display = playing ? 'block' : 'none';
}

function updateReplayChart() {
  if (!dashboardData || priceHistory.length === 0) return;
  const totalPoints = priceHistory.length;
  const minPoints = Math.max(5, Math.floor(totalPoints * 0.05));
  const visibleCount = Math.max(minPoints, Math.floor(totalPoints * replayPosition / 100));
  const slicedHistory = priceHistory.slice(0, visibleCount);

  const lastPrice = slicedHistory[slicedHistory.length - 1];
  updateReplayTimeLabel(lastPrice[0]);

  // Find the nearest GEX snapshot for this replay timestamp
  var replayTimestamp = lastPrice[0];
  var replayData = dashboardData; // fallback to current
  if (gexHistory.length > 0) {
    var bestIdx = 0;
    var bestDist = Math.abs(gexHistory[0].timestamp - replayTimestamp);
    for (var i = 1; i < gexHistory.length; i++) {
      var dist = Math.abs(gexHistory[i].timestamp - replayTimestamp);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    replayData = gexHistory[bestIdx].data;
  }

  // Build a synthetic data object with the sliced price history and historical GEX
  var savedHistory = priceHistory;
  priceHistory = slicedHistory;
  // Override btc_price to the replay timestamp's price
  var replayDataCopy = { ...replayData, btc_price: lastPrice[1] };
  updateChart(replayDataCopy);
  priceHistory = savedHistory;
}

function updateReplayTimeLabel(timestamp) {
  const el = document.getElementById('replayTime');
  if (!el) return;
  if (!timestamp) { el.textContent = ''; return; }
  const d = new Date(timestamp);
  el.textContent = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

async function fetchPriceHistory() {
  try {
    // Fetch 24 hours of data
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1'
    );
    if (response.ok) {
      const data = await response.json();
      var prices = data.prices;

      priceHistory = prices;

      // Update session label with 24h time range
      var sessionLabel = document.getElementById('sessionLabel');
      if (sessionLabel && prices.length > 0) {
        var startTime = new Date(prices[0][0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        var endTime = new Date(prices[prices.length - 1][0]).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        sessionLabel.textContent = '24H  ' + startTime + ' \u2013 ' + endTime;
      }

      if (replayActive) {
        updateReplayChart();
      } else if (dashboardData) {
        updateChart(dashboardData);
      }
    }
  } catch (e) {
    console.warn('Could not fetch price history:', e);
  }
}

// ========== LIVE EST CLOCK + SESSION INDICATOR ==========
let clockTimer = null;

function getESTDate() {
  // Get current time in US Eastern (handles EST/EDT automatically)
  var now = new Date();
  var estStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(estStr);
}

function getCurrentSession(estHour, estMinute) {
  // Convert to decimal hour for easier comparison
  var t = estHour + estMinute / 60;

  // Session windows (Eastern Time):
  // New York:    9:30 AM – 4:00 PM  (9.5 – 16.0)
  // Late / Pre-Asia: 4:00 PM – 8:00 PM  (16.0 – 20.0)
  // Asia/Tokyo:  8:00 PM – 3:00 AM  (20.0 – 3.0, wraps midnight)
  // London:      3:00 AM – 9:30 AM  (3.0 – 9.5)

  if (t >= 9.5 && t < 16) return { name: 'NEW YORK SESSION', color: '#60a5fa' };
  if (t >= 16 && t < 20) return { name: 'LATE NY SESSION', color: '#fbbf24' };
  if (t >= 20 || t < 3) return { name: 'TOKYO SESSION', color: '#ff6b9d' };
  if (t >= 3 && t < 9.5) return { name: 'LONDON SESSION', color: '#00c853' };
  return { name: 'GLOBAL SESSION', color: '#909090' };
}

function updateClock() {
  var est = getESTDate();
  var h = est.getHours();
  var m = est.getMinutes();
  var s = est.getSeconds();

  var session = getCurrentSession(h, m);

  // Format 12h clock
  var ampm = h >= 12 ? 'PM' : 'AM';
  var h12 = h % 12 || 12;
  var timeStr = String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') + ' ' + ampm;

  var tickStatus = wsConnected ? 'LIVE' : (restPollTimer ? 'POLL' : '---');

  if (elements.lastUpdated) {
    elements.lastUpdated.innerHTML = '<span style="color:#00c853">' + tickStatus + '</span>  ' + timeStr + ' ET  <span style="color:' + session.color + '">' + session.name + '</span>';
  }
}

function startLiveClock() {
  updateClock(); // immediate first tick
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
}

// ========== LIVE TICK DATA — WebSocket with REST fallback ==========
// Sources tried in order: Binance WS → CoinCap WS → REST polling
var tickSourceIndex = 0;
var tickSources = [
  { name: 'Binance', url: 'wss://stream.binance.com:9443/ws/btcusdt@aggTrade', parse: function(msg) { return parseFloat(msg.p); } },
  { name: 'CoinCap', url: 'wss://ws.coincap.io/prices?assets=bitcoin', parse: function(msg) { return msg.bitcoin ? parseFloat(msg.bitcoin) : NaN; } }
];
var wsConnected = false;
var restPollTimer = null;
var wsFailCount = 0;

function connectTickSocket() {
  if (tickSocket && tickSocket.readyState <= 1) return;

  // If all WS sources failed twice, fall back to REST polling
  if (wsFailCount >= tickSources.length * 2) {
    console.log('All WebSocket sources failed, falling back to REST polling');
    startRestPolling();
    return;
  }

  var source = tickSources[tickSourceIndex % tickSources.length];
  console.log('Trying tick source:', source.name, source.url);

  try {
    tickSocket = new WebSocket(source.url);
  } catch (e) {
    console.warn(source.name + ' WebSocket construction failed:', e);
    wsFailCount++;
    tickSourceIndex++;
    scheduleTickReconnect();
    return;
  }

  var connectTimeout = setTimeout(function() {
    // If not connected within 5s, try next source
    if (!wsConnected) {
      console.warn(source.name + ' WebSocket timeout');
      wsFailCount++;
      tickSourceIndex++;
      try { tickSocket.close(); } catch(e) {}
      scheduleTickReconnect();
    }
  }, 5000);

  tickSocket.onopen = function() {
    console.log('Tick WebSocket connected via ' + source.name);
    clearTimeout(connectTimeout);
    wsConnected = true;
    wsFailCount = 0;
    if (tickReconnectTimer) { clearTimeout(tickReconnectTimer); tickReconnectTimer = null; }
    // Stop REST polling if it was running
    if (restPollTimer) { clearInterval(restPollTimer); restPollTimer = null; }
    // Clock handles display — just log source
    console.log('Live ticks via ' + source.name);
  };

  tickSocket.onmessage = function(event) {
    if (replayActive) return;
    try {
      var msg = JSON.parse(event.data);
      var price = source.parse(msg);
      if (!price || isNaN(price)) return;
      processTick(price);
    } catch (e) {}
  };

  tickSocket.onclose = function() {
    clearTimeout(connectTimeout);
    console.log(source.name + ' WebSocket closed');
    wsConnected = false;
    tickSourceIndex++;
    wsFailCount++;
    scheduleTickReconnect();
  };

  tickSocket.onerror = function() {
    clearTimeout(connectTimeout);
    console.warn(source.name + ' WebSocket error');
    wsConnected = false;
    try { tickSocket.close(); } catch(e) {}
  };
}

function startRestPolling() {
  if (restPollTimer) return;
  console.log('Starting REST price polling (2s interval)');
  console.log('Live ticks via REST polling');
  restPollTimer = setInterval(async function() {
    if (replayActive) return;
    try {
      var resp = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (resp.ok) {
        var data = await resp.json();
        var price = parseFloat(data.price);
        if (price && !isNaN(price)) processTick(price);
      }
    } catch(e) {
      // Try CoinGecko as ultimate fallback
      try {
        var resp2 = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
        if (resp2.ok) {
          var data2 = await resp2.json();
          if (data2.bitcoin && data2.bitcoin.usd) processTick(data2.bitcoin.usd);
        }
      } catch(e2) {}
    }
  }, 2000);
}

function processTick(price) {
  lastTickPrice = price;

  var now = Date.now();
  var lastEntry = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1] : null;
  if (!lastEntry || now - lastEntry[0] >= 2000) {
    priceHistory.push([now, price]);
    if (priceHistory.length > 43200) priceHistory.shift();
  } else {
    priceHistory[priceHistory.length - 1] = [now, price];
  }

  if (dashboardData) dashboardData.btc_price = price;

  if (!tickThrottleTimer) {
    tickThrottleTimer = setTimeout(function() {
      tickThrottleTimer = null;
      onTickUpdate(price);
    }, TICK_THROTTLE_MS);
  }
}

function scheduleTickReconnect() {
  if (tickReconnectTimer) return;
  tickReconnectTimer = setTimeout(function() {
    tickReconnectTimer = null;
    connectTickSocket();
  }, 2000);
}

function onTickUpdate(price) {
  var formattedPrice = '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Update summary bar price
  var priceEl = document.getElementById('summaryPrice');
  if (priceEl) priceEl.textContent = formattedPrice;

  // Update 24h change
  if (priceHistory.length > 0) {
    var oldPrice = priceHistory[0][1];
    var change = ((price - oldPrice) / oldPrice * 100).toFixed(2);
    var changeEl = document.getElementById('summaryChange');
    if (changeEl) {
      changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
      changeEl.className = 'summary-change ' + (change >= 0 ? 'up' : 'down');
    }
  }

  // Update panel spot price
  var panelSpot = document.getElementById('panelSpot');
  if (panelSpot) panelSpot.textContent = formattedPrice;

  // Smooth chart update — series only, no annotation rebuild
  if (charts.price && dashboardData) {
    var seriesData = priceHistory.map(function(p) { return { x: p[0], y: p[1] }; });
    charts.price.updateSeries([{ name: 'BTC', data: seriesData }], false);

    // Lightweight spot annotation update: remove old, add new
    try {
      charts.price.removeAnnotation('spotPrice');
    } catch(e) {}
    charts.price.addYaxisAnnotation({
      id: 'spotPrice',
      y: price,
      borderColor: '#ffffff',
      strokeDashArray: 0,
      label: {
        text: formattedPrice,
        borderColor: '#ffffff',
        position: 'right',
        style: {
          color: '#000000',
          background: '#ffffff',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          fontWeight: 700,
          padding: { left: 6, right: 6, top: 2, bottom: 2 }
        }
      }
    }, false);
  }
}

function disconnectTickSocket() {
  if (tickSocket) {
    try { tickSocket.close(); } catch(e) {}
    tickSocket = null;
  }
  if (tickReconnectTimer) { clearTimeout(tickReconnectTimer); tickReconnectTimer = null; }
  if (tickThrottleTimer) { clearTimeout(tickThrottleTimer); tickThrottleTimer = null; }
  if (restPollTimer) { clearInterval(restPollTimer); restPollTimer = null; }
  wsConnected = false;
}

// ========== SUMMARY BAR ==========
function updateSummaryBar(data) {
  const el = (id) => document.getElementById(id);

  el('summaryPrice').textContent = '$' + data.btc_price.toLocaleString(undefined, {maximumFractionDigits: 0});

  if (priceHistory.length > 0) {
    const oldPrice = priceHistory[0][1];
    const change = ((data.btc_price - oldPrice) / oldPrice * 100).toFixed(2);
    const changeEl = el('summaryChange');
    changeEl.textContent = (change >= 0 ? '+' : '') + change + '%';
    changeEl.className = 'summary-change ' + (change >= 0 ? 'up' : 'down');
  }

  el('summaryMaxPain').textContent = data.metrics.max_pain
    ? '$' + data.metrics.max_pain.toLocaleString() : '--';
  el('summaryFlip').textContent = data.metrics.flip_level
    ? '$' + data.metrics.flip_level.toLocaleString() : '--';

  const regimeEl = el('summaryRegime');
  const isPos = data.metrics.net_gex >= 0;
  regimeEl.className = 'summary-regime ' + (isPos ? 'positive' : 'negative');
  regimeEl.querySelector('.summary-regime-text').textContent = isPos ? 'Positive Gamma' : 'Negative Gamma';
}

// ========== GEX ANALYSIS SECTION ==========
function updateGexAnalysisSection(data) {
  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  const netGex = data.metrics.net_gex;

  const sortedByStrike = [...signals].sort((a, b) => a.strike - b.strike);
  let zeroGammaStrike = null;

  for (let i = 0; i < sortedByStrike.length - 1; i++) {
    const current = sortedByStrike[i];
    const next = sortedByStrike[i + 1];
    if ((current.gex > 0 && next.gex < 0) || (current.gex < 0 && next.gex > 0)) {
      zeroGammaStrike = Math.abs(current.gex) < Math.abs(next.gex) ? current.strike : next.strike;
      break;
    }
  }

  if (!zeroGammaStrike && sortedByStrike.length > 0) {
    const closest = sortedByStrike.reduce((prev, curr) =>
      Math.abs(curr.strike - btcPrice) < Math.abs(prev.strike - btcPrice) ? curr : prev
    );
    zeroGammaStrike = closest.strike;
  }

  if (elements.zeroGammaStrike && zeroGammaStrike) {
    elements.zeroGammaStrike.textContent = '$' + Math.round(zeroGammaStrike).toLocaleString();
  }

  const totalAbsGex = signals.reduce((sum, s) => sum + Math.abs(s.gex), 0);
  const nearSpotSignals = signals.filter(s => Math.abs(s.strike - btcPrice) / btcPrice < 0.05);
  const nearSpotGex = nearSpotSignals.reduce((sum, s) => sum + Math.abs(s.gex), 0);
  const concentration = totalAbsGex > 0 ? (nearSpotGex / totalAbsGex) * 100 : 0;

  if (elements.gexConcentration) {
    elements.gexConcentration.textContent = concentration.toFixed(1) + '%';
  }
  if (elements.gexConcentrationFill) {
    elements.gexConcentrationFill.style.width = Math.min(concentration, 100) + '%';
  }

  if (elements.marketStatus) {
    if (concentration > 40) {
      elements.marketStatus.textContent = 'PINNED';
      elements.marketStatus.style.color = '#ffffff';
      if (elements.marketStatusDesc) elements.marketStatusDesc.textContent = 'High concentration indicates limited movement until OpEx';
    } else if (concentration > 20) {
      elements.marketStatus.textContent = 'CONTAINED';
      elements.marketStatus.style.color = '#60a5fa';
      if (elements.marketStatusDesc) elements.marketStatusDesc.textContent = 'Moderate GEX concentration — expect some range-bound action';
    } else {
      elements.marketStatus.textContent = 'FREE';
      elements.marketStatus.style.color = '#00c853';
      if (elements.marketStatusDesc) elements.marketStatusDesc.textContent = 'Low concentration — price can move more freely';
    }
  }

  if (elements.dealerGexInsight) {
    const supportLevels = signals.filter(s => s.type === 'support').map(s => s.strike);
    const resistanceLevels = signals.filter(s => s.type === 'resistance').map(s => s.strike);
    const nearestSupport = supportLevels.filter(s => s < btcPrice).sort((a, b) => b - a)[0];
    const nearestResistance = resistanceLevels.filter(s => s > btcPrice).sort((a, b) => a - b)[0];

    let insight = '';
    if (nearestSupport && nearestResistance) {
      insight = 'Price below $' + (nearestSupport/1000).toFixed(0) + 'K = amplified selloff. Above $' + (nearestResistance/1000).toFixed(0) + 'K = breakout fuel.';
    } else if (netGex > 0) {
      insight = 'Positive gamma environment — dealers will suppress volatility.';
    } else {
      insight = 'Negative gamma environment — dealers will amplify moves.';
    }
    elements.dealerGexInsight.textContent = insight;
  }
}

// ========== ANALYTICS CARDS ==========
function updateAnalyticsCards(data) {
  var signals = data.signals || [];
  var btcPrice = data.btc_price;
  var m = data.metrics;
  var el = function(id) { return document.getElementById(id); };

  // --- Put/Call Ratio ---
  var totalCallOI = 0, totalPutOI = 0;
  signals.forEach(function(s) {
    if (s.type === 'support') totalCallOI += (s.open_interest || 0);
    else totalPutOI += (s.open_interest || 0);
  });
  var pcr = totalCallOI > 0 ? (totalPutOI / totalCallOI) : 0;
  var pcrVal = el('pcrValue');
  var pcrBadge = el('pcrBadge');
  var pcrSub = el('pcrSub');
  if (pcrVal) pcrVal.textContent = pcr.toFixed(2);
  if (pcrBadge) {
    if (pcr > 1.2) { pcrBadge.textContent = 'BEARISH'; pcrBadge.className = 'metric-card-badge bearish'; }
    else if (pcr < 0.8) { pcrBadge.textContent = 'BULLISH'; pcrBadge.className = 'metric-card-badge bullish'; }
    else { pcrBadge.textContent = 'NEUTRAL'; pcrBadge.className = 'metric-card-badge neutral'; }
  }
  if (pcrSub) pcrSub.textContent = 'Put OI: ' + formatCompact(totalPutOI, false) + ' / Call OI: ' + formatCompact(totalCallOI, false);

  // --- Total OI ---
  var totalOI = totalCallOI + totalPutOI;
  var oiVal = el('oiValue');
  var oiBadge = el('oiBadge');
  var oiSub = el('oiSub');
  if (oiVal) oiVal.textContent = formatCompact(totalOI, false);
  if (oiBadge) {
    oiBadge.textContent = signals.length + ' STRIKES';
    oiBadge.className = 'metric-card-badge neutral';
  }
  if (oiSub) oiSub.textContent = 'Across ' + signals.length + ' active strikes';

  // --- Max Pain ---
  var maxPain = m.max_pain;
  var mpVal = el('maxPainCardValue');
  var mpBadge = el('maxPainBadge');
  var mpSub = el('maxPainSub');
  if (mpVal && maxPain) {
    mpVal.textContent = '$' + (maxPain / 1000).toFixed(1) + 'K';
  }
  if (maxPain && mpBadge) {
    var dist = ((maxPain - btcPrice) / btcPrice * 100);
    if (dist > 2) { mpBadge.textContent = 'ABOVE'; mpBadge.className = 'metric-card-badge bullish'; }
    else if (dist < -2) { mpBadge.textContent = 'BELOW'; mpBadge.className = 'metric-card-badge bearish'; }
    else { mpBadge.textContent = 'AT SPOT'; mpBadge.className = 'metric-card-badge neutral'; }
    if (mpSub) mpSub.textContent = (dist >= 0 ? '+' : '') + dist.toFixed(1) + '% from spot ($' + btcPrice.toLocaleString(undefined, {maximumFractionDigits: 0}) + ')';
  }

  // --- GEX Regime ---
  var netGex = m.net_gex;
  var gexVal = el('gexRegimeValue');
  var gexBadge = el('gexRegimeBadge');
  var gexSub = el('gexRegimeSub');
  var isPositive = netGex >= 0;
  if (gexVal) {
    gexVal.textContent = isPositive ? '+ve' : '-ve';
    gexVal.className = 'metric-card-value ' + (isPositive ? 'positive' : 'negative');
    gexVal.style.color = isPositive ? 'var(--positive)' : 'var(--negative)';
  }
  if (gexBadge) {
    gexBadge.textContent = isPositive ? 'LOW VOL' : 'HIGH VOL';
    gexBadge.className = 'metric-card-badge ' + (isPositive ? 'bullish' : 'bearish');
  }
  if (gexSub) {
    gexSub.textContent = isPositive
      ? 'Dealers hedge by selling dips — mean reversion'
      : 'Dealers amplify moves — trend continuation';
  }

  // --- Greeks Breakdown ---
  // Vanna
  var vannaVal = el('vannaCardValue');
  var vannaDetail = el('vannaCardDetail');
  var vannaBar = el('vannaBarFill');
  var netVanna = m.net_vanna;
  var vannaMil = (netVanna / 1e6).toFixed(1);
  if (vannaVal) {
    vannaVal.textContent = '$' + (netVanna >= 0 ? '+' : '') + vannaMil + 'M';
    vannaVal.className = 'greek-card-value ' + (netVanna >= 0 ? 'positive' : 'negative');
  }
  if (vannaDetail) {
    vannaDetail.textContent = netVanna >= 0
      ? 'Rising IV pushes price UP — bullish flow'
      : 'Rising IV pushes price DOWN — bearish flow';
  }
  if (vannaBar) {
    var vannaAbs = Math.min(Math.abs(netVanna / 1e6) / 100 * 100, 100);
    vannaBar.style.width = Math.max(vannaAbs, 5) + '%';
    vannaBar.className = 'greek-bar-fill ' + (netVanna >= 0 ? 'positive' : 'negative');
  }

  // Charm
  var charmVal = el('charmCardValue');
  var charmDetail = el('charmCardDetail');
  var charmBar = el('charmBarFill');
  var netCharm = m.net_charm;
  var charmMil = (netCharm / 1e6).toFixed(1);
  if (charmVal) {
    charmVal.textContent = '$' + (netCharm >= 0 ? '+' : '') + charmMil + 'M';
    charmVal.className = 'greek-card-value ' + (netCharm >= 0 ? 'positive' : 'negative');
  }
  if (charmDetail) {
    charmDetail.textContent = netCharm >= 0
      ? 'Time decay creating buy pressure'
      : 'Time decay creating sell pressure';
  }
  if (charmBar) {
    var charmAbs = Math.min(Math.abs(netCharm / 1e6) / 100 * 100, 100);
    charmBar.style.width = Math.max(charmAbs, 5) + '%';
    charmBar.className = 'greek-bar-fill ' + (netCharm >= 0 ? 'positive' : 'negative');
  }

  // Concentration
  var concVal = el('concCardValue');
  var concDetail = el('concCardDetail');
  var concBar = el('concBarFill');
  var totalAbsGex = signals.reduce(function(sum, s) { return sum + Math.abs(s.gex); }, 0);
  var nearSpot = signals.filter(function(s) { return Math.abs(s.strike - btcPrice) / btcPrice < 0.05; });
  var nearGex = nearSpot.reduce(function(sum, s) { return sum + Math.abs(s.gex); }, 0);
  var conc = totalAbsGex > 0 ? (nearGex / totalAbsGex * 100) : 0;
  if (concVal) concVal.textContent = conc.toFixed(1) + '%';
  if (concDetail) {
    if (conc > 40) concDetail.textContent = 'High — price pinned near key strikes';
    else if (conc > 20) concDetail.textContent = 'Moderate — some range-bound action expected';
    else concDetail.textContent = 'Low — price can move freely between levels';
  }
  if (concBar) {
    concBar.style.width = Math.min(conc, 100) + '%';
    concBar.className = 'greek-bar-fill ' + (conc > 40 ? 'negative' : 'positive');
  }

  // Apply glow effects to signal cards
  document.querySelectorAll('.metric-card').forEach(function(c) { c.classList.remove('glow-bullish', 'glow-bearish'); });
  document.querySelectorAll('.greek-card').forEach(function(c) { c.classList.remove('glow-positive', 'glow-negative'); });

  if (pcrVal) {
    var pcrCard = pcrVal.closest('.metric-card');
    if (pcrCard) {
      if (pcr < 0.8) pcrCard.classList.add('glow-bullish');
      else if (pcr > 1.2) pcrCard.classList.add('glow-bearish');
    }
  }
  if (gexVal) {
    var gexCard = gexVal.closest('.metric-card');
    if (gexCard) gexCard.classList.add(isPositive ? 'glow-bullish' : 'glow-bearish');
  }
  if (vannaVal) {
    var vCard = vannaVal.closest('.greek-card');
    if (vCard) vCard.classList.add(netVanna >= 0 ? 'glow-positive' : 'glow-negative');
  }
  if (charmVal) {
    var cCard = charmVal.closest('.greek-card');
    if (cCard) cCard.classList.add(netCharm >= 0 ? 'glow-positive' : 'glow-negative');
  }
}

// ========== GAMMA EXPOSURE FIELD ==========
function renderGammaField(data) {
  var container = document.getElementById('gammaFieldBar');
  if (!container) return;

  var signals = data.signals || [];
  if (signals.length < 2) return;

  var btcPrice = data.btc_price;
  var maxPain = data.metrics.max_pain;
  var flipLevel = data.metrics.flip_level;

  var sorted = [...signals].sort(function(a, b) { return a.strike - b.strike; });
  var near = sorted.filter(function(s) { return Math.abs(s.strike - btcPrice) / btcPrice < 0.15; });
  if (near.length < 3) near = sorted;

  var minS = near[0].strike;
  var maxS = near[near.length - 1].strike;
  var range = maxS - minS;
  if (range === 0) return;

  var maxGex = 0;
  near.forEach(function(s) { if (Math.abs(s.gex) > maxGex) maxGex = Math.abs(s.gex); });
  if (maxGex === 0) return;

  // Build smooth gradient stops from signal data
  var stops = [];
  // Add transparent start
  stops.push('rgba(0,0,0,0) 0%');
  near.forEach(function(s) {
    var pct = ((s.strike - minS) / range * 100).toFixed(1);
    var intensity = Math.abs(s.gex) / maxGex;
    var alpha = (0.15 + intensity * 0.85).toFixed(2);
    var rgb = s.gex >= 0 ? '0,200,83' : '255,23,68';
    stops.push('rgba(' + rgb + ',' + alpha + ') ' + pct + '%');
  });
  stops.push('rgba(0,0,0,0) 100%');

  var gradientCSS = 'linear-gradient(to right, ' + stops.join(', ') + ')';

  // Ensure child elements exist
  var gradEl = container.querySelector('.gf-gradient');
  var markersEl = container.querySelector('.gf-markers');
  var scanEl = container.querySelector('.gf-scan');
  if (!gradEl) {
    container.innerHTML = '<div class="gf-gradient"></div><div class="gf-markers"></div><div class="gf-scan"></div>';
    gradEl = container.querySelector('.gf-gradient');
    markersEl = container.querySelector('.gf-markers');
  }

  gradEl.style.background = gradientCSS;

  // Build markers
  var markersHtml = '';
  function addMarker(price, cls, label) {
    if (!price || price < minS || price > maxS) return;
    var pct = ((price - minS) / range * 100).toFixed(1);
    markersHtml += '<div class="gf-marker ' + cls + '" style="left:' + pct + '%"><span class="gf-marker-label">' + label + '</span></div>';
  }
  addMarker(flipLevel, 'gf-marker-zerogamma', '0\u03B3');
  addMarker(maxPain, 'gf-marker-maxpain', 'MP');
  addMarker(btcPrice, 'gf-marker-spot', 'SPOT');

  markersEl.innerHTML = markersHtml;
}

// ========== REGIME BANNER ==========
function updateRegimeBanner(data) {
  if (!elements.regimeBanner) return;
  const netGex = data.metrics.net_gex;
  const isPositiveGamma = netGex >= 0;

  elements.regimeBanner.className = 'regime-banner ' + (isPositiveGamma ? 'positive' : 'negative');
  if (elements.regimeValue) {
    elements.regimeValue.textContent = isPositiveGamma ? 'Positive Gamma' : 'Negative Gamma';
    elements.regimeValue.className = 'regime-value ' + (isPositiveGamma ? 'positive' : 'negative');
  }
  if (elements.regimeDescription) {
    elements.regimeDescription.textContent = isPositiveGamma
      ? 'Mean reversion, lower vol'
      : 'Trend continuation, higher vol';
  }
}

// ========== METRICS ==========
function updateMetrics(data) {
  const m = data.metrics;
  const btcPrice = data.btc_price;

  // Metrics strip removed from overview — elements may not exist
  if (elements.netGexValue) {
    const gexPositive = m.net_gex >= 0;
    elements.netGexValue.textContent = gexPositive ? '+ve' : '-ve';
    elements.netGexValue.className = 'metric-value ' + (gexPositive ? 'positive' : 'negative');
    if (elements.netGexDesc) elements.netGexDesc.textContent = gexPositive ? 'Suppressed vol' : 'Amplified vol';
  }

  if (elements.netVannaValue) {
    const vannaPositive = m.net_vanna >= 0;
    const vannaMil = (m.net_vanna / 1e6).toFixed(1);
    elements.netVannaValue.textContent = '$' + vannaMil + 'M';
    elements.netVannaValue.className = 'metric-value ' + (vannaPositive ? 'positive' : 'negative');
    if (elements.netVannaDesc) elements.netVannaDesc.textContent = vannaPositive ? 'IV up = bullish' : 'IV up = bearish';
  }

  if (elements.netCharmValue) {
    const charmPositive = m.net_charm >= 0;
    const charmMil = (m.net_charm / 1e6).toFixed(1);
    elements.netCharmValue.textContent = '$' + charmMil + 'M';
    elements.netCharmValue.className = 'metric-value ' + (charmPositive ? 'positive' : 'negative');
    if (elements.netCharmDesc) elements.netCharmDesc.textContent = charmPositive ? 'Decay bullish' : 'Decay bearish';
  }

  if (elements.maxPainValue && m.max_pain) {
    elements.maxPainValue.textContent = '$' + (m.max_pain / 1000).toFixed(0) + 'K';
    elements.maxPainValue.className = 'metric-value neutral';
    const distance = ((m.max_pain - btcPrice) / btcPrice * 100).toFixed(1);
    if (elements.maxPainDesc) elements.maxPainDesc.textContent = (distance > 0 ? '+' : '') + distance + '% from spot';
  }

  previousMetrics = m;
}

// ========== ANIMATED COUNTER ==========
function animateCounter(element, targetValue, prefix, duration) {
  duration = duration || 800;
  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(targetValue * eased);
    element.textContent = prefix + current.toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

// ========== KEY LEVELS PANEL ==========
function updateKeyLevelsPanel(data) {
  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  const m = data.metrics;
  const el = (id) => document.getElementById(id);

  // Snapshot section
  if (el('panelSpot')) el('panelSpot').textContent = '$' + btcPrice.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (el('panelZeroGamma')) {
    el('panelZeroGamma').textContent = m.flip_level ? '$' + (m.flip_level/1000).toFixed(0) + 'K' : '--';
    el('panelZeroGamma').className = 'panel-val';
  }
  if (el('panelMaxPain')) {
    el('panelMaxPain').textContent = m.max_pain ? '$' + (m.max_pain/1000).toFixed(0) + 'K' : '--';
  }
  if (el('panelNetGex')) {
    el('panelNetGex').textContent = formatCompact(m.net_gex);
    el('panelNetGex').className = 'panel-val ' + (m.net_gex >= 0 ? 'positive' : 'negative');
  }
  if (el('panelNetVanna')) {
    var v = (m.net_vanna / 1e6).toFixed(1);
    el('panelNetVanna').textContent = '$' + (m.net_vanna >= 0 ? '+' : '') + v + 'M';
    el('panelNetVanna').className = 'panel-val ' + (m.net_vanna >= 0 ? 'positive' : 'negative');
  }
  if (el('panelNetCharm')) {
    var c = (m.net_charm / 1e6).toFixed(1);
    el('panelNetCharm').textContent = '$' + (m.net_charm >= 0 ? '+' : '') + c + 'M';
    el('panelNetCharm').className = 'panel-val ' + (m.net_charm >= 0 ? 'positive' : 'negative');
  }

  // === STRIKE LADDER — interpolated $250 strikes with GEX bars and change indicators ===
  var interpolatedForLadder = interpolateStrikes(signals, 250);
  var allStrikes = [...interpolatedForLadder].sort(function(a, b) { return b.strike - a.strike; });
  // Only show strikes within ~5% of spot for a focused ladder
  allStrikes = allStrikes.filter(function(s) { return Math.abs(s.strike - btcPrice) / btcPrice < 0.06; });
  var maxAbsGex = 1;
  allStrikes.forEach(function(s) { if (Math.abs(s.gex) > maxAbsGex) maxAbsGex = Math.abs(s.gex); });

  var ladderContainer = document.getElementById('panelStrikeLadder');
  if (ladderContainer) {
    var html = '';
    allStrikes.forEach(function(s) {
      var isPos = s.gex >= 0;
      var intensity = Math.abs(s.gex) / maxAbsGex;
      var barPct = Math.max(intensity * 100, 3).toFixed(0);
      var barColor = isPos ? 'var(--positive)' : 'var(--negative)';
      var strikeLabel = s.interpolated
        ? '$' + s.strike.toLocaleString(undefined, { maximumFractionDigits: 0 })
        : '$' + (s.strike / 1000).toFixed(0) + 'K';
      var isNearSpot = Math.abs(s.strike - btcPrice) / btcPrice < 0.005;
      var spotClass = isNearSpot ? ' ladder-spot' : '';
      var interpClass = s.interpolated ? ' ladder-interp' : '';

      // Change indicator: compare with previous signals (only for real strikes)
      var changeArrow = '';
      var prevGex = previousSignals[s.strike];
      if (!s.interpolated && prevGex !== undefined) {
        var delta = Math.abs(s.gex) - Math.abs(prevGex);
        var pctChange = Math.abs(prevGex) > 0 ? (delta / Math.abs(prevGex)) : 0;
        if (pctChange > 0.05) {
          // Got stronger — show fire indicator
          changeArrow = '<span class="ladder-change stronger" title="Strengthened">&#9650;</span>';
        } else if (pctChange < -0.05) {
          // Got weaker
          changeArrow = '<span class="ladder-change weaker" title="Weakened">&#9660;</span>';
        }
      }

      html += '<div class="ladder-row' + spotClass + interpClass + '">';
      html += '<span class="ladder-strike">' + strikeLabel + '</span>';
      html += '<div class="ladder-bar-wrap">';
      html += '<div class="ladder-bar" style="width:' + barPct + '%;background:' + barColor + ';opacity:' + (0.4 + intensity * 0.6).toFixed(2) + '"></div>';
      html += '</div>';
      html += '<span class="ladder-gex ' + (isPos ? 'positive' : 'negative') + '">' + formatCompact(s.gex) + '</span>';
      html += changeArrow;
      html += '</div>';
    });
    ladderContainer.innerHTML = html;
  }

  // Store current signals for next comparison
  var newPrev = {};
  signals.forEach(function(s) { newPrev[s.strike] = s.gex; });
  previousSignals = newPrev;

  // Footer
  var now = new Date(data.last_updated || Date.now());
  if (el('panelStatus')) el('panelStatus').textContent = 'live';
  if (el('panelFooterDate')) el('panelFooterDate').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ========== TABLES ==========

function getConfluenceBadges(signal) {
  const badges = ['GEX'];
  if (Math.abs(signal.vanna) > 1e6) badges.push('Vanna');
  if (Math.abs(signal.charm) > 500000) badges.push('Charm');
  if (signal.open_interest > 1000) badges.push('OI');
  if (signal.volume > 100) badges.push('Vol');
  return badges.map(b => '<span class="conf-badge active">' + b + '</span>').join('');
}

function getSignalInfo(signal) {
  const score = signal.gex_score;
  const isSupport = signal.type === 'support';
  if (score >= 3) return { class: isSupport ? 'strong-buy' : 'strong-sell', text: isSupport ? 'Strong Buy' : 'Strong Sell' };
  if (score >= 2) return { class: isSupport ? 'buy' : 'sell', text: isSupport ? 'Buy' : 'Sell' };
  if (score >= 1) return { class: 'neutral', text: 'Watch' };
  return { class: 'neutral', text: 'Watch' };
}

function getStrengthIndicator(score) {
  const maxDots = 5;
  const filledDots = Math.min(Math.ceil(score * 1.25), maxDots);
  const isHigh = score >= 3;
  let dots = '';
  for (let i = 0; i < maxDots; i++) {
    const filled = i < filledDots ? 'filled' : '';
    const high = filled && isHigh ? 'high' : '';
    dots += '<div class="strength-dot ' + filled + ' ' + high + '"></div>';
  }
  const labels = ['Low', 'Low', 'Medium', 'High', 'Very High'];
  const labelIndex = Math.min(Math.floor(score), 4);
  return '<div class="strength-bar">' + dots + '</div><span class="strength-label">' + labels[labelIndex] + '</span>';
}

function updateAdvancedTable(data) {
  const signals = data.signals;
  if (!signals || signals.length === 0) {
    elements.advancedTableBody.innerHTML = '<div class="loading-row"><span>No data found</span></div>';
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));

  const rows = sortedSignals.map(signal => {
    const typeClass = signal.type.toLowerCase();
    const gexClass = signal.gex >= 0 ? 'positive' : 'negative';
    const vannaNorm = signal.vanna / 1e6;
    const charmNorm = signal.charm / 1e6;
    const vannaClass = vannaNorm >= 0 ? 'positive' : 'negative';
    const charmClass = charmNorm >= 0 ? 'positive' : 'negative';

    return '<div class="level-row advanced" data-strike="' + signal.strike + '">' +
      '<span class="level-price">$' + signal.strike.toLocaleString() + '</span>' +
      '<span class="level-type ' + typeClass + '">' + signal.type.toUpperCase() + '</span>' +
      '<span class="data-cell ' + gexClass + '">' + formatCompact(signal.gex) + '</span>' +
      '<span class="data-cell ' + vannaClass + '">' + (vannaNorm >= 0 ? '+$' : '-$') + Math.abs(vannaNorm).toFixed(1) + 'M</span>' +
      '<span class="data-cell ' + charmClass + '">' + (charmNorm >= 0 ? '+$' : '-$') + Math.abs(charmNorm).toFixed(1) + 'M</span>' +
      '<span class="data-cell neutral">' + formatCompact(signal.open_interest, false) + '</span>' +
      '<span class="data-cell neutral">' + signal.gex_score.toFixed(1) + '</span>' +
      '</div>';
  }).join('');

  elements.advancedTableBody.innerHTML = rows;
}

// ========== APEXCHARTS RENDERING ==========

// Price Chart — Bookmap-style heatmap visualization
function updateChart(data) {
  const container = document.getElementById('priceChart');
  if (!container) return;

  const btcPrice = data.btc_price;
  const signals = data.signals;

  const seriesData = priceHistory.length > 0
    ? priceHistory.map(p => ({ x: p[0], y: p[1] }))
    : [{ x: Date.now() - 3600000, y: btcPrice * 0.998 }, { x: Date.now(), y: btcPrice }];

  // Interpolate signals to $250 granularity for smooth heatmap
  const interpolatedSignals = interpolateStrikes(signals, 250);
  const allByGex = [...interpolatedSignals].sort(function(a, b) { return Math.abs(b.gex) - Math.abs(a.gex); });
  const maxAbsGex = allByGex.length > 0 ? Math.abs(allByGex[0].gex) : 1;

  // Zero gamma / flip level
  const flipLevel = data.metrics.flip_level;
  const maxPain = data.metrics.max_pain;

  // === COMPUTE Y-AXIS RANGE FIRST (needed to filter visible bands) ===
  var priceYMin = btcPrice * 0.97, priceYMax = btcPrice * 1.03;
  if (priceHistory.length > 0) {
    priceYMin = Infinity; priceYMax = -Infinity;
    for (var i = 0; i < priceHistory.length; i++) {
      if (priceHistory[i][1] < priceYMin) priceYMin = priceHistory[i][1];
      if (priceHistory[i][1] > priceYMax) priceYMax = priceHistory[i][1];
    }
  }
  // Find nearest 3 real strikes above and below spot — always show these
  var strikesAbove = signals.map(function(s) { return s.strike; }).filter(function(st) { return st > btcPrice; }).sort(function(a,b) { return a - b; }).slice(0, 3);
  var strikesBelow = signals.map(function(s) { return s.strike; }).filter(function(st) { return st <= btcPrice; }).sort(function(a,b) { return b - a; }).slice(0, 3);
  strikesAbove.forEach(function(st) { if (st > priceYMax) priceYMax = st; });
  strikesBelow.forEach(function(st) { if (st < priceYMin) priceYMin = st; });
  // Also include flip level and max pain if within range
  if (flipLevel && Math.abs(flipLevel - btcPrice) / btcPrice < 0.08) {
    if (flipLevel < priceYMin) priceYMin = flipLevel;
    if (flipLevel > priceYMax) priceYMax = flipLevel;
  }
  if (maxPain && Math.abs(maxPain - btcPrice) / btcPrice < 0.08) {
    if (maxPain < priceYMin) priceYMin = maxPain;
    if (maxPain > priceYMax) priceYMax = maxPain;
  }
  var yPad = (priceYMax - priceYMin) * 0.08;
  var chartYMin = priceYMin - yPad;
  var chartYMax = priceYMax + yPad;

  const yAnnotations = [];

  // === BOOKMAP HEATMAP BANDS ===
  // Filter to only strikes within the visible y-axis range (avoid off-screen annotations)
  var visibleBands = allByGex.filter(function(s) {
    return s.strike >= chartYMin && s.strike <= chartYMax;
  });

  // Every visible signal gets a translucent band — width + opacity proportional to |GEX|
  // Real strikes get full labels, $250 increments get dimmer labels
  var realLabeledSet = new Set(); // track which real strikes get a label
  var interpLabelIdx = 0;
  visibleBands.forEach(function(s, idx) {
    var intensity = Math.abs(s.gex) / maxAbsGex;
    var isPos = s.gex >= 0;
    // Band width: interpolated bands fill the $250 gap (±125 = $250 total)
    // Real strikes get wider bands to stand out above the interpolated fill
    var bw = s.interpolated ? 125 : (150 + intensity * btcPrice * 0.004);
    // Alpha: use sqrt scaling instead of quadratic so low-intensity bands stay visible
    var alphaMax = s.interpolated ? 0.40 : 0.50;
    var scaledIntensity = Math.sqrt(intensity);
    var alpha = (0.08 + scaledIntensity * alphaMax).toFixed(3);
    var rgb = isPos ? '0, 200, 83' : '255, 23, 68';
    var hexColor = isPos ? '#00c853' : '#ff1744';

    // Band fill
    yAnnotations.push({
      y: s.strike - bw, y2: s.strike + bw,
      fillColor: 'rgba(' + rgb + ', ' + alpha + ')',
      borderColor: 'transparent',
      label: { text: '' }
    });

    // Label REAL (non-interpolated) top strikes — bright, full info
    if (!s.interpolated && activeOverlays.size === 0 && !realLabeledSet.has(s.strike)) {
      if (realLabeledSet.size < 6) {
        var labelIdx = realLabeledSet.size;
        realLabeledSet.add(s.strike);
        var lineAlpha = (0.25 + intensity * 0.40).toFixed(2);
        yAnnotations.push({
          y: s.strike, borderColor: 'rgba(' + rgb + ', ' + lineAlpha + ')', strokeDashArray: 0,
          label: {
            text: (s.strike/1000).toFixed(0) + 'K  ' + formatCompact(s.gex),
            borderColor: 'transparent',
            position: labelIdx % 2 === 0 ? 'right' : 'left',
            offsetX: labelIdx % 2 === 0 ? -4 : 4,
            style: { color: hexColor, background: 'rgba(0,0,0,0.85)', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, padding: { left: 4, right: 4, top: 1, bottom: 1 } }
          }
        });
      }
    }

    // Label INTERPOLATED $250 strikes — dimmer, just the price
    if (s.interpolated && activeOverlays.size === 0) {
      // Use sqrt scaling + higher floor so negative (low intensity) levels stay visible
      var interpLineAlpha = (0.10 + scaledIntensity * 0.15).toFixed(2);
      // Dimmer but clear label colors for both positive and negative
      var interpLabelColor = isPos ? '#5cb97a' : '#e06070';
      yAnnotations.push({
        y: s.strike, borderColor: 'rgba(' + rgb + ', ' + interpLineAlpha + ')', strokeDashArray: 3,
        label: {
          text: '$' + s.strike.toLocaleString(),
          borderColor: 'transparent',
          position: interpLabelIdx % 2 === 0 ? 'right' : 'left',
          offsetX: interpLabelIdx % 2 === 0 ? -4 : 4,
          style: { color: interpLabelColor, background: 'rgba(0,0,0,0.7)', fontSize: '8px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 400, padding: { left: 3, right: 3, top: 1, bottom: 1 } }
        }
      });
      interpLabelIdx++;
    }
  });

  // Overlay annotations (GEX, Vanna, Charm heatmap bands)
  yAnnotations.push.apply(yAnnotations, buildOverlayAnnotations(data));

  // === STRUCTURAL LEVELS — Zero Gamma + Max Pain ===
  if (flipLevel) {
    yAnnotations.push({
      y: flipLevel, borderColor: 'rgba(251, 191, 36, 0.4)', strokeDashArray: 6,
      label: { text: '0\u03B3 ' + (flipLevel/1000).toFixed(0) + 'K', borderColor: 'transparent',
               position: 'left', offsetX: 4,
               style: { color: '#fbbf24', background: 'rgba(0,0,0,0.85)', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, padding: { left: 5, right: 5, top: 2, bottom: 2 } } }
    });
  }
  if (maxPain) {
    yAnnotations.push({
      y: maxPain, borderColor: 'rgba(255, 255, 255, 0.15)', strokeDashArray: 6,
      label: { text: 'MP ' + (maxPain/1000).toFixed(0) + 'K', borderColor: 'transparent',
               position: 'left', offsetX: 4,
               style: { color: '#ffffff', background: 'rgba(0,0,0,0.85)', fontSize: '9px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, padding: { left: 5, right: 5, top: 2, bottom: 2 } } }
    });
  }

  // === SPOT PRICE — prominent tag (id used by WebSocket tick updater) ===
  yAnnotations.push({
    id: 'spotPrice',
    y: btcPrice, borderColor: '#ffffff', strokeDashArray: 0,
    label: { text: '$' + btcPrice.toLocaleString(undefined, {maximumFractionDigits: 0}), borderColor: '#ffffff',
             position: 'right',
             style: { color: '#000000', background: '#ffffff', fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, padding: { left: 6, right: 6, top: 2, bottom: 2 } } }
  });

  // Build nearby-GEX data for the custom tooltip
  var signalsByStrike = {};
  signals.forEach(function(s) { signalsByStrike[s.strike] = s; });
  var sortedStrikes = signals.map(function(s) { return s.strike; }).sort(function(a,b) { return a - b; });

  const options = {
    series: [{ name: 'BTC', data: seriesData }],
    chart: {
      ...APEX_THEME.chart,
      type: 'area',
      height: '100%',
      id: 'mercuryPrice',
    },
    dataLabels: { enabled: false },
    stroke: { curve: 'smooth', width: 2.5, colors: ['#e8e8e8'], lineCap: 'round' },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0,
        opacityFrom: 0.25,
        opacityTo: 0.02,
        colorStops: [
          { offset: 0, color: '#ffffff', opacity: 0.25 },
          { offset: 40, color: '#ffffff', opacity: 0.08 },
          { offset: 100, color: '#ffffff', opacity: 0.01 }
        ]
      }
    },
    colors: ['#e8e8e8'],
    annotations: { yaxis: yAnnotations },
    xaxis: {
      ...APEX_THEME.xaxis,
      type: 'datetime',
      labels: {
        ...APEX_THEME.xaxis.labels,
        datetimeFormatter: { hour: 'HH:mm', minute: 'HH:mm' }
      }
    },
    yaxis: {
      ...APEX_THEME.yaxis,
      min: chartYMin,
      max: chartYMax,
      tickAmount: 8,
      labels: {
        style: { colors: '#909090', fontSize: '12px', fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" },
        formatter: function(v) { return '$' + (v/1000).toFixed(1) + 'K'; }
      }
    },
    grid: {
      ...APEX_THEME.grid,
      borderColor: 'rgba(255,255,255,0.03)',
      yaxis: { lines: { show: true } },
      xaxis: { lines: { show: false } },
    },
    tooltip: {
      ...APEX_THEME.tooltip,
      custom: function(opts) {
        var idx = opts.dataPointIndex;
        var price = opts.series[0][idx];
        var timestamp = opts.w.globals.seriesX[0][idx];
        if (!price || !timestamp) return '';

        var d = new Date(timestamp);
        var timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        var dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Find nearest strikes above and below current price
        var above = null, below = null;
        for (var si = 0; si < sortedStrikes.length; si++) {
          if (sortedStrikes[si] >= price && !above) above = signalsByStrike[sortedStrikes[si]];
          if (sortedStrikes[si] < price) below = signalsByStrike[sortedStrikes[si]];
        }

        var html = '<div class="mercury-tooltip">';
        html += '<div class="mtt-header">';
        html += '<span class="mtt-price">$' + price.toLocaleString(undefined, {maximumFractionDigits: 0}) + '</span>';
        html += '<span class="mtt-time">' + dateStr + ' ' + timeStr + '</span>';
        html += '</div>';

        if (above) {
          var distUp = ((above.strike - price) / price * 100).toFixed(2);
          html += '<div class="mtt-level resistance">';
          html += '<span class="mtt-level-label">RES</span>';
          html += '<span class="mtt-level-strike">$' + (above.strike/1000).toFixed(0) + 'K</span>';
          html += '<span class="mtt-level-dist">+' + distUp + '%</span>';
          html += '<span class="mtt-level-gex">' + formatCompact(above.gex) + '</span>';
          html += '</div>';
        }
        if (below) {
          var distDn = ((price - below.strike) / price * 100).toFixed(2);
          html += '<div class="mtt-level support">';
          html += '<span class="mtt-level-label">SUP</span>';
          html += '<span class="mtt-level-strike">$' + (below.strike/1000).toFixed(0) + 'K</span>';
          html += '<span class="mtt-level-dist">-' + distDn + '%</span>';
          html += '<span class="mtt-level-gex">' + formatCompact(below.gex) + '</span>';
          html += '</div>';
        }

        html += '</div>';
        return html;
      }
    },
    theme: APEX_THEME.theme,
  };

  if (charts.price) {
    charts.price.updateOptions(options, true, true);
  } else {
    charts.price = new ApexCharts(container, options);
    charts.price.render();
  }
}

// Dealer GEX Bar Chart
function renderDealerGexChart(data) {
  const container = document.getElementById('dealerGexChart');
  if (!container) return;

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  const sorted = [...signals]
    .sort((a, b) => a.strike - b.strike)
    .filter(s => Math.abs(s.strike - btcPrice) / btcPrice < 0.15)
    .slice(0, 12);

  if (sorted.length === 0) return;

  const categories = sorted.map(s => '$' + (s.strike/1000).toFixed(0) + 'K');
  const values = sorted.map(s => Math.round(s.gex));

  // Find closest strike to current price
  let closestIdx = 0;
  let minDist = Infinity;
  sorted.forEach((s, i) => {
    const dist = Math.abs(s.strike - btcPrice);
    if (dist < minDist) { minDist = dist; closestIdx = i; }
  });

  const options = {
    series: [{ name: 'Dealer GEX', data: values }],
    chart: {
      ...APEX_THEME.chart,
      type: 'bar',
      height: '100%',
    },
    dataLabels: { enabled: false },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 0,
        barHeight: '65%',
        colors: {
          ranges: [
            { from: -999999999, to: -0.001, color: '#ff1744' },
            { from: 0, to: 999999999, color: '#00c853' }
          ]
        }
      }
    },
    xaxis: {
      ...APEX_THEME.xaxis,
      labels: { ...APEX_THEME.xaxis.labels, formatter: function(v) { return formatCompact(v); } }
    },
    yaxis: {
      ...APEX_THEME.yaxis,
      categories: categories,
      reversed: false,
    },
    grid: APEX_THEME.grid,
    theme: APEX_THEME.theme,
    tooltip: {
      ...APEX_THEME.tooltip,
      custom: function(opts) {
        var idx = opts.dataPointIndex;
        var signal = sorted[idx];
        var vannaNorm = (signal.vanna / 1e6).toFixed(1);
        var charmNorm = (signal.charm / 1e6).toFixed(1);
        return '<div class="apex-custom-tooltip">' +
          '<div class="tooltip-strike">$' + signal.strike.toLocaleString() + '</div>' +
          '<div class="tooltip-row"><span>GEX</span><span class="' + (signal.gex >= 0 ? 'pos' : 'neg') + '">' + formatCompact(signal.gex) + '</span></div>' +
          '<div class="tooltip-row"><span>Vanna</span><span class="' + (signal.vanna >= 0 ? 'pos' : 'neg') + '">' + (signal.vanna >= 0 ? '+$' : '-$') + Math.abs(vannaNorm) + 'M</span></div>' +
          '<div class="tooltip-row"><span>Charm</span><span class="' + (signal.charm >= 0 ? 'pos' : 'neg') + '">' + (signal.charm >= 0 ? '+$' : '-$') + Math.abs(charmNorm) + 'M</span></div>' +
          '<div class="tooltip-row"><span>OI</span><span>' + formatCompact(signal.open_interest, false) + '</span></div>' +
          '</div>';
      }
    },
    annotations: {
      yaxis: [{
        y: categories[closestIdx],
        borderColor: '#ffffff',
        label: { text: 'SPOT', style: { color: '#000000', background: '#ffffff', fontSize: '10px', fontWeight: 600 } }
      }]
    }
  };

  if (charts.dealerGex) {
    charts.dealerGex.updateOptions(options, true, true);
  } else {
    charts.dealerGex = new ApexCharts(container, options);
    charts.dealerGex.render();
  }
}

// Gamma Profile Chart
function renderGammaProfileChart(data) {
  const container = document.getElementById('gammaProfileChart');
  if (!container) return;

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  if (signals.length === 0) return;

  const sorted = [...signals].sort((a, b) => a.strike - b.strike);
  const categories = sorted.map(s => '$' + (s.strike/1000).toFixed(0) + 'K');
  const posData = sorted.map(s => s.gex >= 0 ? Math.round(s.gex) : 0);
  const negData = sorted.map(s => s.gex < 0 ? Math.round(s.gex) : 0);

  const spotIdx = sorted.reduce((best, s, i) =>
    Math.abs(s.strike - btcPrice) < Math.abs(sorted[best].strike - btcPrice) ? i : best, 0);

  const options = {
    series: [
      { name: 'Call Wall (Support)', data: posData },
      { name: 'Put Wall (Resistance)', data: negData }
    ],
    chart: {
      ...APEX_THEME.chart,
      type: 'area',
      height: '100%',
      stacked: false,
    },
    dataLabels: { enabled: false },
    colors: ['#00c853', '#ff1744'],
    stroke: { curve: 'smooth', width: 2 },
    fill: {
      type: 'gradient',
      gradient: { shadeIntensity: 0.1, opacityFrom: 0.15, opacityTo: 0.02, stops: [0, 100] }
    },
    xaxis: { ...APEX_THEME.xaxis, categories: categories },
    yaxis: { ...APEX_THEME.yaxis, labels: { ...APEX_THEME.yaxis.labels, formatter: function(v) { return formatCompact(v); } } },
    grid: APEX_THEME.grid,
    theme: APEX_THEME.theme,
    tooltip: { ...APEX_THEME.tooltip, shared: true, intersect: false, y: { formatter: function(v) { return formatCompact(v); } } },
    legend: { position: 'top', horizontalAlign: 'right', labels: { colors: '#909090' }, markers: { radius: 0 } },
    annotations: {
      xaxis: [{
        x: categories[spotIdx],
        borderColor: '#ffffff',
        strokeDashArray: 4,
        label: { text: 'SPOT', orientation: 'horizontal', style: { color: '#000000', background: '#ffffff', fontSize: '10px', fontWeight: 600 } }
      }]
    }
  };

  if (charts.gammaProfile) {
    charts.gammaProfile.updateOptions(options, true, true);
  } else {
    charts.gammaProfile = new ApexCharts(container, options);
    charts.gammaProfile.render();
  }
}

// Vanna Heatmap (Horizontal Bar)
function renderVannaHeatmap(data) {
  const container = document.getElementById('vannaHeatmap');
  if (!container) return;

  const signals = data.signals || [];
  if (signals.length === 0) return;

  const sorted = [...signals].sort((a, b) => a.strike - b.strike);
  const categories = sorted.map(s => '$' + (s.strike/1000).toFixed(0) + 'K');
  // Normalize vanna to millions for readable display
  const values = sorted.map(s => parseFloat((s.vanna / 1e6).toFixed(1)));

  const options = {
    series: [{ name: 'Vanna ($M)', data: values }],
    chart: {
      ...APEX_THEME.chart,
      type: 'bar',
      height: '100%',
    },
    dataLabels: { enabled: false },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 0,
        barHeight: '70%',
        colors: {
          ranges: [
            { from: -9999, to: -0.001, color: '#ff1744' },
            { from: 0, to: 9999, color: '#60a5fa' }
          ]
        }
      }
    },
    xaxis: {
      categories: categories,
      labels: { style: { colors: '#444444', fontSize: '11px' } }
    },
    yaxis: {
      labels: {
        style: { colors: '#444444', fontSize: '11px' },
        formatter: function(v) { return '$' + v.toFixed(0) + 'M'; }
      }
    },
    grid: APEX_THEME.grid,
    theme: APEX_THEME.theme,
    tooltip: {
      ...APEX_THEME.tooltip,
      y: { formatter: function(v) { return '$' + v.toFixed(1) + 'M'; } },
      x: { show: true }
    },
    legend: { show: false },
  };

  if (charts.vannaHeatmap) {
    charts.vannaHeatmap.updateOptions(options, true, true);
  } else {
    charts.vannaHeatmap = new ApexCharts(container, options);
    charts.vannaHeatmap.render();
  }
}

// Charm Decay Curve
function renderCharmCurve(data) {
  const container = document.getElementById('charmCurveChart');
  if (!container) return;

  const signals = data.signals || [];
  if (signals.length === 0) return;

  const sorted = [...signals].sort((a, b) => a.strike - b.strike);
  const categories = sorted.map(s => '$' + (s.strike/1000).toFixed(0) + 'K');
  // Normalize charm to millions for readable display
  const values = sorted.map(s => parseFloat((s.charm / 1e6).toFixed(2)));

  const options = {
    series: [{ name: 'Charm ($M)', data: values }],
    chart: {
      ...APEX_THEME.chart,
      type: 'area',
      height: '100%',
    },
    dataLabels: { enabled: false },
    colors: ['#fbbf24'],
    stroke: { curve: 'smooth', width: 2.5 },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0.3,
        opacityFrom: 0.3,
        opacityTo: 0.02,
        colorStops: [
          { offset: 0, color: '#fbbf24', opacity: 0.3 },
          { offset: 50, color: '#fbbf24', opacity: 0 },
          { offset: 100, color: '#ffffff', opacity: 0.15 }
        ]
      }
    },
    markers: { size: 4, colors: undefined, strokeColors: '#000000', strokeWidth: 2, hover: { size: 6 } },
    xaxis: { ...APEX_THEME.xaxis, categories: categories },
    yaxis: {
      ...APEX_THEME.yaxis,
      labels: { ...APEX_THEME.yaxis.labels, formatter: function(v) { return '$' + v.toFixed(1) + 'M'; } },
      title: { text: 'Sell Pressure  /  Buy Pressure ($M)', style: { color: '#444444', fontSize: '10px' } }
    },
    grid: APEX_THEME.grid,
    theme: APEX_THEME.theme,
    tooltip: { ...APEX_THEME.tooltip, y: { formatter: function(v) { return '$' + v.toFixed(2) + 'M charm'; } } },
    legend: { show: false },
  };

  if (charts.charmCurve) {
    charts.charmCurve.updateOptions(options, true, true);
  } else {
    charts.charmCurve = new ApexCharts(container, options);
    charts.charmCurve.render();
  }
}

// Spot-Volatility Correlation (ApexCharts scatter with quadrant annotations)
function renderSpotVolChart(data) {
  const container = document.getElementById('spotVolChart');
  if (!container) return;

  const netVanna = data.metrics.net_vanna;
  const netGex = data.metrics.net_gex;

  // Position the "NOW" dot based on vanna (x-axis = IV direction) and gex (y-axis = spot direction)
  const xPos = netVanna >= 0 ? 0.5 : -0.5;
  const yPos = netGex >= 0 ? 0.5 : -0.5;

  const regimeText = netVanna >= 0
    ? 'Rising IV pushes price UP (positive vanna)'
    : 'Rising IV pushes price DOWN (negative vanna)';

  const options = {
    series: [{
      name: 'Current Regime',
      data: [{ x: xPos, y: yPos }]
    }],
    chart: {
      ...APEX_THEME.chart,
      type: 'scatter',
      height: '100%',
      zoom: { enabled: false },
      events: {
        mounted: function(chartContext) {
          addQuadrantLabels(container);
        },
        updated: function(chartContext) {
          addQuadrantLabels(container);
        }
      }
    },
    dataLabels: { enabled: false },
    colors: ['#ffffff'],
    markers: {
      size: 18,
      strokeColors: '#ffffff',
      strokeWidth: 3,
      fillOpacity: 0.3,
      hover: { size: 20 }
    },
    xaxis: {
      min: -1, max: 1,
      tickAmount: 2,
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
      title: {
        text: '\u2190 IV Decrease          IV Increase \u2192',
        style: { color: '#444444', fontSize: '11px', fontWeight: 500 }
      },
      crosshairs: { show: false }
    },
    yaxis: {
      min: -1, max: 1,
      tickAmount: 2,
      labels: { show: false },
      title: {
        text: '\u2190 Spot Down     Spot Up \u2192',
        style: { color: '#444444', fontSize: '11px', fontWeight: 500 }
      }
    },
    grid: {
      borderColor: 'rgba(255,255,255,0.06)',
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    theme: APEX_THEME.theme,
    tooltip: {
      ...APEX_THEME.tooltip,
      custom: function() {
        return '<div class="apex-custom-tooltip">' +
          '<div class="tooltip-strike">\u26A1 Current Regime</div>' +
          '<div class="tooltip-row"><span>' + regimeText + '</span></div>' +
          '</div>';
      }
    },
    annotations: {
      // Quadrant backgrounds via yaxis/xaxis annotations
      yaxis: [
        { y: 0, y2: 1, fillColor: 'rgba(0, 200, 83, 0.04)', borderColor: 'transparent',
          label: { text: '' } },
        { y: -1, y2: 0, fillColor: 'rgba(255, 255, 255, 0.04)', borderColor: 'transparent',
          label: { text: '' } }
      ],
      xaxis: [
        { x: 0, borderColor: 'rgba(255,255,255,0.12)', strokeDashArray: 0 }
      ],
      points: [{
        x: xPos, y: yPos,
        marker: { size: 0 },
        label: {
          text: 'NOW',
          borderColor: '#ffffff',
          style: {
            color: '#000000',
            background: '#ffffff',
            fontSize: '11px',
            fontWeight: 700,
            padding: { left: 8, right: 8, top: 4, bottom: 4 }
          },
          offsetY: -25
        }
      }]
    },
    subtitle: {
      text: regimeText,
      align: 'left',
      style: { color: '#909090', fontSize: '12px', fontWeight: 500 }
    }
  };

  if (charts.spotVol) {
    charts.spotVol.updateOptions(options, true, true);
  } else {
    charts.spotVol = new ApexCharts(container, options);
    charts.spotVol.render();
  }
}

// Add quadrant corner labels to the Spot-Vol chart
function addQuadrantLabels(container) {
  // Remove old labels if any
  container.querySelectorAll('.quadrant-label').forEach(el => el.remove());

  const plotArea = container.querySelector('.apexcharts-plot-area');
  if (!plotArea) return;

  const rect = plotArea.getBBox();
  const labels = [
    { text: 'IV\u2193 Spot\u2191', x: rect.x + rect.width * 0.25, y: rect.y + 20, color: '#fbbf24' },
    { text: 'IV\u2191 Spot\u2191', x: rect.x + rect.width * 0.75, y: rect.y + 20, color: '#00c853' },
    { text: 'IV\u2193 Spot\u2193', x: rect.x + rect.width * 0.25, y: rect.y + rect.height - 10, color: '#ffffff' },
    { text: 'IV\u2191 Spot\u2193', x: rect.x + rect.width * 0.75, y: rect.y + rect.height - 10, color: '#ff1744' }
  ];

  const svg = container.querySelector('svg');
  if (!svg) return;

  labels.forEach(l => {
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', l.x);
    txt.setAttribute('y', l.y);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('fill', l.color);
    txt.setAttribute('font-size', '11');
    txt.setAttribute('font-weight', '600');
    txt.setAttribute('font-family', 'JetBrains Mono, monospace');
    txt.setAttribute('class', 'quadrant-label');
    txt.textContent = l.text;
    svg.appendChild(txt);
  });
}

// ========== UTILITIES ==========
function formatCompact(num, showSign) {
  if (showSign === undefined) showSign = true;
  const abs = Math.abs(num);
  const sign = showSign ? (num >= 0 ? '+' : '-') : (num < 0 ? '-' : '');
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  if (abs >= 1) return sign + abs.toFixed(0);
  if (abs === 0) return '0';
  return sign + abs.toFixed(2);
}

// Normalize large greek values to human-readable scale
// Vanna/Charm raw values can be tens of millions; divide to show cleaner numbers
function normalizeGreeks(signals) {
  return signals.map(s => ({
    ...s,
    vanna_norm: s.vanna / 1e6,
    charm_norm: s.charm / 1e6
  }));
}

function updateLastUpdated(timestamp) {
  // Clock is now handled by startLiveClock() — no-op here
}

function startCountdown() {
  countdownTimer = setInterval(() => {
    secondsUntilUpdate--;
    if (elements.nextUpdate) {
      elements.nextUpdate.textContent = secondsUntilUpdate <= 0 ? 'Updating...' : secondsUntilUpdate + 's';
    }
  }, 1000);
}

function resetCountdown() {
  secondsUntilUpdate = 60;
  if (elements.nextUpdate) {
    elements.nextUpdate.textContent = secondsUntilUpdate + 's';
  }
}

function showLoading(show) {
  if (show) {
    elements.loadingOverlay.classList.remove('hidden');
  } else {
    elements.loadingOverlay.classList.add('hidden');
  }
}

function showError(message) {
  elements.errorToast.querySelector('.toast-message').textContent = message;
  elements.errorToast.classList.add('show');
  setTimeout(() => elements.errorToast.classList.remove('show'), 5000);
}

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadDashboardData(), GEX_REFRESH_INTERVAL);

  // Periodically backfill price history from CoinGecko (fills gaps if WS drops)
  if (priceHistoryTimer) clearInterval(priceHistoryTimer);
  priceHistoryTimer = setInterval(() => fetchPriceHistory(), PRICE_HISTORY_FETCH_INTERVAL);

  // Connect WebSocket for live ticks
  connectTickSocket();
}

window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (priceHistoryTimer) clearInterval(priceHistoryTimer);
  if (countdownTimer) clearInterval(countdownTimer);
  if (clockTimer) clearInterval(clockTimer);
  disconnectTickSocket();
});

// ApexCharts handles resize automatically — no manual resize handler needed
