/* ================================================================
   MERCURY — Page Transition
   Quick star-warp splash (~0.7s) with logo + tagline.

   Auto-plays on page load (skips index.html & architect.html).
   Call window.playMercuryTransition(options) for in-app view switches.
     options.container — DOM element to scope overlay to (default: fullscreen)
     options.onDone    — callback after transition finishes
   ================================================================ */

(function () {

  function createTransition(opts) {
    opts = opts || {};
    const container = opts.container || null;
    const onDone = opts.onDone || null;

    // ── Overlay ──
    const overlay = document.createElement('div');
    overlay.className = 'mercury-transition';

    if (container) {
      // Scoped to a container (e.g. main content area)
      const rect = container.getBoundingClientRect();
      Object.assign(overlay.style, {
        position: 'fixed',
        top: rect.top + 'px', left: rect.left + 'px',
        width: rect.width + 'px', height: rect.height + 'px',
        zIndex: '9999',
        background: '#000', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.3s ease', opacity: '1',
      });
    } else {
      // Fullscreen (page load)
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '99999',
        background: '#000', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        transition: 'opacity 0.3s ease', opacity: '1',
      });
    }

    // Canvas
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    overlay.appendChild(canvas);

    // Logo size: bigger for in-app (56px), standard for page load (36px)
    const logoSize = container ? 56 : 36;

    // Center content (logo + text)
    const center = document.createElement('div');
    Object.assign(center.style, {
      position: 'relative', zIndex: '2', display: 'flex',
      flexDirection: 'column', alignItems: 'center', gap: '12px',
    });
    center.innerHTML = `
      <svg width="${logoSize}" height="${logoSize}" viewBox="0 0 100 100" fill="none"
           style="opacity:0; transition: opacity 0.2s 0.1s;">
        <circle cx="50" cy="50" r="6" fill="rgba(255,255,255,0.9)"/>
        <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(30 50 50)"
                 stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
        <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(-30 50 50)"
                 stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
        <ellipse cx="50" cy="50" rx="40" ry="14" transform="rotate(90 50 50)"
                 stroke="rgba(255,255,255,0.55)" stroke-width="1.2"/>
      </svg>
      <span style="font-family:'JetBrains Mono',monospace; font-size:10px;
                    font-weight:500; letter-spacing:0.18em; text-transform:uppercase;
                    color:rgba(255,255,255,0.35); opacity:0;
                    transition: opacity 0.25s 0.15s;">Built for tomorrow.</span>`;
    overlay.appendChild(center);

    document.body.appendChild(overlay);

    // ── Canvas setup ──
    const ctx = canvas.getContext('2d');
    canvas.width = overlay.offsetWidth;
    canvas.height = overlay.offsetHeight;

    // ── Stars ──
    const stars = [];
    for (let i = 0; i < 300; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.random() * 5,
        speed: 1.2 + Math.random() * 5,
        size: 0.3 + Math.random() * 1,
        alpha: 0.15 + Math.random() * 0.85,
      });
    }

    const start = performance.now();
    let done = false;

    function render(now) {
      if (done) return;
      const elapsed = (now - start) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;

      // Fast deceleration: warp → stop in 0.35s
      const warp = elapsed < 0.35 ? 4 * (1 - elapsed / 0.35) : 0;
      const fade = elapsed < 0.15 ? 0.06 : 0.2 + elapsed * 0.5;

      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, w, h);

      // Central glow
      const glowA = Math.min(0.04, elapsed * 0.06);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 180);
      gr.addColorStop(0, `rgba(255,255,255,${glowA})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(cx, cy, 180, 0, Math.PI * 2);
      ctx.fill();

      stars.forEach(s => {
        s.dist += s.speed * (warp + 0.06);
        const x = cx + Math.cos(s.angle) * s.dist;
        const y = cy + Math.sin(s.angle) * s.dist;
        if (x < -20 || x > w + 20 || y < -20 || y > h + 20) return;

        const ds = Math.min(s.dist / 120, 2);
        const sz = s.size * (0.5 + ds * 0.5);

        if (warp > 0.3) {
          const tl = s.speed * warp * 2.5;
          const px = cx + Math.cos(s.angle) * Math.max(0, s.dist - tl);
          const py = cy + Math.sin(s.angle) * Math.max(0, s.dist - tl);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(255,255,255,${s.alpha * 0.3})`;
          ctx.lineWidth = sz * 0.4;
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      });

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    // Show logo + tagline immediately
    requestAnimationFrame(() => {
      const svg = center.querySelector('svg');
      const tagline = center.querySelector('span');
      if (svg) svg.style.opacity = '1';
      if (tagline) tagline.style.opacity = '1';
    });

    // Exit at ~0.7s
    setTimeout(() => {
      done = true;
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.remove();
        if (onDone) onDone();
      }, 300);
    }, 700);
  }

  // ── Skip preference (persisted in localStorage) ──
  const SKIP_KEY = 'mercury_skip_animations';

  window.toggleSkipAnimations = function (skip) {
    localStorage.setItem(SKIP_KEY, skip ? '1' : '0');
  };

  function shouldSkip() {
    return localStorage.getItem(SKIP_KEY) === '1';
  }

  // Restore checkbox state on load
  document.addEventListener('DOMContentLoaded', () => {
    const cb = document.getElementById('skipAnimToggle');
    if (cb) cb.checked = shouldSkip();
  });

  // ── Expose for in-app view switches ──
  window.playMercuryTransition = function (opts) {
    if (shouldSkip()) return;
    createTransition(opts);
  };

  // ── Auto-play on page load (skip pages with own intros) ──
  const path = location.pathname.toLowerCase();
  if (path.endsWith('/') || path.endsWith('/index.html') || path.endsWith('/architect.html')) return;
  createTransition();

})();
