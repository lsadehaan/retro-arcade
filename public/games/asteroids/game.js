/**
 * Void Drifter — Asteroids with neon wireframe rendering
 * - Vector wireframe ship, asteroids, UFO
 * - Ship rotation, thrust with friction, screen wrapping
 * - Asteroids split: large -> 2 medium -> 2 small -> destroyed
 * - Wave progression, UFO enemy, particle effects
 * - Lives, invulnerability on respawn, score submission
 */

const CANVAS_W = 700;
const CANVAS_H = 520;

// ── Game constants ──────────────────────────────────────────────────────────
const SHIP_RADIUS = 15;
const ROTATION_SPEED = 0.065;
const THRUST_POWER = 0.12;
const FRICTION = 0.992;
const MAX_SPEED = 6;
const MAX_BULLETS = 5;
const BULLET_SPEED = 7;
const BULLET_LIFE = 55; // frames
const BULLET_RADIUS = 2;
const FIRE_COOLDOWN = 150; // ms
const INVULN_TIME = 2000; // ms
const MAX_LIVES = 3;
const PARTICLE_LIFE = 30; // frames

// ── Difficulty ─────────────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { label: 'EASY',   maxLives: 5, asteroidSpeedMult: 0.7, invulnTime: 3000, startingAsteroids: 3 },
  normal: { label: 'NORMAL', maxLives: 3, asteroidSpeedMult: 1.0, invulnTime: 2000, startingAsteroids: 3 },
  hard:   { label: 'HARD',   maxLives: 2, asteroidSpeedMult: 1.3, invulnTime: 1500, startingAsteroids: 5 },
};
let currentDifficulty = localStorage.getItem('asteroids-difficulty') || 'normal';
let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];
function setDifficulty(d) { currentDifficulty = d; activeDiff = DIFFICULTY_CONFIG[d]; localStorage.setItem('asteroids-difficulty', d); }

const ASTEROID_SIZES = {
  large:  { radius: 40, points: 25,  speed: 1.0, children: 'medium' },
  medium: { radius: 20, points: 50,  speed: 1.8, children: 'small' },
  small:  { radius: 10, points: 100, speed: 2.5, children: null },
};

const UFO_INTERVAL_MIN = 15000; // ms between UFO spawns
const UFO_INTERVAL_MAX = 30000;
const UFO_SPEED = 2;
const UFO_FIRE_RATE = 1500; // ms between UFO shots
const UFO_RADIUS = 15;
const UFO_POINTS = 200;
const UFO_BULLET_SPEED = 4;

// ── Colors ──────────────────────────────────────────────────────────────────
const COLOR_SHIP = '#33ff88';
const COLOR_BULLET = '#00ffff';
const COLOR_ASTEROID = '#cccccc';
const COLOR_ASTEROID_GLOW = 'rgba(204,204,204,0.3)';
const COLOR_UFO = '#ff3366';
const COLOR_UFO_BULLET = '#ff6644';
const COLOR_PARTICLE = '#33ff88';
const COLOR_THRUST = '#ff8833';

// ── Canvas & state ──────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const waveEl = document.getElementById('wave');

// Swipe detection for ship control
(function() {
  let touchStartX = 0, touchStartY = 0, touchStartTime = 0;
  canvas.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });
  canvas.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Date.now() - touchStartTime > 400) return;
    var absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (absDx < 30 && absDy < 30) return;
    var key;
    if (absDx > absDy) {
      key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    } else if (dy < 0) {
      key = 'ArrowUp';
    } else {
      return;
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
    setTimeout(function() {
      document.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
    }, 50);
  }, { passive: true });
})();

let running = false;
let gameOver = false;
let score = 0;
let lives = activeDiff.maxLives;
let wave = 0;
let lastTime = 0;
let lastFireTime = 0;

// Ship state
let ship = null;

// Entity arrays
let bullets = [];
let asteroids = [];
let particles = [];
let ufo = null;
let ufoBullets = [];
let ufoTimer = 0;
let nextUfoTime = 0;

// Input state
const keys = {};

// ── Utility functions ───────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

