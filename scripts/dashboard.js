/**
 * HedgeIQ Dashboard
 * All fixes implemented:
 * - Simplified metric displays (Positive/Negative instead of numbers)
 * - 1 minute updates with countdown
 * - Stronger levels shown first
 * - Better signal wording
 * - More forgiving dealer scores
 * - Charm included in confluence
 * - Market regime banner
 * - Fixed chart with attached price labels
 */

const API_BASE_URL = 'https://hedgeiq-backend.onrender.com/api';
const REFRESH_INTERVAL = 60 * 1000; // 1 minute

// State
let currentAsset = 'BTC';
let refreshTimer = null;
let countdownTimer = null;
let secondsUntilUpdate = 60;
let isLoading = false;
let isAdvancedMode = false;
let levelsData = null;
let priceHistory = [];
let isFirstLoad = true;

// DOM Elements
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
  // Metrics
  elements.netGexValue = document.getElementById('netGexValue');
  elements.netGexDesc = document.getElementById('netGexDesc');
  elements.netVannaValue = document.getElementById('netVannaValue');
  elements.netVannaDesc = document.getElementById('netVannaDesc');
  elements.netCharmValue = document.getElementById('netCharmValue');
  elements.netCharmDesc = document.getElementById('netCharmDesc');
  elements.maxPainValue = document.getElementById('maxPainValue');
  elements.maxPainDesc = document.getElementById('maxPainDesc');
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
    if (levelsData) updateAdvancedTable(levelsData);
  } else {
    elements.simpleModeSection.style.display = 'block';
    elements.advancedModeSection.style.display = 'none';
    if (levelsData) updateLevelsTable(levelsData);
  }
}

