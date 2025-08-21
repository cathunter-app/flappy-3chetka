/* Flappy Cat — Istanbul (daylight)
   Requirements satisfied:
   - Hero cat sprite from assets/cat.png
   - Cityscape art background (day)
   - Occasional unobtrusive logo from assets/logo.png
   - Mobile + desktop controls (tap/click/space)
   - Beep/boop sounds and short game-over tune (WebAudio, no files)
   - Difficulty levels (easy, normal, hard, insane)
   - End-of-round: generate shareable Instagram Story image (1080x1920 PNG)
   - Admin panel with unique players count and Top-10 leaderboard (local by default; optional cloud via Supabase)
   - No usernames, straight to play
*/

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const dpr = Math.max(1, window.devicePixelRatio || 1);

  const catImg = new Image();
  catImg.src = 'assets/cat.png';
  const logoImg = new Image();
  logoImg.src = 'assets/logo.png';

  const scoreEl = document.getElementById('score');
  const toast = document.getElementById('toast');
  const goModal = document.getElementById('gameover');
  const finalScoreEl = document.getElementById('finalScore');
  const bestScoreEl = document.getElementById('bestScore');
  const btnRestart = document.getElementById('btnRestart');
  const btnStory = document.getElementById('btnStory');
  const downloadStory = document.getElementById('downloadStory');
  const storyCanvas = document.getElementById('storyCanvas');
  const difficultySel = document.getElementById('difficulty');
  const adminModal = document.getElementById('admin');
  const topList = document.getElementById('topList');
  const uniquePlayersEl = document.getElementById('uniquePlayers');
  const uniNote = document.getElementById('uniNote');
  const btnExport = document.getElementById('btnExport');
  const btnClear = document.getElementById('btnClear');
  const btnCloseAdmin = document.getElementById('btnCloseAdmin');
  const exportArea = document.getElementById('exportArea');

  const CONFIGS = {
    easy:   { gravity: 0.40, jump: -8.6, gap: 180, speed: 2.5, spawnMS: 1500 },
    normal: { gravity: 0.50, jump: -8.9, gap: 160, speed: 3.0, spawnMS: 1350 },
    hard:   { gravity: 0.56, jump: -9.2, gap: 140, speed: 3.6, spawnMS: 1200 },
    insane: { gravity: 0.62, jump: -9.5, gap: 120, speed: 4.2, spawnMS: 1000 },
  };

  // --- STORAGE (local or cloud) ---
  const STORAGE = {
    _key(k){ return `fc_${k}`; },
    _get(k, def){ try{ return JSON.parse(localStorage.getItem(this._key(k))) ?? def; }catch(e){ return def; } },
    _set(k, v){ localStorage.setItem(this._key(k), JSON.stringify(v)); },

    playerId(){
      let id = this._get('playerId', null);
      if(!id){
        id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        this._set('playerId', id);
        // Maintain local unique players list (local-only)
        const players = this._get('players', []);
        if(!players.includes(id)){ players.push(id); this._set('players', players); }
      }
      return id;
    },
    addScore(score, diff){
      const recs = this._get('scores', []);
      recs.push({score, diff, ts: Date.now()});
      this._set('scores', recs);
      // Best per device
      const best = Math.max( this._get('best', 0), score );
      this._set('best', best);
    },
    best(){ return this._get('best', 0); },
    top(n=10){
      const arr = this._get('scores', []).slice().sort((a,b)=>b.score - a.score);
      return arr.slice(0, n);
    },
    uniquePlayersLocal(){ return this._get('players', []).length || 1; },
    exportCSV(){
      const recs = this._get('scores', []);
      const lines = ['score,difficulty,timestamp'];
      for(const r of recs){
        lines.push(`${r.score},${r.diff},${new Date(r.ts).toISOString()}`);
      }
      return lines.join('\n');
    },
    clearLocal(){
      const pid = this._get('playerId', null);
      localStorage.removeItem(this._key('scores'));
      localStorage.removeItem(this._key('best'));
      localStorage.removeItem(this._key('players'));
      // Preserve this player id and re-register as unique so admin shows 1
      if(pid){ this._set('playerId', pid); this._set('players', [pid]); }
    }
  };
  const PLAYER_ID = STORAGE.playerId();

  // --- Optional Supabase (global leaderboard) ---
  const hasSupabase = !!(window.FC_CONFIG && window.FC_CONFIG.SUPABASE_URL && window.FC_CONFIG.SUPABASE_KEY);
  let supabase = null;
  if(hasSupabase && window.supabase){
    supabase = window.supabase.createClient(window.FC_CONFIG.SUPABASE_URL, window.FC_CONFIG.SUPABASE_KEY);
    // Ensure player exists
    supabase.from(window.FC_CONFIG.TABLE_PLAYERS).insert({ player_id: PLAYER_ID }).then(()=>{}).catch(()=>{});
  }

  async function cloudAddScore(score, diff){
    if(!supabase) return;
    try{
      await supabase.from(window.FC_CONFIG.TABLE_SCORES).insert({ player_id: PLAYER_ID, score, diff });
    }catch(e){ /* ignore */ }
  }
  async function cloudTop10(){
    if(!supabase) return null;
    try{
      const {data, error} = await supabase
        .from(window.FC_CONFIG.TABLE_SCORES)
        .select('score,diff,inserted_at')
        .order('score', {ascending:false})
        .limit(10);
      if(error) return null;
      return data;
    }catch(e){ return null; }
  }
  async function cloudUniquePlayers(){
    if(!supabase) return null;
    try{
      const {count, error} = await supabase.from(window.FC_CONFIG.TABLE_PLAYERS).select('*', {count:'exact', head:true});
      if(error) return null;
      return count ?? null;
    }catch(e){ return null; }
  }

  // --- AUDIO ---
  const Audio = (()=>{
    let ctx = null;
    let unlocked = false;
    function ensure(){
      if(!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
      return ctx;
    }
    function unlock(){
      if(!ctx) ensure();
      if(ctx.state === 'suspended') ctx.resume();
      unlocked = true;
    }
    function tone(freq=440, dur=0.08, type='sine', gain=0.03, when=0){
      const ac = ensure();
      const t0 = ac.currentTime + when;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.value = gain;
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0+dur);
    }
    function flap(){ if(!unlocked) return; tone(740, 0.06, 'square', 0.03); }
    function score(){ if(!unlocked) return; tone(420, 0.06, 'triangle', 0.04); tone(560, 0.08, 'triangle', 0.035, 0.04); }
    function gameOver(){
      if(!unlocked) return;
      // tiny descending arpeggio
      tone(660, 0.12, 'sine', 0.05, 0.00);
      tone(520, 0.12, 'sine', 0.05, 0.12);
      tone(390, 0.16, 'sine', 0.05, 0.24);
    }
    return {ensure, unlock, flap, score, gameOver};
  })();

  // --- GAME STATE ---
  let W=0, H=0;
  function resize(){
    const {clientWidth:cw, clientHeight:ch} = canvas;
    W = Math.floor(cw * dpr); H = Math.floor(ch * dpr);
    canvas.width = W; canvas.height = H;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  const onResize = ()=>{ resize(); };
  window.addEventListener('resize', onResize, {passive:true});
  resize();

  // Parallax background data
  const sky = { t:0 };
  const skylineFar = [];
  const skylineNear = [];
  function makeBuildings(list, heightRange, speed){
    list.length = 0;
    const step = 120;
    const width = 80;
    for(let x = 0; x < window.innerWidth + 200; x += step){
      const h = heightRange[0] + Math.random()*(heightRange[1]-heightRange[0]);
      list.push({x, w:width, h, speed});
    }
  }
  makeBuildings(skylineFar, [30, 70], 0.2);
  makeBuildings(skylineNear, [60, 120], 0.5);

  // Obstacles (buildings from top & bottom with gap)
  const obstacles = [];
  let lastSpawn = 0;

  // Cat
  const cat = {
    x: 120, y: 240, vy: 0, r: 28,
    frame: 0
  };

  // Game vars
  let running = true;
  let started = false;
  let score = 0;
  let config = CONFIGS[difficultySel.value];
  let logoFlash = null; // {t, x, y, a}

  function setDifficulty(d){
    config = CONFIGS[d];
  }
  difficultySel.addEventListener('change', e => {
    setDifficulty(e.target.value);
  });

  // Controls
  function flap(){
    if(!started) {
      started = true;
      toast.hidden = true;
    }
    Audio.flap();
    cat.vy = config.jump;
  }

  const onPointer = (e)=>{
    Audio.unlock();
    e.preventDefault();
    flap();
  };
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', (e)=>{
    if(e.code === 'Space' || e.code === 'ArrowUp'){ Audio.unlock(); flap(); }
    if(e.key === 'a' || e.key === 'A'){ openAdmin(); }
  });

  // Show hint for 2 seconds
  setTimeout(()=>{ toast.hidden = true; }, 2200);

  // Allow admin via query
  if(new URLSearchParams(location.search).get('admin') === '1'){
    setTimeout(openAdmin, 200);
  }

  function openAdmin(){
    updateAdmin();
    adminModal.hidden = false;
  }
  btnCloseAdmin.addEventListener('click', ()=> adminModal.hidden = true);
  btnExport.addEventListener('click', ()=>{
    exportArea.value = STORAGE.exportCSV();
    exportArea.select();
  });
  btnClear.addEventListener('click', ()=>{
    if(confirm('Clear local scores and players?')){
      STORAGE.clearLocal();
      updateAdmin();
    }
  });

  async function updateAdmin(){
    // unique players (cloud or local)
    let u = await cloudUniquePlayers();
    if(u == null){
      u = STORAGE.uniquePlayersLocal();
      uniNote.textContent = ' (local browser only)';
    }else{
      uniNote.textContent = ' (cloud)';
    }
    uniquePlayersEl.textContent = u;

    // leaderboard
    topList.innerHTML = '';
    let items = await cloudTop10();
    if(!items){
      items = STORAGE.top(10).map(r=>({
        score: r.score, diff: r.diff, inserted_at: new Date(r.ts).toISOString()
      }));
    }
    items.forEach((r, i)=>{
      const li = document.createElement('li');
      li.textContent = `#${i+1} — ${r.score} (${r.diff})`;
      topList.appendChild(li);
    });
  }

  // Spawn obstacle
  function spawn(){
    const gap = config.gap;
    const minTop = 40; // leave space for skyline
    const maxTop = (canvas.height/dpr) - 120 - gap;
    const topH = minTop + Math.random() * (maxTop - minTop);
    const bottomY = topH + gap;
    const w = 70;
    const x = (canvas.width/dpr) + 20;
    obstacles.push({
      x, w, topH, bottomY, passed:false
    });
  }

  // Collision
  function circleRectColl(cx, cy, r, rx, ry, rw, rh){
    const closestX = Math.max(rx, Math.min(cx, rx+rw));
    const closestY = Math.max(ry, Math.min(cy, ry+rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx*dx + dy*dy) < r*r;
  }

  // Draw skyline + sun
  function drawBackground(dt){
    // Sky gradient
    const g = ctx.createLinearGradient(0,0,0,canvas.height/dpr);
    g.addColorStop(0, '#b9e2ff');
    g.addColorStop(1, '#eaf6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width/dpr,canvas.height/dpr);

    // Sun
    ctx.beginPath();
    ctx.arc((canvas.width/dpr)-100, 100, 40, 0, Math.PI*2);
    ctx.fillStyle = '#fff1a8';
    ctx.fill();

    // Parallax skylines (stylized buildings and mosques silhouettes)
    function drawStrip(list, color){
      for(const b of list){
        b.x -= b.speed;
        if(b.x + b.w < -50){ b.x += (window.innerWidth + 200); }
        ctx.fillStyle = color;
        const y = (canvas.height/dpr) - b.h - 10;
        ctx.fillRect(b.x, y, b.w, b.h);
        // minaret spike
        if(Math.random() < 0.03){
          ctx.beginPath();
          ctx.moveTo(b.x + b.w*0.7, y);
          ctx.lineTo(b.x + b.w*0.72, y - 12);
          ctx.lineWidth = 2;
          ctx.strokeStyle = color;
          ctx.stroke();
        }
      }
    }
    drawStrip(skylineFar, '#b4cde4');
    drawStrip(skylineNear, '#8eb2d1');

    // Occasional unobtrusive logo
    if(!logoFlash && Math.random() < 0.002){ // rare
      const scale = Math.min(0.22, (canvas.width/dpr)/2200);
      const w = 180*scale, h = 180*scale;
      logoFlash = {
        t: 3.2, // seconds
        x: (canvas.width/dpr) - w - 12,
        y: (canvas.height/dpr) - h - 12,
        w, h, a: 0.0
      };
    }
    if(logoFlash){
      logoFlash.t -= dt;
      logoFlash.a = Math.min(0.18, logoFlash.a + dt*0.3);
      ctx.globalAlpha = logoFlash.a;
      ctx.drawImage(logoImg, logoFlash.x, logoFlash.y, logoFlash.w, logoFlash.h);
      ctx.globalAlpha = 1;
      if(logoFlash.t <= 0) logoFlash = null;
    }
  }

  // Draw obstacles as buildings top/bottom
  function drawObstacles(){
    const spd = config.speed;
    ctx.fillStyle = '#2f3d4a';
    obstacles.forEach(o => {
      o.x -= spd;
      // top building
      ctx.fillStyle = '#38556d';
      ctx.fillRect(o.x, 0, o.w, o.topH);
      // little domes
      ctx.beginPath();
      ctx.arc(o.x + o.w*0.3, o.topH, 9, Math.PI, 0);
      ctx.arc(o.x + o.w*0.7, o.topH, 7, Math.PI, 0);
      ctx.fillStyle = '#3f6a87';
      ctx.fill();

      // bottom building
      const bottomH = (canvas.height/dpr) - o.bottomY;
      ctx.fillStyle = '#2d4c62';
      ctx.fillRect(o.x, o.bottomY, o.w, bottomH);

      // score pass check
      if(!o.passed && o.x + o.w < cat.x - 10){
        o.passed = true;
        score++;
        scoreEl.textContent = String(score);
        Audio.score();
      }
    });
    // remove off-screen
    for(let i=obstacles.length-1; i>=0; i--){
      if(obstacles[i].x + obstacles[i].w < -80) obstacles.splice(i,1);
    }
  }

  // Draw cat
  function drawCat(){
    const size = 70;
    const angle = Math.max(-0.45, Math.min(0.45, cat.vy * 0.03));
    ctx.save();
    ctx.translate(cat.x, cat.y);
    ctx.rotate(angle);
    ctx.drawImage(catImg, -size/2, -size/2, size, size);
    ctx.restore();
  }

  // Physics + game loop
  let prev = performance.now();
  function loop(now){
    const dt = Math.min(0.035, (now - prev)/1000);
    prev = now;
    if(running){
      update(dt);
      draw(dt);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  function update(dt){
    // Background evolve
    sky.t += dt;

    // Spawn obstacles
    if(started){
      lastSpawn += dt*1000;
      if(lastSpawn > config.spawnMS){
        lastSpawn = 0;
        spawn();
      }
    }

    // Cat physics
    cat.vy += config.gravity;
    cat.y += cat.vy;
    // Boundaries
    const floor = (canvas.height/dpr) - 20;
    if(cat.y > floor){ cat.y = floor; die(); return; }
    if(cat.y < 10){ cat.y = 10; cat.vy = 0; }

    // Collisions
    for(const o of obstacles){
      if(circleRectColl(cat.x, cat.y, cat.r, o.x, 0, o.w, o.topH) ||
         circleRectColl(cat.x, cat.y, cat.r, o.x, o.bottomY, o.w, (canvas.height/dpr) - o.bottomY)){
        die(); return;
      }
    }
  }

  function draw(dt){
    drawBackground(dt);
    drawObstacles();
    drawCat();

    // Ground strip
    ctx.fillStyle = '#5a8fb3';
    const gh = 20;
    ctx.fillRect(0, (canvas.height/dpr)-gh, canvas.width/dpr, gh);
  }

  // Game over
  async function die(){
    if(!running) return;
    running = false;
    Audio.gameOver();
    finalScoreEl.textContent = String(score);
    const best = Math.max(STORAGE.best(), score);
    bestScoreEl.textContent = String(best);
    STORAGE.addScore(score, difficultySel.value);
    await cloudAddScore(score, difficultySel.value);
    goModal.hidden = false;
    makeStoryImage(score, best, difficultySel.value);
    updateAdmin(); // keep fresh for admin
  }

  function reset(){
    score = 0; scoreEl.textContent = '0';
    obstacles.length = 0;
    lastSpawn = 0;
    running = true;
    started = false;
    cat.x = Math.max(90, Math.min(140, (canvas.width/dpr)*0.22));
    cat.y = (canvas.height/dpr)*0.45;
    cat.vy = -2.5;
    toast.hidden = false;
    setTimeout(()=>{ toast.hidden = true; }, 2000);
  }

  btnRestart.addEventListener('click', ()=>{
    goModal.hidden = true;
    reset();
  });

  // --- Story image (1080x1920) ---
  function makeStoryImage(score, best, diff){
    const c = storyCanvas;
    const k = c.getContext('2d');
    const W = c.width, H = c.height;

    // bg
    const g = k.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#b9e2ff'); g.addColorStop(1,'#eaf6ff');
    k.fillStyle = g; k.fillRect(0,0,W,H);

    // title
    k.fillStyle = '#0b1f32';
    k.font = 'bold 72px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    k.fillText('Flappy Cat — Istanbul', 60, 150);

    // score card
    k.font = 'bold 140px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    k.fillText(String(score), 60, 330);
    k.font = '600 48px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    k.fillText(`Best: ${best}   •   Difficulty: ${diff}`, 60, 400);

    // skyline
    k.fillStyle = '#8eb2d1';
    for(let i=0;i<20;i++){
      const w = 80 + Math.random()*140;
      const h = 80 + Math.random()*220;
      const x = -60 + i*100 + Math.random()*40;
      const y = H - h - 60;
      k.fillRect(x, y, w, h);
    }

    // cat
    const imgW = 520, imgH = 520;
    k.drawImage(catImg, W - imgW - 80, H - imgH - 180, imgW, imgH);

    // logo small
    const lw = 160, lh = 160;
    k.globalAlpha = 0.2;
    k.drawImage(logoImg, W-lw-50, 60, lw, lh);
    k.globalAlpha = 1;

    // Call to action
    k.font = '600 42px system-ui, -apple-system, Segoe UI, Roboto, Arial';
    k.fillStyle = '#0b1f32';
    k.fillText('Try it online →', 60, H-130);
    k.fillStyle = '#1a4f75';
    k.fillText(window.location.origin + window.location.pathname, 60, H-70);

    // prepare download
    const data = c.toDataURL('image/png');
    downloadStory.href = data;
    downloadStory.hidden = false;
  }

  btnStory.addEventListener('click', async ()=>{
    try{
      const blob = await (await fetch(downloadStory.href)).blob();
      const file = new File([blob], 'flappy-cat-story.png', {type:'image/png'});
      if(navigator.canShare && navigator.canShare({files:[file]})){
        await navigator.share({ files:[file], title:'My Flappy Cat score', text:`I scored ${finalScoreEl.textContent}!` });
      }else{
        // trigger download fallback
        downloadStory.click();
        alert('Image saved. Upload it to Instagram Stories.');
      }
    }catch(e){
      downloadStory.click();
    }
  });

  // Kick off
  reset();
  // autoplay: immediately running & obstacles delayed by spawn timer

})();