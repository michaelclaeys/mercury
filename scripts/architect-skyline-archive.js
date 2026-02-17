/* ================================================================
   MERCURY ARCHITECT — First-Person Skyscraper Intro, Terminal Init,
   Scroll Animations, AI Typewriter, Deploy Terminal, Counters
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — FIRST-PERSON SKYSCRAPER INTRO
     ═══════════════════════════════════════════════════════════════ */

  const archIntro = document.getElementById('archIntro');
  const skylineCanvas = document.getElementById('skylineCanvas');
  const archTitle = document.getElementById('archTitle');
  const archTextline = document.getElementById('archTextline');
  const archWord = document.getElementById('archWord');
  const archTerminal = document.getElementById('archTerminal');
  let introExited = false;
  let introTimers = [];

  const ctx = skylineCanvas.getContext('2d');
  const buildings = [];
  const BUILDING_COUNT = 65;

  function resizeSkyline() {
    skylineCanvas.width = window.innerWidth;
    skylineCanvas.height = window.innerHeight;
  }
  resizeSkyline();
  window.addEventListener('resize', resizeSkyline);

  // Generate buildings for first-person perspective — spread across full width + overflow
  const totalSpread = window.innerWidth * 1.4; // 140% of screen width for edge coverage
  const offsetX = -window.innerWidth * 0.2;    // start 20% off-screen left

  for (let i = 0; i < BUILDING_COUNT; i++) {
    const x = offsetX + (i / BUILDING_COUNT) * totalSpread + (Math.random() - 0.5) * 40;
    const w = 15 + Math.random() * 55;

    // Very tall buildings — towering over the viewer
    const targetH = window.innerHeight * (0.50 + Math.random() * 0.45);

    // Depth layer: 0 = far background, 1 = close foreground
    const depth = Math.random();

    buildings.push({
      x: x,
      width: w,
      targetHeight: targetH,
      currentHeight: 0,
      depth: depth,
      hasAntenna: Math.random() > 0.45,
      antennaHeight: 15 + Math.random() * 50,
      windows: [],
      riseDelay: Math.random() * 1200,
      riseStarted: false,
    });
  }

  // Sort by depth so far buildings draw first (painter's algorithm)
  buildings.sort((a, b) => a.depth - b.depth);

  const introStart = performance.now();

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function renderSkyline(now) {
    if (introExited) return;

    const elapsed = (now - introStart) / 1000;
    const w = skylineCanvas.width;
    const h = skylineCanvas.height;
    const elapsedMs = elapsed * 1000;

    // Vanishing point — above top center of screen
    const vpX = w / 2;
    const vpY = -h * 0.15;
    const totalDist = h - vpY;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Sky glow — subtle light at vanishing point
    const skyGrad = ctx.createRadialGradient(vpX, 0, 0, vpX, 0, h * 0.8);
    skyGrad.addColorStop(0, 'rgba(255,255,255,0.018)');
    skyGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // Ground plane glow
    if (elapsed > 0.5) {
      const groundAlpha = Math.min(0.07, (elapsed - 0.5) * 0.015);
      const groundGrad = ctx.createLinearGradient(0, h, 0, h - 80);
      groundGrad.addColorStop(0, `rgba(255,255,255,${groundAlpha})`);
      groundGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, h - 80, w, 80);
    }

    // Render buildings
    buildings.forEach((b, bi) => {
      if (elapsedMs < b.riseDelay) return;

      if (!b.riseStarted) {
        b.riseStarted = true;
        // Generate windows
        const cols = Math.max(1, Math.floor(b.width / 8));
        const rows = Math.max(1, Math.floor(b.targetHeight / 14));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            b.windows.push({
              row: r,
              col: c,
              totalRows: rows,
              totalCols: cols,
              lit: Math.random() > 0.45,
              alpha: 0.03 + Math.random() * 0.55,
              flickerRate: 0.002 + Math.random() * 0.005,
            });
          }
        }
      }

      // Ease rise
      const riseDuration = 1600;
      const riseElapsed = elapsedMs - b.riseDelay;
      const t = Math.min(riseElapsed / riseDuration, 1);
      const eased = easeOutQuart(t);
      b.currentHeight = b.targetHeight * eased;

      if (b.currentHeight < 2) return;

      // Base positions at ground level
      const baseLeft = b.x;
      const baseRight = b.x + b.width;
      const baseY = h;

      // Perspective projection — top converges toward vanishing point
      const pRatio = b.currentHeight / totalDist;
      const topLeftX = baseLeft + (vpX - baseLeft) * pRatio;
      const topRightX = baseRight + (vpX - baseRight) * pRatio;
      const topY = baseY - b.currentHeight;

      // Depth-based opacity (far = dim, near = bright)
      const depthAlpha = 0.06 + b.depth * 0.16;

      // Building trapezoid outline
      ctx.strokeStyle = `rgba(255,255,255,${depthAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(baseLeft, baseY);
      ctx.lineTo(topLeftX, topY);
      ctx.lineTo(topRightX, topY);
      ctx.lineTo(baseRight, baseY);
      ctx.closePath();
      ctx.stroke();

      // Inner edge (subtle depth)
      if (b.width > 20) {
        const inset = 2;
        const innerH = Math.max(0, b.currentHeight - inset);
        const iPRatio = innerH / totalDist;
        const iTopLeftX = (baseLeft + inset) + (vpX - (baseLeft + inset)) * iPRatio;
        const iTopRightX = (baseRight - inset) + (vpX - (baseRight - inset)) * iPRatio;
        ctx.strokeStyle = `rgba(255,255,255,${depthAlpha * 0.2})`;
        ctx.beginPath();
        ctx.moveTo(baseLeft + inset, baseY - inset);
        ctx.lineTo(iTopLeftX, topY + inset);
        ctx.lineTo(iTopRightX, topY + inset);
        ctx.lineTo(baseRight - inset, baseY - inset);
        ctx.closePath();
        ctx.stroke();
      }

      // Windows in perspective
      if (t > 0.15) {
        b.windows.forEach(win => {
          const rowFraction = (win.row + 0.5) / win.totalRows;
          if (rowFraction > t * 1.1) return; // building hasn't risen here yet

          const winHeight = b.targetHeight * rowFraction;
          const winPRatio = winHeight / totalDist;
          const rowLeftX = baseLeft + (vpX - baseLeft) * winPRatio;
          const rowRightX = baseRight + (vpX - baseRight) * winPRatio;
          const rowY = baseY - winHeight;

          const winX = rowLeftX + ((win.col + 0.5) / win.totalCols) * (rowRightX - rowLeftX);
          const alpha = win.lit ? win.alpha * (0.3 + b.depth * 0.7) : 0.015;

          ctx.fillStyle = `rgba(255,255,255,${alpha})`;
          ctx.fillRect(winX - 1, rowY - 1, 2, 2);
        });
      }

      // Antenna
      if (b.hasAntenna && t > 0.8) {
        const antennaProgress = Math.min((t - 0.8) / 0.2, 1);
        const antennaMidBaseX = baseLeft + b.width / 2;
        const antennaTipH = b.currentHeight + b.antennaHeight * antennaProgress;
        const antennaTipPRatio = antennaTipH / totalDist;
        const antennaTipX = antennaMidBaseX + (vpX - antennaMidBaseX) * antennaTipPRatio;
        const antennaTipY = baseY - antennaTipH;

        // Antenna base X (at building top)
        const antennaBaseX = (topLeftX + topRightX) / 2;

        ctx.strokeStyle = `rgba(255,255,255,${depthAlpha * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(antennaBaseX, topY);
        ctx.lineTo(antennaTipX, antennaTipY);
        ctx.stroke();

        // Antenna tip blink
        if (antennaProgress >= 1 && elapsed > 3) {
          const blinkAlpha = (Math.sin(elapsed * 3 + b.x) + 1) * 0.25;
          ctx.fillStyle = `rgba(255,255,255,${blinkAlpha})`;
          ctx.fillRect(antennaTipX - 1, antennaTipY - 1, 2, 2);
        }
      }
    });

    // Window flicker
    if (elapsed > 4) {
      buildings.forEach(b => {
        b.windows.forEach(win => {
          if (Math.random() < win.flickerRate) {
            win.lit = !win.lit;
            if (win.lit) win.alpha = 0.03 + Math.random() * 0.55;
          }
        });
      });
    }

    // Horizontal scan line
    if (elapsed > 2) {
      const scanY = (elapsed * 25) % h;
      ctx.fillStyle = 'rgba(255,255,255,0.012)';
      ctx.fillRect(0, scanY, w, 1);
    }

    // Subtle vertical perspective lines converging to VP
    if (elapsed > 1.5) {
      const lineAlpha = Math.min(0.02, (elapsed - 1.5) * 0.005);
      ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`;
      ctx.lineWidth = 0.3;
      for (let i = 0; i < 8; i++) {
        const gx = (i / 7) * w;
        ctx.beginPath();
        ctx.moveTo(gx, h);
        ctx.lineTo(gx + (vpX - gx) * 0.9, h - h * 0.9);
        ctx.stroke();
      }
    }

    requestAnimationFrame(renderSkyline);
  }

  requestAnimationFrame(renderSkyline);


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

  animateIntroTerminal();


  // ─── Intro timing ──────────────────────────────────

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

  // t=2.4s: Word cycling (no "Mercury" prefix — just the words)
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

  // ─── Exit intro ───────────────────────────────────

  function exitArchIntro() {
    if (introExited) return;
    introExited = true;
    introTimers.forEach(t => clearTimeout(t));
    archIntro.classList.add('exit');
    document.body.classList.remove('intro-active');
    setTimeout(() => {
      archIntro.classList.add('gone');
    }, 1000);
  }

  archIntro.addEventListener('click', exitArchIntro);


  /* ═══════════════════════════════════════════════════════════════
     SECTION 1B — HERO TERMINAL INIT (fires after intro exits)
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
        entry.target.querySelectorAll('.arch-conn').forEach(path => {
          path.classList.add('drawn');
        });
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

  const userText = 'Build me a bot that buys YES on any market where probability drops below 30c but historical resolution rate for that category is above 70%';
  const aiText = 'Understood. I\'ve created a 4-node bot:\n\n1. SCAN: Monitor all markets where P(YES) < 30c\n2. FILTER: Category resolution rate > 70%\n3. CHECK: Liquidity > $50K, spread < 5c\n4. EXECUTE: Buy 200 YES shares @ limit P+1c\n\nRisk: Max $2,000 per position, $10K total exposure.\n\nReady to preview in the editor?';

  function typeText(el, text, speed, callback) {
    let i = 0;
    const cursor = document.createElement('span');
    cursor.className = 'arch-ai-cursor';
    el.textContent = '';
    el.appendChild(cursor);

    function tick() {
      if (i < text.length) {
        const char = text[i];
        if (char === '\n') {
          el.insertBefore(document.createElement('br'), cursor);
        } else {
          el.insertBefore(document.createTextNode(char), cursor);
        }
        i++;
        setTimeout(tick, speed);
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
     SECTION 5 — INFRASTRUCTURE TERMINAL ANIMATION
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
     SECTION 6 — DEPLOY TERMINAL ANIMATION
     ═══════════════════════════════════════════════════════════════ */

  let deployPlayed = false;

  function animateTermInit(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const lines = container.querySelectorAll('.term-line');
    lines.forEach((line) => {
      const delay = parseInt(line.dataset.delay) || 0;
      setTimeout(() => {
        line.classList.add('visible');
      }, delay);
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
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutQuart(progress);
      const value = Math.round(eased * target);
      el.textContent = prefix + value.toLocaleString() + suffix;
      if (progress < 1) requestAnimationFrame(tick);
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
    hamburger.addEventListener('click', () => {
      mobileMenu.classList.toggle('open');
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('open');
      });
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const offset = 44;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

});
