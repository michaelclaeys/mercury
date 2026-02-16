/* ================================================================
   MERCURY — Terminal Landing Page
   Galaxy warp intro, text cycling, hub reveal, live chart,
   counters, scroll reveals, SVG draw, ticking metrics
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  /* ═══════════════════════════════════════════════════════════════
     SECTION 1 — GALAXY INTRO ANIMATION
     ═══════════════════════════════════════════════════════════════ */

  const intro = document.getElementById('intro');
  const galaxyCanvas = document.getElementById('galaxyCanvas');
  const introLogo = document.getElementById('introLogo');
  const introBrand = document.getElementById('introBrand');
  const introTextline = document.getElementById('introTextline');
  const introWord = document.getElementById('introWord');
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

  // Spawn stars near center
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

    // Phase transitions
    if (elapsed < 1.84) {
      warpSpeed = 4;
      trailFade = 0.03;
    } else if (elapsed < 3.34) {
      const t = (elapsed - 1.84) / 1.5;
      warpSpeed = 4 - t * 3.85;
      trailFade = 0.03 + t * 0.3;
    } else {
      warpSpeed = 0.12;
      trailFade = 0.35;
    }

    // Semi-transparent clear for trails
    ctx.fillStyle = `rgba(0, 0, 0, ${trailFade})`;
    ctx.fillRect(0, 0, w, h);

    // ─── Central glow (appears immediately, builds up) ───
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

    // ─── Expanding rings from center ───
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

    // ─── Render stars ───
    stars.forEach(star => {
      star.dist += star.speed * warpSpeed;

      const x = cx + Math.cos(star.angle) * star.dist;
      const y = cy + Math.sin(star.angle) * star.dist;

      // Respawn if off screen
      if (x < -60 || x > w + 60 || y < -60 || y > h + 60) {
        star.dist = Math.random() * 6;
        star.angle = Math.random() * Math.PI * 2;
        return;
      }

      // Size grows with distance (parallax depth)
      const depthScale = Math.min(star.dist / 200, 2.5);
      const drawSize = star.size * (0.6 + depthScale * 0.6);

      // Draw streak during warp
      if (warpSpeed > 0.5) {
        const trailLen = star.speed * warpSpeed * 3.5;
        const px = cx + Math.cos(star.angle) * Math.max(0, star.dist - trailLen);
        const py = cy + Math.sin(star.angle) * Math.max(0, star.dist - trailLen);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.strokeStyle = `rgba(255, 255, 255, ${star.alpha * 0.45})`;
        ctx.lineWidth = drawSize * 0.4;
        ctx.stroke();
      }

      // Square star point
      ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
      ctx.fillRect(x - drawSize / 2, y - drawSize / 2, drawSize, drawSize);
    });

    // ─── Subtle dot grid (visible after warp slows) ───
    if (warpSpeed < 1 && elapsed > 2.34) {
      const gridAlpha = Math.min(0.04, (elapsed - 2.34) * 0.02);
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

  // ─── Intro sequence timing (faster) ───────────────────

  // t=1.84s: Logo appears + orbits draw
  introTimers.push(setTimeout(() => {
    if (introExited) return;
    introLogo.classList.add('visible');
    introLogo.querySelectorAll('.intro-orbit').forEach(o => o.classList.add('drawn'));
  }, 1840));

  // t=2.44s: Core appears
  introTimers.push(setTimeout(() => {
    if (introExited) return;
    introLogo.querySelector('.intro-core').classList.add('visible');
  }, 2440));

  // t=3.04s: Brand text
  introTimers.push(setTimeout(() => {
    if (introExited) return;
    introBrand.classList.add('visible');
  }, 3040));

  // t=3.84s: "Built for" text
  introTimers.push(setTimeout(() => {
    if (introExited) return;
    introTextline.classList.add('visible');
  }, 3840));

  // t=5.4s: Start word cycling
  const words = ['traders', 'vision', 'precision', 'alpha', 'speed', 'insight', 'conviction', 'edge'];
  const finalWord = 'the next generation';
  let wordIndex = 0;

  function cycleWord() {
    if (introExited) return;
    if (wordIndex >= words.length) {
      // Final word
      introWord.classList.add('out');
      setTimeout(() => {
        if (introExited) return;
        introWord.textContent = finalWord;
        introWord.classList.remove('out');
        introWord.classList.add('entering');
        requestAnimationFrame(() => {
          introWord.classList.remove('entering');
        });
      }, 150);

      // Hold then exit
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
      requestAnimationFrame(() => {
        introWord.classList.remove('entering');
      });
      wordIndex++;
      introTimers.push(setTimeout(cycleWord, 250));
    }, 150);
  }

  introTimers.push(setTimeout(() => {
    if (introExited) return;
    wordIndex = 1; // skip 'traders' since it's already showing
    introTimers.push(setTimeout(cycleWord, 250));
  }, 4240));

  // ─── Exit intro ─────────────────────────────────────

  function exitIntro() {
    if (introExited) return;
    introExited = true;

    // Clear remaining timers
    introTimers.forEach(t => clearTimeout(t));

    // Fade out
    intro.classList.add('exit');
    document.body.classList.remove('intro-active');

    setTimeout(() => {
      intro.classList.add('gone');
      revealHub();
      // Activate data helix
      const helix = document.getElementById('dataHelix');
      if (helix) {
        helix.classList.add('active');
        initHelix();
      }
    }, 1000);
  }

  // Click to skip
  intro.addEventListener('click', exitIntro);

  // ─── Hub view / Info view swap ────────────────────────

  const hubView = document.getElementById('hubView');
  const hubInfoView = document.getElementById('hubInfoView');
  const hubSection = document.getElementById('hub');
  let hubSeen = false;
  let hubSwapped = false;

  let infoInitPlayed = false;

  function showInfoView() {
    if (hubView) hubView.style.display = 'none';
    if (hubInfoView) hubInfoView.classList.add('active');
    if (!infoInitPlayed) {
      infoInitPlayed = true;
      const infoInitEl = document.getElementById('infoInit');
      if (infoInitEl) infoInitEl.classList.add('active');
      animateTermInit('infoInit');
    }
  }

  // Detect when user scrolls past the hub
  const hubExitObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting && hubSeen && !hubSwapped) {
        hubSwapped = true;
      }
      if (entry.isIntersecting && !hubSeen) {
        hubSeen = true;
      }
      if (entry.isIntersecting && hubSwapped) {
        showInfoView();
      }
    });
  }, { threshold: 0.05 });

  if (hubSection) hubExitObserver.observe(hubSection);

  // Mercury logo click → scroll to top and show info view
  const navBrand = document.querySelector('.navbar-brand');
  if (navBrand) {
    navBrand.addEventListener('click', (e) => {
      e.preventDefault();
      if (hubSeen) {
        hubSwapped = true;
        showInfoView();
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ─── Hub reveal after intro ─────────────────────────

  // ─── Terminal init sequence animator ───────────────
  function animateTermInit(containerId, callback) {
    const container = document.getElementById(containerId);
    if (!container) { if (callback) callback(); return; }
    const lines = container.querySelectorAll('.term-line');
    lines.forEach((line, i) => {
      const delay = parseInt(line.dataset.delay) || (i * 350);
      setTimeout(() => {
        line.classList.add('visible');
      }, delay);
    });
    // Callback after all lines done
    const maxDelay = Array.from(lines).reduce((max, l) => Math.max(max, parseInt(l.dataset.delay) || 0), 0);
    if (callback) setTimeout(callback, maxDelay + 500);
  }

  function revealHub() {
    // First run the terminal init sequence, then reveal hub content
    animateTermInit('hubInit', () => {
      const heading = document.getElementById('hubHeading');
      const sub = document.getElementById('hubSub');
      const panels = document.getElementById('hubPanels');

      if (heading) heading.classList.add('visible');
      if (sub) sub.classList.add('visible');
      if (panels) panels.classList.add('visible');

      animateHubVisuals();
    });
  }

  function animateHubVisuals() {
    ['hubVisual1', 'hubVisual2', 'hubVisual3'].forEach(id => {
      const container = document.getElementById(id);
      if (!container) return;
      for (let i = 0; i < 12; i++) {
        const bar = document.createElement('div');
        bar.className = 'hub-panel-bar';
        bar.style.height = (5 + Math.random() * 35) + 'px';
        container.appendChild(bar);
      }
    });

    // Animate bars periodically
    setInterval(() => {
      ['hubVisual1', 'hubVisual2', 'hubVisual3'].forEach(id => {
        const container = document.getElementById(id);
        if (!container) return;
        container.querySelectorAll('.hub-panel-bar').forEach(bar => {
          bar.style.height = (5 + Math.random() * 35) + 'px';
        });
      });
    }, 2500);
  }


  /* ═══════════════════════════════════════════════════════════════
     SECTION 2 — PAGE FEATURES
     ═══════════════════════════════════════════════════════════════ */

  // ─── Data helix (sine wave weave) ──────────────────

  const helixTrack = document.getElementById('helixTrack');
  let helixActive = false;
  const helixItems = [];

  const helixData = [
    { t: '$97,420', c: '' },
    { t: '\u0393 0.042', c: 'dim' },
    { t: '+$14.2M', c: '' },
    { t: '\u0394 0.651', c: 'dim' },
    { t: '$96,800', c: '' },
    { t: '\u0398 -12.4', c: 'dim' },
    { t: '62%', c: 'acc' },
    { t: '\u03BD 0.384', c: 'dim' },
    { t: '$3,841', c: '' },
    { t: 'P/C 0.84', c: 'dim' },
    { t: '-$8.7M', c: '' },
    { t: 'OI $4.8B', c: 'dim' },
    { t: '$198.40', c: 'acc' },
    { t: 'VOL $2.1B', c: 'dim' },
    { t: '+$3.1M', c: '' },
    { t: '\u03A3 0.024', c: 'dim' },
    { t: '97,000', c: '' },
    { t: '\u0393 -0.018', c: 'dim' },
    { t: 'LONG \u0393', c: 'acc' },
    { t: '\u0394 0.312', c: 'dim' },
    { t: '$4.8B', c: '' },
    { t: '\u0398 -8.91', c: 'dim' },
    { t: '+2.4%', c: 'acc' },
    { t: '\u03BD 0.217', c: 'dim' },
  ];

  function initHelix() {
    if (!helixTrack) return;
    const containerH = helixTrack.parentElement.offsetHeight;
    const spacing = 38;
    const count = Math.ceil(containerH / spacing) + 6;

    for (let i = 0; i < count; i++) {
      const d = helixData[i % helixData.length];
      const el = document.createElement('div');
      el.className = 'dh' + (d.c ? ' ' + d.c : '');
      el.textContent = d.t;
      helixTrack.appendChild(el);
      helixItems.push({
        el: el,
        y: i * spacing,
        speed: 0.35,
      });
    }
    helixActive = true;
    requestAnimationFrame(tickHelix);
  }

  function tickHelix() {
    if (!helixActive) return;
    const containerH = helixTrack.parentElement.offsetHeight;
    const totalH = helixItems.length * 38;
    const amplitude = 55;
    const freq = 0.025;

    for (let i = 0; i < helixItems.length; i++) {
      const item = helixItems[i];
      item.y -= item.speed;

      // Wrap around
      if (item.y < -30) {
        item.y += totalH;
      }

      const xOffset = Math.sin(item.y * freq) * amplitude;
      item.el.style.transform = `translate(${xOffset}px, ${item.y}px)`;
    }

    requestAnimationFrame(tickHelix);
  }

  // ─── Scroll reveal ──────────────────────────────────

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal, .reveal-stagger').forEach(el => revealObserver.observe(el));

  // ─── SVG draw on scroll ─────────────────────────────

  const drawObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.querySelectorAll('.mock-path, .mock-connection').forEach(path => {
          path.classList.add('drawn');
        });
        drawObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });

  const analyticsMockup = document.getElementById('analyticsMockup');
  const terminalMockup = document.getElementById('terminalMockup');
  if (analyticsMockup) drawObserver.observe(analyticsMockup);
  if (terminalMockup) drawObserver.observe(terminalMockup);

  // ─── Counter animation ──────────────────────────────

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animateCounter(el) {
    const target = parseInt(el.dataset.count);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(easeOutQuart(progress) * target);
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

  // ─── Mobile menu ────────────────────────────────────

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

  // ─── Smooth scroll ──────────────────────────────────

  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        const offset = 44 + 28; // navbar + ticker
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top, behavior: 'smooth' });
      }
    });
  });

  // ─── Live chart ─────────────────────────────────────

  const chartCanvas = document.getElementById('liveChart');
  let chartActive = false;
  let chartData = [];
  let currentPrice = 97420;

  function initChart() {
    let price = 97200 + Math.random() * 400;
    for (let i = 0; i < 80; i++) {
      price += (Math.random() - 0.48) * 80;
      price = Math.max(96000, Math.min(99000, price));
      chartData.push(price);
    }
    currentPrice = chartData[chartData.length - 1];
  }

  function drawChart() {
    if (!chartCanvas) return;
    const c = chartCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = chartCanvas.getBoundingClientRect();

    chartCanvas.width = rect.width * dpr;
    chartCanvas.height = rect.height * dpr;
    c.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    c.clearRect(0, 0, w, h);

    if (chartData.length < 2) return;

    const min = Math.min(...chartData) - 100;
    const max = Math.max(...chartData) + 100;
    const range = max - min;

    // Grid
    c.strokeStyle = '#1a1a1a';
    c.lineWidth = 0.5;
    for (let i = 0; i < 5; i++) {
      const y = (h / 5) * i;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(w, y);
      c.stroke();
    }

    // Price line
    c.strokeStyle = '#d0d0d0';
    c.lineWidth = 1;
    c.beginPath();
    const step = w / (chartData.length - 1);
    chartData.forEach((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / range) * h;
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    });
    c.stroke();

    // Latest price square dot
    const lastX = (chartData.length - 1) * step;
    const lastY = h - ((chartData[chartData.length - 1] - min) / range) * h;
    c.fillStyle = '#ffffff';
    c.fillRect(lastX - 2, lastY - 2, 4, 4);

    // Price label
    c.fillStyle = '#909090';
    c.font = '10px "JetBrains Mono", monospace';
    c.textAlign = 'right';
    c.fillText('$' + Math.round(chartData[chartData.length - 1]).toLocaleString(), w - 4, lastY - 8);
  }

  function tickChart() {
    if (!chartActive) return;
    currentPrice += (Math.random() - 0.48) * 60;
    currentPrice = Math.max(96000, Math.min(99000, currentPrice));
    chartData.push(currentPrice);
    if (chartData.length > 80) chartData.shift();
    drawChart();
    setTimeout(tickChart, 800);
  }

  const chartObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !chartActive) {
        chartActive = true;
        initChart();
        drawChart();
        tickChart();
      }
    });
  }, { threshold: 0.1 });

  if (chartCanvas) {
    chartObserver.observe(chartCanvas);
    window.addEventListener('resize', () => {
      if (chartActive) drawChart();
    });
  }

  // ─── Live ticking metrics ───────────────────────────

  const liveBtcPrice = document.getElementById('liveBtcPrice');
  const liveNetGex = document.getElementById('liveNetGex');
  const liveVanna = document.getElementById('liveVanna');
  const liveFlip = document.getElementById('liveFlip');
  const liveGexBars = document.getElementById('liveGexBars');

  if (liveGexBars) {
    for (let i = 0; i < 16; i++) {
      const bar = document.createElement('div');
      bar.className = 'terminal-bar';
      bar.style.height = (10 + Math.random() * 40) + 'px';
      liveGexBars.appendChild(bar);
    }
  }

  function tickMetrics() {
    if (!chartActive) return;

    if (liveBtcPrice) liveBtcPrice.textContent = '$' + Math.round(currentPrice).toLocaleString();

    if (liveNetGex) {
      const gex = 14.2 + (Math.random() - 0.5) * 2;
      liveNetGex.textContent = (gex >= 0 ? '+' : '') + '$' + gex.toFixed(1) + 'M';
    }

    if (liveVanna) {
      const vanna = -8.7 + (Math.random() - 0.5) * 1.5;
      liveVanna.textContent = (vanna >= 0 ? '+' : '') + '$' + vanna.toFixed(1) + 'M';
    }

    if (liveFlip) {
      const flip = 96800 + Math.round((Math.random() - 0.5) * 200);
      liveFlip.textContent = '$' + flip.toLocaleString();
    }

    if (liveGexBars) {
      liveGexBars.querySelectorAll('.terminal-bar').forEach(bar => {
        bar.style.height = (8 + Math.random() * 42) + 'px';
      });
    }

    setTimeout(tickMetrics, 2000);
  }

  const metricsWatcher = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(tickMetrics, 1000);
        metricsWatcher.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  const terminalWindow = document.querySelector('.terminal-window');
  if (terminalWindow) metricsWatcher.observe(terminalWindow);

});
