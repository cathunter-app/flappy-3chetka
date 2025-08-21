(() => {
  // Canvas setup with HiDPI scaling
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const ui = document.getElementById('ui');
  const startBtn = document.getElementById('startBtn');
  const scoreEl = document.getElementById('score');

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  function resize() {
    canvas.width = Math.floor(window.innerWidth * DPR);
    canvas.height = Math.floor(window.innerHeight * DPR);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }
  window.addEventListener('resize', resize, {passive:true});
  resize();

  // Load cat image
  const catImg = new Image();
  catImg.src = 'assets/cat.png';
  let CAT_AR = 1; // updated on load (w/h)
  catImg.onload = () => { CAT_AR = catImg.width / catImg.height || 1; };

  // Simple game state
  let state = 'menu'; // 'menu' | 'play' | 'dead'
  let lastT = 0;
  let cat, pipes, skyline, score, passedId;
  let speedBase = 2.25; // world speed

  // Audio (procedural beeps via WebAudio)
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  function beep(freq=600, dur=0.08, type='square', gain=0.02) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur);
  }
  function scoreChime() { // little arpeggio
    if (!audioCtx) return;
    [660, 880, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.06, 'sine', 0.03), i*60));
  }
  function gameOverSong() {
    if (!audioCtx) return;
    const seq = [880, 740, 660, 494, 392];
    seq.forEach((f, i) => setTimeout(() => beep(f, 0.12, 'triangle', 0.035), i*140));
  }

  // Entities
  function reset() {
    const w = canvas.width, h = canvas.height;
    score = 0; passedId = -1;
    speedBase = 2.25;
    cat = {
      x: w * 0.25, y: h * 0.45, vy: 0, rot: 0,
      w: 80 * DPR, h: 60 * DPR,
    };
    pipes = [];
    skyline = [
      {x:0}, {x:canvas.width}
    ];
    // spawn initial pipes
    let x = w * 0.8;
    for (let i=0;i<6;i++) {
      pipes.push(makePipe(x));
      x += 320 * DPR;
    }
  }

  function makePipe(x) {
    const h = canvas.height;
    const gap = Math.max(260*DPR, 300*DPR - score*1.5*DPR); // tighter as score grows
    const top = (h*0.25) + Math.random() * (h*0.5);
    const id = Math.random();
    return {x, gapY: top, gap, w: 120*DPR, id};
  }

  function flap() {
    if (state === 'menu') startGame();
    else if (state === 'play') {
      ensureAudio();
      cat.vy = -7.9 * DPR;
      beep(720, 0.06, 'square', 0.03);
    } else if (state === 'dead') {
      // quick restart
      startGame();
    }
  }

  function startGame() {
    ensureAudio();
    state = 'play';
    ui.style.display = 'none';
    reset();
  }

  function stopGame() {
    if (state !== 'dead') {
      state = 'dead';
      gameOverSong();
      // Show UI after short pause
      setTimeout(() => {
        ui.style.display = 'flex';
        document.getElementById('title').textContent = 'Game Over — Score: ' + score;
        document.getElementById('subtitle').textContent = 'Tap / Click / Space to try again';
        startBtn.textContent = 'Restart';
      }, 350);
    }
  }

  // Controls
  startBtn.addEventListener('click', () => { ensureAudio(); startGame(); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }});
  window.addEventListener('mousedown', flap);
  window.addEventListener('touchstart', (e) => { e.preventDefault(); flap(); }, {passive:false});

  function update(dt) {
    if (state !== 'play') return;
    const w = canvas.width, h = canvas.height;

    // Increase speed slightly over time
    speedBase += 0.0003 * dt;

    // Cat physics
    cat.vy += 0.16 * DPR * (dt/16.67);
    cat.y += cat.vy;
    cat.rot = Math.max(-0.5, Math.min(1.0, (cat.vy / (10*DPR))));

    // Boundaries
    if (cat.y < 0) { cat.y = 0; cat.vy = 0; }
    if (cat.y + cat.h > h) { stopGame(); }

    // Pipes
    const speed = speedBase * DPR * (dt/16.67) * 3; // tuned
    pipes.forEach(p => p.x -= speed);

    // Recycle pipes & scoring
    if (pipes.length && pipes[0].x + pipes[0].w < 0) {
      pipes.shift();
      const lastX = pipes[pipes.length - 1].x;
      pipes.push(makePipe(lastX + 320 * DPR));
    }
    pipes.forEach(p => {
      // Score when cat passes center of a pipe once
      if (p.x + p.w/2 < cat.x && p.id !== passedId) {
        score++;
        scoreEl.textContent = score;
        passedId = p.id;
        scoreChime();
      }
    });

    // Collisions
    for (const p of pipes) {
      const px = p.x, pw = p.w;
      const gapTop = p.gapY - p.gap/2;
      const gapBot = p.gapY + p.gap/2;
      const cx = cat.x + cat.w*0.35; // conservative hitbox
      const cy = cat.y + cat.h*0.5;
      const hw = cat.w*0.3, hh = cat.h*0.35;
      const collideX = (cx + hw > px) && (cx - hw < px + pw);
      const collideY = (cy - hh < gapTop) || (cy + hh > gapBot);
      if (collideX && collideY) {
        stopGame();
        break;
      }
    }
  }

  function drawSkyline() {
    const w = canvas.width, h = canvas.height;
    // Parallax layers: distant hills/sea + silhouettes of Istanbul
    // Layer 1: distant haze
    ctx.fillStyle = '#d9f1ff';
    ctx.fillRect(0, h*0.75, w, h*0.25);
    // Layer 2: silhouette
    const speed = speedBase*0.4;
    ctx.save();
    ctx.translate((-performance.now()*0.03*DPR*speed) % (w), 0);
    for (let i=-1;i<3;i++){
      const baseX = i*w;
      ctx.fillStyle = '#5a86a6';
      ctx.beginPath();
      // simple skyline with domes & minarets
      let x = baseX + 80*DPR;
      const y = h*0.62;
      ctx.moveTo(baseX, y+120);
      // blocks
      const parts = [
        [x, y-30],[x+40*DPR, y-30],
        [x+40*DPR, y-60],[x+80*DPR, y-60], // dome base
      ];
      // draw a sequence of rectangles to simulate buildings
      ctx.rect(baseX+20*DPR, y-20, 80*DPR, 120);
      ctx.rect(baseX+140*DPR, y-50, 100*DPR, 150);
      ctx.rect(baseX+280*DPR, y-40, 90*DPR, 140);
      ctx.rect(baseX+410*DPR, y-70, 110*DPR, 170);
      ctx.rect(baseX+560*DPR, y-60, 100*DPR, 160);
      // Blue Mosque-ish domes
      function dome(cx, cy, r){
        ctx.moveTo(cx-r, cy);
        ctx.quadraticCurveTo(cx, cy-r*1.4, cx+r, cy);
        ctx.lineTo(cx-r, cy);
      }
      dome(baseX+200*DPR, y-70, 36*DPR);
      dome(baseX+460*DPR, y-90, 46*DPR);
      // minarets
      function minaret(xm){
        ctx.rect(xm, y-120, 6*DPR, 150);
        ctx.moveTo(xm-6*DPR, y-120);
        ctx.lineTo(xm+3*DPR, y-150);
        ctx.lineTo(xm+12*DPR, y-120);
      }
      minaret(baseX+240*DPR);
      minaret(baseX+500*DPR);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPipes() {
    ctx.fillStyle = '#2f4156';
    pipes.forEach(p => {
      // buildings as obstacles
      const x = p.x, w = p.w;
      const gapTop = p.gapY - p.gap/2;
      const gapBot = p.gapY + p.gap/2;
      // top building
      ctx.fillRect(x, 0, w, gapTop);
      // bottom building
      ctx.fillRect(x, gapBot, w, canvas.height - gapBot);
      // windows
      ctx.fillStyle = '#e7f6ff';
      const winSize = 10*DPR;
      for (let yy = 10*DPR; yy < gapTop-10*DPR; yy += 22*DPR) {
        for (let xx = x+8*DPR; xx < x+w-8*DPR; xx += 20*DPR) {
          ctx.fillRect(xx, yy, winSize, winSize);
        }
      }
      for (let yy = gapBot+10*DPR; yy < canvas.height-10*DPR; yy += 22*DPR) {
        for (let xx = x+8*DPR; xx < x+w-8*DPR; xx += 20*DPR) {
          ctx.fillRect(xx, yy, winSize, winSize);
        }
      }
      ctx.fillStyle = '#2f4156';
    });
  }

  function drawCat() {
    const {x,y,rot} = cat;
    const w = cat.w;
    const h = w / (CAT_AR || 1);
    cat.h = h; // keep hitbox in sync
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    // shadow
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.ellipse(0, h*0.65, w*0.45, h*0.18, 0, 0, Math.PI*2);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.globalAlpha = 1;
    // sprite
    ctx.drawImage(catImg, -w*0.5, -h*0.5, w, h);
    ctx.restore();
  }

  function loop(t) {
    const dt = Math.min(32, t - lastT || 16.67);
    lastT = t;
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // background gradient already set by CSS; draw skyline and ground
    drawSkyline();
    // gameplay
    if (state === 'menu') {
      // idle bob
      if (!cat) reset();
      cat.vy = Math.sin(t*0.003)*0.4;
      cat.y += cat.vy;
    } else if (state === 'play') {
      update(dt);
    }
    if (cat) drawCat();
    drawPipes();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
