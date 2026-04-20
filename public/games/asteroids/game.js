const CANVAS_W = 700;
const CANVAS_H = 520;

const BASE_SHIP = {
  radius: 18,
  rotationSpeed: 0.068,
  thrust: 0.125,
  friction: 0.992,
  maxSpeed: 6.2,
  bulletSpeed: 8.2,
  bulletLife: 56,
  bulletRadius: 2.6,
  maxBullets: 14,
  fireCooldown: 165,
};

const PARTICLE_LIFE = 34;
const PICKUP_LIFE = 9000;
const ROUND_CLEAR_DELAY = 1400;
const OVERDRIVE_TIME = 10000;
const SHIELD_GRACE_TIME = 600;
const UFO_INTERVAL_MIN = 14000;
const UFO_INTERVAL_MAX = 26000;
const UFO_SPEED = 2.2;
const UFO_FIRE_RATE = 1450;
const UFO_RADIUS = 18;
const UFO_POINTS = 200;
const UFO_BULLET_SPEED = 4.3;

const DIFFICULTY_CONFIG = {
  easy: { label: 'EASY', maxLives: 5, asteroidSpeedMult: 0.72, invulnTime: 3000, startingAsteroids: 3 },
  normal: { label: 'NORMAL', maxLives: 3, asteroidSpeedMult: 1, invulnTime: 2000, startingAsteroids: 3 },
  hard: { label: 'HARD', maxLives: 2, asteroidSpeedMult: 1.3, invulnTime: 1500, startingAsteroids: 5 },
};

const ASTEROID_SIZES = {
  large: { radius: 46, points: 25, speed: 0.9, children: 'medium', utilityChance: 0.1, mineralCount: [2, 4] },
  medium: { radius: 25, points: 55, speed: 1.55, children: 'small', utilityChance: 0.16, mineralCount: [1, 3] },
  small: { radius: 13, points: 110, speed: 2.35, children: null, utilityChance: 0.22, mineralCount: [1, 2] },
};

const MINERAL_TYPES = {
  cobalt: { label: 'Co', value: 8, color: '#67e8f9', glow: 'rgba(103, 232, 249, 0.45)', scoreBonus: 8 },
  amberite: { label: 'Am', value: 14, color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.46)', scoreBonus: 12 },
  iridium: { label: 'Ir', value: 22, color: '#f472b6', glow: 'rgba(244, 114, 182, 0.44)', scoreBonus: 16 },
  verdite: { label: 'Ve', value: 30, color: '#86efac', glow: 'rgba(134, 239, 172, 0.44)', scoreBonus: 20 },
};

const UTILITY_DROPS = {
  repair: { label: 'Hull Patch', color: '#fb7185', glow: 'rgba(251, 113, 133, 0.45)' },
  shield: { label: 'Shield Cell', color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.45)' },
  overdrive: { label: 'Overdrive', color: '#a78bfa', glow: 'rgba(167, 139, 250, 0.45)' },
};

let currentDifficulty = localStorage.getItem('asteroids-difficulty') || 'normal';
let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];

function setDifficulty(value) {
  currentDifficulty = value;
  activeDiff = DIFFICULTY_CONFIG[value];
  localStorage.setItem('asteroids-difficulty', value);
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const overlaySummary = document.getElementById('overlay-summary');
const overlayRank = document.getElementById('overlay-rank');
const difficultySelector = document.getElementById('difficulty-selector');
const shopPanel = document.getElementById('shop-panel');
const shopItemsEl = document.getElementById('shop-items');
const shopStatusEl = document.getElementById('shop-status');
const shopCreditsEl = document.getElementById('shop-credits');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const waveEl = document.getElementById('wave');
const creditsEl = document.getElementById('credits');
const cargoEl = document.getElementById('cargo');
const loadoutEl = document.getElementById('loadout');

const keys = {};
let autoFireEnabled = false;
let running = false;
let gameOver = false;
let shopOpen = false;
let overlayState = 'start';
let score = 0;
let credits = 0;
let lives = activeDiff.maxLives;
let shieldCharges = 0;
let wave = 0;
let lastTime = 0;
let lastFireTime = 0;
let roundClearTimer = 0;
let shotBoostTimer = 0;
let waveBannerTimer = 0;
let nextUfoTime = 0;
let ufoTimer = 0;

let ship = null;
let bullets = [];
let asteroids = [];
let particles = [];
let pickups = [];
let ufo = null;
let ufoBullets = [];
let upgrades = createUpgradeState();
let cargoInventory = createCargoInventory();
let currentWaveSalvage = createWaveSalvage();

const stars = createStarfield();
const nebulae = createNebulae();

(function initSwipeControls() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  canvas.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  canvas.addEventListener('touchend', (event) => {
    const dx = event.changedTouches[0].clientX - touchStartX;
    const dy = event.changedTouches[0].clientY - touchStartY;
    if (Date.now() - touchStartTime > 400) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (absDx < 30 && absDy < 30) return;

    let key = null;
    if (absDx > absDy) {
      key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    } else if (dy < 0) {
      key = 'ArrowUp';
    }
    if (!key) return;

    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    }, 55);
  }, { passive: true });
})();

function createUpgradeState() {
  return {
    cannon: 0,
    engine: 0,
    tractor: 0,
    shield: 0,
  };
}

function createCargoInventory() {
  return {
    cobalt: 0,
    amberite: 0,
    iridium: 0,
    verdite: 0,
  };
}

function createWaveSalvage() {
  return {
    credits: 0,
    minerals: createCargoInventory(),
    utility: [],
  };
}

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function wrap(x, y, margin = 60) {
  let nextX = x;
  let nextY = y;
  if (nextX < -margin) nextX += CANVAS_W + margin * 2;
  if (nextX > CANVAS_W + margin) nextX -= CANVAS_W + margin * 2;
  if (nextY < -margin) nextY += CANVAS_H + margin * 2;
  if (nextY > CANVAS_H + margin) nextY -= CANVAS_H + margin * 2;
  return { x: nextX, y: nextY };
}

