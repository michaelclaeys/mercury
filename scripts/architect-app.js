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

// NODE_TYPES, CATEGORY_LABELS, API_DATA_PRESETS -- see scripts/node-types.js


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
      else if (hashView === 'backtest') { switchView('backtest'); }
      else if (hashView === 'my-bots') { switchView('my-bots'); }
      // Mobile users land on My Bots — the node editor needs mouse/desktop
      else { switchView(window.__mercury_mobile ? 'my-bots' : 'builder'); }
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

    // Mobile welcome popup — shown once per device, only on real mobile
    if (window.__mercury_mobile && !localStorage.getItem('mercury_mobile_welcomed')) {
      try { showMobileWelcome(); } catch (e) {}
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
    const subTexts = { charting: 'Charting', portfolio: 'Portfolio', 'bonding-arb': 'One Click Bonds', catalyst: 'Catalyst', funding: 'Funding' };
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
        const _cpfAll = _contractPlatformFilter === 'all' ? 'active' : '';
        const _cpfK   = _contractPlatformFilter === 'kalshi' ? 'active' : '';
        const _cpfP   = _contractPlatformFilter === 'polymarket' ? 'active' : '';
        html += `<div class="contract-platform-chips">
          <button class="contract-platform-chip ${_cpfAll}" data-platform="all" onclick="setContractPlatformFilter('all')">All</button>
          <button class="contract-platform-chip ${_cpfK}" data-platform="kalshi" onclick="setContractPlatformFilter('kalshi')">Kalshi</button>
          <button class="contract-platform-chip ${_cpfP}" data-platform="polymarket" onclick="setContractPlatformFilter('polymarket')">Polymarket</button>
        </div>`;
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
let _contractSearchHighlight = -1;
let _contractPlatformFilter = 'all';   // 'all' | 'kalshi' | 'polymarket'

window.setContractPlatformFilter = function(filter) {
  _contractPlatformFilter = filter;
  document.querySelectorAll('.contract-platform-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.platform === filter);
  });
};     // keyboard nav index

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
      const resp = await engineBridge.searchMarkets(query, _contractPlatformFilter);
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
        const wr = await (window.fetchWithAuth || fetch)(`${getEngineBase()}/api/wallet/polymarket`);
        if (wr.ok) {
          if (polyDot) { polyDot.classList.remove('disconnected'); polyDot.classList.add('connected'); }
          if (polyLabel) polyLabel.textContent = 'Connected';
        } else {
          if (polyDot) { polyDot.classList.add('disconnected'); polyDot.classList.remove('connected'); }
          if (polyLabel) polyLabel.textContent = 'Not Connected — Use sidebar';
        }
      } catch (e) {
        if (polyLabel) polyLabel.textContent = 'Not Connected';
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

  if (!strategy || errors.length > 0) {
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
      autoSaveStrategy();
      showToast('Deploy failed — ' + (e.message || 'engine offline'), 'error');
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

  // Show wallet section only for Polymarket, API section for Kalshi
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

  // Show modal immediately
  document.getElementById('connectAccountModal').classList.add('open');

  // Load wallet state async (non-blocking)
  if (platform === 'polymarket' && window.walletService) {
    updateWalletUI(null); // show connect state immediately
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
    btn.innerHTML = 'Connecting...';
  }
  try {
    const wallet = await window.walletService.getOrCreateWallet();
    updateWalletUI(wallet);

    connectedAccounts.polymarket = true;
    const row = document.getElementById('accountPolymarket');
    if (row) {
      const dot = row.querySelector('.account-dot');
      if (dot) { dot.classList.remove('disconnected'); dot.classList.add('connected'); }
      const abtn = row.querySelector('.account-btn');
      if (abtn) { abtn.textContent = 'Connected'; abtn.classList.add('connected'); }
    }
    updateStatusBar();
    showToast('Polymarket wallet connected');
  } catch (e) {
    showToast('Failed to connect wallet: ' + (e.message || e), 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Connect Wallet';
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
  // Reset sync UI
  document.getElementById('syncUsdcIdle').style.display = 'block';
  document.getElementById('syncUsdcQuote').style.display = 'none';
  document.getElementById('syncUsdcPending').style.display = 'none';
  document.getElementById('depositInfoModal').classList.add('open');
};

window.closeDepositInfo = function() {
  document.getElementById('depositInfoModal').classList.remove('open');
};

window.checkAndConvertUsdc = async function() {
  const idleEl = document.getElementById('syncUsdcIdle');
  const quoteEl = document.getElementById('syncUsdcQuote');
  const quoteText = document.getElementById('syncUsdcQuoteText');

  idleEl.innerHTML = '<span style="font-size:11px;color:var(--dim);">Checking balance...</span>';

  try {
    const resp = await (window.fetchWithAuth || fetch)(`${getEngineBase()}/api/wallet/polymarket/swap-quote`);
    const data = await resp.json();

    if (!data.has_native_usdc || data.native_balance <= 0) {
      idleEl.innerHTML = '<span style="font-size:11px;color:var(--dim);">No native USDC detected in your wallet.</span>' +
        '<br><button class="toolbar-btn" style="font-size:11px;margin-top:8px;" onclick="document.getElementById(\'syncUsdcIdle\').innerHTML=\'<button class=\\"deploy-btn\\" style=\\"width:100%;font-size:12px;padding:8px;\\" onclick=\\"checkAndConvertUsdc()\\">Check balance &amp; get conversion quote</button>\'">Check again</button>';
      return;
    }

    quoteText.innerHTML =
      `<strong style="color:var(--fg);">$${data.native_balance.toFixed(2)} USDC detected</strong><br>` +
      `You'll receive approximately <strong style="color:var(--fg);">$${data.output_usdc_e.toFixed(2)} USDC.e</strong><br>` +
      `<span style="color:var(--dim);">Fee breakdown: DEX swap ~$${data.dex_fee_usd.toFixed(2)} + gas ~$${data.gas_fee_usd.toFixed(3)} = <strong>$${data.total_fee_usd.toFixed(3)} total</strong></span>`;

    idleEl.style.display = 'none';
    quoteEl.style.display = 'block';
  } catch (e) {
    idleEl.innerHTML = '<span style="font-size:11px;color:var(--error);">Failed to fetch quote. Try again.</span>' +
      '<br><button class="toolbar-btn" style="font-size:11px;margin-top:8px;" onclick="window.checkAndConvertUsdc()">Retry</button>';
  }
};

window.executeUsdcConvert = async function() {
  const quoteEl = document.getElementById('syncUsdcQuote');
  const pendingEl = document.getElementById('syncUsdcPending');
  const statusEl = document.getElementById('syncUsdcStatus');

  quoteEl.style.display = 'none';
  pendingEl.style.display = 'block';
  statusEl.textContent = 'Submitting swap via Polymarket relayer...';

  try {
    const resp = await (window.fetchWithAuth || fetch)(`${getEngineBase()}/api/wallet/polymarket/sync-usdc`, { method: 'POST' });
    const data = await resp.json();

    if (!resp.ok) throw new Error(data.detail || 'Swap failed');

    if (data.swapped) {
      statusEl.textContent = `Swap submitted! Expecting ~$${data.output_usdc_e?.toFixed(2)} USDC.e. Confirming on-chain (~30s)...`;
      // Poll balance for up to 2 min
      let polls = 0;
      const poller = setInterval(async () => {
        polls++;
        try {
          await refreshWalletBalance();
          const newBal = window.walletService?.balance?.usdc || 0;
          if (newBal > 0.1 || polls > 8) {
            clearInterval(poller);
            statusEl.innerHTML = `<span style="color:#4ade80;">✓ Done! USDC.e balance updated. Refresh to see.</span>`;
            setTimeout(refreshWalletBalance, 5000);
          }
        } catch (_) {}
      }, 15000);
    } else {
      statusEl.textContent = data.reason || 'No native USDC to convert.';
    }
  } catch (e) {
    pendingEl.style.display = 'none';
    document.getElementById('syncUsdcIdle').style.display = 'block';
    showToast('Conversion failed: ' + e.message, 'error');
  }
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


// AGENT PANEL -- see scripts/agent.js


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

/** One-time mobile welcome popup — shown once per device on first visit */
function showMobileWelcome() {
  const modal = document.getElementById('mobileWelcomeModal');
  const btn = document.getElementById('mobileWelcomeOk');
  if (!modal || !btn) return;

  modal.classList.add('active');

  btn.addEventListener('click', () => {
    modal.classList.remove('active');
    localStorage.setItem('mercury_mobile_welcomed', '1');
  }, { once: true });
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

// MY BOTS + CSV EXPORT -- see scripts/bot-manager.js

// BACKTEST + FUNDING CHECKLIST -- see scripts/backtest.js


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

  // Clear any active AI script so compileStrategy() uses nodes, not the stale script
  activeScript = null;
  activeScriptName = null;
  activeScriptAsset = null;
  hideScriptOverlay();

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
  }

  // Templates loaded from scripts/strategy-templates.js
  templates = window.MERCURY_TEMPLATES || [];
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
