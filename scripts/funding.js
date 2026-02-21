/* ================================================================
   MERCURY — Funding View Controller

   Connects to mercury-engine wallet & Kalshi APIs.
   Uses walletService (from wallet-service.js) for Polymarket.
   ================================================================ */

const ENGINE_BASE = (window.MERCURY_CONFIG && window.MERCURY_CONFIG.engineBase) || 'http://localhost:8778';

// Use authenticated fetch for engine API calls (attaches Supabase JWT)
const _authFetch = (url, opts) => typeof window.fetchWithAuth === 'function'
  ? window.fetchWithAuth(url, opts)
  : fetch(url, opts);

let _fundingPollInterval = null;

// ═══════════════════════════════════════════════════════════
// INIT / TEARDOWN
// ═══════════════════════════════════════════════════════════

function initFundingView() {
  // Check engine health to see what's connected
  checkEngineConnectors();
}

function teardownFundingView() {
  if (_fundingPollInterval) {
    clearInterval(_fundingPollInterval);
    _fundingPollInterval = null;
  }
}

async function checkEngineConnectors() {
  try {
    const resp = await fetch(`${ENGINE_BASE}/api/health`);
    if (!resp.ok) throw new Error('Engine offline');
    const data = await resp.json();

    // Check if wallet manager is ready (wallets can be created)
    if (data.wallet_manager === 'ready') {
      // Check if user already has a wallet
      try {
        const walletResp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket`);
        if (walletResp.ok) {
          const wallet = await walletResp.json();
          if (wallet && wallet.address) {
            setPolyConnected(true, wallet.address);
            await refreshPolyBalance();
            _fundingPollInterval = setInterval(refreshPolyBalance, 15000);
          }
        }
        // 404 = no wallet yet, show Connect button
      } catch (e) { /* no wallet yet */ }
    }

    if (data.kalshi === 'connected') {
      await refreshKalshiBalance();
      setKalshiConnected(true);
    }
  } catch (e) {
    console.warn('[Funding] Engine health check failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// POLYMARKET WALLET
// ═══════════════════════════════════════════════════════════

async function initPolymarketWallet() {
  const btn = document.getElementById('polyConnectBtn');
  if (btn) btn.textContent = 'Connecting...';

  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket`, { method: 'POST' });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();

    if (data && data.address) {
      setPolyConnected(true, data.address);
      await refreshPolyBalance();
      showToast('Polymarket wallet connected');

      // Start polling balance
      _fundingPollInterval = setInterval(refreshPolyBalance, 15000);
    }
  } catch (e) {
    console.error('[Funding] Wallet connection failed:', e);
    if (btn) btn.textContent = 'Connect Wallet';
    showToast('Failed: ' + e.message, 'error');
  }
}

function setPolyConnected(connected, address) {
  const statusDot = document.querySelector('#polyWalletStatus .account-dot');
  const statusText = document.getElementById('polyStatusText');
  const connectBtn = document.getElementById('polyConnectBtn');
  const refreshBtn = document.getElementById('polyRefreshBtn');
  const withdrawBtn = document.getElementById('polyWithdrawBtn');
  const addressRow = document.getElementById('polyAddressRow');
  const addressEl = document.getElementById('polyAddress');

  if (connected) {
    if (statusDot) { statusDot.classList.remove('disconnected'); statusDot.classList.add('connected'); }
    if (statusText) statusText.textContent = 'Connected';
    if (connectBtn) connectBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = '';
    if (withdrawBtn) withdrawBtn.style.display = '';
    if (address && addressRow) {
      addressRow.style.display = '';
      if (addressEl) addressEl.textContent = address;
    }
    // Show positions section
    const posSection = document.getElementById('fundingPositionsSection');
    const tradesSection = document.getElementById('fundingTradesSection');
    if (posSection) posSection.style.display = '';
    if (tradesSection) tradesSection.style.display = '';
  } else {
    if (statusDot) { statusDot.classList.add('disconnected'); statusDot.classList.remove('connected'); }
    if (statusText) statusText.textContent = 'Not Connected';
    if (connectBtn) { connectBtn.style.display = ''; connectBtn.textContent = 'Connect Wallet'; }
    if (refreshBtn) refreshBtn.style.display = 'none';
    if (withdrawBtn) withdrawBtn.style.display = 'none';
    if (addressRow) addressRow.style.display = 'none';
  }

  // Update sidebar indicator too
  const sidebarDot = document.querySelector('#accountPolymarket .account-dot');
  const sidebarBtn = document.getElementById('btnConnectPoly');
  if (connected) {
    if (sidebarDot) { sidebarDot.classList.remove('disconnected'); sidebarDot.classList.add('connected'); }
    if (sidebarBtn) sidebarBtn.textContent = 'Connected';
  }
}

async function refreshPolyBalance() {
  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket/balance`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    const fmt = (v) => v != null ? `$${Number(v).toFixed(2)}` : '--';
    const el = (id) => document.getElementById(id);

    if (el('polyBalance')) el('polyBalance').textContent = fmt(data.usdc);
    if (el('polyWalletBalance')) el('polyWalletBalance').textContent = fmt(data.wallet_usdc);
    if (el('polyTotalBalance')) el('polyTotalBalance').textContent = fmt(data.total);

    // If we got balance, we're connected
    if (data.total > 0 || data.usdc > 0) {
      setPolyConnected(true);
    }

    // Also fetch deposit address if not shown yet
    const addressRow = document.getElementById('polyAddressRow');
    if (addressRow && addressRow.style.display === 'none') {
      try {
        const addrResp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket/deposit-address`);
        if (addrResp.ok) {
          const addrData = await addrResp.json();
          if (addrData.address) {
            setPolyConnected(true, addrData.address);
          }
        }
      } catch (e) { /* ignore */ }
    }

    // Refresh positions
    refreshPositions();

  } catch (e) {
    console.warn('[Funding] Balance fetch failed:', e.message);
  }
}

