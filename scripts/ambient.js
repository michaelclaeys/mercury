/* ================================================================
   MERCURY — Ambient Side Decorations
   Floating data fragments, geometric connectors, drifting particles
   on left and right margins of the viewport
   ================================================================ */

(function () {
  // Skip expensive ambient canvas on mobile — too much overlap + saves battery
  if (window.__mercury_mobile) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'ambientCanvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:40;';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  function resize() {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', resize);

  const W = () => canvas.width / dpr;
  const H = () => canvas.height / dpr;

  // ─── Data fragments (floating text on sides) ──────────
  const fragments = [];
  const fragmentTexts = [
    'P(YES) 0.74', 'VOL $2.1M', '+18.4%', 'CONF 0.89', 'EV +0.12',
    'KELLY 0.22', '842 BOTS', '67.2% WIN', 'BRIER 0.18', '$312M OI',
    'SHARP 1.84', 'DECAY -0.4c', 'SPREAD 2c', 'LIQ $4.2M', 'CAL 0.94',
    '0x7f3a...e2c1', 'node_42', 'lambda.exec', 'feed://poly',
    'ws://stream', 'sig: 0.003', 'lat: low', 'tps: 847', 'q: 0.91',
    'roi: +22.1%', 'pos: LONG', 'exp: $4.2K', 'fill: 98.2%',
    'mkt: 1,247', 'res: 94.8%', 'edge: +3.2c', 'vol: $48.6M',
  ];

  const MARGIN = 280; // fragments only in outer margins
  const FRAG_COUNT = 28;

  function spawnFragment(forceY) {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const x = side === 'left'
      ? 20 + Math.random() * (MARGIN - 40)
      : W() - MARGIN + 20 + Math.random() * (MARGIN - 40);
    const y = forceY !== undefined ? forceY : Math.random() * H();

    return {
      text: fragmentTexts[Math.floor(Math.random() * fragmentTexts.length)],
      x: x,
      y: y,
      speed: 0.08 + Math.random() * 0.18,
      alpha: 0.03 + Math.random() * 0.08,
      size: 8 + Math.random() * 3,
      side: side,
    };
  }

  for (let i = 0; i < FRAG_COUNT; i++) {
    fragments.push(spawnFragment());
  }

  // ─── Geometric nodes (small squares/circles on sides) ──
  const nodes = [];
  const NODE_COUNT = 40;

  for (let i = 0; i < NODE_COUNT; i++) {
    const side = Math.random() < 0.5 ? 'left' : 'right';
    nodes.push({
      x: side === 'left'
        ? 10 + Math.random() * (MARGIN - 20)
        : W() - MARGIN + 10 + Math.random() * (MARGIN - 20),
      y: Math.random() * H(),
      size: 2 + Math.random() * 4,
      alpha: 0.1 + Math.random() * 0.2,
      speed: 0.03 + Math.random() * 0.1,
      pulseSpeed: 0.5 + Math.random() * 2,
      shape: Math.random() < 0.6 ? 'square' : 'circle',
      side: side,
    });
  }

  // ─── Horizontal scan lines (occasional) ────────────────
  const scanLines = [];
  const SCAN_COUNT = 6;

  for (let i = 0; i < SCAN_COUNT; i++) {
    scanLines.push({
      y: Math.random() * H(),
      speed: 0.2 + Math.random() * 0.5,
      alpha: 0.01 + Math.random() * 0.03,
      width: 60 + Math.random() * 200,
      side: Math.random() < 0.5 ? 'left' : 'right',
    });
  }

  // ─── Vertical dashed lines (structural) ────────────────
  const vertLines = [];
  const VERT_COUNT = 8;
  for (let i = 0; i < VERT_COUNT; i++) {
    const side = i < VERT_COUNT / 2 ? 'left' : 'right';
    vertLines.push({
      x: side === 'left'
        ? 30 + Math.random() * (MARGIN - 60)
        : W() - MARGIN + 30 + Math.random() * (MARGIN - 60),
      alpha: 0.015 + Math.random() * 0.03,
      dashLen: 3 + Math.random() * 8,
      gapLen: 15 + Math.random() * 40,
    });
  }

  // ─── Connection lines between nearby nodes ─────────────
  function drawConnections(time) {
    const maxDist = 160;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (nodes[i].side !== nodes[j].side) continue;
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < maxDist) {
          const a = (1 - dist / maxDist) * 0.1;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(nodes[j].x, nodes[j].y);
          ctx.strokeStyle = `rgba(255,255,255,${a})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  // ─── Skyline buildings (side margins only) ─────────────
  const skyBuildings = [];

  function generateSkyline() {
    skyBuildings.length = 0;
    const w = W();
    const h = H();
    const skyM = MARGIN - 20; // keep buildings inside the margin zone

    // Helper — push a cluster of buildings on one side
    function addSideCluster(side, count, opts) {
      for (let i = 0; i < count; i++) {
        const bw = opts.bwMin + Math.random() * opts.bwRange;
        const bh = opts.bhMin + Math.random() * opts.bhRange;
        // x in pixels, converted to fraction later during render
        const xPx = side === 'left'
          ? 4 + Math.random() * (skyM - bw * w - 8)
          : w - skyM + 4 + Math.random() * (skyM - bw * w - 8);
        const x = xPx / w;
        skyBuildings.push({
          x, bw, bh,
          groundY: 1.0,
          alpha: opts.alphaMin + Math.random() * opts.alphaRange,
          layer: opts.layer,
          hasAntenna: Math.random() > 0.45,
          antennaH: 0.008 + Math.random() * 0.022,
          hasCrown: bh > 0.08 && Math.random() > 0.45,
          crownType: ['spire', 'pyramid', 'flat'][Math.floor(Math.random() * 3)],
          crownH: 0.004 + Math.random() * 0.01,
          windowRows: bh > 0.05 ? Math.floor(bh * 70) : 0,
          windowCols: bw > 0.008 ? Math.max(1, Math.floor(bw * 160)) : 0,
          side,
        });
      }
    }

    // Left cluster — back layer (shorter, dimmer)
    addSideCluster('left', 10, { bwMin: 0.005, bwRange: 0.014, bhMin: 0.04, bhRange: 0.12, alphaMin: 0.08, alphaRange: 0.07, layer: 0 });
    // Left cluster — front layer (taller, brighter)
    addSideCluster('left', 8, { bwMin: 0.008, bwRange: 0.022, bhMin: 0.08, bhRange: 0.22, alphaMin: 0.12, alphaRange: 0.10, layer: 1 });

    // Right cluster — back layer
    addSideCluster('right', 10, { bwMin: 0.005, bwRange: 0.014, bhMin: 0.04, bhRange: 0.12, alphaMin: 0.08, alphaRange: 0.07, layer: 0 });
    // Right cluster — front layer
    addSideCluster('right', 8, { bwMin: 0.008, bwRange: 0.022, bhMin: 0.08, bhRange: 0.22, alphaMin: 0.12, alphaRange: 0.10, layer: 1 });

    skyBuildings.sort((a, b) => a.layer - b.layer);

    // Pre-compute window visibility (avoids Math.random() flickering in render loop)
    for (const b of skyBuildings) {
      b._windows = [];
      if (b.windowRows > 0 && b.windowCols > 0) {
        const padXF = 0.18, padYF = 0.10;
        const spacingXF = (1 - padXF * 2) / b.windowCols;
        const spacingYF = (1 - padYF * 2) / b.windowRows;
        const winWF = 0.45 / b.windowCols;
        const winHF = 0.35 / b.windowRows;
        for (let r = 0; r < b.windowRows; r++) {
          for (let c = 0; c < b.windowCols; c++) {
            if (Math.random() > 0.45) continue;
            b._windows.push({
              rx: padXF + c * spacingXF,
              ry: padYF + r * spacingYF,
              wf: winWF, hf: winHF,
              a: 0.4 + Math.random() * 0.5,
            });
          }
        }
      }
    }
  }

  generateSkyline();

  // ─── Stars (side margins only) ────────────────────────
  const ambientStars = [];
  for (let i = 0; i < 40; i++) {
    const side = i < 20 ? 'left' : 'right';
    ambientStars.push({
      x: side === 'left'
        ? 10 + Math.random() * (MARGIN - 20)
        : W() - MARGIN + 10 + Math.random() * (MARGIN - 20),
      y: Math.random() * H() * 0.7,
      size: 1.5 + Math.random() * 2,
      baseAlpha: 0.08 + Math.random() * 0.12,
      twinkleSpeed: 0.6 + Math.random() * 2.5,
      twinkleOffset: Math.random() * Math.PI * 2,
      side,
    });
  }

  // ─── Horizon lights (side margins only) ───────────────
  const horizonLights = [];
  for (let i = 0; i < 12; i++) {
    const side = i < 6 ? 'left' : 'right';
    horizonLights.push({
      x: side === 'left'
        ? 8 + Math.random() * (MARGIN - 16)
        : W() - MARGIN + 8 + Math.random() * (MARGIN - 16),
      y: H() * (0.88 + Math.random() * 0.06),
      size: 1 + Math.random() * 1.2,
      alpha: 0.10 + Math.random() * 0.12,
      blinkSpeed: 0.4 + Math.random() * 1.8,
      blinkOffset: Math.random() * Math.PI * 2,
      side,
    });
  }

  // ─── Crosshair accents (a few scattered) ───────────────
  const crosshairs = [];
  const CH_COUNT = 4;
  for (let i = 0; i < CH_COUNT; i++) {
    const side = i < CH_COUNT / 2 ? 'left' : 'right';
    crosshairs.push({
      x: side === 'left'
        ? 40 + Math.random() * (MARGIN - 80)
        : W() - MARGIN + 40 + Math.random() * (MARGIN - 80),
      y: 100 + Math.random() * (H() - 200),
      size: 8 + Math.random() * 12,
      alpha: 0.04 + Math.random() * 0.06,
      rotSpeed: 0.1 + Math.random() * 0.3,
      side: side,
    });
  }

  // ─── Main render loop ─────────────────────────────────
  let scrollY = 0;
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  let time = 0;

  function render() {
    time += 0.016;
    const w = W();
    const h = H();

    ctx.clearRect(0, 0, w, h);

    // Vertical structural lines
    for (const vl of vertLines) {
      ctx.strokeStyle = `rgba(255,255,255,${vl.alpha})`;
      ctx.lineWidth = 0.5;
      ctx.setLineDash([vl.dashLen, vl.gapLen]);
      ctx.beginPath();
      ctx.moveTo(vl.x, 0);
      ctx.lineTo(vl.x, h);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Connection lines
    drawConnections(time);

    // Nodes
    for (const node of nodes) {
      node.y -= node.speed;
      if (node.y < -10) {
        node.y = h + 10;
        node.x = node.side === 'left'
          ? 10 + Math.random() * (MARGIN - 20)
          : w - MARGIN + 10 + Math.random() * (MARGIN - 20);
      }

      const pulse = (Math.sin(time * node.pulseSpeed) + 1) / 2;
      const a = node.alpha * (0.5 + pulse * 0.5);

      // Outer glow
      const glowR = node.size * 3;
      const glow = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
      glow.addColorStop(0, `rgba(255,255,255,${a * 0.3})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
      ctx.fill();

      // Core shape
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      if (node.shape === 'square') {
        ctx.fillRect(node.x - node.size / 2, node.y - node.size / 2, node.size, node.size);
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Fragments (floating text)
    ctx.font = '500 9px JetBrains Mono, monospace';
    ctx.textAlign = 'left';
    for (let i = 0; i < fragments.length; i++) {
      const f = fragments[i];
      f.y -= f.speed;

      if (f.y < -20) {
        fragments[i] = spawnFragment(h + 20);
      }

      ctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
      ctx.font = `500 ${f.size}px JetBrains Mono, monospace`;
      ctx.fillText(f.text, f.x, f.y);
    }

    // Scan lines
    for (const sl of scanLines) {
      sl.y -= sl.speed;
      if (sl.y < -5) {
        sl.y = h + 5;
        sl.width = 60 + Math.random() * 200;
      }

      const startX = sl.side === 'left' ? 0 : w - sl.width;
      ctx.fillStyle = `rgba(255,255,255,${sl.alpha})`;
      ctx.fillRect(startX, sl.y, sl.width, 1);
    }

    // Stars (pixel positions)
    for (const s of ambientStars) {
      const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed + s.twinkleOffset);
      const sa = s.baseAlpha * (0.3 + twinkle * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${sa})`;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }

    // Horizon lights (pixel positions)
    for (const hl of horizonLights) {
      const blink = 0.5 + 0.5 * Math.sin(time * hl.blinkSpeed + hl.blinkOffset);
      const hlA = hl.alpha * (0.3 + blink * 0.7);
      ctx.fillStyle = `rgba(255,255,255,${hlA})`;
      ctx.fillRect(hl.x - hl.size / 2, hl.y - hl.size / 2, hl.size, hl.size);
    }

    // Skyline buildings (side margins)
    for (const b of skyBuildings) {
      const bx = b.x * w;
      const bw = b.bw * w;
      const bh = b.bh * h;
      const gY = b.groundY * h;
      const a = b.alpha;

      // Outline
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = b.layer === 0 ? 0.6 : 1.0;
      ctx.beginPath();
      ctx.moveTo(bx, gY);
      ctx.lineTo(bx, gY - bh);
      ctx.lineTo(bx + bw, gY - bh);
      ctx.lineTo(bx + bw, gY);
      ctx.stroke();

      // Faint fill
      ctx.fillStyle = `rgba(255,255,255,${a * 0.25})`;
      ctx.fillRect(bx, gY - bh, bw, bh);

      // Crown
      if (b.hasCrown) {
        const cH = b.crownH * h;
        const midX = bx + bw / 2;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`;
        ctx.lineWidth = 0.6;
        if (b.crownType === 'spire') {
          ctx.beginPath();
          ctx.moveTo(midX, gY - bh - cH);
          ctx.lineTo(bx + bw * 0.35, gY - bh);
          ctx.moveTo(midX, gY - bh - cH);
          ctx.lineTo(bx + bw * 0.65, gY - bh);
          ctx.stroke();
        } else if (b.crownType === 'pyramid') {
          ctx.beginPath();
          ctx.moveTo(bx, gY - bh);
          ctx.lineTo(midX, gY - bh - cH);
          ctx.lineTo(bx + bw, gY - bh);
          ctx.stroke();
        }
      }

      // Antenna + blink light
      if (b.hasAntenna) {
        const aH = b.antennaH * h;
        const midX = bx + bw / 2;
        ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(midX, gY - bh);
        ctx.lineTo(midX, gY - bh - aH);
        ctx.stroke();
        const blink = (Math.sin(time * 2 + bx) + 1) / 2;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.6 * blink})`;
        ctx.fillRect(midX - 1, gY - bh - aH - 1, 2, 2);
      }

      // Windows (pre-computed positions — no flickering)
      if (b._windows && b._windows.length > 0) {
        for (const win of b._windows) {
          const wx = bx + win.rx * bw;
          const wy = gY - bh + win.ry * bh;
          ctx.fillStyle = `rgba(255,255,255,${a * win.a})`;
          ctx.fillRect(wx, wy, win.wf * bw, win.hf * bh);
        }
      }
    }

    // Crosshairs
    for (const ch of crosshairs) {
      const a = ch.alpha * (0.6 + Math.sin(time * ch.rotSpeed) * 0.4);
      const s = ch.size;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 0.5;

      // Horizontal
      ctx.beginPath();
      ctx.moveTo(ch.x - s, ch.y);
      ctx.lineTo(ch.x + s, ch.y);
      ctx.stroke();

      // Vertical
      ctx.beginPath();
      ctx.moveTo(ch.x, ch.y - s);
      ctx.lineTo(ch.x, ch.y + s);
      ctx.stroke();

      // Corner brackets
      const b = s * 0.4;
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
      // top-left
      ctx.beginPath(); ctx.moveTo(ch.x - s, ch.y - s); ctx.lineTo(ch.x - s + b, ch.y - s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ch.x - s, ch.y - s); ctx.lineTo(ch.x - s, ch.y - s + b); ctx.stroke();
      // top-right
      ctx.beginPath(); ctx.moveTo(ch.x + s, ch.y - s); ctx.lineTo(ch.x + s - b, ch.y - s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ch.x + s, ch.y - s); ctx.lineTo(ch.x + s, ch.y - s + b); ctx.stroke();
      // bottom-left
      ctx.beginPath(); ctx.moveTo(ch.x - s, ch.y + s); ctx.lineTo(ch.x - s + b, ch.y + s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ch.x - s, ch.y + s); ctx.lineTo(ch.x - s, ch.y + s - b); ctx.stroke();
      // bottom-right
      ctx.beginPath(); ctx.moveTo(ch.x + s, ch.y + s); ctx.lineTo(ch.x + s - b, ch.y + s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ch.x + s, ch.y + s); ctx.lineTo(ch.x + s, ch.y + s - b); ctx.stroke();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  // Reposition elements on resize
  window.addEventListener('resize', () => {
    const w = W();
    const h = H();
    for (const f of fragments) {
      f.x = f.side === 'left'
        ? 20 + Math.random() * (MARGIN - 40)
        : w - MARGIN + 20 + Math.random() * (MARGIN - 40);
    }
    for (const n of nodes) {
      n.x = n.side === 'left'
        ? 10 + Math.random() * (MARGIN - 20)
        : w - MARGIN + 10 + Math.random() * (MARGIN - 20);
    }
    for (const vl of vertLines) {
      const side = vl.x < MARGIN ? 'left' : 'right';
      vl.x = side === 'left'
        ? 30 + Math.random() * (MARGIN - 60)
        : w - MARGIN + 30 + Math.random() * (MARGIN - 60);
    }
    for (const ch of crosshairs) {
      ch.x = ch.side === 'left'
        ? 40 + Math.random() * (MARGIN - 80)
        : w - MARGIN + 40 + Math.random() * (MARGIN - 80);
    }
    for (const s of ambientStars) {
      s.x = s.side === 'left'
        ? 10 + Math.random() * (MARGIN - 20)
        : w - MARGIN + 10 + Math.random() * (MARGIN - 20);
    }
    for (const hl of horizonLights) {
      hl.x = hl.side === 'left'
        ? 8 + Math.random() * (MARGIN - 16)
        : w - MARGIN + 8 + Math.random() * (MARGIN - 16);
      hl.y = h * (0.88 + Math.random() * 0.06);
    }
    generateSkyline();
  });
})();
