/**
 * HedgeIQ Dashboard - Updated for Cached Backend
 */

const API_BASE_URL = 'https://hedgeiq-backend.onrender.com/api';
const REFRESH_INTERVAL = 60 * 1000;

let currentAsset = 'BTC';
let refreshTimer = null;
let countdownTimer = null;
let secondsUntilUpdate = 60;
let isLoading = false;
let isAdvancedMode = false;
let dashboardData = null;
let priceHistory = [];
let isFirstLoad = true;

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  init();
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
}

async function init() {
  setupEventListeners();
  await loadDashboardData();
  startAutoRefresh();
  startCountdown();
}

function setupEventListeners() {
  document.querySelectorAll('.asset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.asset-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      currentAsset = e.target.dataset.asset;
      loadDashboardData();
    });
  });

  elements.refreshBtn.addEventListener('click', () => {
    loadDashboardData();
    resetCountdown();
  });

  elements.advancedModeToggle.addEventListener('change', (e) => {
    isAdvancedMode = e.target.checked;
    toggleAdvancedMode();
  });

  elements.errorToast.querySelector('.toast-close').addEventListener('click', () => {
    elements.errorToast.classList.remove('show');
  });

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const parent = e.target.closest('.levels-filter');
      parent.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      filterLevels(e.target.dataset.filter);
    });
  });
}

function toggleAdvancedMode() {
  if (isAdvancedMode) {
    elements.simpleModeSection.style.display = 'none';
    elements.advancedModeSection.style.display = 'block';
    if (dashboardData) updateAdvancedTable(dashboardData);
  } else {
    elements.simpleModeSection.style.display = 'block';
    elements.advancedModeSection.style.display = 'none';
    if (dashboardData) updateLevelsTable(dashboardData);
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

async function loadDashboardData() {
  if (isLoading) return;
  
  isLoading = true;
  
  const loadingTimeout = setTimeout(() => {
    showLoading(true);
  }, 500);

  try {
    const response = await fetch(`${API_BASE_URL}/dashboard`);
    
    clearTimeout(loadingTimeout);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();
    
    dashboardData = data;

    fetchPriceHistory();

    if (elements.tierBadge) {
      elements.tierBadge.textContent = data.tier.toUpperCase();
      elements.tierBadge.className = `tier-badge ${data.tier}`;
    }
    if (elements.refreshRate) {
      elements.refreshRate.textContent = `Updates every ${data.refresh_rate}`;
    }

    updateRegimeBanner(data);
    updateMetrics(data);
    
    if (isAdvancedMode) {
      updateAdvancedTable(data);
    } else {
      updateLevelsTable(data);
    }
    
    updateChart(data);
    updateLastUpdated(data.last_updated);
    
    isFirstLoad = false;

  } catch (error) {
    clearTimeout(loadingTimeout);
    console.error('Error loading dashboard:', error);
    showError('Failed to load data. Backend may be starting up.');
  } finally {
    isLoading = false;
    showLoading(false);
    resetCountdown();
  }
}

async function fetchPriceHistory() {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1'
    );
    if (response.ok) {
      const data = await response.json();
      priceHistory = data.prices;
      if (dashboardData) updateChart(dashboardData);
    }
  } catch (e) {
    console.warn('Could not fetch price history:', e);
  }
}

function updateRegimeBanner(data) {
  const netGex = data.metrics.net_gex;
  const isPositiveGamma = netGex >= 0;
  
  elements.regimeBanner.className = `regime-banner ${isPositiveGamma ? 'positive' : 'negative'}`;
  elements.regimeValue.textContent = isPositiveGamma ? 'Positive Gamma' : 'Negative Gamma';
  elements.regimeValue.className = `regime-value ${isPositiveGamma ? 'positive' : 'negative'}`;
  elements.regimeDescription.textContent = isPositiveGamma 
    ? 'Dealers will buy dips and sell rips — expect mean reversion and lower volatility'
    : 'Dealers will amplify moves — expect trend continuation and higher volatility';
}

function updateMetrics(data) {
  const m = data.metrics;
  const btcPrice = data.btc_price;
  
  const gexPositive = m.net_gex >= 0;
  elements.netGexValue.textContent = gexPositive ? 'Positive' : 'Negative';
  elements.netGexValue.className = `metric-value ${gexPositive ? 'positive' : 'negative'}`;
  elements.netGexDesc.textContent = gexPositive ? 'Supportive environment' : 'Volatile environment';

  const vannaPositive = m.net_vanna >= 0;
  elements.netVannaValue.textContent = vannaPositive ? 'Positive' : 'Negative';
  elements.netVannaValue.className = `metric-value ${vannaPositive ? 'positive' : 'negative'}`;
  elements.netVannaDesc.textContent = vannaPositive ? 'IV rise = bullish' : 'IV rise = bearish';

  const charmPositive = m.net_charm >= 0;
  elements.netCharmValue.textContent = charmPositive ? 'Positive' : 'Negative';
  elements.netCharmValue.className = `metric-value ${charmPositive ? 'positive' : 'negative'}`;
  elements.netCharmDesc.textContent = charmPositive ? 'Time decay bullish' : 'Time decay bearish';

  // FIX: Actually show max pain value from backend
  if (elements.maxPainValue && m.max_pain) {
    elements.maxPainValue.textContent = `$${m.max_pain.toLocaleString()}`;
    elements.maxPainValue.className = 'metric-value neutral';
    elements.maxPainDesc.textContent = 'Price with max loss for option sellers';
  }
}