function wrap(x, y) {
  if (x < -50) x += CANVAS_W + 100;
  if (x > CANVAS_W + 50) x -= CANVAS_W + 100;
  if (y < -50) y += CANVAS_H + 100;
  if (y > CANVAS_H + 50) y -= CANVAS_H + 100;
  return { x, y };
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

function generateAsteroidShape(radius) {
  const verts = randInt(7, 12);
  const shape = [];
  for (let i = 0; i < verts; i++) {
    const angle = (i / verts) * Math.PI * 2;
    const r = radius * rand(0.7, 1.3);
    shape.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return shape;
}

// ── Ship ────────────────────────────────────────────────────────────────────
function createShip() {
  return {
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2, // pointing up
    thrusting: false,
    invulnerable: true,
    invulnTimer: activeDiff.invulnTime,
    visible: true,
    flickerTimer: 0,
  };
}

function updateShip(dt) {
  if (!ship) return;

  // Rotation
  if (keys['ArrowLeft'] || keys['a'] || keys['A']) ship.angle -= ROTATION_SPEED * dt * 60 / 1000;
  if (keys['ArrowRight'] || keys['d'] || keys['D']) ship.angle += ROTATION_SPEED * dt * 60 / 1000;

  // Thrust
  ship.thrusting = !!(keys['ArrowUp'] || keys['w'] || keys['W']);
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.angle) * THRUST_POWER * dt * 60 / 1000;
    ship.vy += Math.sin(ship.angle) * THRUST_POWER * dt * 60 / 1000;
  }

  // Friction
  const frictionFactor = Math.pow(FRICTION, dt * 60 / 1000);
  ship.vx *= frictionFactor;
  ship.vy *= frictionFactor;

  // Cap speed
  const spd = Math.sqrt(ship.vx ** 2 + ship.vy ** 2);
  if (spd > MAX_SPEED) {
    ship.vx = (ship.vx / spd) * MAX_SPEED;
    ship.vy = (ship.vy / spd) * MAX_SPEED;
  }

  // Move
  ship.x += ship.vx * dt * 60 / 1000;
  ship.y += ship.vy * dt * 60 / 1000;

  // Wrap
  const w = wrap(ship.x, ship.y);
  ship.x = w.x;
  ship.y = w.y;

  // Invulnerability timer
  if (ship.invulnerable) {
    ship.invulnTimer -= dt;
    ship.flickerTimer += dt;
    ship.visible = Math.floor(ship.flickerTimer / 80) % 2 === 0;
    if (ship.invulnTimer <= 0) {
      ship.invulnerable = false;
      ship.visible = true;
    }
  }
}

