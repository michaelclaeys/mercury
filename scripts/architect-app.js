/* ================================================================
   MERCURY ARCHITECT APP — Bot Builder Dashboard
   Node editor, bot management, backtesting, templates
   ================================================================ */

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
      userTier = typeof window.getUserTier === 'function' ? window.getUserTier() : 'free';
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
  if (planEl) planEl.textContent = userTier + ' plan';
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
// NODE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════
const NODE_TYPES = {
  // TRIGGERS
  'price-threshold': {
    category: 'trigger', label: 'Price Threshold', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'market', type: 'select', label: 'Market', options: ['Any', 'Polymarket', 'Kalshi'], default: 'Any' },
      { key: 'contract', type: 'text', label: 'Contract', default: '' },
      { key: 'direction', type: 'select', label: 'Direction', options: ['Crosses Above', 'Crosses Below'], default: 'Crosses Above' },
      { key: 'threshold', type: 'number', label: 'Threshold (cents)', default: 50, min: 1, max: 99 },
    ],
  },
  'volume-spike': {
    category: 'trigger', label: 'Volume Spike', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'multiplier', type: 'number', label: 'Spike Multiplier', default: 3, min: 1.5, max: 20 },
      { key: 'window', type: 'select', label: 'Window', options: ['1hr', '4hr', '24hr'], default: '1hr' },
      { key: 'market', type: 'select', label: 'Market', options: ['Any', 'Polymarket', 'Kalshi'], default: 'Any' },
    ],
  },
  'time-based': {
    category: 'trigger', label: 'Time-Based', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'schedule', type: 'select', label: 'Schedule', options: ['Every 1hr', 'Every 4hr', 'Every 12hr', 'Daily 9AM', 'Daily 5PM'], default: 'Every 4hr' },
      { key: 'timezone', type: 'select', label: 'Timezone', options: ['UTC', 'ET', 'PT'], default: 'ET' },
    ],
  },
  'market-event': {
    category: 'trigger', label: 'Market Event', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'event', type: 'select', label: 'Event Type', options: ['New Listing', 'Resolution', 'Volume Surge', 'Price Alert'], default: 'Resolution' },
      { key: 'lead', type: 'select', label: 'Lead Time', options: ['Immediate', '1hr Before', '24hr Before', '48hr Before'], default: '24hr Before' },
    ],
  },
  'probability-cross': {
    category: 'trigger', label: 'Probability Cross', color: '#00c853',
    inputs: [],
    outputs: [{ id: 'out', label: 'Signal' }],
    properties: [
      { key: 'direction', type: 'select', label: 'Direction', options: ['Crosses Above', 'Crosses Below'], default: 'Crosses Above' },
      { key: 'level', type: 'number', label: 'Level (cents)', default: 60, min: 1, max: 99 },
      { key: 'contract', type: 'text', label: 'Contract', default: '' },
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
      { key: 'minLiquidity', type: 'number', label: 'Min Liquidity ($)', default: 50000, min: 1000 },
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

  // EXECUTION
  'market-order': {
    category: 'execution', label: 'Market Order', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Filled' }],
    properties: [
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'amount', type: 'number', label: 'Amount ($)', default: 100, min: 1 },
      { key: 'platform', type: 'select', label: 'Platform', options: ['Auto', 'Polymarket', 'Kalshi'], default: 'Auto' },
    ],
  },
  'limit-order': {
    category: 'execution', label: 'Limit Order', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Filled' }],
    properties: [
      { key: 'side', type: 'select', label: 'Side', options: ['Buy YES', 'Buy NO', 'Sell YES', 'Sell NO'], default: 'Buy YES' },
      { key: 'limitPrice', type: 'number', label: 'Limit Price (cents)', default: 55, min: 1, max: 99 },
      { key: 'amount', type: 'number', label: 'Amount ($)', default: 100, min: 1 },
      { key: 'expiry', type: 'select', label: 'Expiry', options: ['GTC', '1hr', '4hr', '24hr'], default: 'GTC' },
    ],
  },
  'scaled-entry': {
    category: 'execution', label: 'Scaled Entry', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Complete' }],
    properties: [
      { key: 'totalAmount', type: 'number', label: 'Total Amount ($)', default: 500, min: 10 },
      { key: 'tranches', type: 'number', label: 'Tranches', default: 5, min: 2, max: 20 },
      { key: 'priceRange', type: 'number', label: 'Price Range (cents)', default: 10, min: 1, max: 50 },
    ],
  },
  'dca': {
    category: 'execution', label: 'DCA', color: '#e8e8e8',
    inputs: [{ id: 'in', label: 'Trigger' }],
    outputs: [{ id: 'out', label: 'Executed' }],
    properties: [
      { key: 'amountPer', type: 'number', label: 'Amount Per Buy ($)', default: 50, min: 1 },
      { key: 'interval', type: 'select', label: 'Interval', options: ['Every 1hr', 'Every 4hr', 'Every 12hr', 'Daily'], default: 'Every 4hr' },
      { key: 'maxBuys', type: 'number', label: 'Max Buys', default: 10, min: 1, max: 100 },
    ],
  },

  // RISK
  'stop-loss': {
    category: 'risk', label: 'Stop Loss', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Position' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'type', type: 'select', label: 'Type', options: ['Percentage', 'Fixed Amount', 'Probability Level'], default: 'Percentage' },
      { key: 'value', type: 'number', label: 'Value', default: 15 },
    ],
  },
  'position-limit': {
    category: 'risk', label: 'Position Limit', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'OK' }, { id: 'fail', label: 'Blocked' }],
    properties: [
      { key: 'maxPositions', type: 'number', label: 'Max Positions', default: 5, min: 1, max: 50 },
      { key: 'maxPerContract', type: 'number', label: 'Max Per Contract ($)', default: 500, min: 10 },
    ],
  },
  'portfolio-cap': {
    category: 'risk', label: 'Portfolio Cap', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Check' }],
    outputs: [{ id: 'pass', label: 'OK' }, { id: 'fail', label: 'Blocked' }],
    properties: [
      { key: 'maxCapital', type: 'number', label: 'Max Capital ($)', default: 5000, min: 100 },
      { key: 'action', type: 'select', label: 'On Limit', options: ['Block New Trades', 'Close Smallest', 'Notify Only'], default: 'Block New Trades' },
    ],
  },
  'max-drawdown': {
    category: 'risk', label: 'Max Drawdown', color: '#ff1744',
    inputs: [{ id: 'in', label: 'Monitor' }],
    outputs: [{ id: 'out', label: 'Triggered' }],
    properties: [
      { key: 'maxDD', type: 'number', label: 'Max Drawdown (%)', default: 20, min: 1, max: 100 },
      { key: 'action', type: 'select', label: 'Action', options: ['Kill All Bots', 'Pause All Bots', 'Notify Only'], default: 'Pause All Bots' },
    ],
  },
};