function updateLevelsTable(data) {
  const signals = data.signals;
  
  if (!signals || signals.length === 0) {
    elements.levelsTableBody.innerHTML = `<div class="loading-row"><span>No signals found</span></div>`;
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => b.gex_score - a.gex_score);

  const rows = sortedSignals.map(signal => {
    const typeClass = signal.type.toLowerCase();
    const signalInfo = getSignalInfo(signal);
    const confluences = getConfluenceBadges(signal);
    const strengthHtml = getStrengthIndicator(signal.gex_score);

    return `
      <div class="level-row">
        <span class="level-price">$${signal.strike.toLocaleString()}</span>
        <span class="level-type ${typeClass}">${signal.type.toUpperCase()}</span>
        <span class="level-confluence">${confluences}</span>
        <span class="level-signal ${signalInfo.class}">${signalInfo.text}</span>
        <span class="strength-indicator">${strengthHtml}</span>
      </div>
    `;
  }).join('');

  elements.levelsTableBody.innerHTML = rows;
}

function getConfluenceBadges(signal) {
  const badges = ['GEX'];
  
  if (Math.abs(signal.vanna) > 100) badges.push('Vanna');
  if (Math.abs(signal.charm) > 10) badges.push('Charm');
  if (signal.open_interest > 1000) badges.push('OI');
  if (signal.volume > 100) badges.push('Vol');

  return badges.map(b => `<span class="conf-badge active">${b}</span>`).join('');
}

function getSignalInfo(signal) {
  const score = signal.gex_score;
  const isSupport = signal.type === 'support';
  
  if (score >= 3) {
    return {
      class: isSupport ? 'strong-buy' : 'strong-sell',
      text: isSupport ? 'Strong Buy Zone' : 'Strong Sell Zone'
    };
  } else if (score >= 2) {
    return {
      class: isSupport ? 'buy' : 'sell',
      text: isSupport ? 'Buy Zone' : 'Sell Zone'
    };
  } else if (score >= 1) {
    return {
      class: 'neutral',
      text: isSupport ? 'Potential Support' : 'Potential Resistance'
    };
  } else {
    return {
      class: 'neutral',
      text: 'Watch Level'
    };
  }
}

function getStrengthIndicator(score) {
  const maxDots = 5;
  const filledDots = Math.min(Math.ceil(score * 1.25), maxDots);
  const isHigh = score >= 3;
  
  let dots = '';
  for (let i = 0; i < maxDots; i++) {
    const filled = i < filledDots ? 'filled' : '';
    const high = filled && isHigh ? 'high' : '';
    dots += `<div class="strength-dot ${filled} ${high}"></div>`;
  }
  
  const labels = ['Low', 'Low', 'Medium', 'High', 'Very High'];
  const labelIndex = Math.min(Math.floor(score), 4);
  
  return `
    <div class="strength-bar">${dots}</div>
    <span class="strength-label">${labels[labelIndex]}</span>
  `;
}

function updateAdvancedTable(data) {
  const signals = data.signals;
  
  if (!signals || signals.length === 0) {
    elements.advancedTableBody.innerHTML = `<div class="loading-row"><span>No data found</span></div>`;
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));

  const rows = sortedSignals.map(signal => {
    const typeClass = signal.type.toLowerCase();
    const gexClass = signal.gex >= 0 ? 'positive' : 'negative';
    const vannaClass = signal.vanna >= 0 ? 'positive' : 'negative';
    const charmClass = signal.charm >= 0 ? 'positive' : 'negative';

    return `
      <div class="level-row advanced">
        <span class="level-price">$${signal.strike.toLocaleString()}</span>
        <span class="level-type ${typeClass}">${signal.type.toUpperCase()}</span>
        <span class="data-cell ${gexClass}">${formatCompact(signal.gex)}</span>
        <span class="data-cell ${vannaClass}">${formatCompact(signal.vanna)}</span>
        <span class="data-cell ${charmClass}">${formatCompact(signal.charm)}</span>
        <span class="data-cell neutral">${formatCompact(signal.open_interest)}</span>
        <span class="data-cell neutral">${formatCompact(signal.volume)}</span>
        <span class="data-cell neutral">${signal.gex_score.toFixed(1)}</span>
      </div>
    `;
  }).join('');

  elements.advancedTableBody.innerHTML = rows;
}