function weightedChoice(entries) {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function toRoman(num) {
  const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  return numerals[num - 1] || String(num);
}

function formatThousands(value) {
  return value.toLocaleString();
}

function getShipStats() {
  const engineMult = 1 + upgrades.engine * 0.16;
  const shotBonus = shotBoostTimer > 0 ? 1 : 0;
  return {
    radius: BASE_SHIP.radius,
    rotationSpeed: BASE_SHIP.rotationSpeed * (1 + upgrades.engine * 0.06),
    thrust: BASE_SHIP.thrust * engineMult,
    friction: BASE_SHIP.friction,
    maxSpeed: BASE_SHIP.maxSpeed * (1 + upgrades.engine * 0.1),
    bulletSpeed: BASE_SHIP.bulletSpeed + upgrades.engine * 0.18,
    bulletLife: BASE_SHIP.bulletLife,
    bulletRadius: BASE_SHIP.bulletRadius,
    maxBullets: BASE_SHIP.maxBullets,
    fireCooldown: BASE_SHIP.fireCooldown / (1 + upgrades.cannon * 0.14 + (shotBoostTimer > 0 ? 0.24 : 0)),
    projectiles: Math.min(5, 1 + upgrades.cannon + shotBonus),
    pickupRadius: 18 + upgrades.tractor * 8,
    magnetRadius: 58 + upgrades.tractor * 26,
  };
}

function createShip() {
  return {
    x: CANVAS_W / 2,
    y: CANVAS_H / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    thrusting: false,
    invulnerable: true,
    invulnTimer: activeDiff.invulnTime,
    visible: true,
    flickerTimer: 0,
    trailTimer: 0,
  };
}

function createStarfield() {
  const items = [];
  for (let i = 0; i < 110; i++) {
    items.push({
      x: Math.random() * CANVAS_W,
      y: Math.random() * CANVAS_H,
      radius: Math.random() * 1.4 + 0.25,
      alpha: Math.random() * 0.5 + 0.15,
      drift: rand(0.35, 1.2),
      phase: rand(0, Math.PI * 2),
    });
  }
  return items;
}

function createNebulae() {
  return [
    { x: 128, y: 120, radius: 160, color: 'rgba(41, 121, 255, 0.18)', phase: 0 },
    { x: 540, y: 170, radius: 180, color: 'rgba(255, 109, 83, 0.14)', phase: 1.3 },
    { x: 360, y: 400, radius: 210, color: 'rgba(59, 255, 186, 0.12)', phase: 2.1 },
  ];
}

function summarizeCargo() {
  const parts = Object.entries(MINERAL_TYPES)
    .map(([key, config]) => (cargoInventory[key] > 0 ? `${config.label} ${cargoInventory[key]}` : null))
    .filter(Boolean);
  return parts.length ? parts.join(' • ') : 'Empty';
}

function updateHud() {
  scoreEl.textContent = formatThousands(score);
  creditsEl.textContent = formatThousands(credits);
  cargoEl.textContent = summarizeCargo();
  const stats = getShipStats();
  loadoutEl.textContent = `MK ${toRoman(1 + upgrades.cannon)} • ENG ${upgrades.engine + 1} • SH ${shieldCharges}${shotBoostTimer > 0 ? ' • OD' : ''}`;
  waveEl.textContent = String(Math.max(1, wave));
  updateLivesDisplay();
  return stats;
}

function updateLivesDisplay() {
  let hull = '';
  for (let i = 0; i < lives; i++) hull += '\u2726';
  livesEl.textContent = hull || '---';
}

function chooseAsteroidCore(size) {
  if (size === 'small') {
    return weightedChoice([
      { value: 'amberite', weight: 36 },
      { value: 'iridium', weight: 34 },
      { value: 'verdite', weight: 20 },
      { value: 'cobalt', weight: 10 },
    ]);
  }
  if (size === 'medium') {
    return weightedChoice([
      { value: 'cobalt', weight: 34 },
      { value: 'amberite', weight: 34 },
      { value: 'iridium', weight: 22 },
      { value: 'verdite', weight: 10 },
    ]);
  }
  return weightedChoice([
    { value: 'cobalt', weight: 46 },
    { value: 'amberite', weight: 30 },
    { value: 'iridium', weight: 18 },
    { value: 'verdite', weight: 6 },
  ]);
}

function generateAsteroidShape(radius) {
  const verts = randInt(8, 13);
  const shape = [];
  for (let i = 0; i < verts; i++) {
    const angle = (i / verts) * Math.PI * 2;
    const r = radius * rand(0.68, 1.24);
    shape.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return shape;
}

function generateAsteroidCraters(radius) {
  const craters = [];
  for (let i = 0; i < randInt(2, 4); i++) {
    craters.push({
      x: rand(-radius * 0.38, radius * 0.38),
      y: rand(-radius * 0.38, radius * 0.38),
      r: rand(radius * 0.12, radius * 0.24),
    });
  }
  return craters;
}

function generateAsteroidVeins(radius) {
  const veins = [];
  for (let i = 0; i < randInt(2, 4); i++) {
    const startAngle = rand(0, Math.PI * 2);
    const endAngle = startAngle + rand(0.4, 1.3);
    veins.push({
      x1: Math.cos(startAngle) * radius * rand(0.15, 0.55),
      y1: Math.sin(startAngle) * radius * rand(0.15, 0.55),
      x2: Math.cos(endAngle) * radius * rand(0.45, 0.86),
      y2: Math.sin(endAngle) * radius * rand(0.45, 0.86),
    });
  }
  return veins;
}

function createAsteroid(size, x, y, vx, vy, core) {
  const def = ASTEROID_SIZES[size];
  const mineralCore = core || chooseAsteroidCore(size);
  const speedMult = activeDiff.asteroidSpeedMult;
  return {
    x,
    y,
    vx: (vx ?? rand(-def.speed, def.speed)) * speedMult,
    vy: (vy ?? rand(-def.speed, def.speed)) * speedMult,
    size,
    radius: def.radius,
    shape: generateAsteroidShape(def.radius),
    craters: generateAsteroidCraters(def.radius),
    veins: generateAsteroidVeins(def.radius),
    core: mineralCore,
    rotAngle: rand(0, Math.PI * 2),
    rotSpeed: rand(-0.022, 0.022),
    shadeOffset: rand(0, Math.PI * 2),
  };
}

function spawnWaveAsteroids() {
  wave += 1;
  roundClearTimer = 0;
  currentWaveSalvage = createWaveSalvage();
  shieldCharges = Math.max(shieldCharges, upgrades.shield);
  waveBannerTimer = 1900;
  if (wave > 1) sfx.play('levelup');

  const count = wave + activeDiff.startingAsteroids;
  for (let i = 0; i < count; i++) {
    let x;
    let y;
    if (Math.random() < 0.5) {
      x = Math.random() < 0.5 ? -40 : CANVAS_W + 40;
      y = rand(0, CANVAS_H);
    } else {
      x = rand(0, CANVAS_W);
      y = Math.random() < 0.5 ? -40 : CANVAS_H + 40;
    }

    const angle = rand(0, Math.PI * 2);
    const speed = ASTEROID_SIZES.large.speed + Math.min(wave * 0.05, 0.5);
    asteroids.push(createAsteroid(
      'large',
      x,
      y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    ));
  }
  updateHud();
}

function spawnParticles(x, y, count, options = {}) {
  const colors = options.colors || ['#7fffd8'];
  const speedMin = options.speedMin ?? 1.2;
  const speedMax = options.speedMax ?? 4.2;
  const life = options.life ?? PARTICLE_LIFE;
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(speedMin, speedMax);
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      radius: rand(1.2, 2.8),
      color: colors[randInt(0, colors.length - 1)],
    });
  }
}

