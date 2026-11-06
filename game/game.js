// Survivor Arena — top-down survival shooter. Pure canvas/JS, no deps.
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ---------- input ----------
const keys = new Set();
window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

// ---------- helpers ----------
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

// ---------- upgrade pool ----------
const UPGRADES = [
  { name: 'ยิงไว', desc: 'ลดเวลาเติมกระสุน 15%', apply: (p) => (p.fireDelay *= 0.85) },
  { name: 'ดาเมจ+', desc: 'เพิ่มดาเมจกระสุน 25%', apply: (p) => (p.damage *= 1.25) },
  { name: 'ความเร็ว+', desc: 'เพิ่มความเร็วเดิน 15%', apply: (p) => (p.speed *= 1.15) },
  { name: 'พิสัย+', desc: 'กระสุนไปไกลขึ้น', apply: (p) => (p.bulletRange *= 1.3) },
  { name: 'เลือดสูงสุด+', desc: 'เพิ่ม HP สูงสุด 20 และเติมเต็ม', apply: (p) => { p.maxHp += 20; p.hp = p.maxHp; } },
  { name: 'ยิงหลายทาง', desc: 'ยิงเพิ่ม 1 ทิศทาง', apply: (p) => (p.bulletCount += 1) },
  { name: 'ฟื้นฟู', desc: 'ฟื้น HP ทีละน้อยตลอดเวลา', apply: (p) => (p.regen += 0.5) },
];

function pickUpgrades(n) {
  const pool = [...UPGRADES];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// ---------- entities ----------
function makePlayer() {
  return {
    x: 0, y: 0, r: 14,
    hp: 100, maxHp: 100,
    speed: 180,
    damage: 10,
    fireDelay: 0.5,
    fireTimer: 0,
    bulletRange: 260,
    bulletCount: 1,
    regen: 0,
    level: 1,
    exp: 0,
    expToNext: 10,
  };
}

let player, bullets, enemies, particles, exps;
let elapsed, spawnTimer, spawnInterval, running, paused;

function resetGame() {
  player = makePlayer();
  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  bullets = [];
  enemies = [];
  particles = [];
  exps = [];
  elapsed = 0;
  spawnTimer = 0;
  spawnInterval = 1.4;
  running = true;
  paused = false;
}

function spawnEnemy() {
  const edge = Math.floor(rand(0, 4));
  let x, y;
  if (edge === 0) { x = rand(0, canvas.width); y = -30; }
  else if (edge === 1) { x = canvas.width + 30; y = rand(0, canvas.height); }
  else if (edge === 2) { x = rand(0, canvas.width); y = canvas.height + 30; }
  else { x = -30; y = rand(0, canvas.height); }

  // enemies get tougher as time goes on
  const tier = Math.min(4, Math.floor(elapsed / 30));
  enemies.push({
    x, y, r: 10 + tier * 2,
    hp: 15 + tier * 10,
    maxHp: 15 + tier * 10,
    speed: 55 + tier * 8,
    damage: 8 + tier * 2,
    color: ['#e05b5b', '#d98a3d', '#c04fd9', '#5bc0e0'][tier] || '#e05b5b',
  });
}

function nearestEnemy(x, y) {
  let best = null, bestD = Infinity;
  for (const e of enemies) {
    const d = dist2(x, y, e.x, e.y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function fireBullets() {
  const target = nearestEnemy(player.x, player.y);
  let baseAngle;
  if (target) baseAngle = Math.atan2(target.y - player.y, target.x - player.x);
  else baseAngle = 0;

  const n = player.bulletCount;
  const spread = Math.min(0.6, n * 0.12);
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? 0 : -spread / 2 + (spread / (n - 1)) * i;
    const angle = baseAngle + offset;
    bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420,
      damage: player.damage, range: player.bulletRange, traveled: 0,
    });
  }
}

function spawnParticles(x, y, color, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const sp = rand(40, 140);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, color });
  }
}

