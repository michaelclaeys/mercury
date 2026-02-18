/* ================================================================
   MERCURY — Spotlight Tour Engine
   Reusable guided tour with spotlight cutout + floating tooltip.

   Usage:
     const tour = MercuryTour.create({
       steps: [
         { selector: '.my-element', title: 'Welcome', text: 'This is...', position: 'right' }
       ],
       storageKey: 'mercury_my_tour_done',
       onComplete: () => console.log('done')
     });
     tour.start();
   ================================================================ */

(function () {
  // ── Inject CSS once ──
  const STYLE_ID = 'mercury-tour-styles';
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .tour-overlay {
        position: fixed;
        inset: 0;
        z-index: 8000;
        pointer-events: all;
      }
      .tour-spotlight {
        position: fixed;
        box-shadow: 0 0 0 9999px rgba(0,0,0,0.88);
        border: 1px solid rgba(255,255,255,0.06);
        transition: top 0.4s ease, left 0.4s ease, width 0.4s ease, height 0.4s ease;
        z-index: 8001;
        pointer-events: none;
      }
      .tour-tooltip {
        position: fixed;
        z-index: 8002;
        background: #080808;
        border: 1px solid rgba(255,255,255,0.08);
        padding: 20px 24px;
        max-width: 340px;
        font-family: 'JetBrains Mono', monospace;
        opacity: 0;
        transform: translateY(8px);
        transition: opacity 0.3s ease 0.15s, transform 0.3s ease 0.15s;
      }
      .tour-tooltip.visible {
        opacity: 1;
        transform: translateY(0);
      }
      .tour-tooltip-step {
        font-size: 0.55rem;
        font-weight: 600;
        color: rgba(0,200,83,0.7);
        letter-spacing: 0.12em;
        text-transform: uppercase;
        margin-bottom: 6px;
      }
      .tour-tooltip-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: #ffffff;
        letter-spacing: 0.03em;
        margin-bottom: 8px;
      }
      .tour-tooltip-text {
        font-size: 0.7rem;
        color: #909090;
        line-height: 1.6;
        margin-bottom: 16px;
      }
      .tour-tooltip-nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .tour-progress {
        font-size: 0.6rem;
        color: #444;
        letter-spacing: 0.08em;
        flex: 1;
        text-align: center;
      }
      .tour-next-btn {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.65rem;
        font-weight: 600;
        padding: 6px 16px;
        background: #e8e8e8;
        color: #000;
        border: none;
        cursor: pointer;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        transition: background 0.15s;
      }
      .tour-next-btn:hover {
        background: #00c853;
        color: #000;
      }
      .tour-skip-btn {
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.6rem;
        color: #444;
        background: transparent;
        border: none;
        cursor: pointer;
        letter-spacing: 0.08em;
        transition: color 0.15s;
      }
      .tour-skip-btn:hover {
        color: #e8e8e8;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Position helpers ──

  function getTooltipPosition(rect, pos, tooltipEl) {
    const GAP = 14;
    const tw = tooltipEl.offsetWidth || 340;
    const th = tooltipEl.offsetHeight || 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    switch (pos) {
      case 'right':
        top = rect.top + rect.height / 2 - th / 2;
        left = rect.right + GAP;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - th / 2;
        left = rect.left - tw - GAP;
        break;
      case 'top':
        top = rect.top - th - GAP;
        left = rect.left + rect.width / 2 - tw / 2;
        break;
      case 'bottom':
      default:
        top = rect.bottom + GAP;
        left = rect.left + rect.width / 2 - tw / 2;
        break;
    }

    // Clamp to viewport
    if (left < 12) left = 12;
    if (left + tw > vw - 12) left = vw - tw - 12;
    if (top < 12) top = 12;
    if (top + th > vh - 12) top = vh - th - 12;

    return { top, left };
  }

  // ── Tour factory ──

  function create(config) {
    const { steps, storageKey, onComplete } = config;
    let current = 0;
    let overlay, spotlight, tooltip;

    function build() {
      overlay = document.createElement('div');
      overlay.className = 'tour-overlay';

      spotlight = document.createElement('div');
      spotlight.className = 'tour-spotlight';

      tooltip = document.createElement('div');
      tooltip.className = 'tour-tooltip';
      tooltip.innerHTML = `
        <div class="tour-tooltip-step"></div>
        <div class="tour-tooltip-title"></div>
        <div class="tour-tooltip-text"></div>
        <div class="tour-tooltip-nav">
          <button class="tour-skip-btn">Skip</button>
          <span class="tour-progress"></span>
          <button class="tour-next-btn">Next</button>
        </div>
      `;

      overlay.appendChild(spotlight);
      overlay.appendChild(tooltip);
      document.body.appendChild(overlay);

      // Event listeners
      tooltip.querySelector('.tour-next-btn').addEventListener('click', next);
      tooltip.querySelector('.tour-skip-btn').addEventListener('click', finish);

      // Block clicks on overlay background (not on spotlight target)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) e.stopPropagation();
      });
    }

    function show(index) {
      const step = steps[index];
      if (!step) { finish(); return; }

      const target = document.querySelector(step.selector);
      if (!target) {
        // Skip missing elements
        current++;
        show(current);
        return;
      }

      // Scroll into view
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Wait for scroll to settle
      setTimeout(() => {
        const pad = step.padding || 8;
        const rect = target.getBoundingClientRect();

        // Position spotlight
        spotlight.style.top = (rect.top - pad) + 'px';
        spotlight.style.left = (rect.left - pad) + 'px';
        spotlight.style.width = (rect.width + pad * 2) + 'px';
        spotlight.style.height = (rect.height + pad * 2) + 'px';

        // Update tooltip content
        const stepNum = String(index + 1).padStart(2, '0');
        tooltip.querySelector('.tour-tooltip-step').textContent = `Step ${stepNum}`;
        tooltip.querySelector('.tour-tooltip-title').textContent = step.title;
        tooltip.querySelector('.tour-tooltip-text').textContent = step.text;
        tooltip.querySelector('.tour-progress').textContent =
          (index + 1) + ' / ' + steps.length;

        // Last step: change button text
        const nextBtn = tooltip.querySelector('.tour-next-btn');
        nextBtn.textContent = index === steps.length - 1 ? 'Finish' : 'Next';

        // Position tooltip
        tooltip.classList.remove('visible');
        const pos = step.position || 'bottom';
        const coords = getTooltipPosition(rect, pos, tooltip);
        tooltip.style.top = coords.top + 'px';
        tooltip.style.left = coords.left + 'px';

        // Fade in tooltip
        requestAnimationFrame(() => {
          tooltip.classList.add('visible');
        });
      }, 350);
    }

    function next() {
      current++;
      if (current >= steps.length) {
        finish();
      } else {
        tooltip.classList.remove('visible');
        setTimeout(() => show(current), 150);
      }
    }

    function finish() {
      if (storageKey) {
        localStorage.setItem(storageKey, '1');
      }
      if (overlay && overlay.parentNode) {
        // Fade out
        overlay.style.transition = 'opacity 0.3s';
        overlay.style.opacity = '0';
        setTimeout(() => {
          overlay.remove();
        }, 300);
      }
      if (onComplete) onComplete();
    }

    function start() {
      // Already completed?
      if (storageKey && localStorage.getItem(storageKey)) return;
      build();
      show(0);
    }

    return { start, skip: finish, next };
  }

  // ── Expose globally ──
  window.MercuryTour = { create };
})();