function createPickup(kind, key, x, y, radius, velocityScale = 1) {
  return {
    kind,
    key,
    x,
    y,
    vx: rand(-1.2, 1.2) * velocityScale,
    vy: rand(-1.2, 1.2) * velocityScale,
    radius,
    spin: rand(0, Math.PI * 2),
    bob: rand(0, Math.PI * 2),
    life: PICKUP_LIFE,
  };
}

function dropAsteroidRewards(asteroid) {
  const def = ASTEROID_SIZES[asteroid.size];
  const [minDrops, maxDrops] = def.mineralCount;
  const mineralCount = randInt(minDrops, maxDrops);
  for (let i = 0; i < mineralCount; i++) {
    const scatter = rand(-8, 8);
    pickups.push(createPickup('mineral', asteroid.core, asteroid.x + scatter, asteroid.y + scatter, 8, 1.05));
  }

  if (Math.random() < def.utilityChance) {
    const utilityKey = weightedChoice([
      { value: 'repair', weight: 28 },
      { value: 'shield', weight: 38 },
      { value: 'overdrive', weight: 34 },
    ]);
    pickups.push(createPickup('utility', utilityKey, asteroid.x, asteroid.y, 10, 0.85));
  }
}

function destroyAsteroid(index) {
  const asteroid = asteroids[index];
  const def = ASTEROID_SIZES[asteroid.size];
  const mineral = MINERAL_TYPES[asteroid.core];

  dropAsteroidRewards(asteroid);
  spawnParticles(asteroid.x, asteroid.y, Math.floor(asteroid.radius / 2.8), {
    colors: ['#a3a3a3', '#d4d4d4', mineral.color],
    speedMin: 1.4,
    speedMax: 5.2,
    life: 40,
  });
  score += def.points;
  updateHud();
  sfx.play('score');

  if (def.children) {
    const childDef = ASTEROID_SIZES[def.children];
    for (let i = 0; i < 2; i++) {
      const angle = rand(0, Math.PI * 2);
      asteroids.push(createAsteroid(
        def.children,
        asteroid.x + rand(-6, 6),
        asteroid.y + rand(-6, 6),
        Math.cos(angle) * childDef.speed + asteroid.vx * 0.25,
        Math.sin(angle) * childDef.speed + asteroid.vy * 0.25,
        asteroid.core
      ));
    }
  }

  asteroids.splice(index, 1);
}

function spawnUfo() {
  const fromLeft = Math.random() < 0.5;
  ufo = {
    x: fromLeft ? -UFO_RADIUS - 8 : CANVAS_W + UFO_RADIUS + 8,
    y: rand(70, CANVAS_H - 70),
    vx: fromLeft ? UFO_SPEED : -UFO_SPEED,
    vy: rand(-0.5, 0.5),
    lastFireTime: performance.now(),
  };
}

function updateShip(dt) {
  if (!ship || shopOpen) return;

  const stats = getShipStats();
  const dtScale = dt * 60 / 1000;

  if (keys.ArrowLeft || keys.a || keys.A) ship.angle -= stats.rotationSpeed * dtScale;
  if (keys.ArrowRight || keys.d || keys.D) ship.angle += stats.rotationSpeed * dtScale;

  ship.thrusting = !!(keys.ArrowUp || keys.w || keys.W);
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.angle) * stats.thrust * dtScale;
    ship.vy += Math.sin(ship.angle) * stats.thrust * dtScale;
    ship.trailTimer += dt;
    if (ship.trailTimer > 38) {
      ship.trailTimer = 0;
      spawnParticles(
        ship.x - Math.cos(ship.angle) * 16,
        ship.y - Math.sin(ship.angle) * 16,
        2,
        {
          colors: ['#ff8b3d', '#ffd166', '#60f3ff'],
          speedMin: 0.6,
          speedMax: 2.2,
          life: 24,
        }
      );
    }
  }

  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > stats.maxSpeed) {
    ship.vx = (ship.vx / speed) * stats.maxSpeed;
    ship.vy = (ship.vy / speed) * stats.maxSpeed;
  }

  const frictionFactor = Math.pow(stats.friction, dtScale);
  ship.vx *= frictionFactor;
  ship.vy *= frictionFactor;

  ship.x += ship.vx * dtScale;
  ship.y += ship.vy * dtScale;

  const wrapped = wrap(ship.x, ship.y);
  ship.x = wrapped.x;
  ship.y = wrapped.y;

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

function projectileOffsets(count) {
  switch (count) {
    case 1: return [0];
    case 2: return [-0.09, 0.09];
    case 3: return [-0.13, 0, 0.13];
    case 4: return [-0.19, -0.06, 0.06, 0.19];
    default: return [-0.24, -0.12, 0, 0.12, 0.24];
  }
}

function fireBullet() {
  if (!ship || shopOpen) return;

  const stats = getShipStats();
  const now = performance.now();
  if (bullets.length >= stats.maxBullets) return;
  if (now - lastFireTime < stats.fireCooldown) return;
  lastFireTime = now;

  const offsets = projectileOffsets(stats.projectiles);
  for (const offset of offsets) {
    const angle = ship.angle + offset;
    const vx = Math.cos(angle) * stats.bulletSpeed + ship.vx * 0.36;
    const vy = Math.sin(angle) * stats.bulletSpeed + ship.vy * 0.36;
    bullets.push({
      x: ship.x + Math.cos(angle) * (stats.radius + 2),
      y: ship.y + Math.sin(angle) * (stats.radius + 2),
      prevX: ship.x,
      prevY: ship.y,
      vx,
      vy,
      life: stats.bulletLife,
      radius: stats.bulletRadius,
      color: shotBoostTimer > 0 ? '#e9d5ff' : '#67e8f9',
    });
  }
}

