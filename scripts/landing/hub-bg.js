/* ================================================================
   MERCURY — Hub Background Canvas
   Blueprint grid, twinkling stars, moon, convergence lines,
   skyline silhouette, shooting stars, ticker
   ================================================================ */

export function initHubBackground() {
  const hubCanvas = document.getElementById('hubBgCanvas');
  if (!hubCanvas) return;

  const hCtx = hubCanvas.getContext('2d');
  const W = () => hubCanvas.width;
  const H = () => hubCanvas.height;

  function resize() {
    hubCanvas.width = window.innerWidth;
    hubCanvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const hubStart = performance.now();

  // ── Twinkling stars ────────────────────────────────────
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

  // ── Moon ───────────────────────────────────────────────
  const moonX = 0.12 + Math.random() * 0.08;
  const moonY = 0.08 + Math.random() * 0.06;
  const moonR = 18 + Math.random() * 8;

  // ── Shooting stars ─────────────────────────────────────
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

  // ── Skyline buildings (dense, spread all around) ───────
  const skyBuildings = [];

  // Main bottom skyline
  const mainCount = 70;
  for (let i = 0; i < mainCount; i++) {
    const x = (i / mainCount) * 1.2 - 0.1;
    const bw = 0.008 + Math.random() * 0.028;
    const bh = 0.04 + Math.random() * 0.22;
    const layer = i < 20 ? 0 : i < 50 ? 1 : 2;
    const groundY = layer === 0 ? 0.82 : layer === 1 ? 0.90 : 1.0;
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

  // Left cluster
  for (let i = 0; i < 20; i++) {
    const bw = 0.006 + Math.random() * 0.018;
    const bh = 0.06 + Math.random() * 0.28;
    skyBuildings.push({
      x: -0.02 + Math.random() * 0.22, bw, bh,
      groundY: 0.85 + Math.random() * 0.15,
      alpha: 0.04 + Math.random() * 0.08, layer: 0,
      hasAntenna: Math.random() > 0.5,
      antennaH: 0.01 + Math.random() * 0.04,
      hasCrown: bh > 0.15 && Math.random() > 0.4,
      crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
      crownH: 0.005 + Math.random() * 0.02,
      windowRows: Math.floor(bh * 80),
      windowCols: Math.max(1, Math.floor(bw * 200)),
    });
  }

  // Right cluster
  for (let i = 0; i < 20; i++) {
    const bw = 0.006 + Math.random() * 0.018;
    const bh = 0.06 + Math.random() * 0.28;
    skyBuildings.push({
      x: 0.78 + Math.random() * 0.24, bw, bh,
      groundY: 0.85 + Math.random() * 0.15,
      alpha: 0.04 + Math.random() * 0.08, layer: 0,
      hasAntenna: Math.random() > 0.5,
      antennaH: 0.01 + Math.random() * 0.04,
      hasCrown: bh > 0.15 && Math.random() > 0.4,
      crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
      crownH: 0.005 + Math.random() * 0.02,
      windowRows: Math.floor(bh * 80),
      windowCols: Math.max(1, Math.floor(bw * 200)),
    });
  }

  // Distant background
  for (let i = 0; i < 30; i++) {
    skyBuildings.push({
      x: (i / 30) * 1.3 - 0.15,
      bw: 0.005 + Math.random() * 0.012,
      bh: 0.02 + Math.random() * 0.08,
      groundY: 0.72 + Math.random() * 0.06,
      alpha: 0.03 + Math.random() * 0.04, layer: -1,
      hasAntenna: Math.random() > 0.7,
      antennaH: 0.005 + Math.random() * 0.015,
      hasCrown: false, crownType: 'flat', crownH: 0,
      windowRows: 0, windowCols: 0,
    });
  }

  skyBuildings.sort((a, b) => a.layer - b.layer);

  // ── Convergence lines ──────────────────────────────────
  const convergenceCount = 12;

  // ── Horizon lights ─────────────────────────────────────
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

  // ── Ticker ─────────────────────────────────────────────
  const TICKER = '   MERC +4.2   \u25cf   P(YES) 62c   \u25cf   VOL $48.6M   \u25cf   BOTS 842   \u25cf   WIN 67%   \u25cf   KALSHI +8.4   \u25cf   POLY +12.1   ';
  let tickerScroll = 0;

  // ── Render loop ────────────────────────────────────────
  function render(now) {
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

      if (b.windowRows > 0 && b.windowCols > 0) {
        const winW = bw * 0.5 / b.windowCols;
        const winH = bh * 0.4 / b.windowRows;
        const padX = bw * 0.15;
        const padY = bh * 0.08;
        const spacingX = (bw - padX * 2) / b.windowCols;
        const spacingY = (bh - padY * 2) / b.windowRows;
        for (let r = 0; r < b.windowRows; r++) {
          for (let c = 0; c < b.windowCols; c++) {
            if (Math.random() > 0.55) continue;
            const wx = bx + padX + c * spacingX;
            const wy = gY - bh + padY + r * spacingY;
            hCtx.fillStyle = `rgba(255,255,255,${a * (0.3 + Math.random() * 0.5)})`;
            hCtx.fillRect(wx, wy, winW, winH);
          }
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

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
}
