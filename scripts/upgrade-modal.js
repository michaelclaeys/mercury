/* ================================================================
   MERCURY — Upgrade Modal
   Reusable upgrade prompt shown when free-tier users hit a gated feature.
   Uses the same .modal-overlay + .modal pattern as the rest of the app.
   ================================================================ */

(function () {

  const FEATURE_MESSAGES = {
    live:        'Live trading is available on the Pro plan.',
    backtest:    'Backtesting is available on the Pro plan.',
    'bot-limit': 'Free accounts are limited to 1 bot. Upgrade for unlimited bots.',
    funding:     'Funding applications require a Pro plan. Upgrade to apply for funded capital.',
  };

  let overlayEl = null;

  function ensureOverlay() {
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement('div');
    overlayEl.className = 'modal-overlay';
    overlayEl.id = 'upgradeModal';
    overlayEl.innerHTML = `
      <div class="modal upgrade-modal">
        <div class="modal-header">
          <span class="modal-title">Upgrade to Pro</span>
          <button class="modal-close" id="upgradeModalClose">&times;</button>
        </div>
        <div class="modal-body">
          <div class="upgrade-blocked-msg" id="upgradeBlockedMsg"></div>
          <div class="upgrade-comparison">
            <div class="upgrade-col upgrade-col--free">
              <div class="upgrade-col-header">Free <span class="upgrade-col-price">$0</span></div>
              <ul class="upgrade-list">
                <li class="upgrade-has">1 paper-only bot</li>
                <li class="upgrade-has">Polymarket + Kalshi</li>
                <li class="upgrade-has">Full charting access</li>
                <li class="upgrade-has">AI agent access</li>
                <li class="upgrade-has">All node types</li>
                <li class="upgrade-no">Live trading</li>
                <li class="upgrade-no">Backtesting</li>
                <li class="upgrade-no">Unlimited bots</li>
              </ul>
            </div>
            <div class="upgrade-col upgrade-col--pro">
              <div class="upgrade-col-header">Pro <span class="upgrade-col-price">$99/mo</span></div>
              <ul class="upgrade-list">
                <li class="upgrade-has">Unlimited bots</li>
                <li class="upgrade-has">Polymarket + Kalshi</li>
                <li class="upgrade-has">Full charting access</li>
                <li class="upgrade-has">AI agent access</li>
                <li class="upgrade-has">All node types</li>
                <li class="upgrade-has">Live trading</li>
                <li class="upgrade-has">Unlimited backtesting</li>
                <li class="upgrade-has">Priority support</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="toolbar-btn" id="upgradeLaterBtn">Maybe Later</button>
          <button class="toolbar-btn upgrade-cta-btn" id="upgradeNowBtn">Upgrade to Pro</button>
        </div>
      </div>`;

    document.body.appendChild(overlayEl);

    // Close handlers
    overlayEl.querySelector('#upgradeModalClose').addEventListener('click', closeUpgradeModal);
    overlayEl.querySelector('#upgradeLaterBtn').addEventListener('click', closeUpgradeModal);
    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) closeUpgradeModal();
    });

    overlayEl.querySelector('#upgradeNowBtn').addEventListener('click', function () {
      const userId = window.currentUser?.id || '';
      const url = window.MercuryTiers.getUpgradeURL(userId);
      window.open(url, '_blank');
    });

    return overlayEl;
  }

  function showUpgradeModal(feature) {
    const el = ensureOverlay();
    const msg = FEATURE_MESSAGES[feature] || 'This feature requires the Pro plan.';
    el.querySelector('#upgradeBlockedMsg').textContent = msg;
    el.classList.add('open');
  }

  function closeUpgradeModal() {
    if (overlayEl) overlayEl.classList.remove('open');
  }

  // ── Expose globally ──
  window.showUpgradeModal = showUpgradeModal;
  window.closeUpgradeModal = closeUpgradeModal;

})();
