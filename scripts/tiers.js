/* ================================================================
   MERCURY — Tier Configuration
   Central tier definitions, limits, helpers, and Stripe Payment Link.
   ================================================================ */

(function () {

  // ── Stripe Payment Link (replace with real URL after Stripe setup) ──
  const STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/cNieVc5Rrfmpfxo2FP93y00';

  // ── Tier definitions ──
  const TIERS = {
    free: {
      label: 'Free',
      maxBots: 1,
      allowLive: false,
      allowBacktest: false,
      allowAPI: false,
      dailyTokens: 50000,
      messagesPerMin: 5,
      platforms: ['polymarket', 'kalshi'],
    },
    pro: {
      label: 'Pro',
      maxBots: Infinity,
      allowLive: true,
      allowBacktest: true,
      allowAPI: false,
      dailyTokens: 500000,
      messagesPerMin: 15,
      platforms: ['polymarket', 'kalshi'],
    },
    enterprise: {
      label: 'Enterprise',
      maxBots: Infinity,
      allowLive: true,
      allowBacktest: true,
      allowAPI: true,
      dailyTokens: 2000000,
      messagesPerMin: 30,
      platforms: ['polymarket', 'kalshi'],
    },
  };

  // ── Helpers ──

  function getTierConfig(tier) {
    return TIERS[tier] || TIERS.free;
  }

  function tierCan(tier, feature) {
    const cfg = getTierConfig(tier);
    switch (feature) {
      case 'live':       return cfg.allowLive;
      case 'backtest':   return cfg.allowBacktest;
      case 'api':        return cfg.allowAPI;
      default:           return true;
    }
  }

  function tierMaxBots(tier) {
    return getTierConfig(tier).maxBots;
  }

  function tierLabel(tier) {
    return getTierConfig(tier).label;
  }

  function getUpgradeURL(userId) {
    if (!userId) return STRIPE_PAYMENT_LINK;
    return STRIPE_PAYMENT_LINK + '?client_reference_id=' + encodeURIComponent(userId);
  }

  // ── Expose globally ──
  window.MercuryTiers = {
    TIERS,
    getTierConfig,
    tierCan,
    tierMaxBots,
    tierLabel,
    getUpgradeURL,
    STRIPE_PAYMENT_LINK,
  };

})();
