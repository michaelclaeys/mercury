/* ================================================================
   MERCURY — Hub Landing Page
   Galaxy warp intro → "Where to?" hub reveal
   Returning visitors get a fast ~1.5s version
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  const VISITED_KEY = 'mercury_visited';
  const hasVisited = localStorage.getItem(VISITED_KEY);

  /* ═══════════════════════════════════════════════════════════════
     HUB REVEAL — shared by both intro paths
     ═══════════════════════════════════════════════════════════════ */

  function revealHub() {
    localStorage.setItem(VISITED_KEY, '1');

    // Reveal all elements by ID
    [
      'hubLogo', 'hubLogoText', 'hubMotto', 'hubSub',
      'hubPanels', 'hubWatermark', 'hubElement',
      'hubSideWords', 'hubSideWordsR',
      'hubCoords', 'hubReadout', 'hubStatusBadges',
      'hubSchematicTL', 'hubSchematicTR', 'hubSchematicBL', 'hubSchematicBR',
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('visible');
    });

    // Terminal init sequence (animated line-by-line)
    const terminal = document.getElementById('hubTerminal');
    if (terminal) {
      terminal.classList.add('visible');
      terminal.querySelectorAll('.hub-term-line').forEach(line => {
        const delay = parseInt(line.dataset.delay) || 0;
        setTimeout(() => line.classList.add('visible'), delay);
      });
    }

    // Start hub background animation
    initHubBackground();

    // Notify listeners that hub is fully revealed (used by onboarding tour)
    window.dispatchEvent(new CustomEvent('mercury:hub-revealed'));
  }


  /* ═══════════════════════════════════════════════════════════════
     FAST INTRO — returning visitors (~1.5s)
     Quick star burst + logo flash, then straight to hub
     ═══════════════════════════════════════════════════════════════ */

  function runFastIntro() {
    const intro      = document.getElementById('intro');
    const canvas     = document.getElementById('galaxyCanvas');
    const introLogo    = document.getElementById('introLogo');
    const introBrand   = document.getElementById('introBrand');
    const introTagline = document.getElementById('introTagline');

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Smaller, faster star field
    const stars = [];
    for (let i = 0; i < 400; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.random() * 8,
        speed: 1 + Math.random() * 5,
        size: 0.3 + Math.random() * 1.2,
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

      // Fast deceleration: full warp → stop in 0.6s
      const warp = elapsed < 0.6 ? 4 * (1 - elapsed / 0.6) : 0;
      const fade = elapsed < 0.3 ? 0.05 : 0.15 + elapsed * 0.3;

      ctx.fillStyle = `rgba(0, 0, 0, ${fade})`;
      ctx.fillRect(0, 0, w, h);

      // Central glow
      const glowA = Math.min(0.05, elapsed * 0.04);
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, 250);
      gr.addColorStop(0, `rgba(255,255,255,${glowA})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.arc(cx, cy, 250, 0, Math.PI * 2);
      ctx.fill();

      stars.forEach(s => {
        s.dist += s.speed * (warp + 0.1);
        const x = cx + Math.cos(s.angle) * s.dist;
        const y = cy + Math.sin(s.angle) * s.dist;
        if (x < -40 || x > w + 40 || y < -40 || y > h + 40) return;

        const ds = Math.min(s.dist / 150, 2);
        const sz = s.size * (0.5 + ds * 0.5);

        if (warp > 0.5) {
          const tl = s.speed * warp * 3;
          const px = cx + Math.cos(s.angle) * Math.max(0, s.dist - tl);
          const py = cy + Math.sin(s.angle) * Math.max(0, s.dist - tl);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(255,255,255,${s.alpha * 0.4})`;
          ctx.lineWidth = sz * 0.4;
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
        ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      });

      requestAnimationFrame(render);
    }

    requestAnimationFrame(render);

    // Show logo immediately
    introLogo.classList.add('visible');
    introLogo.querySelectorAll('.intro-orbit').forEach(o => o.classList.add('drawn'));
    const core = introLogo.querySelector('.intro-core');
    if (core) core.classList.add('visible');

    // Brand at 0.3s, tagline at 0.6s
    setTimeout(() => introBrand.classList.add('visible'), 300);
    setTimeout(() => { if (introTagline) introTagline.classList.add('visible'); }, 600);

    // Exit at 1.5s
    setTimeout(() => {
      done = true;
      intro.classList.add('exit');
      document.body.classList.remove('intro-active');
      setTimeout(() => {
        intro.classList.add('gone');
        revealHub();
      }, 400);
    }, 1500);
  }


  /* ═══════════════════════════════════════════════════════════════
     FULL INTRO — first-time visitors (~6s)
     Galaxy warp + word cycling + full reveal
     ═══════════════════════════════════════════════════════════════ */

  function runFullIntro() {
    const intro         = document.getElementById('intro');
    const galaxyCanvas  = document.getElementById('galaxyCanvas');
    const introLogo     = document.getElementById('introLogo');
    const introBrand    = document.getElementById('introBrand');
    const introTextline = document.getElementById('introTextline');
    const introWord     = document.getElementById('introWord');
    let introExited = false;
    let introTimers = [];

    // ─── Galaxy star field ───────────────────────────────
    const ctx = galaxyCanvas.getContext('2d');
    const stars = [];
    const STAR_COUNT = 800;
    let warpSpeed = 4;
    let trailFade = 0.04;

    function resizeGalaxy() {
      galaxyCanvas.width = window.innerWidth;
      galaxyCanvas.height = window.innerHeight;
    }
    resizeGalaxy();
    window.addEventListener('resize', resizeGalaxy);

    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        angle: Math.random() * Math.PI * 2,
        dist: Math.random() * 12,
        speed: 0.3 + Math.random() * 3.2,
        size: 0.3 + Math.random() * 1.5,
        alpha: 0.12 + Math.random() * 0.88
      });
    }

    const introStart = performance.now();

    function renderGalaxy(now) {
      if (introExited) return;

      const elapsed = (now - introStart) / 1000;
      const w = galaxyCanvas.width;
      const h = galaxyCanvas.height;
      const cx = w / 2;
      const cy = h / 2;

      if (elapsed < 0.84) {
        warpSpeed = 4; trailFade = 0.03;
      } else if (elapsed < 2.34) {
        const t = (elapsed - 0.84) / 1.5;
        warpSpeed = 4 - t * 3.85;
        trailFade = 0.03 + t * 0.3;
      } else {
        warpSpeed = 0.12; trailFade = 0.35;
      }

      ctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`;
      ctx.fillRect(0, 0, w, h);

      // Central glow
      const glowAlpha = Math.min(0.04, elapsed * 0.015);
      const glowRadius = 200 + elapsed * 15;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
      grad.addColorStop(0, `rgba(255, 255, 255, ${glowAlpha})`);
      grad.addColorStop(0.4, `rgba(200, 200, 210, ${glowAlpha * 0.4})`);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // Expanding rings
      if (elapsed < 6) {
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 5; i++) {
          const ringAge = elapsed - i * 0.8;
          if (ringAge < 0) continue;
          const ringRadius = ringAge * 90;
          const ringAlpha = Math.max(0, 0.07 - ringAge * 0.009);
          if (ringAlpha <= 0) continue;
          ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`;
          ctx.beginPath();
          ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // Stars
      stars.forEach(star => {
        star.dist += star.speed * warpSpeed;
        const x = cx + Math.cos(star.angle) * star.dist;
        const y = cy + Math.sin(star.angle) * star.dist;

        if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
          star.dist = Math.random() * 6;
          star.angle = Math.random() * Math.PI * 2;
          return;
        }

        const depthScale = Math.min(star.dist / 200, 2.5);
        const drawSize = star.size * (0.6 + depthScale * 0.6);

        if (warpSpeed > 0.5) {
          const trailLen = star.speed * warpSpeed * 3.5;
          const px = cx + Math.cos(star.angle) * Math.max(0, star.dist - trailLen);
          const py = cy + Math.sin(star.angle) * Math.max(0, star.dist - trailLen);
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y);
          ctx.strokeStyle = `rgba(255, 255, 255, ${star.alpha * 0.45})`;
          ctx.lineWidth = drawSize * 0.4;
          ctx.stroke();
        }

        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.fillRect(x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
      });

      // Dot grid after warp slows
      if (warpSpeed < 1 && elapsed > 1.34) {
        const gridAlpha = Math.min(0.04, (elapsed - 1.34) * 0.02);
        ctx.fillStyle = `rgba(255, 255, 255, ${gridAlpha})`;
        const spacing = 60;
        const offsetX = cx % spacing;
        const offsetY = cy % spacing;
        for (let gx = offsetX; gx < w; gx += spacing) {
          for (let gy = offsetY; gy < h; gy += spacing) {
            ctx.fillRect(gx, gy, 1, 1);
          }
        }
      }

      requestAnimationFrame(renderGalaxy);
    }

    requestAnimationFrame(renderGalaxy);

    // ─── Intro sequence timing ───────────────────────────
    introTimers.push(setTimeout(() => {
      if (introExited) return;
      introLogo.classList.add('visible');
      introLogo.querySelectorAll('.intro-orbit').forEach(o => o.classList.add('drawn'));
    }, 340));

    introTimers.push(setTimeout(() => {
      if (introExited) return;
      introLogo.querySelector('.intro-core').classList.add('visible');
    }, 940));

    introTimers.push(setTimeout(() => {
      if (introExited) return;
      introBrand.classList.add('visible');
    }, 1540));

    introTimers.push(setTimeout(() => {
      if (introExited) return;
      introTextline.classList.add('visible');
    }, 2340));

    // Word cycling
    const words = ['forecasters', 'conviction', 'precision', 'edge', 'signal', 'insight', 'alpha', 'truth'];
    const finalWord = 'the next generation';
    let wordIndex = 0;

    function cycleWord() {
      if (introExited) return;
      if (wordIndex >= words.length) {
        introWord.classList.add('out');
        setTimeout(() => {
          if (introExited) return;
          introWord.textContent = finalWord;
          introWord.classList.remove('out');
          introWord.classList.add('entering');
          requestAnimationFrame(() => introWord.classList.remove('entering'));
        }, 150);
        introTimers.push(setTimeout(() => {
          if (!introExited) exitIntro();
        }, 1200));
        return;
      }

      introWord.classList.add('out');
      setTimeout(() => {
        if (introExited) return;
        introWord.textContent = words[wordIndex];
        introWord.classList.remove('out');
        introWord.classList.add('entering');
        requestAnimationFrame(() => introWord.classList.remove('entering'));
        wordIndex++;
        introTimers.push(setTimeout(cycleWord, 250));
      }, 150);
    }

    introTimers.push(setTimeout(() => {
      if (introExited) return;
      wordIndex = 1;
      introTimers.push(setTimeout(cycleWord, 250));
    }, 2240));

    // ─── Exit intro ─────────────────────────────────────
    function exitIntro() {
      if (introExited) return;
      introExited = true;
      introTimers.forEach(t => clearTimeout(t));
      intro.classList.add('exit');
      document.body.classList.remove('intro-active');
      setTimeout(() => {
        intro.classList.add('gone');
        revealHub();
      }, 1000);
    }

    intro.addEventListener('click', exitIntro);
  }


  /* ═══════════════════════════════════════════════════════════════
     HUB BACKGROUND (Architect-inspired)
     Blueprint grid, twinkling stars, moon, convergence lines,
     skyline silhouette, shooting stars, ticker
     ═══════════════════════════════════════════════════════════════ */

  function initHubBackground() {
    // Skip expensive skyline canvas on mobile (hidden via CSS, save CPU/GPU)
    if (window.__mercury_mobile) return;
    const hubCanvas = document.getElementById('hubBgCanvas');
    if (!hubCanvas) return;

    const hCtx = hubCanvas.getContext('2d');
    const W = () => hubCanvas.width;
    const H = () => hubCanvas.height;

    function resizeHub() {
      hubCanvas.width = window.innerWidth;
      hubCanvas.height = window.innerHeight;
    }
    resizeHub();
    window.addEventListener('resize', resizeHub);

    const hubStart = performance.now();

    // ── Twinkling stars ──
    const hubStars = [];
    for (let i = 0; i < 120; i++) {
      hubStars.push({
        x: Math.random(),
        y: Math.random() * 0.60,
        size: 1 + Math.random() * 2.5,
        baseAlpha: 0.08 + Math.random() * 0.22,
        twinkleSpeed: 0.8 + Math.random() * 3,
        twinkleOffset: Math.random() * Math.PI * 2,
      });
    }

    // ── Moon ──
    const moonX = 0.12 + Math.random() * 0.08;
    const moonY = 0.08 + Math.random() * 0.06;
    const moonR = 18 + Math.random() * 8;

    // ── Shooting stars ──
    const shootingStars = [];
    for (let i = 0; i < 8; i++) {
      shootingStars.push({
        startX: 0.05 + Math.random() * 0.90,
        startY: 0.02 + Math.random() * 0.20,
        angle: Math.PI * (0.12 + Math.random() * 0.35),
        length: 80 + Math.random() * 120,
        triggerTime: 2 + i * 3.5 + Math.random() * 2,
        duration: 0.3 + Math.random() * 0.2,
        alpha: 0.3 + Math.random() * 0.25,
      });
    }
    const shootingCycle = shootingStars[shootingStars.length - 1].triggerTime + 2;

    // ── Skyline buildings (dense, spread all around) ──
    const skyBuildings = [];

    // Main bottom skyline
    const mainCount = 70;
    for (let i = 0; i < mainCount; i++) {
      const x = (i / mainCount) * 1.2 - 0.1;
      const bw = 0.008 + Math.random() * 0.028;
      const layer = i < 20 ? 0 : i < 50 ? 1 : 2;
      const bh = layer === 0 ? 0.03 + Math.random() * 0.10
               : layer === 1 ? 0.06 + Math.random() * 0.16
               : 0.08 + Math.random() * 0.22;
      const groundY = 1.0;
      const alpha = layer === 0 ? 0.06 + Math.random() * 0.06
                   : layer === 1 ? 0.10 + Math.random() * 0.08
                   : 0.14 + Math.random() * 0.14;
      skyBuildings.push({
        x, bw, bh, groundY, alpha, layer,
        hasAntenna: Math.random() > 0.55,
        antennaH: 0.01 + Math.random() * 0.03,
        hasCrown: layer >= 1 && bh > 0.10 && Math.random() > 0.4,
        crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
        crownH: 0.005 + Math.random() * 0.015,
        windowRows: layer >= 1 ? Math.floor(bh * 120) : 0,
        windowCols: layer >= 1 ? Math.max(1, Math.floor(bw * 250)) : 0,
      });
    }

    // Left cluster — dense, evenly spaced, all from bottom
    const leftCount = 30;
    for (let i = 0; i < leftCount; i++) {
      const bw = 0.006 + Math.random() * 0.018;
      const bh = 0.06 + Math.random() * 0.32;
      const lSpan = 0.24;
      const x = -0.02 + (i / leftCount) * lSpan + (Math.random() - 0.5) * (lSpan / leftCount) * 0.4;
      const layer = i < 10 ? 0 : 1;
      skyBuildings.push({
        x, bw, bh,
        groundY: 1.0,
        alpha: layer === 0 ? 0.05 + Math.random() * 0.06 : 0.08 + Math.random() * 0.10,
        layer,
        hasAntenna: Math.random() > 0.5, antennaH: 0.01 + Math.random() * 0.04,
        hasCrown: bh > 0.12 && Math.random() > 0.4,
        crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
        crownH: 0.005 + Math.random() * 0.02,
        windowRows: Math.floor(bh * 80), windowCols: Math.max(1, Math.floor(bw * 200)),
      });
    }

    // Right cluster — dense, evenly spaced, all from bottom
    const rightCount = 30;
    for (let i = 0; i < rightCount; i++) {
      const bw = 0.006 + Math.random() * 0.018;
      const bh = 0.06 + Math.random() * 0.32;
      const rSpan = 0.24;
      const x = 0.78 + (i / rightCount) * rSpan + (Math.random() - 0.5) * (rSpan / rightCount) * 0.4;
      const layer = i < 10 ? 0 : 1;
      skyBuildings.push({
        x, bw, bh,
        groundY: 1.0,
        alpha: layer === 0 ? 0.05 + Math.random() * 0.06 : 0.08 + Math.random() * 0.10,
        layer,
        hasAntenna: Math.random() > 0.5, antennaH: 0.01 + Math.random() * 0.04,
        hasCrown: bh > 0.12 && Math.random() > 0.4,
        crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
        crownH: 0.005 + Math.random() * 0.02,
        windowRows: Math.floor(bh * 80), windowCols: Math.max(1, Math.floor(bw * 200)),
      });
    }

    // Distant background — evenly spaced
    for (let i = 0; i < 30; i++) {
      skyBuildings.push({
        x: (i / 30) * 1.3 - 0.15,
        bw: 0.005 + Math.random() * 0.012,
        bh: 0.02 + Math.random() * 0.08,
        groundY: 0.78,
        alpha: 0.03 + Math.random() * 0.04, layer: -1,
        hasAntenna: Math.random() > 0.7, antennaH: 0.005 + Math.random() * 0.015,
        hasCrown: false, crownType: 'flat', crownH: 0,
        windowRows: 0, windowCols: 0,
      });
    }

    skyBuildings.sort((a, b) => a.layer - b.layer);

    // Pre-compute window positions for each building (avoids per-frame nested loops + Math.random)
    for (const b of skyBuildings) {
      b._windows = [];
      if (b.windowRows > 0 && b.windowCols > 0) {
        const padXF = 0.15, padYF = 0.08;
        const spacingXF = (1 - padXF * 2) / b.windowCols;
        const spacingYF = (1 - padYF * 2) / b.windowRows;
        const winWF = 0.5 / b.windowCols;
        const winHF = 0.4 / b.windowRows;
        for (let r = 0; r < b.windowRows; r++) {
          for (let c = 0; c < b.windowCols; c++) {
            if (Math.random() > 0.55) continue; // decide once at init
            b._windows.push({
              rx: padXF + c * spacingXF, // relative x within building (0-1 of bw)
              ry: padYF + r * spacingYF, // relative y within building (0-1 of bh)
              wf: winWF, hf: winHF,
              a: 0.3 + Math.random() * 0.5, // brightness, fixed per window
            });
          }
        }
      }
    }

    // ── Convergence lines ──
    const convergenceCount = 12;

    // ── Horizon lights ──
    const horizonLights = [];
    for (let i = 0; i < 25; i++) {
      horizonLights.push({
        x: Math.random(),
        y: 0.78 + Math.random() * 0.04,
        size: 1 + Math.random() * 1.5,
        alpha: 0.12 + Math.random() * 0.15,
        blinkSpeed: 0.5 + Math.random() * 2,
        blinkOffset: Math.random() * Math.PI * 2,
      });
    }

    // ── Helicopters (orbiting with searchlights) ──
    const helis = [
      {
        cx: 0.70 + Math.random() * 0.10,
        cy: 0.12 + Math.random() * 0.06,
        orbitR: 80 + Math.random() * 40,
        speed: 0.25 + Math.random() * 0.12,
        alpha: 0.55 + Math.random() * 0.15,
        scale: 1.4,
        delay: 1.0,
      },
      {
        cx: 0.20 + Math.random() * 0.12,
        cy: 0.18 + Math.random() * 0.08,
        orbitR: 50 + Math.random() * 30,
        speed: -(0.30 + Math.random() * 0.15),
        alpha: 0.40 + Math.random() * 0.12,
        scale: 1.0,
        delay: 4.0,
      },
    ];

    // ── Ticker ──
    const TICKER = '   MERC +4.2   \u25cf   P(YES) 62c   \u25cf   VOL $48.6M   \u25cf   BOTS 842   \u25cf   WIN 67%   \u25cf   KALSHI +8.4   \u25cf   POLY +12.1   ';
    let tickerScroll = 0;

    // ── Render loop ──
    function renderHub(now) {
      const elapsed = (now - hubStart) / 1000;
      const w = W();
      const h = H();
      const cx = w / 2;

      hCtx.clearRect(0, 0, w, h);
      const fadeIn = Math.min(1, elapsed * 0.5);

      // Blueprint grid
      hCtx.strokeStyle = `rgba(255,255,255,${0.04 * fadeIn})`;
      hCtx.lineWidth = 0.3;
      const gs = 50;
      for (let gx = cx % gs; gx < w; gx += gs) {
        hCtx.beginPath(); hCtx.moveTo(gx, 0); hCtx.lineTo(gx, h); hCtx.stroke();
      }
      for (let gy = 0; gy < h; gy += gs) {
        hCtx.beginPath(); hCtx.moveTo(0, gy); hCtx.lineTo(w, gy); hCtx.stroke();
      }

      // Sky glow
      const sg = hCtx.createRadialGradient(cx, h * 0.2, 0, cx, h * 0.2, h * 0.7);
      sg.addColorStop(0, `rgba(255,255,255,${0.04 * fadeIn})`);
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      hCtx.fillStyle = sg;
      hCtx.fillRect(0, 0, w, h);

      // Convergence lines
      const vpY = -h * 0.15;
      hCtx.strokeStyle = `rgba(255,255,255,${0.035 * fadeIn})`;
      hCtx.lineWidth = 0.3;
      for (let i = 0; i < convergenceCount; i++) {
        const gx = (i / (convergenceCount - 1)) * w;
        hCtx.beginPath();
        hCtx.moveTo(gx, h);
        hCtx.lineTo(gx + (cx - gx) * 0.9, vpY);
        hCtx.stroke();
      }

      // Stars
      hubStars.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(elapsed * s.twinkleSpeed + s.twinkleOffset);
        const sa = s.baseAlpha * fadeIn * (0.3 + twinkle * 0.7);
        hCtx.fillStyle = `rgba(255,255,255,${sa})`;
        hCtx.fillRect(s.x * w - s.size / 2, s.y * h - s.size / 2, s.size, s.size);
      });

      // Moon
      if (fadeIn > 0.3) {
        const mA = Math.min(0.35, (fadeIn - 0.3) * 0.5);
        const mx = moonX * w;
        const my = moonY * h;
        hCtx.strokeStyle = `rgba(255,255,255,${mA})`;
        hCtx.lineWidth = 1.2;
        hCtx.beginPath();
        hCtx.arc(mx, my, moonR, -0.4, Math.PI + 0.4);
        hCtx.stroke();
        hCtx.beginPath();
        hCtx.arc(mx + moonR * 0.35, my - moonR * 0.1, moonR * 0.85, -0.3, Math.PI + 0.3);
        hCtx.strokeStyle = `rgba(0,0,0,${mA * 3})`;
        hCtx.stroke();
        const mg = hCtx.createRadialGradient(mx, my, 0, mx, my, moonR * 3);
        mg.addColorStop(0, `rgba(255,255,255,${mA * 0.35})`);
        mg.addColorStop(1, 'rgba(0,0,0,0)');
        hCtx.fillStyle = mg;
        hCtx.beginPath();
        hCtx.arc(mx, my, moonR * 3, 0, Math.PI * 2);
        hCtx.fill();
      }

      // Shooting stars
      const cycleTime = elapsed % shootingCycle;
      shootingStars.forEach(ss => {
        const st = cycleTime - ss.triggerTime;
        if (st < 0 || st > ss.duration) return;
        const prog = st / ss.duration;
        const headX = ss.startX * w + Math.cos(ss.angle) * ss.length * prog;
        const headY = ss.startY * h + Math.sin(ss.angle) * ss.length * prog;
        const tailFrac = Math.max(0, prog - 0.3);
        const tailX = ss.startX * w + Math.cos(ss.angle) * ss.length * tailFrac;
        const tailY = ss.startY * h + Math.sin(ss.angle) * ss.length * tailFrac;
        const fadeSS = (prog < 0.2 ? prog / 0.2 : 1) * (prog > 0.7 ? (1 - prog) / 0.3 : 1);
        const ssA = ss.alpha * fadeSS * fadeIn;
        const grad = hCtx.createLinearGradient(tailX, tailY, headX, headY);
        grad.addColorStop(0, 'rgba(255,255,255,0)');
        grad.addColorStop(1, `rgba(255,255,255,${ssA})`);
        hCtx.strokeStyle = grad;
        hCtx.lineWidth = 1.5;
        hCtx.beginPath();
        hCtx.moveTo(tailX, tailY);
        hCtx.lineTo(headX, headY);
        hCtx.stroke();
        hCtx.fillStyle = `rgba(255,255,255,${ssA * 1.3})`;
        hCtx.fillRect(headX - 1.5, headY - 1.5, 3, 3);
      });

      // Helicopters
      helis.forEach(heli => {
        if (elapsed <= heli.delay) return;
        const hElapsed = elapsed - heli.delay;
        const hFadeIn = Math.min(1, hElapsed * 1.5) * fadeIn;
        const ha = heli.alpha * hFadeIn;
        const s = heli.scale;
        const hAngle = hElapsed * heli.speed;
        const hx = heli.cx * w + Math.cos(hAngle) * heli.orbitR;
        const hy = heli.cy * h + Math.sin(hAngle) * heli.orbitR * 0.4;

        // Body
        hCtx.strokeStyle = `rgba(255,255,255,${ha})`;
        hCtx.lineWidth = 1.2 * s;
        hCtx.beginPath();
        hCtx.moveTo(hx - 12 * s, hy);
        hCtx.lineTo(hx + 12 * s, hy);
        hCtx.lineTo(hx + 15 * s, hy + 6 * s);
        hCtx.lineTo(hx - 9 * s, hy + 6 * s);
        hCtx.closePath();
        hCtx.stroke();
        // Windshield
        hCtx.lineWidth = 0.6 * s;
        hCtx.beginPath();
        hCtx.moveTo(hx + 6 * s, hy); hCtx.lineTo(hx + 10 * s, hy + 4 * s);
        hCtx.stroke();
        // Tail boom
        hCtx.lineWidth = 1.0 * s;
        hCtx.beginPath();
        hCtx.moveTo(hx - 12 * s, hy);
        hCtx.lineTo(hx - 32 * s, hy - 3 * s);
        hCtx.lineTo(hx - 36 * s, hy - 9 * s);
        hCtx.stroke();
        // Tail rotor
        hCtx.beginPath();
        hCtx.moveTo(hx - 36 * s, hy - 14 * s);
        hCtx.lineTo(hx - 36 * s, hy - 4 * s);
        hCtx.stroke();
        // Main rotor (spinning)
        const rotorAngle = hElapsed * 12;
        const rLen = 24 * s;
        hCtx.lineWidth = 0.8 * s;
        hCtx.beginPath();
        hCtx.moveTo(hx + Math.cos(rotorAngle) * rLen, hy - 7 * s + Math.sin(rotorAngle) * 2.5 * s);
        hCtx.lineTo(hx - Math.cos(rotorAngle) * rLen, hy - 7 * s - Math.sin(rotorAngle) * 2.5 * s);
        hCtx.stroke();
        // Rotor hub
        hCtx.fillStyle = `rgba(255,255,255,${ha * 0.6})`;
        hCtx.fillRect(hx - 1.5 * s, hy - 8 * s, 3 * s, 3 * s);
        // Skids
        hCtx.strokeStyle = `rgba(255,255,255,${ha})`;
        hCtx.lineWidth = 0.7 * s;
        hCtx.beginPath();
        hCtx.moveTo(hx - 8 * s, hy + 6 * s); hCtx.lineTo(hx - 10 * s, hy + 10 * s);
        hCtx.moveTo(hx + 8 * s, hy + 6 * s); hCtx.lineTo(hx + 10 * s, hy + 10 * s);
        hCtx.moveTo(hx - 14 * s, hy + 10 * s); hCtx.lineTo(hx + 14 * s, hy + 10 * s);
        hCtx.stroke();
        // Blinking light
        const hBlink = (Math.sin(elapsed * 5 + heli.delay) + 1) * 0.5;
        if (hBlink > 0.6) {
          hCtx.fillStyle = `rgba(255,255,255,${ha * 1.5})`;
          hCtx.fillRect(hx - 2.5 * s, hy + 6 * s, 5 * s, 5 * s);
        }
        // Searchlight cone
        if (hElapsed > 0.5) {
          const slA = ha * 0.18 * (0.5 + 0.5 * Math.sin(hElapsed * 0.7));
          hCtx.beginPath();
          hCtx.moveTo(hx, hy + 10 * s);
          hCtx.lineTo(hx - 25 * s + Math.sin(hElapsed * 0.3) * 12 * s, hy + 150 * s);
          hCtx.lineTo(hx + 25 * s + Math.sin(hElapsed * 0.3) * 12 * s, hy + 150 * s);
          hCtx.closePath();
          hCtx.fillStyle = `rgba(255,255,255,${slA})`;
          hCtx.fill();
        }
      });

      // Horizon lights
      horizonLights.forEach(hl => {
        const blink = 0.5 + 0.5 * Math.sin(elapsed * hl.blinkSpeed + hl.blinkOffset);
        const hlA = hl.alpha * fadeIn * (0.4 + blink * 0.6);
        hCtx.fillStyle = `rgba(255,255,255,${hlA})`;
        hCtx.fillRect(hl.x * w - hl.size / 2, hl.y * h - hl.size / 2, hl.size, hl.size);
      });

      // Skyline buildings
      skyBuildings.forEach(b => {
        const bx = b.x * w;
        const bw = b.bw * w;
        const bh = b.bh * h;
        const gY = b.groundY * h;
        const a = b.alpha * fadeIn;

        hCtx.strokeStyle = `rgba(255,255,255,${a})`;
        hCtx.lineWidth = b.layer <= 0 ? 0.4 : b.layer === 1 ? 0.7 : 1.0;
        hCtx.beginPath();
        hCtx.moveTo(bx, gY);
        hCtx.lineTo(bx, gY - bh);
        hCtx.lineTo(bx + bw, gY - bh);
        hCtx.lineTo(bx + bw, gY);
        hCtx.stroke();

        hCtx.fillStyle = `rgba(255,255,255,${a * 0.15})`;
        hCtx.fillRect(bx, gY - bh, bw, bh);

        if (b.hasCrown) {
          const cH = b.crownH * h;
          const midX = bx + bw / 2;
          hCtx.strokeStyle = `rgba(255,255,255,${a * 0.8})`;
          hCtx.lineWidth = 0.8;
          if (b.crownType === 'spire') {
            hCtx.beginPath();
            hCtx.moveTo(midX, gY - bh - cH); hCtx.lineTo(bx + bw * 0.35, gY - bh);
            hCtx.moveTo(midX, gY - bh - cH); hCtx.lineTo(bx + bw * 0.65, gY - bh);
            hCtx.stroke();
          } else if (b.crownType === 'pyramid') {
            hCtx.beginPath();
            hCtx.moveTo(bx, gY - bh);
            hCtx.lineTo(midX, gY - bh - cH);
            hCtx.lineTo(bx + bw, gY - bh);
            hCtx.stroke();
          }
        }

        if (b.hasAntenna) {
          const aH = b.antennaH * h;
          const midX = bx + bw / 2;
          hCtx.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
          hCtx.lineWidth = 0.5;
          hCtx.beginPath();
          hCtx.moveTo(midX, gY - bh); hCtx.lineTo(midX, gY - bh - aH);
          hCtx.stroke();
          const blink = (Math.sin(elapsed * 2 + bx) + 1) / 2;
          hCtx.fillStyle = `rgba(255,255,255,${a * 0.4 * blink})`;
          hCtx.fillRect(midX - 1, gY - bh - aH - 1, 2, 2);
        }

        if (b._windows && b._windows.length > 0) {
          for (const win of b._windows) {
            const wx = bx + win.rx * bw;
            const wy = gY - bh + win.ry * bh;
            hCtx.fillStyle = `rgba(255,255,255,${a * win.a})`;
            hCtx.fillRect(wx, wy, win.wf * bw, win.hf * bh);
          }
        }
      });

      // Ground glow
      const gg = hCtx.createLinearGradient(0, h, 0, h - 50);
      gg.addColorStop(0, `rgba(255,255,255,${0.08 * fadeIn})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      hCtx.fillStyle = gg;
      hCtx.fillRect(0, h - 60, w, 60);

      // Ticker
      tickerScroll += 0.4;
      hCtx.font = '500 9px JetBrains Mono, monospace';
      hCtx.fillStyle = `rgba(255,255,255,${0.06 * fadeIn})`;
      const tickerY = h - 6;
      const tickerW = hCtx.measureText(TICKER).width;
      const tickerX = -(tickerScroll % tickerW);
      for (let tx = tickerX; tx < w; tx += tickerW) {
        hCtx.fillText(TICKER, tx, tickerY);
      }

      requestAnimationFrame(renderHub);
    }

    requestAnimationFrame(renderHub);
  }


  /* ═══════════════════════════════════════════════════════════════
     BOOT — pick intro path
     ═══════════════════════════════════════════════════════════════ */

  if (hasVisited) {
    runFastIntro();
  } else {
    runFullIntro();
  }

});