function updateBullets(dt) {
  const dtScale = dt * 60 / 1000;
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.x += bullet.vx * dtScale;
    bullet.y += bullet.vy * dtScale;
    bullet.life -= dtScale;

    const wrapped = wrap(bullet.x, bullet.y);
    bullet.x = wrapped.x;
    bullet.y = wrapped.y;

    if (bullet.life <= 0) bullets.splice(i, 1);
  }
}

function updateAsteroids(dt) {
  if (shopOpen) return;
  const dtScale = dt * 60 / 1000;
  for (const asteroid of asteroids) {
    asteroid.x += asteroid.vx * dtScale;
    asteroid.y += asteroid.vy * dtScale;
    asteroid.rotAngle += asteroid.rotSpeed * dtScale;
    const wrapped = wrap(asteroid.x, asteroid.y);
    asteroid.x = wrapped.x;
    asteroid.y = wrapped.y;
  }
}

function updateParticles(dt) {
  const dtScale = dt * 60 / 1000;
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.x += particle.vx * dtScale;
    particle.y += particle.vy * dtScale;
    particle.life -= dtScale;
    if (particle.life <= 0) particles.splice(i, 1);
  }
}

function updatePickups(dt) {
  const dtScale = dt * 60 / 1000;
  const shipStats = getShipStats();

  for (let i = pickups.length - 1; i >= 0; i--) {
    const pickup = pickups[i];
    pickup.spin += 0.06 * dtScale;
    pickup.bob += 0.04 * dtScale;
    pickup.life -= dt;

    if (!shopOpen) {
      pickup.x += pickup.vx * dtScale;
      pickup.y += pickup.vy * dtScale;
      pickup.vx *= 0.992;
      pickup.vy *= 0.992;

      const wrapped = wrap(pickup.x, pickup.y, 26);
      pickup.x = wrapped.x;
      pickup.y = wrapped.y;
    }

    if (ship) {
      const distance = dist(ship.x, ship.y, pickup.x, pickup.y);
      if (distance < shipStats.magnetRadius && !shopOpen) {
        const pull = (1 - distance / shipStats.magnetRadius) * (0.12 + upgrades.tractor * 0.08);
        pickup.vx += ((ship.x - pickup.x) / Math.max(1, distance)) * pull * dtScale;
        pickup.vy += ((ship.y - pickup.y) / Math.max(1, distance)) * pull * dtScale;
      }
      if (distance < shipStats.pickupRadius + pickup.radius) {
        collectPickup(pickup);
        pickups.splice(i, 1);
        continue;
      }
    }

    if (pickup.life <= 0) pickups.splice(i, 1);
  }
}

function applyUtilityPickup(key) {
  if (key === 'repair') {
    if (lives < activeDiff.maxLives) {
      lives += 1;
      currentWaveSalvage.utility.push('Hull Patch');
    } else {
      credits += 20;
      currentWaveSalvage.credits += 20;
      currentWaveSalvage.utility.push('Hull Patch converted to credits');
    }
  } else if (key === 'shield') {
    shieldCharges += 1;
    currentWaveSalvage.utility.push('Shield Cell');
  } else if (key === 'overdrive') {
    shotBoostTimer = Math.max(shotBoostTimer, OVERDRIVE_TIME);
    currentWaveSalvage.utility.push('Overdrive');
  }
}

function collectPickup(pickup) {
  if (pickup.kind === 'mineral') {
    const mineral = MINERAL_TYPES[pickup.key];
    credits += mineral.value;
    score += mineral.scoreBonus;
    cargoInventory[pickup.key] += 1;
    currentWaveSalvage.credits += mineral.value;
    currentWaveSalvage.minerals[pickup.key] += 1;
    sfx.play('score');
  } else {
    applyUtilityPickup(pickup.key);
    sfx.play('powerup');
  }
  updateHud();
}

function updateUfo(dt) {
  if (shopOpen) return;
  if (wave < 2) return;

  if (!ufo) {
    ufoTimer += dt;
    if (ufoTimer >= nextUfoTime && asteroids.length > 0) {
      spawnUfo();
      ufoTimer = 0;
      nextUfoTime = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
    }
    return;
  }

  const dtScale = dt * 60 / 1000;
  ufo.x += ufo.vx * dtScale;
  ufo.y += ufo.vy * dtScale;
  ufo.vy += rand(-0.04, 0.04) * dtScale;
  ufo.vy = clamp(ufo.vy, -1, 1);

  if (ufo.y < 50) ufo.vy = Math.abs(ufo.vy);
  if (ufo.y > CANVAS_H - 50) ufo.vy = -Math.abs(ufo.vy);

  if (ufo.x < -80 || ufo.x > CANVAS_W + 80) {
    ufo = null;
    return;
  }

  if (ship) {
    const now = performance.now();
    if (now - ufo.lastFireTime > UFO_FIRE_RATE) {
      ufo.lastFireTime = now;
      const angle = Math.atan2(ship.y - ufo.y, ship.x - ufo.x) + rand(-0.24, 0.24);
      ufoBullets.push({
        x: ufo.x,
        y: ufo.y,
        vx: Math.cos(angle) * UFO_BULLET_SPEED,
        vy: Math.sin(angle) * UFO_BULLET_SPEED,
        life: 88,
      });
    }
  }
}

function updateUfoBullets(dt) {
  if (shopOpen) return;
  const dtScale = dt * 60 / 1000;
  for (let i = ufoBullets.length - 1; i >= 0; i--) {
    const bullet = ufoBullets[i];
    bullet.x += bullet.vx * dtScale;
    bullet.y += bullet.vy * dtScale;
    bullet.life -= dtScale;
    if (bullet.life <= 0 || bullet.x < -12 || bullet.x > CANVAS_W + 12 || bullet.y < -12 || bullet.y > CANVAS_H + 12) {
      ufoBullets.splice(i, 1);
    }
  }
}

function absorbHit(x, y) {
  if (!ship || shieldCharges <= 0) return false;
  shieldCharges -= 1;
  ship.invulnerable = true;
  ship.invulnTimer = SHIELD_GRACE_TIME;
  ship.flickerTimer = 0;
  spawnParticles(x, y, 18, {
    colors: ['#60a5fa', '#a5f3fc', '#e0f2fe'],
    speedMin: 1.4,
    speedMax: 4.4,
    life: 28,
  });
  sfx.play('powerup');
  updateHud();
  return true;
}

