/* ================================================================
   MERCURY — Galaxy Intro Animation
   Full intro (~6s) or fast returning-visitor version (~1.5s)
   ================================================================ */

export function runFullIntro(onDone) {
  const intro     = document.getElementById('intro');
  const canvas    = document.getElementById('galaxyCanvas');
  const introLogo = document.getElementById('introLogo');
  const introBrand = document.getElementById('introBrand');
  const introTextline = document.getElementById('introTextline');
  const introWord = document.getElementById('introWord');

  let exited = false;
  const timers = [];

  // ── Galaxy star field ──────────────────────────────────
  const ctx = canvas.getContext('2d');
  const stars = [];
  const STAR_COUNT = 800;
  let warpSpeed = 4;
  let trailFade = 0.04;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      angle: Math.random() * Math.PI * 2,
      dist: Math.random() * 12,
      speed: 0.3 + Math.random() * 3.2,
      size: 0.3 + Math.random() * 1.5,
      alpha: 0.12 + Math.random() * 0.88,
    });
  }

  const start = performance.now();

  function render(now) {
    if (exited) return;

    const elapsed = (now - start) / 1000;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // Phase transitions
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

    // Dot grid after warp
    if (warpSpeed < 1 && elapsed > 1.34) {
      const gridAlpha = Math.min(0.04, (elapsed - 1.34) * 0.02);
      ctx.fillStyle = `rgba(255, 255, 255, ${gridAlpha})`;
      const spacing = 60;
      for (let gx = cx % spacing; gx < w; gx += spacing) {
        for (let gy = cy % spacing; gy < h; gy += spacing) {
          ctx.fillRect(gx, gy, 1, 1);
        }
      }
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  // ── Sequence timing ────────────────────────────────────
  timers.push(setTimeout(() => {
    if (exited) return;
    introLogo.classList.add('visible');
    introLogo.querySelectorAll('.intro-orbit').forEach(o => o.classList.add('drawn'));
  }, 340));

  timers.push(setTimeout(() => {
    if (exited) return;
    introLogo.querySelector('.intro-core').classList.add('visible');
  }, 940));

  timers.push(setTimeout(() => {
    if (exited) return;
    introBrand.classList.add('visible');
  }, 1540));

  timers.push(setTimeout(() => {
    if (exited) return;
    introTextline.classList.add('visible');
  }, 2340));

  // Word cycling
  const words = ['forecasters', 'conviction', 'precision', 'edge', 'signal', 'insight', 'alpha', 'truth'];
  const finalWord = 'the next generation';
  let wordIndex = 0;

  function cycleWord() {
    if (exited) return;
    if (wordIndex >= words.length) {
      introWord.classList.add('out');
      setTimeout(() => {
        if (exited) return;
        introWord.textContent = finalWord;
        introWord.classList.remove('out');
        introWord.classList.add('entering');
        requestAnimationFrame(() => introWord.classList.remove('entering'));
      }, 150);
      timers.push(setTimeout(() => { if (!exited) exit(); }, 1200));
      return;
    }
    introWord.classList.add('out');
    setTimeout(() => {
      if (exited) return;
      introWord.textContent = words[wordIndex];
      introWord.classList.remove('out');
      introWord.classList.add('entering');
      requestAnimationFrame(() => introWord.classList.remove('entering'));
      wordIndex++;
      timers.push(setTimeout(cycleWord, 250));
    }, 150);
  }

  timers.push(setTimeout(() => {
    if (exited) return;
    wordIndex = 1;
    timers.push(setTimeout(cycleWord, 250));
  }, 2240));

  // ── Exit ───────────────────────────────────────────────
  function exit() {
    if (exited) return;
    exited = true;
    timers.forEach(t => clearTimeout(t));
    intro.classList.add('exit');
    document.body.classList.remove('intro-active');
    setTimeout(() => {
      intro.classList.add('gone');
      onDone();
    }, 1000);
  }

  intro.addEventListener('click', exit);
}


export function runFastIntro(onDone) {
  const intro     = document.getElementById('intro');
  const canvas    = document.getElementById('galaxyCanvas');
  const introLogo = document.getElementById('introLogo');
  const introBrand = document.getElementById('introBrand');

  // Quick star burst — compressed version
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

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

    // Fast deceleration: full speed → stop in 0.6s
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

  // Show logo immediately, brand at 0.3s, exit at 1.2s
  introLogo.classList.add('visible');
  introLogo.querySelectorAll('.intro-orbit').forEach(o => o.classList.add('drawn'));
  introLogo.querySelector('.intro-core')?.classList.add('visible');

  setTimeout(() => introBrand.classList.add('visible'), 300);

  setTimeout(() => {
    done = true;
    intro.classList.add('exit');
    document.body.classList.remove('intro-active');
    setTimeout(() => {
      intro.classList.add('gone');
      onDone();
    }, 600); // Faster fade-out (0.6s instead of 1s)
  }, 1200);
}
