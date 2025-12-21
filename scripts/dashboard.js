/**
 * HedgeIQ Dashboard - Complete with Chart Rendering
 */

// ========== AUTHENTICATION ==========
let currentUser = null;
let userTier = 'free';

async function initAuth() {
    const session = await window.requireAuth();
    if (!session) return;
   
    currentUser = await window.getCurrentUser();
    userTier = window.getUserTier(currentUser);
   
    // Update user display in sidebar - USE EMAIL
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const userPlanEl = document.getElementById('userPlan');
    const settingsEmailEl = document.getElementById('settingsEmail');
    
    if (currentUser && currentUser.email) {
        // Show email as name
        if (userNameEl) {
            userNameEl.textContent = currentUser.email;
        }
        // Avatar = first letter of email
        if (userAvatarEl) {
            userAvatarEl.textContent = currentUser.email.charAt(0).toUpperCase();
        }
        // Settings email
        if (settingsEmailEl) {
            settingsEmailEl.textContent = currentUser.email;
        }
    }
    
    // Update tier display
    if (userPlanEl) {
        userPlanEl.textContent = userTier.charAt(0).toUpperCase() + userTier.slice(1) + ' Plan';
    }
    
    const settingsTierBadge = document.getElementById('settingsTierBadge');
    if (settingsTierBadge) {
        settingsTierBadge.textContent = userTier.toUpperCase() + ' PLAN';
        settingsTierBadge.className = 'tier-badge-large ' + userTier;
    }
   
    console.log('User authenticated:', currentUser.email, '| Tier:', userTier);
}

// ========== CONFIGURATION ==========
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
  
  // GEX Analysis elements
  elements.zeroGammaStrike = document.getElementById('zeroGammaStrike');
  elements.gexConcentration = document.getElementById('gexConcentration');
  elements.gexConcentrationFill = document.getElementById('gexConcentrationFill');
  elements.marketStatus = document.getElementById('marketStatus');
  elements.marketStatusDesc = document.getElementById('marketStatusDesc');
  elements.dealerGexInsight = document.getElementById('dealerGexInsight');
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

  if (elements.advancedModeToggle) {
    elements.advancedModeToggle.addEventListener('change', (e) => {
      isAdvancedMode = e.target.checked;
      toggleAdvancedMode();
    });
  }

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

