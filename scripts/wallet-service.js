/* ================================================================
   MERCURY — Polymarket Wallet Service

   Platform-managed wallets for automated Polymarket trading.

   Architecture:
     Frontend (this file) → mercury-engine backend → custody provider

   Security model:
   - All private keys held by third-party custody provider (never on frontend)
   - Deposits credited after 12+ Polygon block confirmations
   - Withdrawal cooldown: 24h after wallet creation or address change
   - All operations require Supabase auth token
   - USDC-only (no flash loan risk across transactions)
   - Rate-limited withdrawals with per-tier caps

   The mercury-engine backend handles:
   - Wallet creation via custody provider API (Circle/Privy/Fireblocks)
   - Deposit monitoring (Polygon RPC subscription for USDC transfers)
   - Order signing for Polymarket CLOB (EIP-712 via custody provider)
   - USDC withdrawals with confirmation checks
   ================================================================ */

class MercuryWalletService {
  constructor(engineBase = 'http://localhost:8778') {
    this.engineBase = engineBase;
    this._wallet = null;
    this._balance = null;
    this._pollInterval = null;
  }

  // ─── Internal fetch with auth ───────────────────────────
  async _authFetch(path, options = {}) {
    if (typeof window.fetchWithAuth === 'function') {
      return window.fetchWithAuth(`${this.engineBase}${path}`, options);
    }
    // Fallback for dev
    return fetch(`${this.engineBase}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  }

  async _request(path, options = {}) {
    const resp = await this._authFetch(path, options);
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({ error: resp.statusText }));
      const err = new Error(body.error || body.detail || `HTTP ${resp.status}`);
      err.status = resp.status;
      err.code = body.code || null;
      throw err;
    }
    return resp.json();
  }

  // ═══════════════════════════════════════════════════════════
  // WALLET LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  /**
   * Get or create the user's managed Polymarket wallet.
   * Returns: { address, created_at, status, network, provider }
   */
  async getOrCreateWallet() {
    try {
      const data = await this._request('/api/wallet/polymarket', {
        method: 'POST',
      });
      this._wallet = data;
      return data;
    } catch (e) {
      console.warn('[Wallet] Failed to get/create wallet:', e.message);
      throw e;
    }
  }

  /**
   * Get wallet info without creating.
   * Returns null if no wallet exists.
   */
  async getWallet() {
    try {
      const data = await this._request('/api/wallet/polymarket');
      this._wallet = data;
      return data;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // BALANCE + DEPOSITS
  // ═══════════════════════════════════════════════════════════

  /**
   * Get wallet balance.
   * Returns: { usdc, positions_value, total, pending_deposits }
   */
  async getBalance() {
    const data = await this._request('/api/wallet/polymarket/balance');
    this._balance = data;
    return data;
  }

  /**
   * Get deposit history.
   * Returns: [{ tx_hash, amount, confirmations, status, timestamp }]
   */
  async getDeposits(limit = 20) {
    return this._request(`/api/wallet/polymarket/deposits?limit=${limit}`);
  }

  /**
   * Get minimum required confirmations for deposit credit.
   */
  getRequiredConfirmations() {
    return 12; // Polygon blocks — ~24 seconds
  }

  // ═══════════════════════════════════════════════════════════
  // WITHDRAWALS
  // ═══════════════════════════════════════════════════════════

  /**
   * Request a withdrawal to user's external wallet.
   * Backend enforces: cooldown, max limits, balance checks.
   * @param {string} toAddress - Polygon USDC destination
   * @param {number} amount - USDC amount
   * Returns: { tx_hash, amount, status, estimated_arrival }
   */
  async requestWithdrawal(toAddress, amount) {
    if (!toAddress || !toAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      throw new Error('Invalid Polygon address');
    }
    if (!amount || amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    return this._request('/api/wallet/polymarket/withdraw', {
      method: 'POST',
      body: JSON.stringify({
        to_address: toAddress,
        amount: parseFloat(amount),
      }),
    });
  }

  /**
   * Get withdrawal history.
   */
  async getWithdrawals(limit = 20) {
    return this._request(`/api/wallet/polymarket/withdrawals?limit=${limit}`);
  }

  /**
   * Check if withdrawals are currently allowed (cooldown check).
   * Returns: { allowed, reason, cooldown_remaining_seconds }
   */
  async checkWithdrawalEligibility() {
    return this._request('/api/wallet/polymarket/withdraw/check');
  }

  // ═══════════════════════════════════════════════════════════
  // POSITIONS (Polymarket conditional tokens)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get current open positions.
   * Returns: [{ market, token_id, side, size, avg_price, current_price, pnl }]
   */
  async getPositions() {
    return this._request('/api/wallet/polymarket/positions');
  }

  // ═══════════════════════════════════════════════════════════
  // TRADING (used by bot engine, not directly by user)
  // ═══════════════════════════════════════════════════════════

  /**
   * Place an order via the managed wallet.
   * Only mercury-engine bots call this — frontend triggers via bot deploy.
   */
  async placeOrder(tokenId, side, price, size) {
    return this._request('/api/wallet/polymarket/order', {
      method: 'POST',
      body: JSON.stringify({ token_id: tokenId, side, price, size }),
    });
  }

  // ═══════════════════════════════════════════════════════════
  // POLLING
  // ═══════════════════════════════════════════════════════════

  startBalancePolling(callback, intervalMs = 15000) {
    this.stopBalancePolling();
    const poll = async () => {
      try {
        const balance = await this.getBalance();
        callback(balance, null);
      } catch (e) {
        callback(null, e);
      }
    };
    poll();
    this._pollInterval = setInterval(poll, intervalMs);
  }

  stopBalancePolling() {
    if (this._pollInterval) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LOCAL STATE
  // ═══════════════════════════════════════════════════════════

  get wallet() { return this._wallet; }
  get balance() { return this._balance; }
  get hasWallet() { return !!this._wallet && !!this._wallet.address; }
  get walletAddress() { return this._wallet?.address || null; }
}

// Global instance
window.walletService = new MercuryWalletService();