const CATEGORY_LABELS = {
  trigger: 'TRIGGER', condition: 'CONDITION', execution: 'EXEC', risk: 'RISK',
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
  el.researchTabContent = document.getElementById('researchTabContent');
  el.tabAgent = document.getElementById('tabAgent');
  el.tabResearch = document.getElementById('tabResearch');
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
  cacheElements();
  initAuth().then(() => {
    initMockData();
    setupEventListeners();

    // Check for #research hash to deep-link into research view
    const hashView = window.location.hash.replace('#', '');
    if (hashView === 'research') {
      switchView('research');
    } else {
      switchView('builder');
    }

    // Show wizard for first-time users, otherwise load default strategy
    if (!localStorage.getItem('mercury_wizard_done')) {
      showWizard();
    } else {
      // Try restoring auto-saved strategy, fall back to default
      if (!restoreAutoSave()) {
        loadDefaultStrategy();
      }
    }

    updateMercuryScript();
    updateStatusBar();

    // Palette tooltip for first visit
    if (!localStorage.getItem('mercury_palette_seen')) {
      showPaletteTooltip();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════
function switchView(viewName, params) {
  if (logInterval) { clearInterval(logInterval); logInterval = null; }

  // Teardown research dashboard when leaving
  if (typeof teardownResearchDashboard === 'function') teardownResearchDashboard();

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
    logoSub.textContent = viewName === 'research' ? 'Research' : 'Architect';
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
    case 'research':
      if (typeof initResearchDashboard === 'function') initResearchDashboard();
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
      const name = item.querySelector('.palette-item-name').textContent.toLowerCase();
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

  // Canvas click (deselect)
  el.canvasContainer.addEventListener('click', e => {
    if (e.target === el.canvasContainer || e.target === el.canvasViewport ||
        e.target === el.connectionsLayer) {
      deselectNode();
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

  // Agent panel tabs
  if (el.tabAgent) el.tabAgent.addEventListener('click', () => switchAgentTab('agent'));
  if (el.tabResearch) el.tabResearch.addEventListener('click', () => switchAgentTab('research'));

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
  document.getElementById('connectModalClose').addEventListener('click', closeConnectModal);
  document.getElementById('connectCancel').addEventListener('click', closeConnectModal);
  document.getElementById('connectConfirm').addEventListener('click', confirmConnect);
  document.getElementById('connectAccountModal').addEventListener('click', e => {
    if (e.target.id === 'connectAccountModal') closeConnectModal();
  });

  // MercuryScript panel toggle
  document.getElementById('btnScriptToggle').addEventListener('click', toggleScriptPanel);
  document.getElementById('mercuryScriptPanel').querySelector('.mercuryscript-header').addEventListener('click', toggleScriptPanel);

  // Deploy modal
  document.getElementById('deployModalClose').addEventListener('click', closeDeployModal);
  document.getElementById('deployCancel').addEventListener('click', closeDeployModal);
  document.getElementById('deployConfirm').addEventListener('click', confirmDeploy);
  document.getElementById('deployModal').addEventListener('click', e => {
    if (e.target.id === 'deployModal') closeDeployModal();
  });

  // Bot detail
  document.getElementById('detailBack').addEventListener('click', () => switchView('my-bots'));
  document.getElementById('btnPauseBot').addEventListener('click', () => toggleBotStatus('paused'));
  document.getElementById('btnRestartBot').addEventListener('click', () => toggleBotStatus('live'));
  document.getElementById('btnKillBot').addEventListener('click', killBot);
  document.getElementById('btnEditStrategy').addEventListener('click', () => {
    switchView('builder');
    showToast('Strategy loaded into builder');
  });

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
function onCanvasMouseDown(e) {
  // Only pan on middle mouse or space+left
  if (e.button === 1 || (e.button === 0 && canvas.spaceHeld)) {
    e.preventDefault();
    canvas.isPanning = true;
    canvas.panStartX = e.clientX;
    canvas.panStartY = e.clientY;
    canvas.panStartPanX = canvas.panX;
    canvas.panStartPanY = canvas.panY;
    el.canvasContainer.classList.add('panning');
  }
}

function onCanvasMouseMove(e) {
  if (canvas.isPanning) {
    canvas.panX = canvas.panStartPanX + (e.clientX - canvas.panStartX);
    canvas.panY = canvas.panStartPanY + (e.clientY - canvas.panStartY);
    applyCanvasTransform();
    updateMercuryScript();
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
      const fromPos = getPortPosition(fromNode, connectingFrom.portId, connectingFrom.portType);
      tempConnectionLine.setAttribute('d', calcBezierPath(fromPos.x, fromPos.y, pos.x, pos.y));
    }
  }
}

function onCanvasMouseUp(e) {
  if (canvas.isPanning) {
    canvas.isPanning = false;
    el.canvasContainer.classList.remove('panning');
  }

  if (draggingNodeId) {
    const node = nodes.find(n => n.id === draggingNodeId);
    if (node && node.domElement) node.domElement.classList.remove('dragging');
    draggingNodeId = null;
    autoSaveStrategy();
  }

  if (connectingFrom) {
    if (tempConnectionLine) {
      tempConnectionLine.remove();
      tempConnectionLine = null;
    }
    connectingFrom = null;
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

// ═══════════════════════════════════════════════════════════════
// NODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
function createNode(type, x, y, propOverrides) {
  const def = NODE_TYPES[type];
  if (!def) return null;

  const id = 'node-' + (nextNodeId++);
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
    e.stopPropagation();
    selectNode(id);
  });

  // Port interactions
  div.querySelectorAll('.node-port').forEach(portEl => {
    portEl.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      const portId = portEl.dataset.port;
      const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
      startConnection(id, portId, portType);
    });

    portEl.addEventListener('mouseup', e => {
      if (connectingFrom) {
        const portId = portEl.dataset.port;
        const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
        endConnection(id, portId, portType);
      }
    });
  });

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
    const display = val !== undefined && val !== '' ? val : '--';
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

function refreshNodeDOM(node) {
  const def = NODE_TYPES[node.type];
  if (!def || !node.domElement) return;
  node.domElement.innerHTML = buildNodeHTML(node, def);

  // Re-bind port events
  node.domElement.querySelectorAll('.node-port').forEach(portEl => {
    portEl.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      const portId = portEl.dataset.port;
      const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
      startConnection(node.id, portId, portType);
    });
    portEl.addEventListener('mouseup', e => {
      if (connectingFrom) {
        const portId = portEl.dataset.port;
        const portType = portEl.classList.contains('node-port-out') ? 'output' : 'input';
        endConnection(node.id, portId, portType);
      }
    });
  });
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
      if (c.svgPath) c.svgPath.remove();
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
    // Same type — invalid
    if (tempConnectionLine) { tempConnectionLine.remove(); tempConnectionLine = null; }
    connectingFrom = null;
    return;
  }

  // No self-connection
  if (fromNodeId === toNodeId) {
    if (tempConnectionLine) { tempConnectionLine.remove(); tempConnectionLine = null; }
    connectingFrom = null;
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
  }

  if (tempConnectionLine) { tempConnectionLine.remove(); tempConnectionLine = null; }
  connectingFrom = null;
}

function addConnection(fromNodeId, fromPortId, toNodeId, toPortId) {
  const id = 'conn-' + (nextConnId++);
  const fromNode = nodes.find(n => n.id === fromNodeId);
  const category = fromNode ? NODE_TYPES[fromNode.type].category : '';

  const svgNS = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(svgNS, 'path');
  path.classList.add('connection-path');
  if (category) path.classList.add(category);
  path.id = id;
  el.connectionsLayer.appendChild(path);

  const conn = { id, fromNodeId, fromPortId, toNodeId, toPortId, svgPath: path };
  connections.push(conn);

  updateConnectionPath(conn);
  updatePortDots();
  autoSaveStrategy();
  return conn;
}

function updateConnectionPath(conn) {
  const fromNode = nodes.find(n => n.id === conn.fromNodeId);
  const toNode = nodes.find(n => n.id === conn.toNodeId);
  if (!fromNode || !toNode || !conn.svgPath) return;

  const from = getPortPosition(fromNode, conn.fromPortId, 'output');
  const to = getPortPosition(toNode, conn.toPortId, 'input');

  conn.svgPath.setAttribute('d', calcBezierPath(from.x, from.y, to.x, to.y));
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

  if (nodes.length === 0) {
    el.mercuryScriptCode.innerHTML = '<span class="ms-comment"># No nodes yet — drag nodes or ask AI to build a strategy</span>';
    return;
  }

  let script = '';
  const stratName = el.strategyName.value || 'untitled_strategy';
  script += `<span class="ms-comment"># MercuryScript — ${stratName}</span>\n`;
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
        if (p.type === 'number') return `<span class="ms-number">${val}</span>`;
        return `<span class="ms-string">"${val}"</span>`;
      }).join(', ');
      out += paramStr + '):\n';
    } else if (cat === 'condition') {
      out += `${pad}<span class="${catTag}">if</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${val}</span>`;
        return `<span class="ms-string">"${val}"</span>`;
      }).join(', ');
      out += paramStr + '):\n';
    } else if (cat === 'execution') {
      out += `${pad}<span class="${catTag}">execute</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${val}</span>`;
        return `<span class="ms-string">"${val}"</span>`;
      }).join(', ');
      out += paramStr + ')\n';
    } else if (cat === 'risk') {
      out += `${pad}<span class="${catTag}">guard</span> <span class="ms-variable">${def.label.toLowerCase().replace(/\\s+/g, '_')}</span>(`;
      const paramStr = def.properties.map(p => {
        const val = node.properties[p.key];
        if (p.type === 'number') return `<span class="ms-number">${val}</span>`;
        return `<span class="ms-string">"${val}"</span>`;
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
  const commitCount = commitHistory.length;
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
    },
  };

  return { strategy, errors };
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
  if (!strategy || !strategy.layout) {
    showToast('Invalid strategy format — missing layout data', 'error');
    return;
  }

  pushUndo();

  _suppressAutoSave = true;
  clearCanvas();

  // Rebuild nodes from layout
  strategy.layout.nodes.forEach(ns => {
    const node = createNode(ns.type, ns.x, ns.y, ns.properties);
    if (node) {
      node.id = ns.id;
      if (node.domElement) node.domElement.id = ns.id;
    }
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

function autoSaveStrategy() {
  if (_suppressAutoSave) return;
  if (nodes.length === 0) {
    localStorage.removeItem('mercury_autosave');
    return;
  }

  const state = {
    name: el.strategyName ? el.strategyName.value : 'untitled_strategy',
    nodes: nodes.map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, properties: { ...n.properties } })),
    connections: connections.map(c => ({
      fromNodeId: c.fromNodeId, fromPortId: c.fromPortId,
      toNodeId: c.toNodeId, toPortId: c.toPortId,
    })),
    nextNodeId,
    nextConnId,
    savedAt: Date.now(),
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
    if (!state.nodes || state.nodes.length === 0) return false;

    _suppressAutoSave = true;

    // Clear current canvas
    nodes.forEach(n => { if (n.domElement) n.domElement.remove(); });
    connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); });
    nodes = [];
    connections = [];

    nextNodeId = state.nextNodeId || 1;
    nextConnId = state.nextConnId || 1;

    // Recreate nodes
    state.nodes.forEach(ns => {
      createNode(ns.type, ns.x, ns.y, ns.properties);
      const node = nodes[nodes.length - 1];
      if (node) {
        node.id = ns.id;
        if (node.domElement) node.domElement.id = ns.id;
      }
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

  def.properties.forEach(p => {
    const val = node.properties[p.key];
    html += `<div class="inspector-field">`;
    html += `<label class="field-label">${p.label}</label>`;

    if (p.type === 'select') {
      html += `<select class="field-select" data-prop="${p.key}" onchange="onInspectorChange('${nodeId}','${p.key}',this.value)">`;
      p.options.forEach(opt => {
        html += `<option ${val === opt ? 'selected' : ''}>${opt}</option>`;
      });
      html += '</select>';
    } else if (p.type === 'number') {
      html += `<input class="field-input" type="number" data-prop="${p.key}" value="${val}"
        ${p.min !== undefined ? 'min="' + p.min + '"' : ''}
        ${p.max !== undefined ? 'max="' + p.max + '"' : ''}
        onchange="onInspectorChange('${nodeId}','${p.key}',this.value)">`;
    } else {
      html += `<input class="field-input" type="text" data-prop="${p.key}" value="${val || ''}"
        onchange="onInspectorChange('${nodeId}','${p.key}',this.value)">`;
    }

    html += '</div>';
  });

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
  refreshNodeDOM(node);
  autoSaveStrategy();
};

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
  connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); });
  nodes = [];
  connections = [];

  nextNodeId = state.nextNodeId;
  nextConnId = state.nextConnId;

  // Recreate nodes
  state.nodes.forEach(ns => {
    createNode(ns.type, ns.x, ns.y, ns.properties);
    // Overwrite ID
    const node = nodes[nodes.length - 1];
    if (node.domElement) node.domElement.id = ns.id;
    node.id = ns.id;
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

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
    e.preventDefault();
    pushUndo();
    deleteNode(selectedNodeId);
  }

  if (e.key === 'Escape') {
    deselectNode();
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
let commitHistory = [
  { hash: 'a1b2c3', message: 'Initial strategy', time: Date.now() }
];

function openCommitModal() {
  // Update diff display
  const diffEl = document.getElementById('commitDiff');
  diffEl.innerHTML = `<div class="commit-diff-line added">+ ${nodes.length} node${nodes.length !== 1 ? 's' : ''}</div>` +
    `<div class="commit-diff-line added">+ ${connections.length} connection${connections.length !== 1 ? 's' : ''}</div>`;

  // Update history
  const historyEl = document.getElementById('commitHistory');
  historyEl.innerHTML = commitHistory.slice(0, 5).map(c =>
    `<div class="commit-entry">
      <span class="commit-hash">${c.hash}</span>
      <span class="commit-msg">${c.message}</span>
      <span class="commit-time">${timeAgo(new Date(c.time).toISOString())}</span>
    </div>`
  ).join('');

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
  commitHistory.unshift({ hash, message: msg, time: Date.now() });

  el.toolbarStatus.textContent = 'COMMITTED';
  el.toolbarStatus.classList.add('saved');
  showToast('Committed: ' + msg);

  // Update version
  const versionEl = document.getElementById('scriptVersion');
  if (versionEl) versionEl.textContent = 'v0.' + commitHistory.length;

  closeCommitModal();
  setTimeout(() => {
    el.toolbarStatus.textContent = 'DRAFT';
    el.toolbarStatus.classList.remove('saved');
  }, 2000);
}

function openDeployModal() {
  // Validate strategy before opening deploy modal
  const errors = validateStrategy();
  if (errors.length > 0) {
    showToast(errors[0], 'error');
    console.warn('[Mercury Compiler] Validation errors:', errors);
    return;
  }

  const name = el.strategyName.value || 'untitled_strategy';
  document.getElementById('deployBotName').value = name;
  document.getElementById('deployModal').classList.add('open');
}

function closeDeployModal() {
  document.getElementById('deployModal').classList.remove('open');
}

function confirmDeploy() {
  const botName = document.getElementById('deployBotName').value || 'Unnamed Bot';
  const platform = document.getElementById('deployPlatform').value;
  const capital = document.getElementById('deployCapital').value;
  const mode = document.getElementById('deployMode').value;

  // Compile strategy
  const { strategy, errors } = compileStrategy();

  if (!strategy) {
    closeDeployModal();
    showToast(errors[0] || 'Compilation failed', 'error');
    return;
  }

  // Attach deploy config from modal
  strategy.config = {
    platform,
    capital: parseFloat(capital) || 10000,
    mode: mode || 'Paper Trading',
  };

  // Log compiled strategy to console for development
  console.log('[Mercury Compiler] Strategy compiled successfully:');
  console.log(JSON.stringify(strategy, null, 2));

  closeDeployModal();

  // Launch compiler animation
  runCompilerAnimation(botName, platform, mode, () => {
    const newBot = createMockBot(botName, 'Custom', 'live', platform, parseFloat(capital));
    // Attach compiled strategy to bot for future use
    newBot.compiledStrategy = strategy;
    bots.unshift(newBot);
    updateStatusBar();
    autoSaveStrategy();
    showToast('Bot "' + botName + '" is now live on ' + platform);
    switchView('my-bots');
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
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'Establishing connection to ' + platform + '...' },
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'Handshake with ' + platform + ' node... <span class="status-ok">[OK]</span>' },
    { tag: 'NETWORK', tagClass: 'tag-network', text: 'API key verified — latency 12ms' },
    { tag: 'DEPLOY', tagClass: 'tag-deploy', text: 'Deploying "' + botName + '" in ' + mode + ' mode...' },
    { tag: 'DEPLOY', tagClass: 'tag-deploy', text: 'Registering market listeners...' },
    { tag: 'LIVE', tagClass: 'tag-live', text: '■ Bot "' + botName + '" is LIVE — monitoring ' + platform },
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
  document.getElementById('connectApiKey').value = '';
  document.getElementById('connectApiSecret').value = '';
  document.getElementById('connectAccountModal').classList.add('open');
};

function closeConnectModal() {
  document.getElementById('connectAccountModal').classList.remove('open');
  connectingPlatform = null;
}

function confirmConnect() {
  if (!connectingPlatform) return;
  const key = document.getElementById('connectApiKey').value.trim();
  if (!key) {
    showToast('Please enter an API key', 'error');
    return;
  }

  connectedAccounts[connectingPlatform] = true;

  // Update sidebar dot
  const rowId = connectingPlatform === 'polymarket' ? 'accountPolymarket' : 'accountKalshi';
  const row = document.getElementById(rowId);
  if (row) {
    const dot = row.querySelector('.account-dot');
    dot.classList.remove('disconnected');
    dot.classList.add('connected');
    const btn = row.querySelector('.account-btn');
    btn.textContent = 'Connected';
    btn.classList.add('connected');
    btn.onclick = null;
  }

  closeConnectModal();
  updateStatusBar();
  showToast(connectingPlatform.charAt(0).toUpperCase() + connectingPlatform.slice(1) + ' connected successfully');
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
function handleAgentInput() {
  const text = (el.agentInput ? el.agentInput.value : '').trim();
  if (!text) return;

  addAgentMessage(text, 'user');
  el.agentInput.value = '';

  // Hide quick prompts after first message
  const quickPrompts = document.getElementById('agentQuickPrompts');
  if (quickPrompts) quickPrompts.style.display = 'none';

  // Simulate AI response with typing delay
  setTimeout(() => {
    simulateAgentResponse(text);
  }, 600);
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

function addStrategyCard(data) {
  if (!el.agentMessages) return;
  // data = { name, nodes, market, edge, script }
  const card = document.createElement('div');
  card.className = 'agent-strategy-card';
  card.innerHTML = `
    <div class="strategy-card-header">
      <span class="strategy-card-name">${escapeHtml(data.name)}</span>
      <span class="strategy-card-meta">${data.nodes} nodes</span>
    </div>
    <div class="strategy-card-body">
      <div class="strategy-card-stats">
        <div class="strategy-card-stat">
          <span class="strategy-card-stat-label">Market</span>
          <span class="strategy-card-stat-value">${escapeHtml(data.market)}</span>
        </div>
        <div class="strategy-card-stat">
          <span class="strategy-card-stat-label">Est. Edge</span>
          <span class="strategy-card-stat-value positive">${data.edge}</span>
        </div>
      </div>
      <div class="strategy-card-script">${data.script}</div>
    </div>
    <div class="strategy-card-actions">
      <button class="strategy-card-btn primary" onclick="deployFromCard()">Deploy</button>
      <button class="strategy-card-btn" onclick="backtestFromCard()">Backtest</button>
      <button class="strategy-card-btn" onclick="editFromCard()">Edit Nodes</button>
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
  // Redirect Research tab to the full dashboard view
  if (tabName === 'research') {
    switchView('research');
    return;
  }
  if (el.tabAgent) el.tabAgent.classList.toggle('active', tabName === 'agent');
  if (el.tabResearch) el.tabResearch.classList.toggle('active', tabName === 'research');
  if (el.agentTabContent) {
    el.agentTabContent.style.display = tabName === 'agent' ? 'flex' : 'none';
    el.agentTabContent.classList.toggle('active', tabName === 'agent');
  }
  if (el.researchTabContent) {
    el.researchTabContent.style.display = tabName === 'research' ? 'flex' : 'none';
    el.researchTabContent.classList.toggle('active', tabName === 'research');
  }
}

// ═══════════════════════════════════════════════════════════════
// AGENT STATUS BAR
// ═══════════════════════════════════════════════════════════════
function updateStatusBar() {
  const liveBots = bots.filter(b => b.status === 'live').length;
  const statusBots = document.getElementById('statusBots');
  const statusPoly = document.getElementById('statusPoly');
  const statusKalshi = document.getElementById('statusKalshi');

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

function clearCanvas() {
  nodes.forEach(n => { if (n.domElement) n.domElement.remove(); });
  connections.forEach(c => { if (c.svgPath) c.svgPath.remove(); });
  nodes = [];
  connections = [];
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT STRATEGY (loaded on first open)
// ═══════════════════════════════════════════════════════════════
function loadDefaultStrategy() {
  const n1 = createNode('probability-cross', 120, 180, {
    direction: 'Crosses Above', level: 65, contract: 'Fed Rate Cut Mar 2026'
  });
  const n2 = createNode('liquidity-check', 420, 180, { minLiquidity: 25000, depth: '1% Depth' });
  const n3 = createNode('market-order', 720, 130, { side: 'Buy YES', amount: 200, platform: 'Polymarket' });
  const n4 = createNode('stop-loss', 720, 340, { type: 'Percentage', value: 15 });

  if (n1 && n2) addConnection(n1.id, 'out', n2.id, 'in');
  if (n2 && n3) addConnection(n2.id, 'pass', n3.id, 'in');
  if (n3 && n4) addConnection(n3.id, 'out', n4.id, 'in');

  el.strategyName.value = 'rate_cut_momentum';

  // Center canvas on nodes
  setTimeout(() => {
    canvas.panX = 80;
    canvas.panY = 20;
    applyCanvasTransform();
    updateMercuryScript();
  }, 100);
}

// ═══════════════════════════════════════════════════════════════
// MY BOTS VIEW
// ═══════════════════════════════════════════════════════════════
function renderBots() {
  const filter = document.querySelector('#botFilters .filter-tab.active')?.dataset.filter || 'all';
  const sort = document.getElementById('botSort')?.value || 'updated';

  let filtered = filter === 'all' ? [...bots] : bots.filter(b => b.status === filter);

  // Sort
  filtered.sort((a, b) => {
    if (sort === 'pnl') return b.metrics.pnl - a.metrics.pnl;
    if (sort === 'winrate') return b.metrics.winRate - a.metrics.winRate;
    if (sort === 'name') return a.name.localeCompare(b.name);
    return new Date(b.updatedAt) - new Date(a.updatedAt);
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
    const pnlClass = bot.metrics.pnl >= 0 ? 'positive' : 'negative';
    const pnlSign = bot.metrics.pnl >= 0 ? '+' : '';

    return `<div class="bot-card" data-bot-id="${bot.id}" onclick="switchView('bot-detail',{botId:'${bot.id}'})">
      <div class="bot-card-header">
        <div>
          <div class="bot-card-name">${bot.name}</div>
          <div class="bot-card-type">${bot.strategyType}</div>
          <div class="bot-card-market">${bot.market}</div>
        </div>
        <span class="status-badge ${bot.status}">${bot.status}</span>
      </div>
      <div class="bot-card-metrics">
        <div class="bot-metric">
          <span class="bot-metric-label">Win Rate</span>
          <span class="bot-metric-value">${bot.metrics.winRate.toFixed(1)}%</span>
        </div>
        <div class="bot-metric">
          <span class="bot-metric-label">P&L</span>
          <span class="bot-metric-value ${pnlClass}">${pnlSign}$${Math.abs(bot.metrics.pnl).toLocaleString()}</span>
        </div>
        <div class="bot-metric">
          <span class="bot-metric-label">Volume</span>
          <span class="bot-metric-value">$${(bot.metrics.volume / 1000).toFixed(1)}K</span>
        </div>
      </div>
      <div class="bot-card-sparkline">${renderSparklineSVG(bot.sparklineData, pnlClass === 'positive' ? '#00c853' : '#ff1744')}</div>
      <div class="bot-card-footer">
        <span class="bot-card-updated">${timeAgo(bot.updatedAt)}</span>
      </div>
    </div>`;
  }).join('');
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
function renderBotDetail(botId) {
  const bot = bots.find(b => b.id === botId);
  if (!bot) return;

  document.getElementById('detailBotName').textContent = bot.name;
  const statusEl = document.getElementById('detailStatus');
  statusEl.textContent = bot.status;
  statusEl.className = 'status-badge ' + bot.status;

  // Metrics
  const m = bot.metrics;
  document.getElementById('detailMetrics').innerHTML = [
    { label: 'Win Rate', value: m.winRate.toFixed(1) + '%', cls: m.winRate >= 50 ? 'positive' : 'negative' },
    { label: 'P&L', value: (m.pnl >= 0 ? '+$' : '-$') + Math.abs(m.pnl).toLocaleString(), cls: m.pnl >= 0 ? 'positive' : 'negative' },
    { label: 'Volume', value: '$' + m.volume.toLocaleString(), cls: '' },
    { label: 'Sharpe', value: m.sharpe.toFixed(2), cls: m.sharpe >= 1 ? 'positive' : '' },
    { label: 'Max DD', value: m.maxDrawdown.toFixed(1) + '%', cls: 'negative' },
    { label: 'Positions', value: m.openPositions, cls: '' },
  ].map(c => `<div class="detail-metric-card">
    <span class="detail-metric-label">${c.label}</span>
    <span class="detail-metric-value ${c.cls}">${c.value}</span>
  </div>`).join('');

  // Performance chart
  renderPerfChart(bot);

  // Positions
  document.getElementById('positionCount').textContent = bot.positions.length;
  document.getElementById('positionsBody').innerHTML = bot.positions.map(p => {
    const pnlCls = p.pnl >= 0 ? 'positive' : 'negative';
    return `<div class="data-table-row positions-row">
      <span class="data-table-cell bright">${p.contract}</span>
      <span class="data-table-cell">${p.side}</span>
      <span class="data-table-cell">${p.qty}</span>
      <span class="data-table-cell">${p.entry}c</span>
      <span class="data-table-cell ${pnlCls}">${p.pnl >= 0 ? '+' : ''}$${p.pnl.toFixed(2)}</span>
    </div>`;
  }).join('');

  // Trades
  document.getElementById('tradeCount').textContent = bot.trades.length + ' trades';
  document.getElementById('tradesBody').innerHTML = bot.trades.slice(0, 30).map(t => {
    const pnlCls = t.pnl >= 0 ? 'positive' : 'negative';
    return `<div class="data-table-row trades-row">
      <span class="data-table-cell muted">${formatTime(t.timestamp)}</span>
      <span class="data-table-cell ${t.side === 'BUY' ? 'positive' : 'negative'}">${t.side}</span>
      <span class="data-table-cell bright">${t.contract}</span>
      <span class="data-table-cell">${t.price}c</span>
      <span class="data-table-cell">$${t.amount}</span>
      <span class="data-table-cell ${pnlCls}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</span>
    </div>`;
  }).join('');

  // Logs
  renderBotLogs(bot);
  startLogSimulation(bot);
}

function renderPerfChart(bot) {
  if (charts.detailPerf) { charts.detailPerf.destroy(); charts.detailPerf = null; }

  const data = bot.sparklineData.map((v, i) => ({
    x: Date.now() - (bot.sparklineData.length - 1 - i) * 3600000,
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
    colors: [bot.metrics.pnl >= 0 ? '#00c853' : '#ff1744'],
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
  logsEl.innerHTML = bot.logs.map(l =>
    `<div class="log-entry">
      <span class="log-time">${formatTime(l.timestamp)}</span>
      <span class="log-level ${l.level}">${l.level}</span>
      <span class="log-message">${l.message}</span>
    </div>`
  ).join('');
  logsEl.scrollTop = logsEl.scrollHeight;
}

function startLogSimulation(bot) {
  if (logInterval) clearInterval(logInterval);
  if (bot.status !== 'live') return;

  const logsEl = document.getElementById('botLogs');
  const messages = [
    { level: 'info', msg: 'Heartbeat OK — latency 8ms' },
    { level: 'info', msg: 'Market scan complete — 0 new signals' },
    { level: 'signal', msg: 'Probability shift detected: +2.3c on ' + bot.contract },
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
      <span class="log-message">${m.msg}</span>`;
    logsEl.appendChild(entry);
    logsEl.scrollTop = logsEl.scrollHeight;

    // Keep log size reasonable
    while (logsEl.children.length > 100) logsEl.removeChild(logsEl.firstChild);
  }, 3000 + Math.random() * 4000);
}

function toggleBotStatus(newStatus) {
  const bot = bots.find(b => b.id === selectedBotId);
  if (!bot) return;
  bot.status = newStatus;
  renderBotDetail(selectedBotId);
  showToast('Bot ' + (newStatus === 'paused' ? 'paused' : 'restarted'));
}

function killBot() {
  const bot = bots.find(b => b.id === selectedBotId);
  if (!bot) return;
  bot.status = 'draft';
  if (logInterval) { clearInterval(logInterval); logInterval = null; }
  showToast('Bot killed — moved to draft');
  switchView('my-bots');
}

// ═══════════════════════════════════════════════════════════════
// BACKTEST VIEW
// ═══════════════════════════════════════════════════════════════
function populateBacktestStrategies() {
  const sel = document.getElementById('btStrategy');
  sel.innerHTML = '<option value="current">Current Builder Strategy</option>';
  bots.forEach(b => {
    sel.innerHTML += `<option value="${b.id}">${b.name}</option>`;
  });
}

function runBacktest() {
  const running = document.getElementById('backtestRunning');
  const results = document.getElementById('backtestResults');
  running.style.display = 'flex';
  results.style.display = 'none';

  setTimeout(() => {
    running.style.display = 'none';
    renderBacktestResults();
    results.style.display = 'block';
  }, 2200);
}

function renderBacktestResults() {
  const capital = parseFloat(document.getElementById('btCapital').value) || 10000;
  const days = parseInt(document.getElementById('btPeriod').value) || 90;

  // Simulate results
  const totalReturn = 12 + Math.random() * 30;
  const sharpe = 1.2 + Math.random() * 1.2;
  const winRate = 55 + Math.random() * 20;
  const maxDD = -(5 + Math.random() * 15);
  const totalTrades = Math.floor(days * (1 + Math.random() * 2));
  const avgTrade = (capital * totalReturn / 100) / totalTrades;

  // Equity curve
  const equityData = [];
  let equity = capital;
  for (let i = 0; i < days; i++) {
    equity += equity * ((Math.random() - 0.4) * 0.02);
    equityData.push({
      x: Date.now() - (days - i) * 86400000,
      y: Math.round(equity * 100) / 100,
    });
  }

  // Mock trades
  const trades = [];
  for (let i = 0; i < Math.min(totalTrades, 40); i++) {
    const pnl = (Math.random() - 0.35) * 100;
    trades.push({
      timestamp: new Date(Date.now() - Math.random() * days * 86400000).toISOString(),
      side: Math.random() > 0.5 ? 'BUY' : 'SELL',
      contract: ['Fed Rate Cut', 'BTC > $100K', 'Trump 2028', 'Recession 2026'][Math.floor(Math.random() * 4)],
      price: Math.floor(30 + Math.random() * 50),
      amount: Math.floor(50 + Math.random() * 200),
      pnl,
    });
  }
  trades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const container = document.getElementById('backtestResults');
  container.innerHTML = `
    <div class="backtest-stats">
      <div class="backtest-stat-card">
        <span class="backtest-stat-label">Total Return</span>
        <span class="backtest-stat-value positive">+${totalReturn.toFixed(1)}%</span>
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
        <span class="card-meta">$${capital.toLocaleString()} initial</span>
      </div>
      <div class="card-body">
        <div id="backtestChart" style="width:100%;height:280px;"></div>
      </div>
    </div>
    <div class="detail-card">
      <div class="card-header">
        <span class="card-title">Trades</span>
        <span class="card-meta">${trades.length} shown</span>
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
        ${trades.map(t => `<div class="data-table-row trades-row">
          <span class="data-table-cell muted">${formatTime(t.timestamp)}</span>
          <span class="data-table-cell ${t.side === 'BUY' ? 'positive' : 'negative'}">${t.side}</span>
          <span class="data-table-cell bright">${t.contract}</span>
          <span class="data-table-cell">${t.price}c</span>
          <span class="data-table-cell">$${t.amount}</span>
          <span class="data-table-cell ${t.pnl >= 0 ? 'positive' : 'negative'}">${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}</span>
        </div>`).join('')}
      </div>
    </div>`;

  // Render equity chart
  setTimeout(() => {
    if (charts.backtestEquity) { charts.backtestEquity.destroy(); }
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
      colors: ['#00c853'],
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
// TEMPLATES VIEW
// ═══════════════════════════════════════════════════════════════
function renderTemplates() {
  const filter = document.querySelector('#templateFilters .filter-tab.active')?.dataset.filter || 'all';
  const filtered = filter === 'all' ? templates : templates.filter(t => t.category === filter);

  el.templatesGrid.innerHTML = filtered.map(t => {
    return `<div class="template-card">
      <div class="template-card-header">
        <div>
          <div class="template-card-name">${t.name}</div>
          <div class="template-difficulty">${t.difficulty} &middot; ${t.nodeCount} nodes</div>
        </div>
        <span class="template-category ${t.category}">${t.category.replace('-', ' ')}</span>
      </div>
      <div class="template-description">${t.description}</div>
      <div class="template-stats">
        <div class="template-stat">
          <span class="template-stat-label">Win Rate</span>
          <span class="template-stat-value">${t.winRate}%</span>
        </div>
        <div class="template-stat">
          <span class="template-stat-label">Avg Return</span>
          <span class="template-stat-value" style="color:var(--green)">+${t.avgReturn}%</span>
        </div>
      </div>
      <div class="template-preview">${renderTemplatePreview(t)}</div>
      <div class="template-card-footer">
        <button class="toolbar-btn" onclick="loadTemplate('${t.id}')">Use Template</button>
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
  el.toastMessage.textContent = message;
  el.toast.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(() => { el.toast.classList.remove('show'); }, 3000);
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function formatTime(iso) {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  return h + ':' + m + ':' + s;
}

// ═══════════════════════════════════════════════════════════════
// MOCK DATA
// ═══════════════════════════════════════════════════════════════
function initMockData() {
  bots = [
    createMockBot('Rate Cut Momentum', 'Momentum', 'live', 'Polymarket', 10000),
    createMockBot('Election Arbitrage', 'Arbitrage', 'live', 'Multi-Platform', 25000),
    createMockBot('Reversion Scanner', 'Mean Reversion', 'paused', 'Kalshi', 5000),
    createMockBot('Event Catalyst', 'Event-Driven', 'live', 'Polymarket', 8000),
    createMockBot('Breakout Sniper', 'Momentum', 'draft', 'Polymarket', 0),
    createMockBot('Cross-Platform Arb', 'Arbitrage', 'error', 'Multi-Platform', 15000),
    createMockBot('Prob Decay Farmer', 'Mean Reversion', 'live', 'Kalshi', 12000),
    createMockBot('Resolution Rush', 'Event-Driven', 'paused', 'Polymarket', 3000),
  ];

  templates = [
    {
      id: 'tmpl-1', name: 'Probability Momentum', category: 'momentum',
      description: 'Buys YES when probability breaks above a threshold with volume confirmation. Includes stop-loss and position sizing.',
      difficulty: 'Beginner', winRate: 68, avgReturn: 14.2, nodeCount: 4,
      nodes: [
        { type: 'probability-cross', x: 100, y: 150, properties: { direction: 'Crosses Above', level: 60 } },
        { type: 'liquidity-check', x: 380, y: 150, properties: { minLiquidity: 50000 } },
        { type: 'market-order', x: 660, y: 100, properties: { side: 'Buy YES', amount: 200 } },
        { type: 'stop-loss', x: 660, y: 280, properties: { type: 'Percentage', value: 15 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-2', name: 'Mean Reversion Sniper', category: 'mean-reversion',
      description: 'Identifies oversold markets (probability < 25c) with sufficient liquidity. Uses scaled entry for better average price.',
      difficulty: 'Intermediate', winRate: 62, avgReturn: 18.7, nodeCount: 4,
      nodes: [
        { type: 'price-threshold', x: 100, y: 150, properties: { direction: 'Crosses Below', threshold: 25 } },
        { type: 'liquidity-check', x: 380, y: 150, properties: { minLiquidity: 30000 } },
        { type: 'scaled-entry', x: 660, y: 100, properties: { totalAmount: 500, tranches: 5 } },
        { type: 'max-drawdown', x: 660, y: 280, properties: { maxDD: 20 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-3', name: 'Cross-Platform Arb', category: 'arbitrage',
      description: 'Detects price discrepancies between Polymarket and Kalshi for the same event. Executes simultaneous opposing positions.',
      difficulty: 'Advanced', winRate: 84, avgReturn: 8.4, nodeCount: 5,
      nodes: [
        { type: 'price-threshold', x: 100, y: 100, properties: { threshold: 5, market: 'Polymarket' } },
        { type: 'price-threshold', x: 100, y: 280, properties: { threshold: 5, market: 'Kalshi' } },
        { type: 'correlation', x: 380, y: 180, properties: { threshold: 0.8 } },
        { type: 'market-order', x: 660, y: 130, properties: { side: 'Buy YES', platform: 'Polymarket' } },
        { type: 'market-order', x: 660, y: 280, properties: { side: 'Buy NO', platform: 'Kalshi' } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 4, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-4', name: 'Resolution Event Trader', category: 'event-driven',
      description: 'Monitors markets approaching resolution. Buys strongly-trending contracts in the final 48 hours with tight risk controls.',
      difficulty: 'Beginner', winRate: 71, avgReturn: 12.1, nodeCount: 4,
      nodes: [
        { type: 'market-event', x: 100, y: 150, properties: { event: 'Resolution', lead: '48hr Before' } },
        { type: 'probability-band', x: 380, y: 150, properties: { min: 70, max: 95 } },
        { type: 'limit-order', x: 660, y: 100, properties: { side: 'Buy YES', limitPrice: 75, amount: 300 } },
        { type: 'stop-loss', x: 660, y: 280, properties: { type: 'Probability Level', value: 60 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-5', name: 'Volume Spike Scalper', category: 'momentum',
      description: 'Catches sudden volume spikes and enters with market orders. Quick profit-taking with tight stops for fast in-and-out trades.',
      difficulty: 'Intermediate', winRate: 58, avgReturn: 22.5, nodeCount: 3,
      nodes: [
        { type: 'volume-spike', x: 100, y: 180, properties: { multiplier: 5, window: '1hr' } },
        { type: 'market-order', x: 420, y: 180, properties: { side: 'Buy YES', amount: 150 } },
        { type: 'stop-loss', x: 720, y: 180, properties: { type: 'Percentage', value: 8 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'out', to: 2, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-6', name: 'DCA Accumulator', category: 'mean-reversion',
      description: 'Systematic dollar-cost averaging into undervalued contracts. Time-based triggers with portfolio exposure limits.',
      difficulty: 'Beginner', winRate: 65, avgReturn: 11.3, nodeCount: 3,
      nodes: [
        { type: 'time-based', x: 100, y: 180, properties: { schedule: 'Daily 9AM', timezone: 'ET' } },
        { type: 'portfolio-exposure', x: 400, y: 180, properties: { maxExposure: 20 } },
        { type: 'dca', x: 700, y: 180, properties: { amountPer: 50, interval: 'Daily', maxBuys: 30 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-7', name: 'Kalshi Weather Hedge', category: 'event-driven',
      description: 'Monitors weather-related Kalshi markets. Enters positions based on probability movements with correlation-aware sizing.',
      difficulty: 'Advanced', winRate: 60, avgReturn: 9.8, nodeCount: 4,
      nodes: [
        { type: 'probability-cross', x: 100, y: 150, properties: { direction: 'Crosses Below', level: 40 } },
        { type: 'correlation', x: 380, y: 150, properties: { threshold: 0.5, action: 'Reduce Size' } },
        { type: 'scaled-entry', x: 660, y: 100, properties: { totalAmount: 300, tranches: 3 } },
        { type: 'portfolio-cap', x: 660, y: 280, properties: { maxCapital: 2000 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 1, toPort: 'in' },
        { from: 1, fromPort: 'pass', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'out', to: 3, toPort: 'in' },
      ],
    },
    {
      id: 'tmpl-8', name: 'Multi-Trigger Grid', category: 'arbitrage',
      description: 'Combines price, volume, and time triggers to catch complex market patterns. Position limits prevent overexposure.',
      difficulty: 'Advanced', winRate: 72, avgReturn: 16.4, nodeCount: 5,
      nodes: [
        { type: 'price-threshold', x: 80, y: 100, properties: { direction: 'Crosses Above', threshold: 55 } },
        { type: 'volume-spike', x: 80, y: 280, properties: { multiplier: 2, window: '4hr' } },
        { type: 'probability-band', x: 380, y: 180, properties: { min: 40, max: 70 } },
        { type: 'market-order', x: 660, y: 130, properties: { side: 'Buy YES', amount: 200 } },
        { type: 'position-limit', x: 660, y: 300, properties: { maxPositions: 3, maxPerContract: 500 } },
      ],
      connections: [
        { from: 0, fromPort: 'out', to: 2, toPort: 'in' },
        { from: 2, fromPort: 'pass', to: 3, toPort: 'in' },
        { from: 3, fromPort: 'out', to: 4, toPort: 'in' },
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

// Step 4 actions — how to start building
window.tutStartBlank = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  // Empty canvas — user builds from scratch
};

window.tutStartTemplate = function() {
  const overlay = document.getElementById('wizardOverlay');
  if (overlay) overlay.classList.remove('active');
  localStorage.setItem('mercury_wizard_done', '1');
  switchView('templates');
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