// ========== DATA LOADING ==========
async function loadDashboardData() {
  if (isLoading) return;
 
  isLoading = true;
 
  const loadingTimeout = setTimeout(() => {
    showLoading(true);
  }, 500);

  try {
    const response = await window.fetchWithAuth(API_BASE_URL + '/dashboard');
   
    clearTimeout(loadingTimeout);

    if (!response.ok) {
      throw new Error('API returned ' + response.status);
    }

    const data = await response.json();
    dashboardData = data;

    fetchPriceHistory();

    if (elements.tierBadge) {
      elements.tierBadge.textContent = data.tier.toUpperCase();
      elements.tierBadge.className = 'tier-badge ' + data.tier;
    }
    if (elements.refreshRate) {
      elements.refreshRate.textContent = 'Updates every ' + data.refresh_rate;
    }

    updateRegimeBanner(data);
    updateMetrics(data);
    updateGexAnalysisSection(data);
   
    if (isAdvancedMode) {
      updateAdvancedTable(data);
    } else {
      updateLevelsTable(data);
    }
   
    // Render ALL charts
    updateChart(data);
    renderDealerGexChart(data);
    renderGammaProfileChart(data);
    renderVannaHeatmap(data);
    renderCharmCurve(data);
    renderSpotVolChart(data);
    
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

// ========== GEX ANALYSIS SECTION UPDATE ==========
function updateGexAnalysisSection(data) {
  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  const netGex = data.metrics.net_gex;
  
  // Calculate Zero Gamma Strike (where GEX flips from positive to negative)
  const sortedByStrike = [...signals].sort((a, b) => a.strike - b.strike);
  let zeroGammaStrike = btcPrice; // Default to current price
  
  // Find where GEX changes sign near current price
  for (let i = 0; i < sortedByStrike.length - 1; i++) {
    const current = sortedByStrike[i];
    const next = sortedByStrike[i + 1];
    if (current.gex > 0 && next.gex < 0 && current.strike <= btcPrice && next.strike >= btcPrice) {
      // Interpolate
      zeroGammaStrike = (current.strike + next.strike) / 2;
      break;
    }
  }
  
  // If no clear flip found, use the closest strike to current price
  if (zeroGammaStrike === btcPrice && sortedByStrike.length > 0) {
    const closest = sortedByStrike.reduce((prev, curr) => 
      Math.abs(curr.strike - btcPrice) < Math.abs(prev.strike - btcPrice) ? curr : prev
    );
    zeroGammaStrike = closest.strike;
  }
  
  if (elements.zeroGammaStrike) {
    elements.zeroGammaStrike.textContent = '$' + Math.round(zeroGammaStrike).toLocaleString();
  }
  
  // Calculate GEX Concentration at Spot
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
  
  // Market Status
  if (elements.marketStatus) {
    if (concentration > 40) {
      elements.marketStatus.textContent = 'PINNED';
      elements.marketStatus.style.color = '#a855f7';
      if (elements.marketStatusDesc) {
        elements.marketStatusDesc.textContent = 'High concentration indicates limited movement until OpEx';
      }
    } else if (concentration > 20) {
      elements.marketStatus.textContent = 'CONTAINED';
      elements.marketStatus.style.color = '#00d4ff';
      if (elements.marketStatusDesc) {
        elements.marketStatusDesc.textContent = 'Moderate GEX concentration — expect some range-bound action';
      }
    } else {
      elements.marketStatus.textContent = 'FREE';
      elements.marketStatus.style.color = '#10b981';
      if (elements.marketStatusDesc) {
        elements.marketStatusDesc.textContent = 'Low concentration — price can move more freely';
      }
    }
  }
  
  // Dealer GEX Insight
  if (elements.dealerGexInsight) {
    const supportLevels = signals.filter(s => s.type === 'support').map(s => s.strike);
    const resistanceLevels = signals.filter(s => s.type === 'resistance').map(s => s.strike);
    
    const nearestSupport = supportLevels.filter(s => s < btcPrice).sort((a, b) => b - a)[0];
    const nearestResistance = resistanceLevels.filter(s => s > btcPrice).sort((a, b) => a - b)[0];
    
    let insight = '';
    if (nearestSupport && nearestResistance) {
      insight = `Price below $${(nearestSupport/1000).toFixed(0)}K = amplified selloff. Above $${(nearestResistance/1000).toFixed(0)}K = breakout fuel.`;
    } else if (netGex > 0) {
      insight = 'Positive gamma environment — dealers will suppress volatility.';
    } else {
      insight = 'Negative gamma environment — dealers will amplify moves.';
    }
    elements.dealerGexInsight.textContent = insight;
  }
}

// ========== REGIME BANNER ==========
function updateRegimeBanner(data) {
  const netGex = data.metrics.net_gex;
  const isPositiveGamma = netGex >= 0;
 
  elements.regimeBanner.className = 'regime-banner ' + (isPositiveGamma ? 'positive' : 'negative');
  elements.regimeValue.textContent = isPositiveGamma ? 'Positive Gamma' : 'Negative Gamma';
  elements.regimeValue.className = 'regime-value ' + (isPositiveGamma ? 'positive' : 'negative');
  elements.regimeDescription.textContent = isPositiveGamma
    ? 'Dealers will buy dips and sell rips — expect mean reversion and lower volatility'
    : 'Dealers will amplify moves — expect trend continuation and higher volatility';
}

// ========== METRICS ==========
function updateMetrics(data) {
  const m = data.metrics;
  const btcPrice = data.btc_price;
 
  const gexPositive = m.net_gex >= 0;
  elements.netGexValue.textContent = gexPositive ? 'Positive' : 'Negative';
  elements.netGexValue.className = 'metric-value ' + (gexPositive ? 'positive' : 'negative');
  elements.netGexDesc.textContent = gexPositive ? 'Supportive environment' : 'Volatile environment';

  const vannaPositive = m.net_vanna >= 0;
  elements.netVannaValue.textContent = vannaPositive ? 'Positive' : 'Negative';
  elements.netVannaValue.className = 'metric-value ' + (vannaPositive ? 'positive' : 'negative');
  elements.netVannaDesc.textContent = vannaPositive ? 'IV rise = bullish' : 'IV rise = bearish';

  const charmPositive = m.net_charm >= 0;
  elements.netCharmValue.textContent = charmPositive ? 'Positive' : 'Negative';
  elements.netCharmValue.className = 'metric-value ' + (charmPositive ? 'positive' : 'negative');
  elements.netCharmDesc.textContent = charmPositive ? 'Time decay bullish' : 'Time decay bearish';

  if (elements.maxPainValue && m.max_pain) {
    elements.maxPainValue.textContent = '$' + m.max_pain.toLocaleString();
    elements.maxPainValue.className = 'metric-value neutral';
    const distance = ((m.max_pain - btcPrice) / btcPrice * 100).toFixed(1);
    elements.maxPainDesc.textContent = distance > 0 ? `${distance}% above spot` : `${Math.abs(distance)}% below spot`;
  }
}

// ========== TABLES ==========
function updateLevelsTable(data) {
  const signals = data.signals;
 
  if (!signals || signals.length === 0) {
    elements.levelsTableBody.innerHTML = '<div class="loading-row"><span>No signals found</span></div>';
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => b.gex_score - a.gex_score);

  const rows = sortedSignals.map(signal => {
    const typeClass = signal.type.toLowerCase();
    const signalInfo = getSignalInfo(signal);
    const confluences = getConfluenceBadges(signal);
    const strengthHtml = getStrengthIndicator(signal.gex_score);

    return '<div class="level-row">' +
      '<span class="level-price">$' + signal.strike.toLocaleString() + '</span>' +
      '<span class="level-type ' + typeClass + '">' + signal.type.toUpperCase() + '</span>' +
      '<span class="level-confluence">' + confluences + '</span>' +
      '<span class="level-signal ' + signalInfo.class + '">' + signalInfo.text + '</span>' +
      '<span class="strength-indicator">' + strengthHtml + '</span>' +
      '</div>';
  }).join('');

  elements.levelsTableBody.innerHTML = rows;
}

function getConfluenceBadges(signal) {
  const badges = ['GEX'];
 
  if (Math.abs(signal.vanna) > 100) badges.push('Vanna');
  if (Math.abs(signal.charm) > 10) badges.push('Charm');
  if (signal.open_interest > 1000) badges.push('OI');
  if (signal.volume > 100) badges.push('Vol');

  return badges.map(b => '<span class="conf-badge active">' + b + '</span>').join('');
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
    dots += '<div class="strength-dot ' + filled + ' ' + high + '"></div>';
  }
 
  const labels = ['Low', 'Low', 'Medium', 'High', 'Very High'];
  const labelIndex = Math.min(Math.floor(score), 4);
 
  return '<div class="strength-bar">' + dots + '</div>' +
    '<span class="strength-label">' + labels[labelIndex] + '</span>';
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
    const vannaClass = signal.vanna >= 0 ? 'positive' : 'negative';
    const charmClass = signal.charm >= 0 ? 'positive' : 'negative';

    return '<div class="level-row advanced">' +
      '<span class="level-price">$' + signal.strike.toLocaleString() + '</span>' +
      '<span class="level-type ' + typeClass + '">' + signal.type.toUpperCase() + '</span>' +
      '<span class="data-cell ' + gexClass + '">' + formatCompact(signal.gex) + '</span>' +
      '<span class="data-cell ' + vannaClass + '">' + formatCompact(signal.vanna) + '</span>' +
      '<span class="data-cell ' + charmClass + '">' + formatCompact(signal.charm) + '</span>' +
      '<span class="data-cell neutral">' + formatCompact(signal.open_interest) + '</span>' +
      '<span class="data-cell neutral">' + formatCompact(signal.volume) + '</span>' +
      '<span class="data-cell neutral">' + signal.gex_score.toFixed(1) + '</span>' +
      '</div>';
  }).join('');

  elements.advancedTableBody.innerHTML = rows;
}