function update(dt) {
  if (!running || paused) return;
  elapsed += dt;

  // movement
  let dx = 0, dy = 0;
  if (keys.has('w') || keys.has('arrowup')) dy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) dy += 1;
  if (keys.has('a') || keys.has('arrowleft')) dx -= 1;
  if (keys.has('d') || keys.has('arrowright')) dx += 1;
  const len = Math.hypot(dx, dy) || 1;
  player.x += (dx / len) * player.speed * dt;
  player.y += (dy / len) * player.speed * dt;
  player.x = Math.max(player.r, Math.min(canvas.width - player.r, player.x));
  player.y = Math.max(player.r, Math.min(canvas.height - player.r, player.y));

  if (player.regen > 0) player.hp = Math.min(player.maxHp, player.hp + player.regen * dt);

  // firing
  player.fireTimer -= dt;
  if (player.fireTimer <= 0 && enemies.length) {
    fireBullets();
    player.fireTimer = player.fireDelay;
  }

  // spawning — ramps up over time
  spawnTimer -= dt;
  spawnInterval = Math.max(0.3, 1.4 - elapsed * 0.01);
  if (spawnTimer <= 0) {
    spawnEnemy();
    spawnTimer = spawnInterval;
  }

  // bullets
  for (const b of bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.traveled += Math.hypot(b.vx, b.vy) * dt;
  }
  bullets = bullets.filter((b) => b.traveled < b.range);

  // enemies move toward player
  for (const e of enemies) {
    const a = Math.atan2(player.y - e.y, player.x - e.x);
    e.x += Math.cos(a) * e.speed * dt;
    e.y += Math.sin(a) * e.speed * dt;
  }

  // bullet-enemy collisions
  for (const b of bullets) {
    for (const e of enemies) {
      if (b._dead || e.hp <= 0) continue;
      if (dist2(b.x, b.y, e.x, e.y) < (e.r + 3) ** 2) {
        e.hp -= b.damage;
        b._dead = true;
        spawnParticles(b.x, b.y, '#ffd34d', 3);
        if (e.hp <= 0) killEnemy(e);
        break;
      }
    }
  }
  bullets = bullets.filter((b) => !b._dead);
  enemies = enemies.filter((e) => e.hp > 0);

  // enemy-player collisions
  for (const e of enemies) {
    if (dist2(player.x, player.y, e.x, e.y) < (e.r + player.r) ** 2) {
      player.hp -= e.damage * dt;
      if (player.hp <= 0) gameOver();
    }
  }

  // exp orbs drift to player and get collected
  for (const o of exps) {
    const d = Math.hypot(player.x - o.x, player.y - o.y);
    if (d < 90) {
      const a = Math.atan2(player.y - o.y, player.x - o.x);
      o.x += Math.cos(a) * 260 * dt;
      o.y += Math.sin(a) * 260 * dt;
    }
    if (d < 16) o._collected = true;
  }
  for (const o of exps) {
    if (o._collected) gainExp(o.value);
  }
  exps = exps.filter((o) => !o._collected);

  // particles
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);

  updateHud();
}

function killEnemy(e) {
  spawnParticles(e.x, e.y, e.color, 10);
  exps.push({ x: e.x, y: e.y, value: 3 + Math.floor(e.maxHp / 15) });
}

function gainExp(v) {
  player.exp += v;
  if (player.exp >= player.expToNext) {
    player.exp -= player.expToNext;
    player.level += 1;
    player.expToNext = Math.floor(player.expToNext * 1.35 + 5);
    openUpgradeChoice();
  }
}

function gameOver() {
  running = false;
  paused = true;
  showOverlay(
    'จบเกม',
    `รอดชีวิต ${formatTime(elapsed)} — เลเวล ${player.level}`,
    [],
    'เล่นใหม่',
    () => { resetGame(); hideOverlay(); }
  );
}

function openUpgradeChoice() {
  paused = true;
  const choices = pickUpgrades(3);
  showOverlay(
    'เลเวลอัป!',
    `เลือกอัปเกรด — เลเวล ${player.level}`,
    choices,
    null,
    null
  );
}

// ---------- rendering ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // faint grid for motion reference
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const grid = 60;
  for (let x = 0; x < canvas.width; x += grid) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += grid) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }

  // exp orbs
  for (const o of exps) {
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, Math.PI * 2); ctx.fill();
  }

  // particles
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 0.4);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // enemies
  for (const e of enemies) {
    ctx.fillStyle = e.color;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    // hp bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
    ctx.fillStyle = '#4caf50';
    ctx.fillRect(e.x - e.r, e.y - e.r - 8, (e.r * 2) * (e.hp / e.maxHp), 3);
  }

  // bullets
  ctx.fillStyle = '#ffd34d';
  for (const b of bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI * 2); ctx.fill();
  }

  // player
  ctx.fillStyle = '#4caf50';
  ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2); ctx.fill();
}

// ---------- HUD / overlay ----------
const hpText = document.getElementById('hpText');
const hpBar = document.getElementById('hpBar');
const lvlEl = document.getElementById('lvl');
const timerEl = document.getElementById('timer');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayBody = document.getElementById('overlayBody');
const upgradesEl = document.getElementById('upgrades');
const overlayBtn = document.getElementById('overlayBtn');

function formatTime(s) {
  const m = Math.floor(s / 60).toString().padStart(2, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
}

function updateHud() {
  hpText.textContent = `${Math.max(0, Math.ceil(player.hp))}/${player.maxHp}`;
  hpBar.style.width = `${Math.max(0, (player.hp / player.maxHp) * 100)}%`;
  lvlEl.textContent = player.level;
  timerEl.textContent = formatTime(elapsed);
}

function showOverlay(title, body, upgradeChoices, btnLabel, onBtn) {
  overlay.classList.remove('hidden');
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  upgradesEl.innerHTML = '';

  if (upgradeChoices.length) {
    overlayBtn.style.display = 'none';
    for (const u of upgradeChoices) {
      const btn = document.createElement('button');
      btn.innerHTML = `<b>${u.name}</b>${u.desc}`;
      btn.onclick = () => {
        u.apply(player);
        hideOverlay();
        paused = false;
      };
      upgradesEl.appendChild(btn);
    }
  } else {
    overlayBtn.style.display = 'inline-block';
    overlayBtn.textContent = btnLabel || 'เริ่มเกม';
    overlayBtn.onclick = onBtn;
  }
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

// ---------- main loop ----------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---------- boot ----------
resetGame();
running = false;
paused = true;
showOverlay(
  'Survivor Arena',
  'WASD หรือลูกศร เพื่อเดิน ยิงอัตโนมัติไปทางศัตรูที่ใกล้สุด รอดให้นานที่สุด!',
  [],
  'เริ่มเกม',
  () => { resetGame(); hideOverlay(); }
);
requestAnimationFrame(loop);
