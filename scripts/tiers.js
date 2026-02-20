/* ================================================================
   MERCURY — Tier Configuration
   All features are free. Helpers kept for backward compatibility
   so existing code that calls MercuryTiers.* doesn't break.
   ================================================================ */

(function () {

  const TIERS = {
    free: {
      label: 'Free',
      maxBots: Infinity,
      allowLive: true,
      allowBacktest: true,
      allowAPI: true,
      dailyTokens: 2000000,
      messagesPerMin: 30,
      platforms: ['polymarket', 'kalshi'],
    },
  };

  function getTierConfig() { return TIERS.free; }
  function tierCan()       { return true; }
  function tierMaxBots()   { return Infinity; }
  function tierLabel()     { return 'Free'; }
  function getUpgradeURL() { return null; }

  window.MercuryTiers = {
    TIERS,
    getTierConfig,
    tierCan,
    tierMaxBots,
    tierLabel,
    getUpgradeURL,
    STRIPE_PAYMENT_LINK: null,
  };

})();