function killShip() {
  if (!ship) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150);
  spawnParticles(ship.x, ship.y, 24, {
    colors: ['#f87171', '#fb7185', '#fecdd3', '#fbbf24'],
    speedMin: 1.8,
    speedMax: 5.4,
    life: 44,
  });
  lives -= 1;
  shieldCharges = 0;
  updateHud();
  sfx.play('damage');

  if (lives <= 0) {
    ship = null;
    endGame();
  } else {
    ship = createShip();
  }
}

function destroyUfo() {
  if (!ufo) return;
  spawnParticles(ufo.x, ufo.y, 18, {
    colors: ['#f472b6', '#fb7185', '#fde68a'],
    speedMin: 1.4,
    speedMax: 4.8,
    life: 36,
  });
  score += UFO_POINTS;
  updateHud();
  if (Math.random() < 0.7) {
    const dropKey = Math.random() < 0.5 ? 'shield' : 'overdrive';
    pickups.push(createPickup('utility', dropKey, ufo.x, ufo.y, 10, 1.2));
  }
  ufo = null;
}

function checkCollisions() {
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const bullet = bullets[bi];
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = asteroids[ai];
      if (dist(bullet.x, bullet.y, asteroid.x, asteroid.y) < asteroid.radius) {
        bullets.splice(bi, 1);
        destroyAsteroid(ai);
        break;
      }
    }
  }

  if (ufo) {
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const bullet = bullets[bi];
      if (dist(bullet.x, bullet.y, ufo.x, ufo.y) < UFO_RADIUS) {
        bullets.splice(bi, 1);
        destroyUfo();
        break;
      }
    }
  }

  if (ship && !ship.invulnerable) {
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const asteroid = asteroids[ai];
      if (dist(ship.x, ship.y, asteroid.x, asteroid.y) < asteroid.radius + BASE_SHIP.radius * 0.72) {
        destroyAsteroid(ai);
        if (!absorbHit(ship.x, ship.y)) killShip();
        return;
      }
    }
  }

  if (ship && !ship.invulnerable && ufo) {
    if (dist(ship.x, ship.y, ufo.x, ufo.y) < UFO_RADIUS + BASE_SHIP.radius * 0.72) {
      destroyUfo();
      if (!absorbHit(ship.x, ship.y)) killShip();
      return;
    }
  }

  if (ship && !ship.invulnerable) {
    for (let i = ufoBullets.length - 1; i >= 0; i--) {
      const bullet = ufoBullets[i];
      if (dist(ship.x, ship.y, bullet.x, bullet.y) < BASE_SHIP.radius * 0.72 + 3) {
        ufoBullets.splice(i, 1);
        if (!absorbHit(ship.x, ship.y)) killShip();
        return;
      }
    }
  }
}

function shopDefinitions() {
  return [
    {
      key: 'pulse',
      hotkey: '1',
      label: 'Pulse Cannons',
      description: 'Adds side-lasers and tightens the firing cycle.',
      level: `${upgrades.cannon}/3`,
      cost: 70 + upgrades.cannon * 55,
      disabled: upgrades.cannon >= 3 || credits < 70 + upgrades.cannon * 55,
      buy() {
        if (upgrades.cannon >= 3) return false;
        const cost = 70 + upgrades.cannon * 55;
        if (credits < cost) return false;
        credits -= cost;
        upgrades.cannon += 1;
        sfx.play('powerup');
        return `Pulse Cannons upgraded to MK ${toRoman(1 + upgrades.cannon)}.`;
      },
    },
    {
      key: 'engine',
      hotkey: '2',
      label: 'Afterburners',
      description: 'Boosts thrust, turn response, and top drift speed.',
      level: `${upgrades.engine}/4`,
      cost: 55 + upgrades.engine * 45,
      disabled: upgrades.engine >= 4 || credits < 55 + upgrades.engine * 45,
      buy() {
        if (upgrades.engine >= 4) return false;
        const cost = 55 + upgrades.engine * 45;
        if (credits < cost) return false;
        credits -= cost;
        upgrades.engine += 1;
        sfx.play('powerup');
        return `Afterburners tuned to tier ${upgrades.engine}.`;
      },
    },
    {
      key: 'tractor',
      hotkey: '3',
      label: 'Tractor Beam',
      description: 'Pulls mineral shards from farther away and widens pickup range.',
      level: `${upgrades.tractor}/3`,
      cost: 48 + upgrades.tractor * 38,
      disabled: upgrades.tractor >= 3 || credits < 48 + upgrades.tractor * 38,
      buy() {
        if (upgrades.tractor >= 3) return false;
        const cost = 48 + upgrades.tractor * 38;
        if (credits < cost) return false;
        credits -= cost;
        upgrades.tractor += 1;
        sfx.play('powerup');
        return `Tractor Beam widened to tier ${upgrades.tractor}.`;
      },
    },
    {
      key: 'shield',
      hotkey: '4',
      label: 'Shield Matrix',
      description: 'Adds a starting shield charge each wave and grants one now.',
      level: `${upgrades.shield}/3`,
      cost: 82 + upgrades.shield * 58,
      disabled: upgrades.shield >= 3 || credits < 82 + upgrades.shield * 58,
      buy() {
        if (upgrades.shield >= 3) return false;
        const cost = 82 + upgrades.shield * 58;
        if (credits < cost) return false;
        credits -= cost;
        upgrades.shield += 1;
        shieldCharges += 1;
        sfx.play('powerup');
        return `Shield Matrix expanded. Charges online: ${shieldCharges}.`;
      },
    },
    {
      key: 'repair',
      hotkey: '5',
      label: 'Field Repair',
      description: 'Spend salvage on immediate hull restoration before launching.',
      level: lives < activeDiff.maxLives ? `${lives}/${activeDiff.maxLives}` : 'Full',
      cost: 38 + wave * 8,
      disabled: lives >= activeDiff.maxLives || credits < 38 + wave * 8,
      buy() {
        const cost = 38 + wave * 8;
        if (lives >= activeDiff.maxLives || credits < cost) return false;
        credits -= cost;
        lives += 1;
        sfx.play('powerup');
        return `Hull patched to ${lives}/${activeDiff.maxLives}.`;
      },
    },
  ];
}