function drawShip() {
  if (!ship || !ship.visible) return;

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  // Ship body — triangle
  ctx.beginPath();
  ctx.moveTo(SHIP_RADIUS, 0);
  ctx.lineTo(-SHIP_RADIUS * 0.7, -SHIP_RADIUS * 0.6);
  ctx.lineTo(-SHIP_RADIUS * 0.4, 0);
  ctx.lineTo(-SHIP_RADIUS * 0.7, SHIP_RADIUS * 0.6);
  ctx.closePath();
  ctx.strokeStyle = COLOR_SHIP;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLOR_SHIP;
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Thrust flame
  if (ship.thrusting) {
    ctx.beginPath();
    ctx.moveTo(-SHIP_RADIUS * 0.5, -SHIP_RADIUS * 0.25);
    ctx.lineTo(-SHIP_RADIUS * (0.8 + Math.random() * 0.5), 0);
    ctx.lineTo(-SHIP_RADIUS * 0.5, SHIP_RADIUS * 0.25);
    ctx.strokeStyle = COLOR_THRUST;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLOR_THRUST;
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

// ── Bullets ─────────────────────────────────────────────────────────────────
function fireBullet() {
  if (!ship || bullets.length >= MAX_BULLETS) return;
  const now = performance.now();
  if (now - lastFireTime < FIRE_COOLDOWN) return;
  lastFireTime = now;

  bullets.push({
    x: ship.x + Math.cos(ship.angle) * SHIP_RADIUS,
    y: ship.y + Math.sin(ship.angle) * SHIP_RADIUS,
    vx: Math.cos(ship.angle) * BULLET_SPEED + ship.vx * 0.3,
    vy: Math.sin(ship.angle) * BULLET_SPEED + ship.vy * 0.3,
    life: BULLET_LIFE,
  });
}

function updateBullets(dt) {
  const dtFactor = dt * 60 / 1000;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.vx * dtFactor;
    b.y += b.vy * dtFactor;
    b.life -= dtFactor;

    const w = wrap(b.x, b.y);
    b.x = w.x;
    b.y = w.y;

    if (b.life <= 0) bullets.splice(i, 1);
  }
}

function drawBullets() {
  ctx.fillStyle = COLOR_BULLET;
  ctx.shadowColor = COLOR_BULLET;
  ctx.shadowBlur = 8;
  for (const b of bullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ── Asteroids ───────────────────────────────────────────────────────────────
function createAsteroid(size, x, y, vx, vy) {
  const def = ASTEROID_SIZES[size];
  const sm = activeDiff.asteroidSpeedMult;
  return {
    x, y,
    vx: (vx ?? rand(-def.speed, def.speed)) * sm,
    vy: (vy ?? rand(-def.speed, def.speed)) * sm,
    size,
    radius: def.radius,
    shape: generateAsteroidShape(def.radius),
    rotAngle: rand(0, Math.PI * 2),
    rotSpeed: rand(-0.02, 0.02),
  };
}

function spawnWaveAsteroids() {
  wave++;
  const count = wave + activeDiff.startingAsteroids;
  for (let i = 0; i < count; i++) {
    // Spawn from edges
    let x, y;
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? -30 : CANVAS_W + 30;
      y = rand(0, CANVAS_H);
    } else {
      x = rand(0, CANVAS_W);
      y = Math.random() < 0.5 ? -30 : CANVAS_H + 30;
    }
    const speed = ASTEROID_SIZES.large.speed;
    const angle = rand(0, Math.PI * 2);
    asteroids.push(createAsteroid('large', x, y, Math.cos(angle) * speed, Math.sin(angle) * speed));
  }
  waveEl.textContent = wave;
}

function updateAsteroids(dt) {
  const dtFactor = dt * 60 / 1000;
  for (const a of asteroids) {
    a.x += a.vx * dtFactor;
    a.y += a.vy * dtFactor;
    a.rotAngle += a.rotSpeed * dtFactor;
    const w = wrap(a.x, a.y);
    a.x = w.x;
    a.y = w.y;
  }
}

function drawAsteroids() {
  for (const a of asteroids) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rotAngle);
    ctx.beginPath();
    ctx.moveTo(a.shape[0].x, a.shape[0].y);
    for (let i = 1; i < a.shape.length; i++) {
      ctx.lineTo(a.shape[i].x, a.shape[i].y);
    }
    ctx.closePath();
    ctx.strokeStyle = COLOR_ASTEROID;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = COLOR_ASTEROID_GLOW;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function destroyAsteroid(index) {
  const a = asteroids[index];
  const def = ASTEROID_SIZES[a.size];

  // Spawn particles
  spawnParticles(a.x, a.y, Math.floor(a.radius / 3) + 4);

  // Add score
  score += def.points;
  scoreEl.textContent = score;

  // Split into children
  if (def.children) {
    const childDef = ASTEROID_SIZES[def.children];
    for (let i = 0; i < 2; i++) {
      const angle = rand(0, Math.PI * 2);
      asteroids.push(createAsteroid(
        def.children,
        a.x + rand(-5, 5),
        a.y + rand(-5, 5),
        Math.cos(angle) * childDef.speed,
        Math.sin(angle) * childDef.speed
      ));
    }
  }

  asteroids.splice(index, 1);
}

// ── Particles ───────────────────────────────────────────────────────────────
function spawnParticles(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(1, 4);
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: PARTICLE_LIFE,
      maxLife: PARTICLE_LIFE,
    });
  }
}

function updateParticles(dt) {
  const dtFactor = dt * 60 / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dtFactor;
    p.y += p.vy * dtFactor;
    p.life -= dtFactor;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = `rgba(51,255,136,${alpha})`;
    ctx.shadowColor = COLOR_PARTICLE;
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ── UFO ─────────────────────────────────────────────────────────────────────
function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  ufo = {
    x: fromLeft ? -UFO_RADIUS : CANVAS_W + UFO_RADIUS,
    y: rand(50, CANVAS_H - 50),
    vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
    vy: rand(-0.5, 0.5),
    lastFireTime: performance.now(),
  };
}

