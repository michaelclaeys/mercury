/* ================================================================
   MERCURY ARCHITECT — Wall Street Skyline Intro + Page Animations
   Zoom-reveal cityscape · financial district · schematic overlay
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — WALL STREET SKYLINE INTRO
     Camera starts zoomed into the heart of the financial district,
     then slowly pulls back to reveal a grand skyline with
     architectural detail, Wall Street references, and schematic
     annotations — all in wireframe blueprint style.
     ═══════════════════════════════════════════════════════════════ */

  const archIntro = document.getElementById('archIntro');
  const canvas = document.getElementById('blueprintCanvas');
  const archTitle = document.getElementById('archTitle');
  const archTextline = document.getElementById('archTextline');
  const archWord = document.getElementById('archWord');
  const archTerminal = document.getElementById('archTerminal');
  let introExited = false;
  let introTimers = [];

  const ARCH_VISITED_KEY = 'mercury_arch_visited';
  const archHasVisited = localStorage.getItem(ARCH_VISITED_KEY);

  const ctx = canvas.getContext('2d');

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  // Utilities
  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  /* ─── Constants ─── */

  const ZOOM_FROM = 1.45;
  const ZOOM_TO = 0.80;
  const ZOOM_MS = 4000;
  const RISE_MS = 1800;
  let introStart = performance.now();
  const W = window.innerWidth;
  const H = window.innerHeight;

  const SIGNS = ['MERCURY', 'EXCHANGE', 'FEDERAL', 'LIBERTY', 'TRADE', 'CAPITAL', 'SIGNAL', 'ALPHA'];
  let signIdx = 0;

  const TICKER = '   MERC +4.2   \u25cf   P(YES) 62c   \u25cf   VOL $48.6M   \u25cf   BOTS 842   \u25cf   WIN 67%   \u25cf   KALSHI +8.4   \u25cf   POLY +12.1   \u25cf   ROI +18.4%   ';
  let tickerScroll = 0;

  /* ─── Generate buildings in 3 depth layers ─── */
  // Layer 0 = far skyline (base high, short, dim, simple)
  // Layer 1 = mid-ground  (base mid, medium, moderate detail)
  // Layer 2 = foreground   (base at bottom, tall, bright, full detail)

  const buildings = [];

  function makeBldg(layer, x, bw, bh) {
    // Ground line per layer — far buildings sit higher up (distance)
    const groundY = layer === 0 ? H * 0.58 : layer === 1 ? H * 0.75 : H;
    const alphaBase = layer === 0 ? 0.10 : layer === 1 ? 0.22 : 0.40;
    const alphaMax  = layer === 0 ? 0.20 : layer === 1 ? 0.38 : 0.85;
    const alpha = alphaBase + Math.random() * (alphaMax - alphaBase);

    const tall = bh > H * 0.35 && layer === 2;
    const wide = bw > 45 && layer >= 1;

    // Architectural features only on mid + foreground
    const setbacks = [];
    if (tall && Math.random() > 0.45) {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let s = 0; s < n; s++)
        setbacks.push({ frac: 0.68 + s * 0.09, inset: 3 + Math.random() * 8 });
    }

    let crown = null;
    if (tall && Math.random() > 0.3)
      crown = { type: ['spire','pyramid','chevron'][Math.floor(Math.random()*3)], height: 8 + Math.random() * 20 };

    const hasColumns = bw > 30 && !tall && layer >= 1 && Math.random() > 0.45;
    const colCount = hasColumns ? 4 + Math.floor(Math.random() * 8) : 0;
    const colFrac = hasColumns ? 0.25 + Math.random() * 0.15 : 0;

    const hasTicker = layer === 2 && Math.random() > 0.84;
    const tickerFrac = 0.12 + Math.random() * 0.20;

    const hasXBrace = layer === 2 && tall && Math.random() > 0.7;

    const hasWaterTower = layer >= 1 && !tall && Math.random() > 0.65;
    const waterTowerFrac = 0.2 + Math.random() * 0.6;
    const hasMechBox = layer >= 1 && Math.random() > 0.55;
    const mechBoxFrac = 0.3 + Math.random() * 0.4;
    const hasFlag = layer === 2 && Math.random() > 0.85;
    const flagFrac = 0.1 + Math.random() * 0.8;

    const hasAntenna = Math.random() > 0.4;
    const antennaH = 8 + Math.random() * (layer === 0 ? 15 : 45);

    let sign = null;
    if (layer === 2 && Math.random() > 0.78 && signIdx < SIGNS.length)
      sign = SIGNS[signIdx++];

    const hasDimLine = layer === 2 && Math.random() > 0.91;
    const floors = Math.round(bh / (H * 0.012));

    const sideDepth = layer === 0 ? 0 : 2 + Math.random() * 8;
    const sideDir = x + bw / 2 < W / 2 ? 1 : -1;

    const distFromCenter = Math.abs(x + bw / 2 - W / 2) / (W / 2);
    const riseDelay = layer * 300 + distFromCenter * 600 + Math.random() * 500;

    buildings.push({
      layer, x, width: bw, targetH: bh, curH: 0, groundY, alpha,
      riseDelay, riseStarted: false, windows: [],
      setbacks, crown,
      hasColumns, colCount, colFrac,
      hasTicker, tickerFrac, hasXBrace,
      hasWaterTower, waterTowerFrac,
      hasMechBox, mechBoxFrac,
      hasFlag, flagFrac,
      hasAntenna, antennaH,
      sign, hasDimLine, floors,
      sideDepth, sideDir,
    });
  }

  // Layer 0 — far skyline (30 packed small buildings)
  for (let i = 0; i < 30; i++) {
    const x = -W * 0.05 + (i / 30) * W * 1.1 + (Math.random() - 0.5) * 15;
    makeBldg(0, x, 8 + Math.random() * 28, H * (0.04 + Math.random() * 0.16));
  }

  // Layer 1 — mid-ground (25 medium buildings)
  for (let i = 0; i < 25; i++) {
    const x = -W * 0.1 + (i / 25) * W * 1.2 + (Math.random() - 0.5) * 25;
    makeBldg(1, x, 12 + Math.random() * 42, H * (0.08 + Math.random() * 0.25));
  }

  // Layer 2 — foreground (25 tall detailed buildings)
  for (let i = 0; i < 25; i++) {
    const x = -W * 0.15 + (i / 25) * W * 1.3 + (Math.random() - 0.5) * 35;
    makeBldg(2, x, 18 + Math.random() * 65, H * (0.20 + Math.random() * 0.50));
  }

  // Sort: layer 0 first, then 1, then 2. Within same layer, random.
  buildings.sort((a, b) => a.layer - b.layer || a.x - b.x);

  /* ─── Charging Bull (normalized 0-1 coords) ─── */

  const bullPts = [
    [0,.50],[.04,.28],[.08,.16],[.14,.10],[.22,.06],[.30,.05],
    [.38,.04],[.46,.06],[.52,.04],[.56,.02],[.59,.00],[.57,.05],
    [.61,.01],[.58,.08],[.56,.14],[.54,.20],[.50,.24],[.48,.30],
    [.51,.42],[.53,.50],[.49,.50],[.47,.38],[.42,.32],[.36,.30],
    [.28,.32],[.22,.30],[.24,.44],[.26,.50],[.22,.50],[.19,.40],
    [.14,.36],[.08,.40],[.04,.48],[.01,.50],[0,.50]
  ];
  const bullWorldX = W * 0.62;
  const bullSize = 70;
  const wallStX = W * 0.36;

  /* ─── Atmospheric details (pre-generated) ─── */

  // Stars — tiny twinkling dots in upper sky
  const stars = [];
  for (let i = 0; i < 55; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * H * 0.50,
      size: 1.2 + Math.random() * 2.5,
      baseAlpha: 0.10 + Math.random() * 0.20,
      twinkleSpeed: 1 + Math.random() * 3,
      twinkleOffset: Math.random() * Math.PI * 2,
    });
  }

  // Moon — thin crescent, upper-left area
  const moonX = W * (0.10 + Math.random() * 0.12);
  const moonY = H * (0.07 + Math.random() * 0.08);
  const moonR = 25 + Math.random() * 12;

  // Airplanes — slow-moving across the sky with nav lights + contrails
  const planes = [];
  for (let i = 0; i < 3; i++) {
    planes.push({
      x: -150 + Math.random() * W * 0.4,
      y: H * (0.04 + Math.random() * 0.28),
      speed: 0.12 + Math.random() * 0.22,
      dir: i === 1 ? -1 : 1,
      size: 10 + Math.random() * 8,
      alpha: 0.30 + Math.random() * 0.20,
      blinkOffset: Math.random() * Math.PI * 2,
      hasContrail: Math.random() > 0.35,
      contrailLen: 120 + Math.random() * 180,
      delay: 0.3 + i * 0.4 + Math.random() * 0.3,
    });
  }

  // Shooting stars — triggered at specific times
  const shootingStars = [];
  for (let i = 0; i < 6; i++) {
    shootingStars.push({
      startX: W * (0.05 + Math.random() * 0.90),
      startY: H * (0.01 + Math.random() * 0.18),
      angle: Math.PI * (0.12 + Math.random() * 0.35),
      length: 100 + Math.random() * 150,
      triggerTime: 0.8 + i * 0.7 + Math.random() * 0.5,
      duration: 0.25 + Math.random() * 0.25,
      alpha: 0.40 + Math.random() * 0.30,
    });
  }

  // Bird flocks — small V-formations drifting
  const flocks = [];
  for (let i = 0; i < 3; i++) {
    const birdCount = 3 + Math.floor(Math.random() * 5);
    const birds = [];
    for (let b = 0; b < birdCount; b++) {
      const side = b % 2 === 0 ? -1 : 1;
      const rank = Math.ceil((b + 1) / 2);
      birds.push({
        offX: side * rank * (10 + Math.random() * 6),
        offY: rank * (6 + Math.random() * 4),
        wingPhase: Math.random() * Math.PI * 2,
      });
    }
    flocks.push({
      x: -80 + Math.random() * W * 0.3,
      y: H * (0.12 + Math.random() * 0.30),
      speed: 0.25 + Math.random() * 0.35,
      dir: Math.random() > 0.3 ? 1 : -1,
      alpha: 0.25 + Math.random() * 0.15,
      birds,
      delay: 0.5 + i * 0.5 + Math.random() * 0.3,
    });
  }

  // Helicopter — distant orbit with searchlight
  const heli = {
    cx: W * (0.72 + Math.random() * 0.12),
    cy: H * (0.14 + Math.random() * 0.08),
    orbitR: 40 + Math.random() * 25,
    speed: 0.35 + Math.random() * 0.2,
    alpha: 0.35 + Math.random() * 0.15,
    delay: 0.8,
  };

  // Distant city lights on horizon (between far and mid skyline)
  const horizonLights = [];
  for (let i = 0; i < 20; i++) {
    horizonLights.push({
      x: Math.random() * W,
      y: H * (0.53 + Math.random() * 0.06),
      size: 1.5 + Math.random() * 2.0,
      alpha: 0.15 + Math.random() * 0.18,
      blinkSpeed: 0.5 + Math.random() * 2,
      blinkOffset: Math.random() * Math.PI * 2,
    });
  }

  /* ─── Street-level details (pre-generated) ─── */

  const streetSigns = [];
  const STREET_NAMES = ['BROAD ST', 'NASSAU', 'PINE ST', 'CEDAR', 'LIBERTY', 'FULTON', 'MAIDEN LN', 'EXCHANGE PL'];
  for (let i = 0; i < 8; i++) {
    streetSigns.push({
      x: W * (0.04 + (i / 7) * 0.92) + (Math.random() - 0.5) * 30,
      postH: 30 + Math.random() * 14,
      signW: 38 + Math.random() * 16,
      name: STREET_NAMES[i % STREET_NAMES.length],
      alpha: 0.35 + Math.random() * 0.20,
      delay: 0.4 + i * 0.1,
    });
  }

  const streetLamps = [];
  for (let i = 0; i < 12; i++) {
    streetLamps.push({
      x: W * (0.01 + (i / 11) * 0.98) + (Math.random() - 0.5) * 20,
      height: 40 + Math.random() * 18,
      alpha: 0.30 + Math.random() * 0.18,
      glowR: 14 + Math.random() * 10,
      delay: 0.3 + i * 0.1,
    });
  }

  const trees = [];
  for (let i = 0; i < 8; i++) {
    trees.push({
      x: W * (0.06 + (i / 7) * 0.88) + (Math.random() - 0.5) * 40,
      trunkH: 24 + Math.random() * 14,
      canopyR: 14 + Math.random() * 10,
      alpha: 0.30 + Math.random() * 0.18,
      delay: 0.5 + i * 0.12,
    });
  }

  const crosswalks = [];
  for (let i = 0; i < 5; i++) {
    crosswalks.push({
      x: W * (0.10 + i * 0.20) + (Math.random() - 0.5) * 25,
      width: 50 + Math.random() * 30,
      stripes: 6 + Math.floor(Math.random() * 3),
      alpha: 0.22 + Math.random() * 0.12,
      delay: 0.4 + i * 0.15,
    });
  }

  const fireHydrants = [];
  for (let i = 0; i < 5; i++) {
    fireHydrants.push({
      x: W * (0.12 + i * 0.20) + (Math.random() - 0.5) * 50,
      alpha: 0.32 + Math.random() * 0.15,
      delay: 0.5 + i * 0.15,
    });
  }

  /* ─── Render ─── */

  function render(now) {
    if (introExited) return;

    const elapsed = (now - introStart) / 1000;
    const ems = elapsed * 1000;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;

    // Gentle zoom-out (1.35 → 1.0)
    const zT = clamp01(ems / ZOOM_MS);
    const zoom = ZOOM_FROM + (ZOOM_TO - ZOOM_FROM) * easeOutQuart(zT);

    // Vanishing point
    const vpX = cx;
    const vpY = -h * 0.12;
    const totalDist = h - vpY;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // ── Blueprint grid ──
    if (elapsed > 0.3) {
      const ga = Math.min(0.04, (elapsed - 0.3) * 0.012);
      ctx.strokeStyle = `rgba(255,255,255,${ga})`;
      ctx.lineWidth = 0.3;
      const gs = 50;
      for (let gx = cx % gs; gx < w; gx += gs) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
      }
      for (let gy = 0; gy < h; gy += gs) {
        ctx.beginPath(); ctx.moveTo(0, h - gy); ctx.lineTo(w, h - gy); ctx.stroke();
      }
    }

    // ── Sky glow ──
    const sg = ctx.createRadialGradient(vpX, h * 0.15, 0, vpX, h * 0.15, h * 0.65);
    sg.addColorStop(0, 'rgba(255,255,255,0.04)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);

    // ── Ground glow ──
    if (elapsed > 0.4) {
      const ga2 = Math.min(0.10, (elapsed - 0.4) * 0.03);
      const gg = ctx.createLinearGradient(0, h, 0, h - 70);
      gg.addColorStop(0, `rgba(255,255,255,${ga2})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(0, h - 70, w, 70);
    }

    // ── Convergence lines ──
    if (elapsed > 1.5) {
      const clA = Math.min(0.03, (elapsed - 1.5) * 0.008);
      ctx.strokeStyle = `rgba(255,255,255,${clA})`;
      ctx.lineWidth = 0.3;
      for (let i = 0; i < 10; i++) {
        const gx = (i / 9) * w;
        ctx.beginPath();
        ctx.moveTo(gx, h);
        ctx.lineTo(gx + (vpX - gx) * 0.9, h - h * 0.9);
        ctx.stroke();
      }
    }

    // ── Stars (behind buildings) ──
    if (elapsed > 0.3) {
      const starFade = Math.min(1, (elapsed - 0.3) * 1.5);
      stars.forEach(s => {
        const twinkle = 0.5 + 0.5 * Math.sin(elapsed * s.twinkleSpeed + s.twinkleOffset);
        const sa = s.baseAlpha * 3 * starFade * (0.3 + twinkle * 0.7);
        const sx = cx + (s.x - cx) * zoom;
        const sy = s.y;
        ctx.fillStyle = `rgba(255,255,255,${sa})`;
        ctx.fillRect(sx - s.size / 2, sy - s.size / 2, s.size, s.size);
      });
    }

    // ── Moon (thin crescent) ──
    if (elapsed > 0.5) {
      const mA = Math.min(0.35, (elapsed - 0.5) * 0.15);
      const mx = cx + (moonX - cx) * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${mA})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, moonY, moonR * zoom, -0.4, Math.PI + 0.4);
      ctx.stroke();
      // Inner arc to make crescent
      ctx.beginPath();
      ctx.arc(mx + moonR * 0.35 * zoom, moonY - moonR * 0.1 * zoom, moonR * 0.85 * zoom, -0.3, Math.PI + 0.3);
      ctx.strokeStyle = `rgba(0,0,0,${mA * 3})`;
      ctx.stroke();
      // Subtle glow
      const mg = ctx.createRadialGradient(mx, moonY, 0, mx, moonY, moonR * 2.5 * zoom);
      mg.addColorStop(0, `rgba(255,255,255,${mA * 0.5})`);
      mg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - moonR * 4, moonY - moonR * 4, moonR * 8, moonR * 8);
    }

    // ── Shooting stars ──
    shootingStars.forEach(ss => {
      const st = elapsed - ss.triggerTime;
      if (st < 0 || st > ss.duration) return;
      const prog = st / ss.duration;
      const headX = ss.startX + Math.cos(ss.angle) * ss.length * prog;
      const headY = ss.startY + Math.sin(ss.angle) * ss.length * prog;
      const tailFrac = Math.max(0, prog - 0.3);
      const tailX = ss.startX + Math.cos(ss.angle) * ss.length * tailFrac;
      const tailY = ss.startY + Math.sin(ss.angle) * ss.length * tailFrac;
      const fadeIn = prog < 0.2 ? prog / 0.2 : 1;
      const fadeOut = prog > 0.7 ? (1 - prog) / 0.3 : 1;
      const ssA = ss.alpha * fadeIn * fadeOut;
      const grad = ctx.createLinearGradient(tailX, tailY, headX, headY);
      grad.addColorStop(0, `rgba(255,255,255,0)`);
      grad.addColorStop(1, `rgba(255,255,255,${ssA})`);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(headX, headY);
      ctx.stroke();
      // Bright head dot
      ctx.fillStyle = `rgba(255,255,255,${ssA * 1.5})`;
      ctx.fillRect(headX - 2, headY - 2, 4, 4);
    });

    // ── Horizon lights (distant city between layers) ──
    if (elapsed > 0.5) {
      const hlFade = Math.min(1, (elapsed - 0.5) * 1.0);
      horizonLights.forEach(hl => {
        const blink = 0.5 + 0.5 * Math.sin(elapsed * hl.blinkSpeed + hl.blinkOffset);
        const hlA = hl.alpha * hlFade * (0.4 + blink * 0.6);
        const hlx = cx + (hl.x - cx) * zoom;
        ctx.fillStyle = `rgba(255,255,255,${hlA})`;
        ctx.fillRect(hlx - hl.size / 2, hl.y - hl.size / 2, hl.size, hl.size);
      });
    }

    // ── Buildings ──
    buildings.forEach(b => {
      if (ems < b.riseDelay) return;

      // Init windows
      if (!b.riseStarted) {
        b.riseStarted = true;
        if (b.layer >= 1) { // only mid + foreground get windows
          const cols = Math.max(1, Math.floor(b.width / 9));
          const rows = Math.max(2, Math.floor(b.targetH / 14));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              b.windows.push({
                row: r, col: c, totalR: rows, totalC: cols,
                lit: Math.random() > 0.38,
                alpha: 0.06 + Math.random() * 0.55,
                flicker: 0.002 + Math.random() * 0.005,
              });
            }
          }
        }
      }

      // Rise
      const rT = clamp01((ems - b.riseDelay) / RISE_MS);
      const eR = easeOutQuart(rT);
      b.curH = b.targetH * eR;
      if (b.curH < 2) return;

      // Per-building ground line (layers have different baselines)
      const gY = b.groundY;

      // Apply zoom
      const bx = cx + (b.x - cx) * zoom;
      const bw = b.width * zoom;
      const bh = b.curH * zoom;
      const sd = b.sideDepth * zoom;
      const sDir = b.sideDir;

      if (bx + bw < -50 || bx > w + 50) return;

      const bL = bx;
      const bR = bx + bw;
      const a = b.alpha;

      // Perspective — converge toward VP based on height relative to full canvas
      const pR = bh / totalDist;
      const tLX = bL + (vpX - bL) * pR;
      const tRX = bR + (vpX - bR) * pR;
      const tY = gY - bh;

      // ── Colonnade / Temple building (distinct shape — NO rectangle) ──
      if (b.hasColumns && b.layer >= 1 && rT > 0.15) {
        const colA = a * 0.85;
        const colTopH = bh * b.colFrac;
        const colTopPR = colTopH / totalDist;
        const pedLX = bL + (vpX - bL) * colTopPR;
        const pedRX = bR + (vpX - bR) * colTopPR;
        const colTopY = gY - colTopH;
        const pedMid = (pedLX + pedRX) / 2;
        const pedH = 14 * zoom;
        const entH = 6 * zoom;

        // Steps at base (3 steps, each wider than building)
        ctx.strokeStyle = `rgba(255,255,255,${colA * 0.5})`;
        ctx.lineWidth = 0.8;
        for (let st = 0; st < 3; st++) {
          const stepW = bw * (1.08 + st * 0.06);
          const stepY = gY - st * 3 * zoom;
          const stepX = bL - (stepW - bw) / 2;
          ctx.beginPath();
          ctx.moveTo(stepX, stepY);
          ctx.lineTo(stepX + stepW, stepY);
          ctx.stroke();
        }
        const colBaseY = gY - 9 * zoom; // top of steps

        // Free-standing columns (no enclosing rectangle)
        ctx.strokeStyle = `rgba(255,255,255,${colA})`;
        ctx.lineWidth = b.layer === 2 ? 1.5 : 1.0;
        for (let c = 0; c < b.colCount; c++) {
          const frac = (c + 0.5) / b.colCount;
          const colBX = bL + bw * frac;
          const colTX = pedLX + (pedRX - pedLX) * frac;
          ctx.beginPath();
          ctx.moveTo(colBX, colBaseY);
          ctx.lineTo(colTX, colTopY + entH);
          ctx.stroke();
          // Column capital (small widening at top)
          const capW = (bw / b.colCount) * 0.35 * zoom;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(colTX - capW, colTopY + entH);
          ctx.lineTo(colTX + capW, colTopY + entH);
          ctx.stroke();
          ctx.lineWidth = b.layer === 2 ? 1.5 : 1.0;
        }

        // Entablature (thick band between columns and pediment)
        ctx.strokeStyle = `rgba(255,255,255,${colA * 0.8})`;
        ctx.lineWidth = 1.2;
        // Bottom of entablature
        ctx.beginPath();
        ctx.moveTo(pedLX, colTopY + entH);
        ctx.lineTo(pedRX, colTopY + entH);
        ctx.stroke();
        // Top of entablature
        ctx.beginPath();
        ctx.moveTo(pedLX, colTopY);
        ctx.lineTo(pedRX, colTopY);
        ctx.stroke();
        // Fill entablature lightly
        ctx.fillStyle = `rgba(255,255,255,${colA * 0.04})`;
        ctx.fillRect(pedLX, colTopY, pedRX - pedLX, entH);

        // Pediment (triangle)
        ctx.strokeStyle = `rgba(255,255,255,${colA})`;
        ctx.lineWidth = b.layer === 2 ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(pedLX - 3 * zoom, colTopY);
        ctx.lineTo(pedMid, colTopY - pedH);
        ctx.lineTo(pedRX + 3 * zoom, colTopY);
        ctx.closePath();
        ctx.stroke();
        // Pediment fill
        ctx.fillStyle = `rgba(255,255,255,${colA * 0.03})`;
        ctx.fill();

        // Tympanum detail (small circle or motif inside pediment)
        if (bw > 40) {
          ctx.strokeStyle = `rgba(255,255,255,${colA * 0.4})`;
          ctx.lineWidth = 0.6;
          const tympR = pedH * 0.25;
          ctx.beginPath();
          ctx.arc(pedMid, colTopY - pedH * 0.4, tympR, 0, Math.PI * 2);
          ctx.stroke();
        }

      } else {
        // ── Main outline (regular buildings) ──
        ctx.beginPath();
        ctx.moveTo(bL, gY);
        ctx.lineTo(tLX, tY);
        ctx.lineTo(tRX, tY);
        ctx.lineTo(bR, gY);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,255,255,${b.layer === 0 ? a * 0.02 : a * 0.05})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.lineWidth = b.layer === 0 ? 0.6 : b.layer === 1 ? 1.0 : 1.5 + Math.random() * 0.5;
        ctx.stroke();

        // ── 3D side face (mid + foreground only) ──
        if (b.layer >= 1 && bw > 12 && sd > 0) {
          const sa = a * 0.45;
          const sOff = sd * sDir;
          ctx.strokeStyle = `rgba(255,255,255,${sa})`;
          ctx.lineWidth = 0.6;
          if (sDir > 0) {
            ctx.beginPath();
            ctx.moveTo(tRX, tY);
            ctx.lineTo(tRX + sOff * (1 - pR * 0.3), tY);
            ctx.lineTo(bR + sOff * 0.2, gY);
            ctx.lineTo(bR, gY);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${sa * 0.7})`;
            ctx.beginPath();
            ctx.moveTo(tLX, tY);
            ctx.lineTo(tLX + sOff * 0.35, tY - sd * 0.08);
            ctx.lineTo(tRX + sOff * (1 - pR * 0.3), tY);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(tLX, tY);
            ctx.lineTo(tLX + sOff * (1 - pR * 0.3), tY);
            ctx.lineTo(bL + sOff * 0.2, gY);
            ctx.lineTo(bL, gY);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${sa * 0.7})`;
            ctx.beginPath();
            ctx.moveTo(tRX, tY);
            ctx.lineTo(tRX + sOff * 0.35, tY - sd * 0.08);
            ctx.lineTo(tLX + sOff * (1 - pR * 0.3), tY);
            ctx.stroke();
          }
        }

        // ── Floor lines (mid + foreground) ──
        if (b.layer >= 1 && bw > 18 && bh > 36) {
          const nFloors = Math.floor(bh / 18);
          ctx.strokeStyle = `rgba(255,255,255,${a * 0.18})`;
          ctx.lineWidth = 0.3;
          for (let f = 1; f < nFloors; f++) {
            const fFrac = f / nFloors;
            const fH = bh * fFrac;
            const fPR = fH / totalDist;
            const fLX = bL + (vpX - bL) * fPR;
            const fRX = bR + (vpX - bR) * fPR;
            ctx.beginPath();
            ctx.moveTo(fLX, gY - fH);
            ctx.lineTo(fRX, gY - fH);
            ctx.stroke();
          }
        }

        // ── Setbacks (foreground only) ──
        if (b.layer === 2) {
          b.setbacks.forEach(sb => {
            if (rT < sb.frac) return;
            const sbH = bh * sb.frac;
            const sbPR = sbH / totalDist;
            const sbIn = sb.inset * zoom;
            const sbLX = bL + sbIn + (vpX - bL - sbIn) * sbPR;
            const sbRX = bR - sbIn + (vpX - bR + sbIn) * sbPR;
            const sbY2 = gY - sbH;
            ctx.strokeStyle = `rgba(255,255,255,${a * 0.7})`;
            ctx.lineWidth = 1.0;
            ctx.beginPath();
            ctx.moveTo(sbLX - sbIn * 0.5, sbY2);
            ctx.lineTo(sbRX + sbIn * 0.5, sbY2);
            ctx.stroke();
          });
        }

        // ── Crown (foreground) ──
        if (b.crown && b.layer === 2 && rT > 0.88) {
          const cA = a * 0.85 * clamp01((rT - 0.88) / 0.12);
          const midX = (tLX + tRX) / 2;
          const cH = b.crown.height * zoom;
          ctx.strokeStyle = `rgba(255,255,255,${cA})`;
          ctx.lineWidth = 1.2;
          switch (b.crown.type) {
            case 'spire':
              ctx.beginPath();
              ctx.moveTo(midX, tY - cH);
              ctx.lineTo(tLX + (tRX - tLX) * 0.3, tY);
              ctx.moveTo(midX, tY - cH);
              ctx.lineTo(tRX - (tRX - tLX) * 0.3, tY);
              ctx.stroke();
              break;
            case 'pyramid':
              ctx.beginPath();
              ctx.moveTo(midX, tY - cH);
              ctx.lineTo(tLX + (tRX - tLX) * 0.15, tY);
              ctx.lineTo(tRX - (tRX - tLX) * 0.15, tY);
              ctx.closePath();
              ctx.stroke();
              break;
            case 'chevron':
              for (let cv = 0; cv < 3; cv++) {
                const cvY2 = tY - cH * (cv + 1) / 4;
                const cvW = (tRX - tLX) * (1 - cv * 0.25) * 0.5;
                ctx.beginPath();
                ctx.moveTo(midX - cvW, tY - cH * cv / 4);
                ctx.lineTo(midX, cvY2);
                ctx.lineTo(midX + cvW, tY - cH * cv / 4);
                ctx.stroke();
              }
              break;
          }
        }
      }

      // ── X-bracing (foreground) ──
      if (b.hasXBrace && rT > 0.5) {
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.25})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(bL, gY); ctx.lineTo(tRX, tY);
        ctx.moveTo(bR, gY); ctx.lineTo(tLX, tY);
        ctx.stroke();
      }

      // ── Ticker board (foreground) ──
      if (b.hasTicker && rT > 0.6 && bw > 25) {
        const tkH = bh * b.tickerFrac;
        const tkPR = tkH / totalDist;
        const tkLX = bL + (vpX - bL) * tkPR;
        const tkRX = bR + (vpX - bR) * tkPR;
        const tkY2 = gY - tkH;
        const tkHt = 8 * zoom;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.06})`;
        ctx.fillRect(tkLX, tkY2, tkRX - tkLX, tkHt);
        ctx.save();
        ctx.beginPath();
        ctx.rect(tkLX, tkY2, tkRX - tkLX, tkHt);
        ctx.clip();
        ctx.font = `${Math.max(7, 8 * zoom)}px monospace`;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.65})`;
        const tkTextW = ctx.measureText(TICKER).width;
        const tkOff = tkLX - (tickerScroll % tkTextW);
        ctx.fillText(TICKER, tkOff, tkY2 + tkHt * 0.78);
        ctx.fillText(TICKER, tkOff + tkTextW, tkY2 + tkHt * 0.78);
        ctx.restore();
      }

      // ── Windows (mid + foreground) ──
      if (rT > 0.12 && b.layer >= 1) {
        b.windows.forEach(win => {
          const rowFrac = (win.row + 0.5) / win.totalR;
          if (rowFrac > rT * 1.05) return;
          const winH = b.targetH * eR * zoom * rowFrac;
          const winPR = winH / totalDist;
          const rLX = bL + (vpX - bL) * winPR;
          const rRX = bR + (vpX - bR) * winPR;
          const rY = gY - winH;
          const wX = rLX + ((win.col + 0.5) / win.totalC) * (rRX - rLX);
          const wA = win.lit ? win.alpha * (0.3 + (b.layer === 2 ? 0.5 : 0.2)) : 0.015;
          const wSz = b.layer === 2 ? Math.max(1.5, 2.0 * zoom) : 1.2;
          ctx.fillStyle = `rgba(255,255,255,${wA})`;
          ctx.fillRect(wX - wSz / 2, rY - wSz / 2, wSz, wSz);
        });
      }

      // ── Antenna ──
      if (b.hasAntenna && rT > 0.82) {
        const antP = clamp01((rT - 0.82) / 0.18);
        const midBX = bL + bw / 2;
        const antTipH = bh + b.antennaH * zoom * antP;
        const antTipPR = antTipH / totalDist;
        const antTipX = midBX + (vpX - midBX) * antTipPR;
        const antTipY2 = gY - antTipH;
        const antBaseX = (tLX + tRX) / 2;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(antBaseX, tY);
        ctx.lineTo(antTipX, antTipY2);
        ctx.stroke();
        if (antP >= 1 && elapsed > 3) {
          const blink = (Math.sin(elapsed * 3 + b.x) + 1) * 0.35;
          ctx.fillStyle = `rgba(255,255,255,${blink})`;
          ctx.fillRect(antTipX - 1.5, antTipY2 - 1.5, 3, 3);
        }
      }

      // ── Rooftop features (mid + foreground) ──
      if (b.layer >= 1 && rT > 0.92) {
        const rtA = a * 0.45 * clamp01((rT - 0.92) / 0.08);
        if (b.hasWaterTower) {
          const wtX = tLX + (tRX - tLX) * b.waterTowerFrac;
          const wtH2 = 10 * zoom, wtW2 = 5 * zoom;
          ctx.strokeStyle = `rgba(255,255,255,${rtA})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(wtX - wtW2 * 0.4, tY); ctx.lineTo(wtX - wtW2 * 0.3, tY - wtH2 * 0.5);
          ctx.moveTo(wtX + wtW2 * 0.4, tY); ctx.lineTo(wtX + wtW2 * 0.3, tY - wtH2 * 0.5);
          ctx.stroke();
          ctx.strokeRect(wtX - wtW2 / 2, tY - wtH2, wtW2, wtH2 * 0.5);
          ctx.beginPath();
          ctx.moveTo(wtX - wtW2 / 2, tY - wtH2);
          ctx.lineTo(wtX, tY - wtH2 - 3 * zoom);
          ctx.lineTo(wtX + wtW2 / 2, tY - wtH2);
          ctx.stroke();
        }
        if (b.hasMechBox) {
          const mbX = tLX + (tRX - tLX) * b.mechBoxFrac;
          ctx.strokeStyle = `rgba(255,255,255,${rtA})`;
          ctx.lineWidth = 0.4;
          ctx.strokeRect(mbX - 4 * zoom, tY - 4 * zoom, 8 * zoom, 4 * zoom);
        }
        if (b.hasFlag) {
          const flX = tLX + (tRX - tLX) * b.flagFrac;
          const flH2 = 12 * zoom;
          ctx.strokeStyle = `rgba(255,255,255,${rtA})`;
          ctx.lineWidth = 0.4;
          ctx.beginPath(); ctx.moveTo(flX, tY); ctx.lineTo(flX, tY - flH2); ctx.stroke();
          const wave = Math.sin(elapsed * 2 + b.x) * 1.5;
          ctx.beginPath();
          ctx.moveTo(flX, tY - flH2);
          ctx.lineTo(flX + 6 * zoom + wave, tY - flH2 + 3 * zoom);
          ctx.lineTo(flX, tY - flH2 + 5 * zoom);
          ctx.stroke();
        }
      }

      // ── Building sign (foreground) ──
      if (b.sign && b.layer === 2 && rT > 0.7 && bw > 30) {
        const signA = a * 0.55 * clamp01((rT - 0.7) / 0.2);
        const signH2 = bh * 0.55;
        const signPR = signH2 / totalDist;
        const signLX = bL + (vpX - bL) * signPR;
        const signRX = bR + (vpX - bR) * signPR;
        const signMidX = (signLX + signRX) / 2;
        ctx.font = `bold ${Math.max(7, 8 * zoom)}px monospace`;
        ctx.fillStyle = `rgba(255,255,255,${signA})`;
        ctx.textAlign = 'center';
        ctx.fillText(b.sign, signMidX, gY - signH2);
        ctx.textAlign = 'start';
      }

      // ── Dimension line (foreground) ──
      if (b.hasDimLine && rT > 0.8) {
        const dlA = a * 0.30;
        const dlX = bR + 8 * zoom;
        ctx.strokeStyle = `rgba(255,255,255,${dlA})`;
        ctx.lineWidth = 0.3;
        ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(dlX, gY); ctx.lineTo(dlX, tY); ctx.stroke();
        ctx.setLineDash([]);
        const aSz = 3;
        ctx.beginPath();
        ctx.moveTo(dlX - aSz, gY - aSz); ctx.lineTo(dlX, gY); ctx.lineTo(dlX + aSz, gY - aSz);
        ctx.moveTo(dlX - aSz, tY + aSz); ctx.lineTo(dlX, tY); ctx.lineTo(dlX + aSz, tY + aSz);
        ctx.stroke();
        ctx.save();
        ctx.translate(dlX + 5, (gY + tY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = `${Math.max(5, 5 * zoom)}px monospace`;
        ctx.fillStyle = `rgba(255,255,255,${dlA})`;
        ctx.textAlign = 'center';
        ctx.fillText(`${b.floors} FL`, 0, 0);
        ctx.restore();
      }
    });

    // ── Window flicker ──
    if (elapsed > 4) {
      buildings.forEach(b => {
        b.windows.forEach(win => {
          if (Math.random() < win.flicker) {
            win.lit = !win.lit;
            if (win.lit) win.alpha = 0.06 + Math.random() * 0.55;
          }
        });
      });
    }

    // ── Ticker scroll ──
    tickerScroll += 0.5;

    // ── Charging Bull ──
    if (elapsed > 2.5) {
      const bullA = Math.min(0.35, (elapsed - 2.5) * 0.06);
      const bsX = cx + (bullWorldX - cx) * zoom;
      const bsScale = bullSize * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${bullA})`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      bullPts.forEach((pt, i) => {
        const px = bsX + pt[0] * bsScale;
        const py = h - pt[1] * bsScale;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // ── Wall St sign ──
    if (elapsed > 3) {
      const wsA = Math.min(0.30, (elapsed - 3) * 0.06);
      const wsX = cx + (wallStX - cx) * zoom;
      const postH = 24 * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${wsA})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(wsX, h); ctx.lineTo(wsX, h - postH); ctx.stroke();
      ctx.strokeRect(wsX - 2, h - postH - 9, 32 * zoom, 9);
      ctx.font = `bold ${Math.max(6, 7 * zoom)}px monospace`;
      ctx.fillStyle = `rgba(255,255,255,${wsA * 0.85})`;
      ctx.fillText('WALL ST', wsX + 2, h - postH - 2);
    }

    // ── Street-level details (ground layer) ──

    // Crosswalks
    crosswalks.forEach(cw => {
      if (elapsed < cw.delay) return;
      const cwA = cw.alpha * Math.min(1, (elapsed - cw.delay) * 3);
      const cwX = cx + (cw.x - cx) * zoom;
      const cwW = cw.width * zoom;
      const stripeH = 4;
      const gap = 5;
      ctx.fillStyle = `rgba(255,255,255,${cwA})`;
      for (let s = 0; s < cw.stripes; s++) {
        const sy = h - 6 - s * (stripeH + gap);
        ctx.fillRect(cwX - cwW / 2, sy, cwW, stripeH);
      }
    });

    // Street lamps
    streetLamps.forEach(sl => {
      if (elapsed < sl.delay) return;
      const slA = sl.alpha * Math.min(1, (elapsed - sl.delay) * 3);
      const slX = cx + (sl.x - cx) * zoom;
      const slH = sl.height * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${slA})`;
      ctx.lineWidth = 1.2;
      // Post
      ctx.beginPath();
      ctx.moveTo(slX, h);
      ctx.lineTo(slX, h - slH);
      ctx.stroke();
      // Curved arm
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(slX, h - slH);
      ctx.quadraticCurveTo(slX + 8 * zoom, h - slH - 6 * zoom, slX + 12 * zoom, h - slH);
      ctx.stroke();
      // Light fixture (small rectangle hanging down)
      ctx.strokeRect(slX + 10 * zoom, h - slH, 4 * zoom, 3 * zoom);
      // Light glow
      const lgA = slA * 0.45 * (0.8 + 0.2 * Math.sin(elapsed * 0.5 + sl.x));
      const lg = ctx.createRadialGradient(slX + 12 * zoom, h - slH + 3 * zoom, 0, slX + 12 * zoom, h - slH + 3 * zoom, sl.glowR * zoom);
      lg.addColorStop(0, `rgba(255,255,255,${lgA})`);
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(slX + 12 * zoom - sl.glowR * zoom, h - slH + 3 * zoom - sl.glowR * zoom, sl.glowR * 2 * zoom, sl.glowR * 2 * zoom);
      // Light pool on ground
      const gpA = slA * 0.08;
      const gpR = sl.glowR * 2 * zoom;
      const gp = ctx.createRadialGradient(slX + 6 * zoom, h, 0, slX + 6 * zoom, h, gpR);
      gp.addColorStop(0, `rgba(255,255,255,${gpA})`);
      gp.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gp;
      ctx.fillRect(slX + 6 * zoom - gpR, h - gpR * 0.3, gpR * 2, gpR * 0.3);
    });

    // Trees
    trees.forEach(tr => {
      if (elapsed < tr.delay) return;
      const trA = tr.alpha * Math.min(1, (elapsed - tr.delay) * 3);
      const trX = cx + (tr.x - cx) * zoom;
      const trH = tr.trunkH * zoom;
      const crR = tr.canopyR * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${trA})`;
      ctx.lineWidth = 1.2;
      // Trunk
      ctx.beginPath();
      ctx.moveTo(trX, h);
      ctx.lineTo(trX, h - trH);
      ctx.stroke();
      // Branches (wireframe canopy)
      ctx.lineWidth = 0.8;
      const topY = h - trH;
      for (let br = 0; br < 6; br++) {
        const angle = -Math.PI * 0.1 + (br / 5) * (-Math.PI * 0.8);
        const bLen = crR * (0.5 + Math.random() * 0.5);
        ctx.beginPath();
        ctx.moveTo(trX, topY);
        ctx.lineTo(trX + Math.cos(angle) * bLen, topY + Math.sin(angle) * bLen);
        ctx.stroke();
      }
      // Canopy circle outline
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(trX, topY - crR * 0.4, crR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${trA * 0.6})`;
      ctx.stroke();
    });

    // Street signs
    streetSigns.forEach(ss => {
      if (elapsed < ss.delay) return;
      const ssA = ss.alpha * Math.min(1, (elapsed - ss.delay) * 3);
      const ssX = cx + (ss.x - cx) * zoom;
      const pH = ss.postH * zoom;
      const sW = ss.signW * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${ssA})`;
      ctx.lineWidth = 1.0;
      // Post
      ctx.beginPath();
      ctx.moveTo(ssX, h);
      ctx.lineTo(ssX, h - pH);
      ctx.stroke();
      // Sign plate
      const sH = 11 * zoom;
      ctx.strokeRect(ssX - 1, h - pH - sH, sW, sH);
      ctx.fillStyle = `rgba(255,255,255,${ssA * 0.06})`;
      ctx.fillRect(ssX - 1, h - pH - sH, sW, sH);
      ctx.font = `bold ${Math.max(7, 9 * zoom)}px monospace`;
      ctx.fillStyle = `rgba(255,255,255,${ssA * 0.85})`;
      ctx.fillText(ss.name, ssX + 3, h - pH - 3);
    });

    // Fire hydrants
    fireHydrants.forEach(fh => {
      if (elapsed < fh.delay) return;
      const fhA = fh.alpha * Math.min(1, (elapsed - fh.delay) * 3);
      const fhX = cx + (fh.x - cx) * zoom;
      ctx.strokeStyle = `rgba(255,255,255,${fhA})`;
      ctx.lineWidth = 1.0;
      // Body
      const fhW = 8, fhH = 14;
      ctx.strokeRect(fhX - fhW / 2, h - fhH, fhW, fhH);
      // Cap (dome)
      ctx.beginPath();
      ctx.moveTo(fhX - fhW / 2 - 1, h - fhH);
      ctx.lineTo(fhX, h - fhH - 5);
      ctx.lineTo(fhX + fhW / 2 + 1, h - fhH);
      ctx.stroke();
      // Nozzles
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(fhX - fhW / 2, h - fhH + 5); ctx.lineTo(fhX - fhW / 2 - 5, h - fhH + 5);
      ctx.moveTo(fhX + fhW / 2, h - fhH + 5); ctx.lineTo(fhX + fhW / 2 + 5, h - fhH + 5);
      ctx.stroke();
      // Valve on top
      ctx.fillStyle = `rgba(255,255,255,${fhA * 0.5})`;
      ctx.fillRect(fhX - 1.5, h - fhH - 5, 3, 3);
    });

    // ── Airplanes (over the skyline) ──
    planes.forEach(pl => {
      if (elapsed < pl.delay) return;
      const plElapsed = elapsed - pl.delay;
      pl.x += pl.speed * pl.dir;
      // Wrap around
      if (pl.dir > 0 && pl.x > w + 200) pl.x = -200;
      if (pl.dir < 0 && pl.x < -200) pl.x = w + 200;

      const fadeIn = Math.min(1, plElapsed * 2);
      const pa = pl.alpha * fadeIn;
      const px = cx + (pl.x - cx) * zoom;
      const py = pl.y;
      const ps = pl.size * zoom;

      // Fuselage
      ctx.strokeStyle = `rgba(255,255,255,${pa})`;
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(px - ps * 2 * pl.dir, py);
      ctx.lineTo(px + ps * 2 * pl.dir, py);
      ctx.stroke();
      // Wings
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px - ps * 1.2, py - ps * 0.5);
      ctx.lineTo(px, py);
      ctx.lineTo(px + ps * 1.2, py - ps * 0.5);
      ctx.stroke();
      // Tail
      ctx.beginPath();
      ctx.moveTo(px - ps * 1.5 * pl.dir, py - ps * 0.5);
      ctx.lineTo(px - ps * 2 * pl.dir, py);
      ctx.stroke();

      // Nav lights (blink)
      const blink = (Math.sin(elapsed * 4 + pl.blinkOffset) + 1) * 0.5;
      if (blink > 0.5) {
        ctx.fillStyle = `rgba(255,255,255,${pa * 1.0})`;
        ctx.fillRect(px - ps * 1.2 - 1.5, py - ps * 0.5 - 1.5, 3, 3);
        ctx.fillRect(px + ps * 1.2 - 1.5, py - ps * 0.5 - 1.5, 3, 3);
      }

      // Contrail
      if (pl.hasContrail && plElapsed > 1) {
        const cLen = pl.contrailLen * zoom;
        const cGrad = ctx.createLinearGradient(
          px - cLen * pl.dir, py, px - ps * 2 * pl.dir, py
        );
        cGrad.addColorStop(0, 'rgba(255,255,255,0)');
        cGrad.addColorStop(1, `rgba(255,255,255,${pa * 0.35})`);
        ctx.strokeStyle = cGrad;
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(px - ps * 2 * pl.dir, py + 1);
        ctx.lineTo(px - cLen * pl.dir, py + 1 + Math.sin(elapsed + pl.x * 0.01) * 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(px - ps * 2 * pl.dir, py - 1);
        ctx.lineTo(px - cLen * pl.dir, py - 1 - Math.sin(elapsed + pl.x * 0.01) * 3);
        ctx.stroke();
      }
    });

    // ── Bird flocks ──
    flocks.forEach(fl => {
      if (elapsed < fl.delay) return;
      fl.x += fl.speed * fl.dir;
      if (fl.dir > 0 && fl.x > w + 100) fl.x = -100;
      if (fl.dir < 0 && fl.x < -100) fl.x = w + 100;

      const fadeIn = Math.min(1, (elapsed - fl.delay) * 2);
      const fa = fl.alpha * fadeIn;
      const fx = cx + (fl.x - cx) * zoom;

      fl.birds.forEach(bird => {
        const bx = fx + bird.offX * zoom;
        const by = fl.y + bird.offY * zoom;
        const wingFlap = Math.sin(elapsed * 5 + bird.wingPhase) * 5;
        ctx.strokeStyle = `rgba(255,255,255,${fa})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(bx - 8, by + wingFlap);
        ctx.lineTo(bx, by);
        ctx.lineTo(bx + 8, by + wingFlap);
        ctx.stroke();
      });
    });

    // ── Helicopter (distant orbit) ──
    if (elapsed > heli.delay) {
      const hElapsed = elapsed - heli.delay;
      const fadeIn = Math.min(1, hElapsed * 1.5);
      const ha = heli.alpha * fadeIn;
      const hAngle = hElapsed * heli.speed;
      const hx = cx + (heli.cx + Math.cos(hAngle) * heli.orbitR - cx) * zoom;
      const hy = heli.cy + Math.sin(hAngle) * heli.orbitR * 0.4;

      // Body
      ctx.strokeStyle = `rgba(255,255,255,${ha})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(hx - 12, hy);
      ctx.lineTo(hx + 12, hy);
      ctx.lineTo(hx + 15, hy + 6);
      ctx.lineTo(hx - 9, hy + 6);
      ctx.closePath();
      ctx.stroke();
      // Windshield
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(hx + 6, hy); ctx.lineTo(hx + 10, hy + 4);
      ctx.stroke();
      // Tail boom
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.moveTo(hx - 12, hy);
      ctx.lineTo(hx - 32, hy - 3);
      ctx.lineTo(hx - 36, hy - 9);
      ctx.stroke();
      // Tail rotor
      ctx.beginPath();
      ctx.moveTo(hx - 36, hy - 14);
      ctx.lineTo(hx - 36, hy - 4);
      ctx.stroke();
      // Rotor (spinning)
      const rotorAngle = hElapsed * 12;
      const rLen = 24;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(rotorAngle) * rLen, hy - 7 + Math.sin(rotorAngle) * 2.5);
      ctx.lineTo(hx - Math.cos(rotorAngle) * rLen, hy - 7 - Math.sin(rotorAngle) * 2.5);
      ctx.stroke();
      // Rotor hub
      ctx.fillStyle = `rgba(255,255,255,${ha * 0.6})`;
      ctx.fillRect(hx - 1.5, hy - 8, 3, 3);
      // Skids
      ctx.strokeStyle = `rgba(255,255,255,${ha})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(hx - 8, hy + 6); ctx.lineTo(hx - 10, hy + 10);
      ctx.moveTo(hx + 8, hy + 6); ctx.lineTo(hx + 10, hy + 10);
      ctx.moveTo(hx - 14, hy + 10); ctx.lineTo(hx + 14, hy + 10);
      ctx.stroke();
      // Blinking light
      const hBlink = (Math.sin(elapsed * 5) + 1) * 0.5;
      if (hBlink > 0.6) {
        ctx.fillStyle = `rgba(255,255,255,${ha * 1.5})`;
        ctx.fillRect(hx - 2.5, hy + 6, 5, 5);
      }
      // Searchlight cone
      if (hElapsed > 0.5) {
        const slA = ha * 0.15 * (0.5 + 0.5 * Math.sin(hElapsed * 0.7));
        ctx.beginPath();
        ctx.moveTo(hx, hy + 10);
        ctx.lineTo(hx - 20 + Math.sin(hElapsed * 0.3) * 10, hy + 120);
        ctx.lineTo(hx + 20 + Math.sin(hElapsed * 0.3) * 10, hy + 120);
        ctx.closePath();
        ctx.fillStyle = `rgba(255,255,255,${slA})`;
        ctx.fill();
      }
    }

    // ── Center vignette (darken center so text stays readable) ──
    const vig = ctx.createRadialGradient(cx, h * 0.42, 0, cx, h * 0.42, h * 0.45);
    vig.addColorStop(0, 'rgba(0,0,0,0.5)');
    vig.addColorStop(0.6, 'rgba(0,0,0,0.2)');
    vig.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    // ── Drawing border ──
    if (elapsed > 1) {
      const bdrA = Math.min(0.08, (elapsed - 1) * 0.015);
      ctx.strokeStyle = `rgba(255,255,255,${bdrA})`;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(16, 16, w - 32, h - 32);
    }

    // ── Title block ──
    if (elapsed > 2) {
      const tbA = Math.min(0.10, (elapsed - 2) * 0.02);
      const tbW = 160, tbH2 = 40;
      const tbX = w - 16 - tbW, tbY2 = h - 16 - tbH2;
      ctx.strokeStyle = `rgba(255,255,255,${tbA})`;
      ctx.lineWidth = 0.4;
      ctx.strokeRect(tbX, tbY2, tbW, tbH2);
      ctx.font = '7px monospace';
      ctx.fillStyle = `rgba(255,255,255,${tbA})`;
      ctx.fillText('MERCURY ARCHITECT', tbX + 6, tbY2 + 14);
      ctx.fillText('FINANCIAL DISTRICT', tbX + 6, tbY2 + 24);
      ctx.fillText('SCALE: NTS', tbX + 6, tbY2 + 34);
    }

    // ── Scan line ──
    if (elapsed > 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, (elapsed * 22) % h, w, 1);
    }

    // ── Fog band ──
    if (elapsed > 1.5) {
      const fogA = Math.min(0.04, (elapsed - 1.5) * 0.008);
      const fogY = h * 0.50;
      const fogG = ctx.createLinearGradient(0, fogY - 50, 0, fogY + 50);
      fogG.addColorStop(0, 'rgba(0,0,0,0)');
      fogG.addColorStop(0.5, `rgba(255,255,255,${fogA})`);
      fogG.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fogG;
      ctx.fillRect(0, fogY - 50, w, 100);
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);


  // ─── Terminal init in intro ──────────────────────────

  function animateIntroTerminal() {
    if (!archTerminal) return;
    const lines = archTerminal.querySelectorAll('.term-line');
    lines.forEach((line) => {
      const delay = parseInt(line.dataset.delay) || 0;
      introTimers.push(setTimeout(() => {
        if (introExited) return;
        line.classList.add('visible');
      }, delay));
    });
  }

  if (!archHasVisited) {
    // ── Full intro timing (first-time visitors) ──────────
    animateIntroTerminal();

    // t=1.2s: Title appears
    introTimers.push(setTimeout(() => {
      if (introExited) return;
      archTitle.classList.add('visible');
    }, 1200));

    // t=2s: Textline appears
    introTimers.push(setTimeout(() => {
      if (introExited) return;
      archTextline.classList.add('visible');
    }, 2000));

    // t=2.4s: Word cycling
    const archWords = ['imagine', 'design', 'build', 'test', 'deploy', 'profit'];
    let archWordIndex = 1;

    function cycleArchWord() {
      if (introExited) return;
      if (archWordIndex >= archWords.length) {
        introTimers.push(setTimeout(() => {
          if (!introExited) exitArchIntro();
        }, 800));
        return;
      }
      archWord.classList.add('out');
      setTimeout(() => {
        if (introExited) return;
        archWord.textContent = archWords[archWordIndex];
        archWord.classList.remove('out');
        archWord.classList.add('entering');
        requestAnimationFrame(() => archWord.classList.remove('entering'));
        archWordIndex++;
        introTimers.push(setTimeout(cycleArchWord, 250));
      }, 120);
    }

    introTimers.push(setTimeout(() => {
      if (introExited) return;
      introTimers.push(setTimeout(cycleArchWord, 250));
    }, 2400));

  } else {
    // ── Fast intro for returning visitors (~1.5s) ────────
    // Reuse the full render loop but fast-forward 3.5s into the animation
    // so buildings are already risen, zoom is done, all details visible
    introStart = performance.now() - 3500;

    // Title immediately visible
    archTitle.classList.add('visible');

    // All terminal lines at once after 0.3s
    if (archTerminal) {
      setTimeout(() => {
        archTerminal.querySelectorAll('.term-line').forEach(l => l.classList.add('visible'));
      }, 300);
    }

    // Exit at 1.5s
    setTimeout(() => {
      exitArchIntro();
    }, 1500);
  }

  // ─── Exit intro ───────────────────────────────────

  function exitArchIntro() {
    if (introExited) return;
    introExited = true;
    introTimers.forEach(t => clearTimeout(t));
    archIntro.classList.add('exit');
    document.body.classList.remove('intro-active');
    localStorage.setItem(ARCH_VISITED_KEY, '1');
    setTimeout(() => { archIntro.classList.add('gone'); }, archHasVisited ? 400 : 1000);
  }

  archIntro.addEventListener('click', exitArchIntro);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 1B — HERO TERMINAL INIT
     ═══════════════════════════════════════════════════════════════ */

  let heroInitPlayed = false;
  const heroObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !heroInitPlayed) {
        heroInitPlayed = true;
        heroObserver.unobserve(entry.target);
        animateTermInit('heroInit');
      }
    });
  }, { threshold: 0.1 });
  const heroSection = document.getElementById('archHero');
  if (heroSection) heroObserver.observe(heroSection);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 — SCROLL REVEALS
     ═══════════════════════════════════════════════════════════════ */

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => revealObserver.observe(el));


  /* ═══════════════════════════════════════════════════════════════
     SECTION 3 — SVG CONNECTION DRAW
     ═══════════════════════════════════════════════════════════════ */

  const drawObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.arch-conn').forEach(path => path.classList.add('drawn'));
        drawObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  const builderDemo = document.getElementById('archBuilderDemo');
  if (builderDemo) drawObserver.observe(builderDemo);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 4 — AI CHAT TYPEWRITER
     ═══════════════════════════════════════════════════════════════ */

  const aiUserMsg = document.getElementById('aiUserMsg');
  const aiResponse = document.getElementById('aiResponse');
  const aiResponseWrap = document.getElementById('aiResponseWrap');
  let aiTyped = false;

  const userText = 'I want to trade weather markets. When NOAA upgrades a hurricane to Cat 4+ within 48hrs of Florida landfall, buy YES on Florida disaster markets but only if price is still under 40 cents';
  const aiText = 'Built. Weather-edge bot:\n\n1. SOURCE: NOAA Hurricane API tracking Cat 4+ storms\n2. TRIGGER: Landfall window < 48hrs + FL trajectory confirmed\n3. SCAN: All Polymarket FL disaster contracts where P(YES) < 40c\n4. CONFIRM: Twitter sentiment spike > 300% on "hurricane"\n5. EXECUTE: Buy 2,000 YES @ limit P+2c per contract\n6. HEDGE: Sell 500 NO on Kalshi "FL Emergency Declaration"\n\nRisk: $8K max, auto-exit if storm downgrades to Cat 2.\n\nDeploy now or backtest against 2024 hurricane season?';

  function typeText(el, text, spd, callback) {
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'arch-ai-cursor';
    el.textContent = '';
    el.appendChild(cursor);
    function tick() {
      if (i < text.length) {
        if (text[i] === '\n') el.insertBefore(document.createElement('br'), cursor);
        else el.insertBefore(document.createTextNode(text[i]), cursor);
        i++;
        setTimeout(tick, spd);
      } else {
        cursor.remove();
        if (callback) callback();
      }
    }
    tick();
  }

  const aiChatObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !aiTyped) {
        aiTyped = true;
        aiChatObserver.unobserve(entry.target);
        typeText(aiUserMsg, userText, 18, () => {
          setTimeout(() => {
            aiResponseWrap.style.display = 'block';
            typeText(aiResponse, aiText, 12);
          }, 800);
        });
      }
    });
  }, { threshold: 0.3 });
  const aiDemo = document.getElementById('archAiDemo');
  if (aiDemo) aiChatObserver.observe(aiDemo);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 5 — INFRASTRUCTURE TERMINAL
     ═══════════════════════════════════════════════════════════════ */

  let infraPlayed = false;
  const infraObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !infraPlayed) {
        infraPlayed = true;
        infraObserver.unobserve(entry.target);
        animateTermInit('infraTerminal');
      }
    });
  }, { threshold: 0.3 });
  const infraDemo = document.getElementById('archInfraDemo');
  if (infraDemo) infraObserver.observe(infraDemo);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 6 — DEPLOY TERMINAL
     ═══════════════════════════════════════════════════════════════ */

  let deployPlayed = false;

  function animateTermInit(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.term-line').forEach(line => {
      setTimeout(() => line.classList.add('visible'), parseInt(line.dataset.delay) || 0);
    });
  }

  const deployObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !deployPlayed) {
        deployPlayed = true;
        deployObserver.unobserve(entry.target);
        animateTermInit('deployTerminal');
      }
    });
  }, { threshold: 0.3 });
  const deployDemo = document.getElementById('archDeployDemo');
  if (deployDemo) deployObserver.observe(deployDemo);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 7 — COUNTER ANIMATION
     ═══════════════════════════════════════════════════════════════ */

  function animateCounter(el) {
    const target = parseInt(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const dur = 2000, start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      el.textContent = prefix + Math.round(easeOutQuart(p) * target).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('[data-count]').forEach(animateCounter);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.3 });
  const metricsBar = document.querySelector('.metrics-bar');
  if (metricsBar) counterObserver.observe(metricsBar);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 8 — MOBILE MENU + SMOOTH SCROLL
     ═══════════════════════════════════════════════════════════════ */

  const hamburger = document.getElementById('hamburgerBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => mobileMenu.classList.remove('open'));
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 44, behavior: 'smooth' });
      }
    });
  });


  /* ═══════════════════════════════════════════════════════════════
     SECTION 9 — DATA HELIX
     ═══════════════════════════════════════════════════════════════ */

  const helixCanvas = document.getElementById('helixCanvas');
  const helixEl = document.getElementById('dataHelix');
  let helixActive = false;
  let helixOffset = 0;

  function initHelix() {
    if (!helixCanvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = helixCanvas.parentElement.getBoundingClientRect();
    helixCanvas.width = rect.width * dpr;
    helixCanvas.height = rect.height * dpr;
    helixCanvas.style.width = rect.width + 'px';
    helixCanvas.style.height = rect.height + 'px';
    helixActive = true;
    if (helixEl) helixEl.classList.add('active');
    requestAnimationFrame(tickHelix);
  }

  function tickHelix() {
    if (!helixActive) return;
    const dpr = window.devicePixelRatio || 1;
    const hCtx = helixCanvas.getContext('2d');
    const w = helixCanvas.width;
    const h = helixCanvas.height;
    const cx = w / 2;
    const amplitude = 70 * dpr;
    const nodeSpacing = 28 * dpr;
    const nodeRadius = 2.2 * dpr;

    helixOffset += 0.4;
    hCtx.clearRect(0, 0, w, h);

    const rungSpacing = nodeSpacing * 2;
    for (let y = -rungSpacing; y < h + rungSpacing; y += rungSpacing) {
      const yy = ((y + helixOffset * dpr) % (h + rungSpacing * 2)) - rungSpacing;
      const phase = yy * 0.035 / dpr;
      hCtx.beginPath();
      hCtx.moveTo(cx + Math.sin(phase) * amplitude, yy);
      hCtx.lineTo(cx + Math.sin(phase + Math.PI) * amplitude, yy);
      hCtx.strokeStyle = 'rgba(255,255,255,' + (0.03 + (Math.cos(phase) + 1) / 2 * 0.04) + ')';
      hCtx.lineWidth = 0.5 * dpr;
      hCtx.stroke();
    }

    const nodes = [];
    for (let y = -nodeSpacing; y < h + nodeSpacing; y += nodeSpacing) {
      const yy = ((y + helixOffset * dpr) % (h + nodeSpacing * 2)) - nodeSpacing;
      const phase = yy * 0.035 / dpr;
      nodes.push({ x: cx + Math.sin(phase) * amplitude, y: yy, depth: Math.cos(phase), strand: 0 });
      nodes.push({ x: cx + Math.sin(phase + Math.PI) * amplitude, y: yy, depth: Math.cos(phase + Math.PI), strand: 1 });
    }
    nodes.sort((a, b) => a.depth - b.depth);

    for (let strand = 0; strand < 2; strand++) {
      const pts = [];
      for (let y = -nodeSpacing * 2; y < h + nodeSpacing * 2; y += 4 * dpr) {
        const yy = ((y + helixOffset * dpr) % (h + nodeSpacing * 4)) - nodeSpacing * 2;
        pts.push({ x: cx + Math.sin(yy * 0.035 / dpr + strand * Math.PI) * amplitude, y: yy });
      }
      pts.sort((a, b) => a.y - b.y);
      hCtx.beginPath();
      pts.forEach((p, i) => i === 0 ? hCtx.moveTo(p.x, p.y) : hCtx.lineTo(p.x, p.y));
      hCtx.strokeStyle = 'rgba(255,255,255,0.1)';
      hCtx.lineWidth = 1 * dpr;
      hCtx.stroke();
    }

    for (const node of nodes) {
      const nd = (node.depth + 1) / 2;
      const size = nodeRadius * (0.5 + nd * 0.5);
      hCtx.fillStyle = 'rgba(255,255,255,' + ((0.1 + nd * 0.5) * (node.strand === 0 ? 1 : 0.6)) + ')';
      hCtx.fillRect(node.x - size / 2, node.y - size / 2, size, size);
      if (nd > 0.7) {
        const glow = hCtx.createRadialGradient(node.x, node.y, 0, node.x, node.y, size * 4);
        glow.addColorStop(0, 'rgba(255,255,255,' + ((nd - 0.7) * 0.15) + ')');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        hCtx.fillStyle = glow;
        hCtx.beginPath(); hCtx.arc(node.x, node.y, size * 4, 0, Math.PI * 2); hCtx.fill();
      }
    }
    requestAnimationFrame(tickHelix);
  }

  setTimeout(initHelix, 500);

  window.addEventListener('resize', () => {
    if (helixCanvas && helixActive) {
      const dpr = window.devicePixelRatio || 1;
      const rect = helixCanvas.parentElement.getBoundingClientRect();
      helixCanvas.width = rect.width * dpr;
      helixCanvas.height = rect.height * dpr;
      helixCanvas.style.width = rect.width + 'px';
      helixCanvas.style.height = rect.height + 'px';
    }
  });


  /* ═══════════════════════════════════════════════════════════════
     SECTION 10 — PERSISTENT BACKGROUND (helicopters)
     Runs on a fixed canvas behind all page content, independent
     of the intro animation.
     ═══════════════════════════════════════════════════════════════ */

  const archBg = document.getElementById('archBgCanvas');
  if (archBg) {
    const bgCtx = archBg.getContext('2d');

    function resizeBg() {
      archBg.width = window.innerWidth;
      archBg.height = window.innerHeight;
    }
    resizeBg();
    window.addEventListener('resize', resizeBg);

    const bgStart = performance.now();

    // Helicopter — right side, orbiting with searchlight
    const bgHelis = [
      {
        cx: 0.72 + Math.random() * 0.10,
        cy: 0.10 + Math.random() * 0.06,
        orbitR: 70 + Math.random() * 35,
        speed: 0.25 + Math.random() * 0.12,
        alpha: 0.45 + Math.random() * 0.15,
        scale: 1.3,
        delay: 2.0,
      },
    ];

    function renderBg(now) {
      const elapsed = (now - bgStart) / 1000;
      const w = archBg.width;
      const h = archBg.height;

      bgCtx.clearRect(0, 0, w, h);

      bgHelis.forEach(bh => {
        if (elapsed <= bh.delay) return;
        const he = elapsed - bh.delay;
        const fi = Math.min(1, he * 1.5);
        const ha = bh.alpha * fi;
        const s = bh.scale;
        const ang = he * bh.speed;
        const hx = bh.cx * w + Math.cos(ang) * bh.orbitR;
        const hy = bh.cy * h + Math.sin(ang) * bh.orbitR * 0.4;

        // Body
        bgCtx.strokeStyle = `rgba(255,255,255,${ha})`;
        bgCtx.lineWidth = 1.2 * s;
        bgCtx.beginPath();
        bgCtx.moveTo(hx - 12 * s, hy);
        bgCtx.lineTo(hx + 12 * s, hy);
        bgCtx.lineTo(hx + 15 * s, hy + 6 * s);
        bgCtx.lineTo(hx - 9 * s, hy + 6 * s);
        bgCtx.closePath();
        bgCtx.stroke();
        // Windshield
        bgCtx.lineWidth = 0.6 * s;
        bgCtx.beginPath();
        bgCtx.moveTo(hx + 6 * s, hy); bgCtx.lineTo(hx + 10 * s, hy + 4 * s);
        bgCtx.stroke();
        // Tail boom
        bgCtx.lineWidth = 1.0 * s;
        bgCtx.beginPath();
        bgCtx.moveTo(hx - 12 * s, hy);
        bgCtx.lineTo(hx - 32 * s, hy - 3 * s);
        bgCtx.lineTo(hx - 36 * s, hy - 9 * s);
        bgCtx.stroke();
        // Tail rotor
        bgCtx.beginPath();
        bgCtx.moveTo(hx - 36 * s, hy - 14 * s);
        bgCtx.lineTo(hx - 36 * s, hy - 4 * s);
        bgCtx.stroke();
        // Main rotor (spinning)
        const rotorAngle = he * 12;
        const rLen = 24 * s;
        bgCtx.lineWidth = 0.8 * s;
        bgCtx.beginPath();
        bgCtx.moveTo(hx + Math.cos(rotorAngle) * rLen, hy - 7 * s + Math.sin(rotorAngle) * 2.5 * s);
        bgCtx.lineTo(hx - Math.cos(rotorAngle) * rLen, hy - 7 * s - Math.sin(rotorAngle) * 2.5 * s);
        bgCtx.stroke();
        // Rotor hub
        bgCtx.fillStyle = `rgba(255,255,255,${ha * 0.6})`;
        bgCtx.fillRect(hx - 1.5 * s, hy - 8 * s, 3 * s, 3 * s);
        // Skids
        bgCtx.strokeStyle = `rgba(255,255,255,${ha})`;
        bgCtx.lineWidth = 0.7 * s;
        bgCtx.beginPath();
        bgCtx.moveTo(hx - 8 * s, hy + 6 * s); bgCtx.lineTo(hx - 10 * s, hy + 10 * s);
        bgCtx.moveTo(hx + 8 * s, hy + 6 * s); bgCtx.lineTo(hx + 10 * s, hy + 10 * s);
        bgCtx.moveTo(hx - 14 * s, hy + 10 * s); bgCtx.lineTo(hx + 14 * s, hy + 10 * s);
        bgCtx.stroke();
        // Blinking nav light
        const bl = (Math.sin(elapsed * 5 + bh.delay) + 1) * 0.5;
        if (bl > 0.6) {
          bgCtx.fillStyle = `rgba(255,255,255,${ha * 1.5})`;
          bgCtx.fillRect(hx - 2.5 * s, hy + 6 * s, 5 * s, 5 * s);
        }
        // Searchlight cone
        if (he > 0.5) {
          const slA = ha * 0.18 * (0.5 + 0.5 * Math.sin(he * 0.7));
          bgCtx.beginPath();
          bgCtx.moveTo(hx, hy + 10 * s);
          bgCtx.lineTo(hx - 25 * s + Math.sin(he * 0.3) * 12 * s, hy + 150 * s);
          bgCtx.lineTo(hx + 25 * s + Math.sin(he * 0.3) * 12 * s, hy + 150 * s);
          bgCtx.closePath();
          bgCtx.fillStyle = `rgba(255,255,255,${slA})`;
          bgCtx.fill();
        }
      });

      requestAnimationFrame(renderBg);
    }

    requestAnimationFrame(renderBg);
  }

});