// ========== CHART RENDERING ==========

// Main Price Chart
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

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Resistance levels
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

  // Support levels
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

  // Price line gradient fill
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

  // Price line
  ctx.beginPath();
  ctx.moveTo(indexToX(0), priceToY(prices[0]));
  for (let i = 1; i < prices.length; i++) {
    ctx.lineTo(indexToX(i), priceToY(prices[i]));
  }
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Current price dot
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

// Dealer GEX Bar Chart (like homepage)
function renderDealerGexChart(data) {
  const canvas = document.getElementById('dealerGexChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 40, right: 20, bottom: 50, left: 20 };

  ctx.clearRect(0, 0, width, height);

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  
  // Sort by strike and take relevant strikes near current price
  const sortedSignals = [...signals]
    .sort((a, b) => a.strike - b.strike)
    .filter(s => Math.abs(s.strike - btcPrice) / btcPrice < 0.15)
    .slice(0, 7);

  if (sortedSignals.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No GEX data available', width / 2, height / 2);
    return;
  }

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxAbsGex = Math.max(...sortedSignals.map(s => Math.abs(s.gex)));
  const barWidth = chartWidth / sortedSignals.length * 0.7;
  const barGap = chartWidth / sortedSignals.length * 0.3;

  // Find current price bar index
  let currentPriceIndex = -1;
  let minDist = Infinity;
  sortedSignals.forEach((s, i) => {
    const dist = Math.abs(s.strike - btcPrice);
    if (dist < minDist) {
      minDist = dist;
      currentPriceIndex = i;
    }
  });

  sortedSignals.forEach((signal, i) => {
    const x = padding.left + i * (barWidth + barGap) + barGap / 2;
    const barHeight = Math.abs(signal.gex) / maxAbsGex * (chartHeight / 2 - 20);
    const isPositive = signal.gex >= 0;
    const centerY = padding.top + chartHeight / 2;
    
    // Bar
    const barY = isPositive ? centerY - barHeight : centerY;
    
    // Colors
    if (isPositive) {
      ctx.fillStyle = '#10b981';
    } else {
      ctx.fillStyle = '#ef4444';
    }
    
    // Draw bar with rounded top
    ctx.beginPath();
    ctx.roundRect(x, barY, barWidth, barHeight, [4, 4, 0, 0]);
    ctx.fill();
    
    // "CURRENT" label
    if (i === currentPriceIndex) {
      ctx.fillStyle = '#00d4ff';
      ctx.font = '600 10px DM Sans';
      ctx.textAlign = 'center';
      ctx.fillText('CURRENT', x + barWidth / 2, isPositive ? barY - 25 : barY + barHeight + 35);
    }
    
    // GEX value on bar
    ctx.fillStyle = '#fff';
    ctx.font = '600 11px DM Sans';
    ctx.textAlign = 'center';
    const valueY = isPositive ? barY - 8 : barY + barHeight + 15;
    const formattedValue = formatCompact(signal.gex);
    ctx.fillText(formattedValue, x + barWidth / 2, valueY);
    
    // Strike label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '500 11px DM Sans';
    ctx.fillText('$' + (signal.strike / 1000).toFixed(0) + 'K', x + barWidth / 2, height - 15);
  });

  // Center line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartHeight / 2);
  ctx.lineTo(width - padding.right, padding.top + chartHeight / 2);
  ctx.stroke();
}

// Gamma Profile Chart
function renderGammaProfileChart(data) {
  const canvas = document.getElementById('gammaProfileChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 40, right: 60, bottom: 50, left: 60 };

  ctx.clearRect(0, 0, width, height);

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  
  if (signals.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No gamma data available', width / 2, height / 2);
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => a.strike - b.strike);
  
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const strikes = sortedSignals.map(s => s.strike);
  const gexValues = sortedSignals.map(s => s.gex);
  
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const maxAbsGex = Math.max(...gexValues.map(g => Math.abs(g)));
  
  const strikeToX = (strike) => padding.left + ((strike - minStrike) / (maxStrike - minStrike)) * chartWidth;
  const gexToY = (gex) => padding.top + chartHeight / 2 - (gex / maxAbsGex) * (chartHeight / 2 - 10);

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Zero line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartHeight / 2);
  ctx.lineTo(width - padding.right, padding.top + chartHeight / 2);
  ctx.stroke();

  // Current price line
  const priceX = strikeToX(btcPrice);
  ctx.strokeStyle = '#00d4ff';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(priceX, padding.top);
  ctx.lineTo(priceX, height - padding.bottom);
  ctx.stroke();
  ctx.setLineDash([]);
  
  ctx.fillStyle = '#00d4ff';
  ctx.font = '600 11px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText('SPOT', priceX, padding.top - 10);

  // Gamma profile area (positive)
  ctx.beginPath();
  ctx.moveTo(strikeToX(sortedSignals[0].strike), padding.top + chartHeight / 2);
  sortedSignals.forEach(s => {
    if (s.gex >= 0) {
      ctx.lineTo(strikeToX(s.strike), gexToY(s.gex));
    } else {
      ctx.lineTo(strikeToX(s.strike), padding.top + chartHeight / 2);
    }
  });
  ctx.lineTo(strikeToX(sortedSignals[sortedSignals.length - 1].strike), padding.top + chartHeight / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 185, 129, 0.3)';
  ctx.fill();

  // Gamma profile area (negative)
  ctx.beginPath();
  ctx.moveTo(strikeToX(sortedSignals[0].strike), padding.top + chartHeight / 2);
  sortedSignals.forEach(s => {
    if (s.gex < 0) {
      ctx.lineTo(strikeToX(s.strike), gexToY(s.gex));
    } else {
      ctx.lineTo(strikeToX(s.strike), padding.top + chartHeight / 2);
    }
  });
  ctx.lineTo(strikeToX(sortedSignals[sortedSignals.length - 1].strike), padding.top + chartHeight / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
  ctx.fill();

  // Profile line
  ctx.beginPath();
  ctx.moveTo(strikeToX(sortedSignals[0].strike), gexToY(sortedSignals[0].gex));
  sortedSignals.forEach(s => {
    ctx.lineTo(strikeToX(s.strike), gexToY(s.gex));
  });
  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '11px DM Sans';
  ctx.textAlign = 'center';
  
  // X-axis labels
  const labelCount = Math.min(5, sortedSignals.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (sortedSignals.length - 1) / (labelCount - 1));
    const s = sortedSignals[idx];
    ctx.fillText('$' + (s.strike / 1000).toFixed(0) + 'K', strikeToX(s.strike), height - 15);
  }

  // Y-axis labels
  ctx.textAlign = 'right';
  ctx.fillText('+' + formatCompact(maxAbsGex), padding.left - 10, padding.top + 15);
  ctx.fillText('0', padding.left - 10, padding.top + chartHeight / 2 + 4);
  ctx.fillText('-' + formatCompact(maxAbsGex), padding.left - 10, height - padding.bottom - 5);

  // Legend
  ctx.font = '600 11px DM Sans';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#10b981';
  ctx.fillRect(width - padding.right - 120, padding.top, 10, 10);
  ctx.fillText('Call Wall (Support)', width - padding.right - 105, padding.top + 9);
  
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(width - padding.right - 120, padding.top + 20, 10, 10);
  ctx.fillText('Put Wall (Resistance)', width - padding.right - 105, padding.top + 29);
}

// Vanna Heatmap
function renderVannaHeatmap(data) {
  const canvas = document.getElementById('vannaHeatmap');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 40, right: 80, bottom: 50, left: 60 };

  ctx.clearRect(0, 0, width, height);

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  
  if (signals.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No vanna data available', width / 2, height / 2);
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => a.strike - b.strike);
  
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const maxAbsVanna = Math.max(...sortedSignals.map(s => Math.abs(s.vanna)));
  const barHeight = chartHeight / sortedSignals.length * 0.8;

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '600 12px DM Sans';
  ctx.textAlign = 'left';
  ctx.fillText('Vanna Exposure by Strike — IV Sensitivity', padding.left, 20);

  sortedSignals.forEach((signal, i) => {
    const y = padding.top + i * (chartHeight / sortedSignals.length);
    const barWidth = Math.abs(signal.vanna) / maxAbsVanna * (chartWidth - 100);
    const isPositive = signal.vanna >= 0;
    
    // Background bar
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.fillRect(padding.left, y, chartWidth - 100, barHeight);
    
    // Value bar with gradient
    const gradient = ctx.createLinearGradient(padding.left, 0, padding.left + barWidth, 0);
    if (isPositive) {
      gradient.addColorStop(0, 'rgba(168, 85, 247, 0.3)');
      gradient.addColorStop(1, 'rgba(168, 85, 247, 0.8)');
    } else {
      gradient.addColorStop(0, 'rgba(236, 72, 153, 0.3)');
      gradient.addColorStop(1, 'rgba(236, 72, 153, 0.8)');
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(padding.left, y, barWidth, barHeight);
    
    // Strike label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '500 11px DM Sans';
    ctx.textAlign = 'right';
    ctx.fillText('$' + (signal.strike / 1000).toFixed(0) + 'K', padding.left - 10, y + barHeight / 2 + 4);
    
    // Value label
    ctx.textAlign = 'left';
    ctx.fillText(formatCompact(signal.vanna), padding.left + barWidth + 8, y + barHeight / 2 + 4);
    
    // Highlight current price level
    if (Math.abs(signal.strike - btcPrice) / btcPrice < 0.02) {
      ctx.strokeStyle = '#00d4ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(padding.left - 2, y - 2, chartWidth - 96, barHeight + 4);
      
      ctx.fillStyle = '#00d4ff';
      ctx.font = '600 10px DM Sans';
      ctx.textAlign = 'left';
      ctx.fillText('← SPOT', width - padding.right + 5, y + barHeight / 2 + 4);
    }
  });

  // Color legend
  ctx.font = '500 10px DM Sans';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#a855f7';
  ctx.fillText('Positive: IV↑ = Bullish', width - padding.right, height - 25);
  ctx.fillStyle = '#ec4899';
  ctx.fillText('Negative: IV↑ = Bearish', width - padding.right, height - 10);
}

// Charm Decay Curve
function renderCharmCurve(data) {
  const canvas = document.getElementById('charmCurveChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 40, right: 60, bottom: 50, left: 60 };

  ctx.clearRect(0, 0, width, height);

  const signals = data.signals || [];
  
  if (signals.length === 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px DM Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No charm data available', width / 2, height / 2);
    return;
  }

  const sortedSignals = [...signals].sort((a, b) => a.strike - b.strike);
  
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const strikes = sortedSignals.map(s => s.strike);
  const charmValues = sortedSignals.map(s => s.charm);
  
  const minStrike = Math.min(...strikes);
  const maxStrike = Math.max(...strikes);
  const maxAbsCharm = Math.max(...charmValues.map(c => Math.abs(c)));
  
  const strikeToX = (strike) => padding.left + ((strike - minStrike) / (maxStrike - minStrike)) * chartWidth;
  const charmToY = (charm) => padding.top + chartHeight / 2 - (charm / maxAbsCharm) * (chartHeight / 2 - 10);

  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '600 12px DM Sans';
  ctx.textAlign = 'left';
  ctx.fillText('Charm (Delta Decay) — Time Flow Impact', padding.left, 20);

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (i / 4) * chartHeight;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  // Zero line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartHeight / 2);
  ctx.lineTo(width - padding.right, padding.top + chartHeight / 2);
  ctx.stroke();

  // Charm area fill
  ctx.beginPath();
  ctx.moveTo(strikeToX(sortedSignals[0].strike), padding.top + chartHeight / 2);
  sortedSignals.forEach(s => {
    ctx.lineTo(strikeToX(s.strike), charmToY(s.charm));
  });
  ctx.lineTo(strikeToX(sortedSignals[sortedSignals.length - 1].strike), padding.top + chartHeight / 2);
  ctx.closePath();
  
  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, 'rgba(236, 72, 153, 0.4)');
  gradient.addColorStop(0.5, 'rgba(236, 72, 153, 0)');
  gradient.addColorStop(0.5, 'rgba(251, 191, 36, 0)');
  gradient.addColorStop(1, 'rgba(251, 191, 36, 0.4)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // Charm line
  ctx.beginPath();
  ctx.moveTo(strikeToX(sortedSignals[0].strike), charmToY(sortedSignals[0].charm));
  sortedSignals.forEach(s => {
    ctx.lineTo(strikeToX(s.strike), charmToY(s.charm));
  });
  ctx.strokeStyle = '#ec4899';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Data points
  sortedSignals.forEach(s => {
    ctx.beginPath();
    ctx.arc(strikeToX(s.strike), charmToY(s.charm), 4, 0, Math.PI * 2);
    ctx.fillStyle = s.charm >= 0 ? '#ec4899' : '#fbbf24';
    ctx.fill();
  });

  // X-axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '11px DM Sans';
  ctx.textAlign = 'center';
  const labelCount = Math.min(5, sortedSignals.length);
  for (let i = 0; i < labelCount; i++) {
    const idx = Math.floor(i * (sortedSignals.length - 1) / (labelCount - 1));
    const s = sortedSignals[idx];
    ctx.fillText('$' + (s.strike / 1000).toFixed(0) + 'K', strikeToX(s.strike), height - 15);
  }

  // Y-axis labels
  ctx.textAlign = 'right';
  ctx.fillText('Buy Pressure', padding.left - 10, padding.top + 15);
  ctx.fillText('Sell Pressure', padding.left - 10, height - padding.bottom - 5);
}

// Spot-Volatility Correlation
function renderSpotVolChart(data) {
  const canvas = document.getElementById('spotVolChart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const container = canvas.parentElement;
  
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;

  const width = canvas.width;
  const height = canvas.height;
  const padding = { top: 40, right: 60, bottom: 50, left: 60 };

  ctx.clearRect(0, 0, width, height);

  const signals = data.signals || [];
  const btcPrice = data.btc_price;
  const netVanna = data.metrics.net_vanna;
  
  // Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '600 12px DM Sans';
  ctx.textAlign = 'left';
  ctx.fillText('Spot-Volatility Correlation — Market Regime', padding.left, 20);

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const centerX = padding.left + chartWidth / 2;
  const centerY = padding.top + chartHeight / 2;

  // Draw quadrant grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  
  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(padding.left, centerY);
  ctx.lineTo(width - padding.right, centerY);
  ctx.stroke();
  
  // Vertical line
  ctx.beginPath();
  ctx.moveTo(centerX, padding.top);
  ctx.lineTo(centerX, height - padding.bottom);
  ctx.stroke();

  // Quadrant labels
  ctx.font = '600 11px DM Sans';
  ctx.textAlign = 'center';
  
  // Top-right: IV up, Spot up (positive correlation)
  ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
  ctx.fillText('IV↑ Spot↑', centerX + chartWidth / 4, padding.top + 20);
  ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
  ctx.fillRect(centerX, padding.top, chartWidth / 2, chartHeight / 2);
  
  // Top-left: IV up, Spot down (negative correlation)
  ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
  ctx.fillText('IV↑ Spot↓', padding.left + chartWidth / 4, padding.top + 20);
  ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
  ctx.fillRect(padding.left, padding.top, chartWidth / 2, chartHeight / 2);
  
  // Bottom-right: IV down, Spot up
  ctx.fillStyle = 'rgba(251, 191, 36, 0.8)';
  ctx.fillText('IV↓ Spot↑', centerX + chartWidth / 4, height - padding.bottom - 10);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
  ctx.fillRect(centerX, centerY, chartWidth / 2, chartHeight / 2);
  
  // Bottom-left: IV down, Spot down
  ctx.fillStyle = 'rgba(168, 85, 247, 0.8)';
  ctx.fillText('IV↓ Spot↓', padding.left + chartWidth / 4, height - padding.bottom - 10);
  ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
  ctx.fillRect(padding.left, centerY, chartWidth / 2, chartHeight / 2);

  // Current regime indicator based on Vanna
  const regime = netVanna >= 0 ? 'positive' : 'negative';
  const indicatorX = netVanna >= 0 ? centerX + chartWidth / 4 : padding.left + chartWidth / 4;
  const indicatorY = centerY - 20;
  
  ctx.beginPath();
  ctx.arc(indicatorX, indicatorY, 30, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 212, 255, 0.3)';
  ctx.fill();
  ctx.strokeStyle = '#00d4ff';
  ctx.lineWidth = 3;
  ctx.stroke();
  
  ctx.fillStyle = '#00d4ff';
  ctx.font = '700 12px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText('NOW', indicatorX, indicatorY + 5);

  // Axis labels
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = '500 10px DM Sans';
  ctx.textAlign = 'center';
  ctx.fillText('← IV Decrease                    IV Increase →', centerX, height - 10);
  
  ctx.save();
  ctx.translate(15, centerY);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Spot Decrease ←                    → Spot Increase', 0, 0);
  ctx.restore();

  // Regime description
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.font = '500 11px DM Sans';
  ctx.textAlign = 'left';
  const regimeText = netVanna >= 0 
    ? 'Current: Rising IV pushes price UP (positive vanna)' 
    : 'Current: Rising IV pushes price DOWN (negative vanna)';
  ctx.fillText(regimeText, padding.left, height - 30);
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
  ctx.fillText('$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 }), x + labelWidth / 2, clampedY);
}

// ========== UTILITIES ==========
function formatCompact(num) {
  const abs = Math.abs(num);
  const sign = num >= 0 ? '+' : '-';
 
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1) + 'B';
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1) + 'M';
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1) + 'K';
  if (abs >= 1) return sign + abs.toFixed(0);
  return sign + abs.toFixed(2);
}

function updateLastUpdated(timestamp) {
  if (timestamp) {
    const date = new Date(timestamp);
    elements.lastUpdated.textContent = 'Updated ' + date.toLocaleTimeString();
  } else {
    elements.lastUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();
  }
}

function startCountdown() {
  countdownTimer = setInterval(() => {
    secondsUntilUpdate--;
    if (secondsUntilUpdate <= 0) {
      elements.nextUpdate.textContent = 'Updating...';
    } else {
      elements.nextUpdate.textContent = 'Next update in: ' + secondsUntilUpdate + 's';
    }
  }, 1000);
}

function resetCountdown() {
  secondsUntilUpdate = 60;
  elements.nextUpdate.textContent = 'Next update in: ' + secondsUntilUpdate + 's';
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
  if (dashboardData) {
    updateChart(dashboardData);
    renderDealerGexChart(dashboardData);
    renderGammaProfileChart(dashboardData);
    renderVannaHeatmap(dashboardData);
    renderCharmCurve(dashboardData);
    renderSpotVolChart(dashboardData);
  }
});