function filterLevels(filter) {
  if (!levelsData) return;
  
  const filteredData = {
    ...levelsData,
    key_levels: levelsData.key_levels.filter(level => {
      if (filter === 'all') return true;
      if (filter === 'support') return level.level_type === 'SUPPORT';
      if (filter === 'resistance') return level.level_type === 'RESISTANCE';
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
  
  // Only show loading overlay on first load
  if (isFirstLoad) {
    showLoading(true);
  }

  try {
    const [metricsRes, levelsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/metrics?days_out=30`),
      fetch(`${API_BASE_URL}/levels?days_out=30&top_n=15`)
    ]);

    // Fetch price history in background (don't block)
    fetchPriceHistory();

    if (!metricsRes.ok || !levelsRes.ok) {
      throw new Error('Failed to fetch data');
    }

    const metrics = await metricsRes.json();
    const levels = await levelsRes.json();
    
    levelsData = levels;

    updateRegimeBanner(metrics);
    updateMetrics(metrics);
    
    if (isAdvancedMode) {
      updateAdvancedTable(levels);
    } else {
      updateLevelsTable(levels);
    }
    
    updateChart(levels);
    updateLastUpdated();
    
    isFirstLoad = false;

  } catch (error) {
    console.error('Error loading dashboard:', error);
    showError('Failed to load data. Check that backend is running.');
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
      if (levelsData) updateChart(levelsData);
    }
  } catch (e) {
    console.warn('Could not fetch price history:', e);
  }
}

function updateRegimeBanner(data) {
  const m = data.metrics;
  const isPositiveGamma = m.regime === 'POSITIVE_GAMMA';
  
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
  
  // Net GEX - simplified display
  const gexPositive = m.net_gex >= 0;
  elements.netGexValue.textContent = gexPositive ? 'Positive' : 'Negative';
  elements.netGexValue.className = `metric-value ${gexPositive ? 'positive' : 'negative'}`;
  elements.netGexDesc.textContent = gexPositive ? 'Supportive environment' : 'Volatile environment';

  // Net Vanna - simplified display
  const vannaPositive = m.net_vanna >= 0;
  elements.netVannaValue.textContent = vannaPositive ? 'Positive' : 'Negative';
  elements.netVannaValue.className = `metric-value ${vannaPositive ? 'positive' : 'negative'}`;
  elements.netVannaDesc.textContent = vannaPositive ? 'IV rise = bullish' : 'IV rise = bearish';

  // Net Charm - simplified display
  const charmPositive = m.net_charm >= 0;
  elements.netCharmValue.textContent = charmPositive ? 'Positive' : 'Negative';
  elements.netCharmValue.className = `metric-value ${charmPositive ? 'positive' : 'negative'}`;
  elements.netCharmDesc.textContent = charmPositive ? 'Time decay bullish' : 'Time decay bearish';

  // Max Pain
  elements.maxPainValue.textContent = `$${m.max_pain.toLocaleString()}`;
  elements.maxPainValue.className = 'metric-value neutral';
  const painDistance = ((m.max_pain - btcPrice) / btcPrice * 100).toFixed(1);
  elements.maxPainDesc.textContent = `${painDistance > 0 ? '+' : ''}${painDistance}% from spot`;
}

function updateLevelsTable(data) {
  const levels = data.key_levels;
  
  if (!levels || levels.length === 0) {
    elements.levelsTableBody.innerHTML = `<div class="loading-row"><span>No levels found</span></div>`;
    return;
  }

  // Sort by strength (dealer score) descending - strongest first
  const sortedLevels = [...levels].sort((a, b) => b.gex_dealer_score - a.gex_dealer_score);

  const rows = sortedLevels.map(level => {
    const typeClass = level.level_type.toLowerCase();
    const signalInfo = getSignalInfo(level);
    const confluences = getConfluenceBadges(level);
    const strengthHtml = getStrengthIndicator(level.gex_dealer_score);

    return `
      <div class="level-row">
        <span class="level-price">$${level.strike.toLocaleString()}</span>
        <span class="level-type ${typeClass}">${level.level_type}</span>
        <span class="level-confluence">${confluences}</span>
        <span class="level-signal ${signalInfo.class}">${signalInfo.text}</span>
        <span class="strength-indicator">${strengthHtml}</span>
      </div>
    `;
  }).join('');

  elements.levelsTableBody.innerHTML = rows;
}

function getConfluenceBadges(level) {
  // Always include GEX since it's the primary metric
  const badges = ['GEX'];
  
  // Add Vanna if significant
  if (Math.abs(level.vanna) > 100) {
    badges.push('Vanna');
  }
  
  // Add Charm if significant
  if (Math.abs(level.charm) > 10) {
    badges.push('Charm');
  }
  
  // Add OI indicator if high open interest
  if (level.open_interest > 1000) {
    badges.push('OI');
  }
  
  // Add Volume if there's recent activity
  if (level.volume > 100) {
    badges.push('Vol');
  }

  return badges.map(b => `<span class="conf-badge active">${b}</span>`).join('');
}

function getSignalInfo(level) {
  const score = level.gex_dealer_score;
  const isSupport = level.level_type === 'SUPPORT';
  
  // More generous thresholds
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
  // Convert score (0-4) to dots (1-5)
  const maxDots = 5;
  const filledDots = Math.min(Math.ceil(score * 1.25), maxDots); // Scale 0-4 to 1-5
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
  const levels = data.key_levels;
  
  if (!levels || levels.length === 0) {
    elements.advancedTableBody.innerHTML = `<div class="loading-row"><span>No data found</span></div>`;
    return;
  }

  // Sort by absolute GEX value
  const sortedLevels = [...levels].sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex));

  const rows = sortedLevels.map(level => {
    const typeClass = level.level_type.toLowerCase();
    const gexClass = level.gex >= 0 ? 'positive' : 'negative';
    const vannaClass = level.vanna >= 0 ? 'positive' : 'negative';
    const charmClass = level.charm >= 0 ? 'positive' : 'negative';

    return `
      <div class="level-row advanced">
        <span class="level-price">$${level.strike.toLocaleString()}</span>
        <span class="level-type ${typeClass}">${level.level_type}</span>
        <span class="data-cell ${gexClass}">${formatCompact(level.gex)}</span>
        <span class="data-cell ${vannaClass}">${formatCompact(level.vanna)}</span>
        <span class="data-cell ${charmClass}">${formatCompact(level.charm)}</span>
        <span class="data-cell neutral">${formatCompact(level.open_interest)}</span>
        <span class="data-cell neutral">${formatCompact(level.volume)}</span>
        <span class="data-cell neutral">${level.gex_dealer_score.toFixed(1)}</span>
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
  const levels = data.key_levels;

  // Get prices
  let prices = priceHistory.length > 0 
    ? priceHistory.map(p => p[1])
    : Array(100).fill(btcPrice).map((p, i) => p + (Math.random() - 0.5) * p * 0.01);

  // Get all key levels for price range
  const resistanceLevels = levels.filter(l => l.level_type === 'RESISTANCE').slice(0, 3);
  const supportLevels = levels.filter(l => l.level_type === 'SUPPORT').slice(0, 3);
  
  const allLevelPrices = [...resistanceLevels, ...supportLevels].map(l => l.strike);
  const allPrices = [...prices, ...allLevelPrices, btcPrice];
  
  // Calculate range with padding to show all levels
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

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Draw resistance zones
  resistanceLevels.forEach(level => {
    const y = priceToY(level.strike);
    
    // Zone background
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(padding.left, y - 12, chartWidth, 24);
    
    // Dashed line
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Price label on right
    drawPriceLabel(ctx, level.strike, y, 'resistance', width, padding);
  });

  // Draw support zones
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

  // Draw price gradient fill
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

  // Draw price line
  ctx.beginPath();
  ctx.moveTo(indexToX(0), priceToY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(indexToX(i), priceToY(prices[i]));
  }
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw current price dot and label (attached to line)
  const lastX = indexToX(prices.length - 1);
  const lastY = priceToY(prices[prices.length - 1]);
  
  // Pulsing outer ring
  ctx.beginPath();
  ctx.arc(lastX, lastY, 12, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 212, 255, 0.2)';
  ctx.fill();
  
  // Inner dot
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#00d4ff';
  ctx.fill();

  // Current price label - attached to the dot
  drawPriceLabel(ctx, btcPrice, lastY, 'current', width, padding);
}

function drawPriceLabel(ctx, price, y, type, canvasWidth, padding) {
  const x = canvasWidth - padding.right + 8;
  const labelWidth = 80;
  const labelHeight = 24;
  
  // Clamp y to keep label visible
  const clampedY = Math.max(labelHeight / 2, Math.min(y, ctx.canvas.height - labelHeight / 2));
  
  // Background
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
  
  // Draw connecting line for current price
  if (type === 'current') {
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(canvasWidth - padding.right, y);
    ctx.lineTo(x, clampedY);
    ctx.stroke();
  }
  
  // Draw label background
  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, clampedY - labelHeight / 2, labelWidth, labelHeight, 4);
  ctx.fill();
  
  // Draw border
  ctx.strokeStyle = textColor;
  ctx.lineWidth = 1;
  ctx.stroke();
  
  // Draw text
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

function updateLastUpdated() {
  const now = new Date();
  elements.lastUpdated.textContent = `Updated ${now.toLocaleTimeString()}`;
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
  if (levelsData) updateChart(levelsData);
});