function renderShopItems() {
  const items = shopDefinitions();
  shopItemsEl.innerHTML = '';
  shopCreditsEl.textContent = `Credits ${formatThousands(credits)}`;

  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'shop-item';
    button.disabled = item.disabled;
    button.dataset.shopKey = item.key;
    button.innerHTML =
      `<div class="shop-item-title"><span>${item.label}</span><span class="shop-item-key">[${item.hotkey}]</span></div>` +
      `<div class="shop-item-desc">${item.description}</div>` +
      `<div class="shop-item-meta"><span>Cost ${formatThousands(item.cost)}</span><span>${item.disabled && item.level.includes('/3') && item.level.startsWith('3') ? 'MAX' : item.level}</span></div>`;
    shopItemsEl.appendChild(button);
  }
}

function renderSalvageSummary() {
  const minerals = Object.entries(MINERAL_TYPES)
    .map(([key, config]) => (currentWaveSalvage.minerals[key] > 0 ? `${config.label} ${currentWaveSalvage.minerals[key]}` : null))
    .filter(Boolean)
    .join(' • ');
  const utilities = currentWaveSalvage.utility.length ? currentWaveSalvage.utility.join(', ') : 'None';
  return (
    `<strong>Wave ${wave} salvage:</strong> ${formatThousands(currentWaveSalvage.credits)} credits banked.<br>` +
    `<strong>Minerals:</strong> ${minerals || 'No recovered ore'}<br>` +
    `<strong>Special pickups:</strong> ${utilities}`
  );
}

function renderRunSummary() {
  const upgradesSummary = `Cannons MK ${toRoman(1 + upgrades.cannon)} • Engine ${upgrades.engine + 1} • Tractor ${upgrades.tractor} • Shield ${upgrades.shield}`;
  return (
    `<strong>Run haul:</strong> ${formatThousands(credits)} unspent credits.<br>` +
    `<strong>Cargo:</strong> ${summarizeCargo()}<br>` +
    `<strong>Loadout:</strong> ${upgradesSummary}`
  );
}

function enterUpgradeShop() {
  if (shopOpen || gameOver) return;
  shopOpen = true;
  overlayState = 'shop';
  overlay.style.display = 'flex';
  overlayTitle.textContent = 'UPGRADE DOCK';
  overlayMessage.innerHTML = `Wave ${wave} cleared. Scoop the last drift, then refit before wave ${wave + 1}.`;
  overlaySummary.innerHTML = renderSalvageSummary();
  overlaySummary.hidden = false;
  overlayRank.hidden = true;
  difficultySelector.style.display = 'none';
  shopPanel.hidden = false;
  startBtn.textContent = `LAUNCH WAVE ${wave + 1}`;
  shopStatusEl.textContent = 'Dock services online.';
  renderShopItems();
}

function closeOverlay() {
  overlay.style.display = 'none';
  overlaySummary.hidden = true;
  overlayRank.hidden = true;
  shopPanel.hidden = true;
}