function copyPolyAddress() {
  const addr = document.getElementById('polyAddress');
  if (addr) {
    navigator.clipboard.writeText(addr.textContent).then(() => {
      showToast('Address copied to clipboard');
    }).catch(() => {
      // Fallback
      const range = document.createRange();
      range.selectNode(addr);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      document.execCommand('copy');
      showToast('Address copied');
    });
  }
}

// ═══════════════════════════════════════════════════════════
// KALSHI ACCOUNT
// ═══════════════════════════════════════════════════════════

async function initKalshiAccount() {
  const btn = document.getElementById('kalshiConnectBtn');
  if (btn) btn.textContent = 'Connecting...';

  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/kalshi/balance`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || err.error || `HTTP ${resp.status}`);
    }
    const data = await resp.json();
    setKalshiConnected(true);
    updateKalshiBalance(data);
    showToast('Kalshi account connected');
  } catch (e) {
    console.error('[Funding] Kalshi connect failed:', e);
    if (btn) btn.textContent = 'Connect Account';
    showToast('Failed to connect: ' + e.message, 'error');
  }
}

function setKalshiConnected(connected) {
  const statusDot = document.querySelector('#kalshiWalletStatus .account-dot');
  const statusText = document.getElementById('kalshiStatusText');
  const connectBtn = document.getElementById('kalshiConnectBtn');
  const refreshBtn = document.getElementById('kalshiRefreshBtn');

  if (connected) {
    if (statusDot) { statusDot.classList.remove('disconnected'); statusDot.classList.add('connected'); }
    if (statusText) statusText.textContent = 'Connected';
    if (connectBtn) connectBtn.style.display = 'none';
    if (refreshBtn) refreshBtn.style.display = '';
  } else {
    if (statusDot) { statusDot.classList.add('disconnected'); statusDot.classList.remove('connected'); }
    if (statusText) statusText.textContent = 'Not Connected';
    if (connectBtn) { connectBtn.style.display = ''; connectBtn.textContent = 'Connect Account'; }
    if (refreshBtn) refreshBtn.style.display = 'none';
  }

  // Update sidebar
  const sidebarDot = document.querySelector('#accountKalshi .account-dot');
  const sidebarBtn = document.getElementById('btnConnectKalshi');
  if (connected) {
    if (sidebarDot) { sidebarDot.classList.remove('disconnected'); sidebarDot.classList.add('connected'); }
    if (sidebarBtn) sidebarBtn.textContent = 'Connected';
  }
}

function updateKalshiBalance(data) {
  const fmt = (v) => v != null ? `$${Number(v).toFixed(2)}` : '--';
  const el = (id) => document.getElementById(id);
  if (el('kalshiBalance')) el('kalshiBalance').textContent = fmt(data.balance);
  if (el('kalshiPnl')) {
    const pnl = data.pnl || 0;
    el('kalshiPnl').textContent = (pnl >= 0 ? '+' : '') + fmt(pnl);
    el('kalshiPnl').style.color = pnl >= 0 ? 'var(--green)' : 'var(--red)';
  }
}

async function refreshKalshiBalance() {
  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/kalshi/balance`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    updateKalshiBalance(data);
    setKalshiConnected(true);
  } catch (e) {
    console.warn('[Funding] Kalshi balance fetch failed:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════
// POSITIONS
// ═══════════════════════════════════════════════════════════

async function refreshPositions() {
  const tbody = document.getElementById('fundingPositionsBody');
  if (!tbody) return;

  const allPositions = [];

  // Polymarket positions
  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket/positions`);
    if (resp.ok) {
      const data = await resp.json();
      (data.positions || []).forEach(p => {
        allPositions.push({
          market: p.market || 'Unknown',
          platform: 'Polymarket',
          side: p.side || 'YES',
          size: p.balance || 0,
          price: p.current_price != null ? p.current_price.toFixed(1) + 'c' : '--',
          value: p.balance != null ? '$' + p.balance.toFixed(2) : '--',
        });
      });
    }
  } catch (e) { /* ignore */ }

  // Kalshi positions
  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/kalshi/positions`);
    if (resp.ok) {
      const data = await resp.json();
      (data.positions || []).forEach(p => {
        const qty = Math.abs(p.position || 0);
        allPositions.push({
          market: p.ticker || 'Unknown',
          platform: 'Kalshi',
          side: (p.position || 0) > 0 ? 'YES' : 'NO',
          size: qty,
          price: '--',
          value: '--',
        });
      });
    }
  } catch (e) { /* ignore */ }

  if (allPositions.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="funding-empty">No open positions</td></tr>';
    return;
  }

  tbody.innerHTML = allPositions.map(p => `
    <tr>
      <td>${esc(p.market)}</td>
      <td><span class="funding-platform-badge funding-platform-badge--${p.platform.toLowerCase()}">${p.platform}</span></td>
      <td>${p.side}</td>
      <td>${p.size}</td>
      <td>${p.price}</td>
      <td>${p.value}</td>
    </tr>
  `).join('');
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// WITHDRAW
// ═══════════════════════════════════════════════════════════

function openPolyWithdraw() {
  const modal = document.getElementById('polyWithdrawModal');
  if (modal) modal.style.display = 'flex';

  // Show available balance
  const totalEl = document.getElementById('polyTotalBalance');
  const availEl = document.getElementById('withdrawAvailable');
  if (totalEl && availEl) {
    availEl.textContent = 'Available: ' + totalEl.textContent;
  }
}

function closePolyWithdraw() {
  const modal = document.getElementById('polyWithdrawModal');
  if (modal) modal.style.display = 'none';
}

async function submitPolyWithdraw() {
  const address = document.getElementById('withdrawAddress').value.trim();
  const amount = parseFloat(document.getElementById('withdrawAmount').value);

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    showToast('Invalid Polygon address', 'error');
    return;
  }
  if (!amount || amount <= 0) {
    showToast('Enter a valid amount', 'error');
    return;
  }

  try {
    const resp = await _authFetch(`${ENGINE_BASE}/api/wallet/polymarket/withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_address: address, amount }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Withdrawal failed' }));
      throw new Error(err.detail || err.error);
    }
    const data = await resp.json();
    closePolyWithdraw();
    showToast(`Withdrawal submitted: ${data.tx_hash ? data.tx_hash.slice(0, 12) + '...' : 'pending'}`);
    refreshPolyBalance();
  } catch (e) {
    showToast('Withdrawal failed: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════
// METAMASK DEPOSIT (Funding page)
// ═══════════════════════════════════════════════════════════

async function fundingDepositWithMetaMask() {
  const POLYGON_CHAIN_ID = '0x89';
  const USDC_CONTRACT = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e (Polymarket)
  const walletAddress = document.getElementById('polyAddress')?.textContent;

  if (!walletAddress || walletAddress === '0x...') {
    showToast('No trading wallet found', 'error');
    return;
  }
  if (!window.ethereum) {
    showToast('MetaMask not detected. Copy the address and send manually.', 'error');
    return;
  }

  const btn = document.getElementById('polyMetamaskDepositBtn');
  btn.disabled = true;
  btn.textContent = 'Connecting MetaMask...';

  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];

    btn.textContent = 'Switching to Polygon...';
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: POLYGON_CHAIN_ID }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: POLYGON_CHAIN_ID,
            chainName: 'Polygon',
            nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
            rpcUrls: ['https://polygon-rpc.com'],
            blockExplorerUrls: ['https://polygonscan.com'],
          }],
        });
      } else {
        throw switchError;
      }
    }

    // Prompt for amount
    const amountStr = prompt('Enter USDC amount to deposit (min $5):');
    if (!amountStr) { return; }
    const amount = parseFloat(amountStr);
    if (!amount || amount < 5) {
      showToast('Minimum deposit is $5.00 USDC', 'error');
      return;
    }

    const amountRaw = BigInt(Math.round(amount * 1e6));
    const recipientPadded = walletAddress.slice(2).toLowerCase().padStart(64, '0');
    const amountPadded = amountRaw.toString(16).padStart(64, '0');
    const data = '0xa9059cbb' + recipientPadded + amountPadded;

    btn.textContent = 'Confirm in MetaMask...';
    const txHash = await window.ethereum.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: USDC_CONTRACT, data, value: '0x0' }],
    });

    showToast('Deposit submitted! TX: ' + txHash.slice(0, 14) + '...');
    setTimeout(() => refreshPolyBalance(), 15000);
    setTimeout(() => refreshPolyBalance(), 45000);

  } catch (e) {
    if (e.code === 4001) {
      showToast('Transaction cancelled', 'info');
    } else {
      showToast('Deposit failed: ' + (e.message || e), 'error');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Deposit with MetaMask';
  }
}

// Make functions globally available
window.initFundingView = initFundingView;
window.teardownFundingView = teardownFundingView;
window.initPolymarketWallet = initPolymarketWallet;
window.refreshPolyBalance = refreshPolyBalance;
window.copyPolyAddress = copyPolyAddress;
window.initKalshiAccount = initKalshiAccount;
window.refreshKalshiBalance = refreshKalshiBalance;
window.refreshPositions = refreshPositions;
window.openPolyWithdraw = openPolyWithdraw;
window.closePolyWithdraw = closePolyWithdraw;
window.submitPolyWithdraw = submitPolyWithdraw;
window.fundingDepositWithMetaMask = fundingDepositWithMetaMask;