function updateUfo(dt) {
  if (!ufo) {
    // Timer for next UFO
    ufoTimer += dt;
    if (ufoTimer >= nextUfoTime && asteroids.length > 0) {
      spawnUfo();
      ufoTimer = 0;
      nextUfoTime = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
    }
    return;
  }

  const dtFactor = dt * 60 / 1000;
  ufo.x += ufo.vx * dtFactor;
  ufo.y += ufo.vy * dtFactor;

  // Slight vertical wobble
  ufo.vy += rand(-0.05, 0.05) * dtFactor;
  ufo.vy = Math.max(-1, Math.min(1, ufo.vy));

  // Keep in vertical bounds
  if (ufo.y < 30) ufo.vy = Math.abs(ufo.vy);
  if (ufo.y > CANVAS_H - 30) ufo.vy = -Math.abs(ufo.vy);

  // Remove if offscreen
  if (ufo.x < -60 || ufo.x > CANVAS_W + 60) {
    ufo = null;
    return;
  }

  // Fire at player
  if (ship) {
    const now = performance.now();
    if (now - ufo.lastFireTime > UFO_FIRE_RATE) {
      ufo.lastFireTime = now;
      const angle = Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + rand(-0.3, 0.3);
      ufoBullets.push({
        x: ufo.x,
        y: ufo.y,
        vx: Math.cos(angle) * UFO_BULLET_SPEED,
        vy: Math.sin(angle) * UFO_BULLET_SPEED,
        life: 80,
      });
    }
  }
}

function updateUfoBullets(dt) {
  const dtFactor = dt * 60 / 1000;
  for (let i = ufoBullets.length - 1; i >= 0; i--) {
    const b = ufoBullets[i];
    b.x += b.vx * dtFactor;
    b.y += b.vy * dtFactor;
    b.life -= dtFactor;
    if (b.life <= 0 || b.x < -10 || b.x > CANVAS_W + 10 || b.y < -10 || b.y > CANVAS_H + 10) {
      ufoBullets.splice(i, 1);
    }
  }
}

function drawUfo() {
  if (!ufo) return;

  ctx.save();
  ctx.translate(ufo.x, ufo.y);

  // UFO body — classic saucer shape
  ctx.beginPath();
  ctx.ellipse(0, 0, UFO_RADIUS, UFO_RADIUS * 0.4, 0, 0, Math.PI * 2);
  ctx.strokeStyle = COLOR_UFO;
  ctx.lineWidth = 2;
  ctx.shadowColor = COLOR_UFO;
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Dome
  ctx.beginPath();
  ctx.ellipse(0, -UFO_RADIUS * 0.2, UFO_RADIUS * 0.5, UFO_RADIUS * 0.35, 0, Math.PI, 0);
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawUfoBullets() {
  ctx.fillStyle = COLOR_UFO_BULLET;
  ctx.shadowColor = COLOR_UFO_BULLET;
  ctx.shadowBlur = 6;
  for (const b of ufoBullets) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ── Collisions ──────────────────────────────────────────────────────────────
function checkCollisions() {
  // Bullets vs Asteroids
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const a = asteroids[ai];
      if (dist(b.x, b.y, a.x, a.y) < a.radius) {
        bullets.splice(bi, 1);
        destroyAsteroid(ai);
        break;
      }
    }
  }

  // Bullets vs UFO
  if (ufo) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      if (dist(b.x, b.y, ufo.x, ufo.y) < UFO_RADIUS) {
        bullets.splice(bi, 1);
        score += UFO_POINTS;
        scoreEl.textContent = score;
        spawnParticles(ufo.x, ufo.y, 15);
        ufo = null;
        break;
      }
    }
  }

  // Ship vs Asteroids
  if (ship && !ship.invulnerable) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const a = asteroids[ai];
      if (dist(ship.x, ship.y, a.x, a.y) < a.radius + SHIP_RADIUS * 0.6) {
        destroyAsteroid(ai);
        killShip();
        return;
      }
    }
  }

  // Ship vs UFO
  if (ship && !ship.invulnerable && ufo) {
    if (dist(ship.x, ship.y, ufo.x, ufo.y) < UFO_RADIUS + SHIP_RADIUS * 0.6) {
      spawnParticles(ufo.x, ufo.y, 15);
      ufo = null;
      killShip();
      return;
    }
  }

  // Ship vs UFO bullets
  if (ship && !ship.invulnerable) {
    for (let i = ufoBullets.length - 1; i >= 0; i--) {
      const b = ufoBullets[i];
      if (dist(ship.x, ship.y, b.x, b.y) < SHIP_RADIUS * 0.6 + 3) {
        ufoBullets.splice(i, 1);
        killShip();
        return;
      }
    }
  }
}

function killShip() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150);
  spawnParticles(ship.x, ship.y, 20);
  lives--;
  updateLivesDisplay();

  if (lives <= 0) {
    ship = null;
    endGame();
  } else {
    // Respawn at center with invulnerability
    ship = createShip();
  }
}