function startGame() {
  running = true;
  gameOver = false;
  shopOpen = false;
  overlayState = 'playing';
  score = 0;
  credits = 0;
  lives = activeDiff.maxLives;
  shieldCharges = 0;
  wave = 0;
  lastFireTime = 0;
  roundClearTimer = 0;
  shotBoostTimer = 0;
  waveBannerTimer = 0;
  bullets = [];
  asteroids = [];
  particles = [];
  pickups = [];
  ufo = null;
  ufoBullets = [];
  ufoTimer = 0;
  nextUfoTime = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
  cargoInventory = createCargoInventory();
  currentWaveSalvage = createWaveSalvage();
  upgrades = createUpgradeState();
  ship = createShip();

  overlayTitle.textContent = 'VOID DRIFTER';
  overlayMessage.innerHTML =
    'Rotate with Left/Right or A/D. Burn forward with Up or W.<br>' +
    'Crack asteroids, scoop the mineral drops, then spend salvage in the dock between rounds.';
  difficultySelector.style.display = 'flex';
  startBtn.textContent = 'START GAME';
  updateHud();
  closeOverlay();
  spawnWaveAsteroids();
  sfx.play('start');
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function continueFromShop() {
  if (!shopOpen) return;
  shopOpen = false;
  overlayState = 'playing';
  closeOverlay();
  spawnWaveAsteroids();
}

function endGame() {
  gameOver = true;
  running = false;
  shopOpen = false;
  overlayState = 'gameover';
  overlay.style.display = 'flex';
  overlayTitle.textContent = 'GAME OVER';
  overlayMessage.textContent = `Final Score: ${formatThousands(score)}`;
  overlaySummary.innerHTML = renderRunSummary();
  overlaySummary.hidden = false;
  overlayRank.hidden = false;
  overlayRank.textContent = '';
  difficultySelector.style.display = 'flex';
  shopPanel.hidden = true;
  startBtn.textContent = 'PLAY AGAIN';
  sfx.play('gameover');
  submitScore();
}

async function submitScore() {
  try {
    const res = await api.post('/api/scores/asteroids', { score, difficulty: currentDifficulty });
    if (res && res.ok) {
      const data = await res.json();
      overlayRank.textContent = `Rank saved: #${data.rank}`;
    } else if (res && res.status === 401) {
      overlayRank.textContent = 'Log in to save your score.';
    } else {
      overlayRank.textContent = 'Score submission unavailable.';
    }
  } catch (err) {
    console.error('Score submission failed:', err);
    overlayRank.textContent = 'Score submission unavailable.';
  }
  if (typeof window.loadMiniLeaderboard === 'function') {
    window.loadMiniLeaderboard();
  }
}

function attemptPurchaseByKey(key) {
  if (!shopOpen) return false;
  const item = shopDefinitions().find((entry) => entry.key === key);
  if (!item) return false;
  const message = item.buy();
  if (!message) {
    shopStatusEl.textContent = item.disabled ? 'Not enough credits or upgrade already maxed.' : 'Purchase failed.';
    return false;
  }
  updateHud();
  renderShopItems();
  shopStatusEl.textContent = message;
  return true;
}

function update(dt) {
  if (shopOpen || gameOver) {
    updateParticles(dt);
    updatePickups(dt);
    if (waveBannerTimer > 0) waveBannerTimer -= dt;
    return;
  }

  if (autoFireEnabled) keys[' '] = true;
  if (keys[' '] || keys.Space) fireBullet();

  shotBoostTimer = Math.max(0, shotBoostTimer - dt);
  if (waveBannerTimer > 0) waveBannerTimer -= dt;

  updateShip(dt);
  updateBullets(dt);
  updateAsteroids(dt);
  updateParticles(dt);
  updatePickups(dt);
  updateUfo(dt);
  updateUfoBullets(dt);
  checkCollisions();

  if (asteroids.length === 0 && !shopOpen && !gameOver) {
    roundClearTimer += dt;
    if (roundClearTimer >= ROUND_CLEAR_DELAY) enterUpgradeShop();
  } else if (asteroids.length > 0) {
    roundClearTimer = 0;
  }

  updateHud();
}

function drawBackground() {
  const time = performance.now() * 0.00022;
  const sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  sky.addColorStop(0, '#050a18');
  sky.addColorStop(0.45, '#030713');
  sky.addColorStop(1, '#010206');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  for (const nebula of nebulae) {
    const pulse = 0.85 + Math.sin(time + nebula.phase) * 0.08;
    const gradient = ctx.createRadialGradient(
      nebula.x,
      nebula.y,
      nebula.radius * 0.1,
      nebula.x,
      nebula.y,
      nebula.radius * pulse
    );
    gradient.addColorStop(0, nebula.color);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }

  for (const star of stars) {
    const alpha = star.alpha + Math.sin(time * star.drift * 8 + star.phase) * 0.12;
    ctx.fillStyle = `rgba(255, 255, 255, ${clamp(alpha, 0.05, 0.75)})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAsteroids() {
  for (const asteroid of asteroids) {
    const mineral = MINERAL_TYPES[asteroid.core];
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rotAngle);

    const fill = ctx.createRadialGradient(
      -asteroid.radius * 0.28,
      -asteroid.radius * 0.34,
      asteroid.radius * 0.12,
      0,
      0,
      asteroid.radius * 1.06
    );
    fill.addColorStop(0, '#4b5563');
    fill.addColorStop(0.55, '#1f2937');
    fill.addColorStop(1, '#0f172a');

    ctx.beginPath();
    ctx.moveTo(asteroid.shape[0].x, asteroid.shape[0].y);
    for (let i = 1; i < asteroid.shape.length; i++) {
      ctx.lineTo(asteroid.shape[i].x, asteroid.shape[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(240, 244, 255, 0.18)';
    ctx.stroke();

    ctx.strokeStyle = mineral.color;
    ctx.shadowColor = mineral.glow;
    ctx.shadowBlur = 8;
    ctx.lineWidth = asteroid.size === 'large' ? 2 : 1.6;
    for (const vein of asteroid.veins) {
      ctx.beginPath();
      ctx.moveTo(vein.x1, vein.y1);
      ctx.lineTo(vein.x2, vein.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    for (const crater of asteroid.craters) {
      ctx.beginPath();
      ctx.arc(crater.x, crater.y, crater.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.48)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawShip() {
  if (!ship || !ship.visible) return;

  const stats = getShipStats();
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.angle);

  if (shieldCharges > 0 || ship.invulnerable) {
    ctx.beginPath();
    ctx.arc(0, 0, stats.radius + 7 + Math.sin(performance.now() * 0.01) * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = shieldCharges > 0 ? 'rgba(96, 165, 250, 0.75)' : 'rgba(125, 211, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(96, 165, 250, 0.38)';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  if (ship.thrusting) {
    const flameLength = 18 + upgrades.engine * 5 + Math.random() * 8;
    const flame = ctx.createLinearGradient(-stats.radius - flameLength, 0, -6, 0);
    flame.addColorStop(0, 'rgba(255, 130, 65, 0)');
    flame.addColorStop(0.45, '#ffd166');
    flame.addColorStop(1, '#60f3ff');
    ctx.beginPath();
    ctx.moveTo(-stats.radius * 0.9, -stats.radius * 0.45);
    ctx.lineTo(-stats.radius - flameLength, 0);
    ctx.lineTo(-stats.radius * 0.9, stats.radius * 0.45);
    ctx.closePath();
    ctx.fillStyle = flame;
    ctx.shadowColor = 'rgba(255, 190, 92, 0.55)';
    ctx.shadowBlur = 16;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.beginPath();
  ctx.moveTo(stats.radius + 6, 0);
  ctx.lineTo(-stats.radius + 2, -stats.radius * 0.82);
  ctx.lineTo(-stats.radius * 0.48, -stats.radius * 0.22);
  ctx.lineTo(-stats.radius * 0.82, 0);
  ctx.lineTo(-stats.radius * 0.48, stats.radius * 0.22);
  ctx.lineTo(-stats.radius + 2, stats.radius * 0.82);
  ctx.closePath();
  const hull = ctx.createLinearGradient(-stats.radius, -stats.radius, stats.radius, stats.radius);
  hull.addColorStop(0, '#e2f3ff');
  hull.addColorStop(0.35, '#8ce9ff');
  hull.addColorStop(1, '#0ea5a4');
  ctx.fillStyle = hull;
  ctx.shadowColor = 'rgba(96, 243, 255, 0.42)';
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#dffaff';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.fillStyle = '#082f49';
  ctx.beginPath();
  ctx.moveTo(stats.radius * 0.22, 0);
  ctx.lineTo(-stats.radius * 0.3, -stats.radius * 0.38);
  ctx.lineTo(-stats.radius * 0.5, 0);
  ctx.lineTo(-stats.radius * 0.3, stats.radius * 0.38);
  ctx.closePath();
  ctx.fill();

  if (upgrades.cannon > 0) {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 3;
    const wingOffset = 6 + upgrades.cannon * 2;
    ctx.beginPath();
    ctx.moveTo(4, -wingOffset);
    ctx.lineTo(stats.radius + 3, -wingOffset);
    ctx.moveTo(4, wingOffset);
    ctx.lineTo(stats.radius + 3, wingOffset);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBullets() {
  for (const bullet of bullets) {
    ctx.strokeStyle = bullet.color;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(bullet.prevX, bullet.prevY);
    ctx.lineTo(bullet.x, bullet.y);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = applyAlpha(particle.color, alpha);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

function applyAlpha(hexColor, alpha) {
  if (!hexColor.startsWith('#')) return hexColor;
  const value = hexColor.slice(1);
  const normalized = value.length === 3
    ? value.split('').map((part) => part + part).join('')
    : value;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawPickups() {
  for (const pickup of pickups) {
    const config = pickup.kind === 'mineral' ? MINERAL_TYPES[pickup.key] : UTILITY_DROPS[pickup.key];
    ctx.save();
    ctx.translate(pickup.x, pickup.y + Math.sin(pickup.bob) * 2.4);
    ctx.rotate(pickup.spin);
    ctx.shadowColor = config.glow;
    ctx.shadowBlur = 12;
    if (pickup.kind === 'mineral') {
      ctx.beginPath();
      ctx.moveTo(0, -pickup.radius);
      ctx.lineTo(pickup.radius * 0.72, -pickup.radius * 0.18);
      ctx.lineTo(pickup.radius * 0.42, pickup.radius);
      ctx.lineTo(-pickup.radius * 0.42, pickup.radius);
      ctx.lineTo(-pickup.radius * 0.72, -pickup.radius * 0.18);
      ctx.closePath();
      ctx.fillStyle = config.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    } else {
      ctx.fillStyle = config.color;
      ctx.fillRect(-pickup.radius * 0.8, -pickup.radius * 0.8, pickup.radius * 1.6, pickup.radius * 1.6);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-pickup.radius * 0.8, -pickup.radius * 0.8, pickup.radius * 1.6, pickup.radius * 1.6);
      ctx.beginPath();
      ctx.moveTo(0, -pickup.radius * 0.46);
      ctx.lineTo(0, pickup.radius * 0.46);
      ctx.moveTo(-pickup.radius * 0.46, 0);
      ctx.lineTo(pickup.radius * 0.46, 0);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawUfo() {
  if (!ufo) return;

  ctx.save();
  ctx.translate(ufo.x, ufo.y);
  const body = ctx.createLinearGradient(0, -UFO_RADIUS, 0, UFO_RADIUS);
  body.addColorStop(0, '#fecdd3');
  body.addColorStop(1, '#f472b6');
  ctx.fillStyle = body;
  ctx.strokeStyle = '#ffe4e6';
  ctx.lineWidth = 1.8;
  ctx.shadowColor = 'rgba(244, 114, 182, 0.46)';
  ctx.shadowBlur = 14;

  ctx.beginPath();
  ctx.ellipse(0, 2, UFO_RADIUS, UFO_RADIUS * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, -5, UFO_RADIUS * 0.56, UFO_RADIUS * 0.34, 0, Math.PI, 0);
  ctx.fillStyle = '#fdf2f8';
  ctx.fill();
  ctx.restore();
}

function drawUfoBullets() {
  ctx.fillStyle = '#fb7185';
  ctx.shadowColor = '#fb7185';
  ctx.shadowBlur = 8;
  for (const bullet of ufoBullets) {
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function drawWaveBanner() {
  if (waveBannerTimer <= 0) return;
  const alpha = clamp(waveBannerTimer / 800, 0, 1);
  ctx.save();
  ctx.fillStyle = `rgba(216, 252, 255, ${alpha})`;
  ctx.font = '16px var(--font-pixel, monospace)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.shadowColor = 'rgba(103, 232, 249, 0.4)';
  ctx.shadowBlur = 12;
  ctx.fillText(`WAVE ${wave}`, CANVAS_W / 2, 22);
  ctx.restore();
}

function draw() {
  drawBackground();
  drawAsteroids();
  drawPickups();
  drawBullets();
  drawUfo();
  drawUfoBullets();
  drawParticles();
  drawShip();
  drawWaveBanner();
}

function gameLoop(timestamp) {
  if (!running) return;
  const dt = Math.min(timestamp - lastTime, 50);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

function resetOverlayToStart() {
  overlayTitle.textContent = 'VOID DRIFTER';
  overlayMessage.innerHTML =
    'Rotate with Left/Right or A/D. Burn forward with Up or W.<br>' +
    'Crack asteroids, scoop the mineral drops, then spend salvage in the dock between rounds.';
  overlaySummary.hidden = true;
  overlayRank.hidden = true;
  shopPanel.hidden = true;
  difficultySelector.style.display = 'flex';
  startBtn.textContent = 'START GAME';
}

document.addEventListener('keydown', (event) => {
  keys[event.key] = true;

  if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
  }

  if (shopOpen) {
    const quickBuys = {
      '1': 'pulse',
      '2': 'engine',
      '3': 'tractor',
      '4': 'shield',
      '5': 'repair',
    };
    if (quickBuys[event.key]) {
      event.preventDefault();
      attemptPurchaseByKey(quickBuys[event.key]);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      continueFromShop();
      return;
    }
  }

  if ((event.key === 'q' || event.key === 'Q') && !shopOpen) {
    autoFireEnabled = !autoFireEnabled;
    if (!autoFireEnabled) keys[' '] = false;
    const button = document.getElementById('autofire-btn');
    if (button) {
      button.classList.toggle('active', autoFireEnabled);
      button.textContent = autoFireEnabled ? 'AUTO*' : 'AUTO';
    }
  }
});

document.addEventListener('keyup', (event) => {
  keys[event.key] = false;
});

startBtn.addEventListener('click', () => {
  if (shopOpen) {
    continueFromShop();
    return;
  }

  resetOverlayToStart();
  startGame();
});

shopItemsEl.addEventListener('click', (event) => {
  const button = event.target.closest('[data-shop-key]');
  if (!button) return;
  attemptPurchaseByKey(button.dataset.shopKey);
});

const autoFireBtn = document.getElementById('autofire-btn');
if (autoFireBtn) {
  autoFireBtn.addEventListener('click', () => {
    autoFireEnabled = !autoFireEnabled;
    if (!autoFireEnabled) keys[' '] = false;
    autoFireBtn.classList.toggle('active', autoFireEnabled);
    autoFireBtn.textContent = autoFireEnabled ? 'AUTO*' : 'AUTO';
  });
}

function initDifficultySelector() {
  const buttons = document.querySelectorAll('#difficulty-selector .diff-btn');
  buttons.forEach((button) => {
    if (button.dataset.difficulty === currentDifficulty) button.classList.add('diff-active');
    button.addEventListener('click', () => {
      buttons.forEach((other) => other.classList.remove('diff-active'));
      button.classList.add('diff-active');
      setDifficulty(button.dataset.difficulty);
      lives = activeDiff.maxLives;
      updateHud();
    });
  });
}

initDifficultySelector();
updateHud();
resetOverlayToStart();

window.voidDrifterDebug = {
  forceShop() {
    if (!running) startGame();
    asteroids = [];
    enterUpgradeShop();
    return { wave, credits, shopOpen };
  },
  getState() {
    return {
      running,
      gameOver,
      shopOpen,
      wave,
      score,
      credits,
      lives,
      shieldCharges,
      upgrades: { ...upgrades },
      cargo: { ...cargoInventory },
      asteroidCount: asteroids.length,
      pickupCount: pickups.length,
    };
  },
};
