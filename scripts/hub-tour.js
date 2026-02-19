/* ================================================================
   MERCURY — Hub Onboarding Tour
   Spotlight tour for the homepage hub panels.
   Triggered on first authenticated visit after signup.
   Requires: tour-engine.js (MercuryTour), auth.js (getCurrentUser)
   ================================================================ */

(function () {
  const TOUR_KEY = 'mercury_hub_tour_done';

  // Already completed — bail early
  if (localStorage.getItem(TOUR_KEY)) return;

  window.addEventListener('mercury:hub-revealed', async function onRevealed() {
    // Only fire once
    window.removeEventListener('mercury:hub-revealed', onRevealed);

    // Must be logged in (new signup flow sets session before redirecting here)
    try {
      if (typeof window.getCurrentUser === 'function') {
        const user = await window.getCurrentUser();
        if (!user || !user.email) return;
      } else {
        return; // auth.js not loaded
      }
    } catch (e) {
      return; // not logged in
    }

    // Already done?
    if (localStorage.getItem(TOUR_KEY)) return;

    // Wait for engine
    if (!window.MercuryTour) return;

    // Delay so hub animations finish
    setTimeout(() => {
      const tour = window.MercuryTour.create({
        steps: [
          {
            selector: '.hub-panel--featured',
            title: 'Architect',
            text: 'Your strategy builder. Design prediction market bots with AI assistance, backtest ideas, and deploy to production \u2014 all from one canvas.',
            position: 'bottom',
            padding: 8,
          },
          {
            selector: '#catalystPanel',
            title: 'Catalyst',
            text: 'Real-time keyword spike detection across Google News. Tracks 7 feeds, flags statistically significant surges using a 24-hour rolling baseline, and auto-categorizes keywords so you spot narrative shifts before they move markets.',
            position: 'bottom',
            padding: 8,
          },
          {
            selector: '#backtestPanel',
            title: 'Backtest',
            text: 'Replay strategies against historical data. Full P&L, drawdown, and Brier score reports before you risk real capital.',
            position: 'bottom',
            padding: 8,
          },
          {
            selector: '#liveManagementPanel',
            title: 'Live Management',
            text: 'Monitor running bots, positions, and risk in real-time. 24/7 infrastructure \u2014 no crashed scripts, no 3am wake-up calls.',
            position: 'bottom',
            padding: 8,
          },
          {
            selector: '#fundingPanel',
            title: 'Mercury Funding',
            text: 'Pro users with profitable strategies can apply for up to $5,000 in funded capital. Our money, your strategy \u2014 you keep the profits.',
            position: 'top',
            padding: 8,
          },
        ],
        storageKey: TOUR_KEY,
      });
      tour.start();
    }, 1200);
  });
})();