function updateChart(data) {
  const canvas = document.getElementById('priceChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 30, right: 100, bottom: 30, left: 20 };

  ctx.clearRect(0, 0, width, height);

  const btcPrice = data.btc_price;
  const signals = data.signals;

  let prices = priceHistory.length > 0 
    ? priceHistory.map(p => p[1])
    : Array(100).fill(btcPrice).map((p, i) => p + (Math.random() - 0.5) * p * 0.01);

  const resistanceLevels = signals.filter(s => s.type === 'resistance').slice(0, 3);
  const supportLevels = signals.filter(s => s.type === 'support').slice(0, 3);
  
  const allLevelPrices = [...resistanceLevels, ...supportLevels].map(s => s.strike);
  const allPrices = [...prices, ...allLevelPrices, btcPrice];
  
  const dataMin = Math.min(...allPrices);
  const dataMax = Math.max(...allPrices);
  const rangePadding = (dataMax - dataMin) * 0.1;
  const minPrice = dataMin - rangePadding;
  const maxPrice = dataMax + rangePadding;
  const priceRange = maxPrice - minPrice;

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const priceToY = (price) => padding.top + (1 - (price - minPrice) / priceRange) * chartHeight;
  const indexToX = (index) => padding.left + (index / (prices.length - 1)) * chartWidth;

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  resistanceLevels.forEach(level => {
    const y = priceToY(level.strike);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(padding.left, y - 12, chartWidth, 24);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPriceLabel(ctx, level.strike, y, 'resistance', width, padding);
  });

  supportLevels.forEach(level => {
    const y = priceToY(level.strike);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
    ctx.fillRect(padding.left, y - 12, chartWidth, 24);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.5)';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    drawPriceLabel(ctx, level.strike, y, 'support', width, padding);
  });

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, 'rgba(0, 212, 255, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 212, 255, 0)');

  ctx.beginPath();
  ctx.moveTo(indexToX(0), priceToY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(indexToX(i), priceToY(prices[i]));
  }
  ctx.lineTo(indexToX(prices.length - 1), height - padding.bottom);
  ctx.lineTo(indexToX(0), height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(indexToX(0), priceToY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(indexToX(i), priceToY(prices[i]));
  }
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const lastX = indexToX(prices.length - 1);
  const lastY = priceToY(prices[prices.length - 1]);
  
  ctx.beginPath();
  ctx.arc(lastX, lastY, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
  ctx.fill();
  
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#00d4ff';
  ctx.fill();

  drawPriceLabel(ctx, btcPrice, lastY, 'current', width, padding);
}

function drawPriceLabel(ctx, price, y, type, canvasWidth, padding) {
  const x = canvasWidth - padding.right + 8;
  const labelWidth = 80;
  const labelHeight = 24;
  
  const clampedY = Math.max(labelHeight / 2, Math.min(y, ctx.canvas.height - labelHeight / 2));
  
  let bgColor, textColor;
  if (type === 'resistance') {
    bgColor = 'rgba(239, 68, 68, 0.2)';
    textColor = '#ef4444';
  } else if (type === 'support') {
    bgColor = 'rgba(16, 185, 129, 0.2)';
    textColor = '#10b981';
  } else {
    bgColor = 'rgba(0, 212, 255, 0.3)';
    textColor = '#00d4ff';
  }
  
  if (type === 'current') {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvasWidth - padding.right, y);
    ctx.lineTo(x, clampedY);
    ctx.stroke();
  }
  
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, clampedY - labelHeight / 2, labelWidth, labelHeight, 4);
  ctx.fill();
  
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  ctx.fillStyle = textColor;
  ctx.font = '600 12px DM Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, x + labelWidth / 2, clampedY);
}

function formatCompact(num) {
  const abs = Math.abs(num);
  const sign = num >= 0 ? '+' : '-';
  
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  if (abs >= 1) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(2)}`;
}

function updateLastUpdated(timestamp) {
  if (timestamp) {
    const date = new Date(timestamp);
    elements.lastUpdated.textContent = `Updated ${date.toLocaleTimeString()}`;
  } else {
    elements.lastUpdated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  }
}

function startCountdown() {
  countdownTimer = setInterval(() => {
    secondsUntilUpdate--;
    if (secondsUntilUpdate <= 0) {
      elements.nextUpdate.textContent = 'Updating...';
    } else {
      elements.nextUpdate.textContent = `Next update in: ${secondsUntilUpdate}s`;
    }
  }, 1000);
}

function resetCountdown() {
  secondsUntilUpdate = 60;
  elements.nextUpdate.textContent = `Next update in: ${secondsUntilUpdate}s`;
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
  refreshTimer = setInterval(() => loadDashboardData(), REFRESH_INTERVAL);
}

window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearInterval(refreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);
});

window.addEventListener('resize', () => {
  if (dashboardData) updateChart(dashboardData);
});
```

**Save this entire file to:**
```
C:\Users\micha\OneDrive\Desktop\hedgeiqsimple\hedgeiq-frontend\scripts\dashboard.js