function updateLivesDisplay() {
  let stars = '';
  for (let i = 0; i < lives; i++) stars += '\u2733';
  livesEl.textContent = stars || '---';
}

// ── Game flow ───────────────────────────────────────────────────────────────
function startGame() {
  score = 0;
  lives = activeDiff.maxLives;
  wave = 0;
  bullets = [];
  asteroids = [];
  particles = [];
  ufo = null;
  ufoBullets = [];
  ufoTimer = 0;
  nextUfoTime = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
  lastFireTime = 0;
  gameOver = false;

  scoreEl.textContent = '0';
  updateLivesDisplay();
  waveEl.textContent = '1';

  ship = createShip();
  spawnWaveAsteroids();

  overlay.style.display = 'none';
  const ds = document.getElementById('difficulty-selector');
  if (ds) ds.style.display = 'none';
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function endGame() {
  gameOver = true;
  running = false;

  // Show game over overlay
  overlay.querySelector('h2').textContent = 'GAME OVER';
  overlay.querySelector('p').textContent = 'Final Score: ' + score.toLocaleString();
  startBtn.textContent = 'PLAY AGAIN';
  overlay.style.display = 'flex';
  const ds = document.getElementById('difficulty-selector');
  if (ds) ds.style.display = 'flex';

  // Submit score
  submitScore();
}

async function submitScore() {
  try {
    const res = await api.post('/api/scores/asteroids', { score, difficulty: currentDifficulty });
    if (res && res.ok) {
      const data = await res.json();
      const rankInfo = document.createElement('p');
      rankInfo.style.cssText = 'font-size:0.9rem;color:#33ff88;text-shadow:0 0 6px #33ff88;';
      rankInfo.textContent = 'Rank: #' + data.rank;
      overlay.querySelector('p').after(rankInfo);
    }
  } catch (err) {
    console.error('Score submission failed:', err);
  }
  if (typeof window.loadMiniLeaderboard === 'function') {
    window.loadMiniLeaderboard();
  }
}

// ── Game loop ───────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!running) return;

  const dt = Math.min(timestamp - lastTime, 50); // cap at 50ms to prevent spiral
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

function update(dt) {
  updateShip(dt);
  updateBullets(dt);
  updateAsteroids(dt);
  updateParticles(dt);
  updateUfo(dt);
  updateUfoBullets(dt);
  checkCollisions();

  // Fire continuously while key held
  if (keys[' '] || keys['Space']) fireBullet();

  // Check if wave cleared
  if (asteroids.length === 0 && !gameOver) {
    spawnWaveAsteroids();
  }
}

function draw() {
  // Clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Faint starfield (static)
  drawStars();

  drawAsteroids();
  drawBullets();
  drawUfo();
  drawUfoBullets();
  drawParticles();
  drawShip();
}

// ── Static starfield ────────────────────────────────────────────────────────
const stars = [];
for (let i = 0; i < 80; i++) {
  stars.push({
    x: Math.random() * CANVAS_W,
    y: Math.random() * CANVAS_H,
    r: Math.random() * 1.2 + 0.3,
    alpha: Math.random() * 0.5 + 0.2,
  });
}

function drawStars() {
  for (const s of stars) {
    ctx.fillStyle = `rgba(255,255,255,${s.alpha})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Input ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// Start button
startBtn.addEventListener('click', () => {
  // Clean up any leftover rank info from previous game
  const extra = overlay.querySelectorAll('p');
  if (extra.length > 1) {
    for (let i = 1; i < extra.length; i++) extra[i].remove();
  }
  // Restore overlay text
  overlay.querySelector('h2').textContent = 'VOID DRIFTER';
  overlay.querySelector('p').innerHTML =
    'Left/Right or A/D \u2014 Rotate<br>' +
    'Up or W \u2014 Thrust<br>' +
    'Space \u2014 Fire<br>' +
    'Destroy asteroids. Survive the void.';
  startBtn.textContent = 'START GAME';
  startGame();
});

// ── Difficulty selector ────────────────────────────────────────────────────
function initDifficultySelector() {
  const btns = document.querySelectorAll('#difficulty-selector .diff-btn');
  btns.forEach(btn => {
    if (btn.dataset.difficulty === currentDifficulty) btn.classList.add('diff-active');
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('diff-active'));
      btn.classList.add('diff-active');
      setDifficulty(btn.dataset.difficulty);
    });
  });
}
initDifficultySelector();
