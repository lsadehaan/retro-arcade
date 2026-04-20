const CANVAS_W = 700;
const CANVAS_H = 520;
const FULL_CIRCLE = Math.PI * 2;

const BASE_SHIP = {
  radius: 18,
  rotationSpeed: 0.05,
  thrust: 0.048,
  friction: 0.986,
  maxSpeed: 2.8,
  bulletSpeed: 6.4,
  bulletLife: 52,
  bulletRadius: 2.6,
  maxBullets: 9,
  fireCooldown: 255,
};

const PARTICLE_LIFE = 34;
const PICKUP_LIFE = 9000;
const ROUND_CLEAR_DELAY = 1400;
const OVERDRIVE_TIME = 6000;
const SHIELD_GRACE_TIME = 600;
const UFO_INTERVAL_MIN = 18000;
const UFO_INTERVAL_MAX = 30000;
const UFO_SPEED = 1.8;
const UFO_FIRE_RATE = 1650;
const UFO_RADIUS = 18;
const UFO_POINTS = 200;
const UFO_BULLET_SPEED = 3.9;

const DIFFICULTY_CONFIG = {
  easy: { label: 'EASY', maxLives: 5, asteroidSpeedMult: 0.4, invulnTime: 3200, startingAsteroids: 2 },
  normal: { label: 'NORMAL', maxLives: 3, asteroidSpeedMult: 0.55, invulnTime: 2600, startingAsteroids: 2 },
  hard: { label: 'HARD', maxLives: 2, asteroidSpeedMult: 0.75, invulnTime: 2000, startingAsteroids: 3 },
};

const ASTEROID_SIZES = {
  large: { radius: 46, points: 25, speed: 0.52, children: 'medium', utilityChance: 0.04, mineralCount: [2, 3], drawSize: 96 },
  medium: { radius: 28, points: 55, speed: 0.86, children: 'small', utilityChance: 0.07, mineralCount: [1, 2], drawSize: 64 },
  small: { radius: 15, points: 110, speed: 1.18, children: null, utilityChance: 0.1, mineralCount: [1, 2], drawSize: 32 },
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

const PIXEL_STYLE = {
  shipSize: 32,
  ufoSize: 48,
};

const SPRITE_PATHS = {
  ship: rangePaths('ship', 48),
  thrust: rangePaths('thrust', 48),
  asteroid: {
    large: rangePaths('asteroid-large', 60),
    medium: rangePaths('asteroid-medium', 40),
    small: rangePaths('asteroid-small', 20),
  },
  explosion: rangePaths('explosion', 12),
  shipExplosion: rangePaths('ship-explosion', 21),
  ufo: rangePaths('ufo', 40),
  shield: rangePaths('shield', 2),
};

let currentDifficulty = localStorage.getItem('asteroids-difficulty') || 'normal';
let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];

function setDifficulty(value) {
  currentDifficulty = value;
  activeDiff = DIFFICULTY_CONFIG[value];
  localStorage.setItem('asteroids-difficulty', value);
}

function rangePaths(group, count) {
  return Array.from({ length: count }, (_, index) => `assets/${group}/${index}.png`);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${src}`));
    image.src = src;
  });
}

async function loadSpriteSets() {
  const [ship, thrust, explosion, shipExplosion, ufo, shield] = await Promise.all([
    Promise.all(SPRITE_PATHS.ship.map(loadImage)),
    Promise.all(SPRITE_PATHS.thrust.map(loadImage)),
    Promise.all(SPRITE_PATHS.explosion.map(loadImage)),
    Promise.all(SPRITE_PATHS.shipExplosion.map(loadImage)),
    Promise.all(SPRITE_PATHS.ufo.map(loadImage)),
    Promise.all(SPRITE_PATHS.shield.map(loadImage)),
  ]);
  const [large, medium, small] = await Promise.all([
    Promise.all(SPRITE_PATHS.asteroid.large.map(loadImage)),
    Promise.all(SPRITE_PATHS.asteroid.medium.map(loadImage)),
    Promise.all(SPRITE_PATHS.asteroid.small.map(loadImage)),
  ]);

  return {
    ship,
    thrust,
    asteroid: { large, medium, small },
    explosion,
    shipExplosion,
    ufo,
    shield,
  };
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

ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

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
let effects = [];
let upgrades = createUpgradeState();
let cargoInventory = createCargoInventory();
let currentWaveSalvage = createWaveSalvage();
let spriteAssets = null;
let spritesReady = false;
let spriteLoadError = null;

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

function normalizeAngle(angle) {
  return ((angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

function rotationFrame(angle, frameCount) {
  return Math.round(normalizeAngle(angle + Math.PI / 2) / FULL_CIRCLE * frameCount) % frameCount;
}

function cycleFrame(elapsed, frameCount, frameDuration) {
  return Math.floor(elapsed / frameDuration) % frameCount;
}

function drawCenteredSprite(image, x, y, width, height, alpha = 1) {
  if (!image) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    Math.round(x - width / 2),
    Math.round(y - height / 2),
    width,
    height
  );
  ctx.restore();
}

function addEffect(type, x, y, size) {
  effects.push({ type, x, y, size, elapsed: 0 });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const effect = effects[i];
    effect.elapsed += dt;
    const ttl = effect.type === 'shield' ? 180 : effect.type === 'shipExplosion' ? 630 : 360;
    if (effect.elapsed >= ttl) effects.splice(i, 1);
  }
}

function getShipStats() {
  const engineMult = 1 + upgrades.engine * 0.09;
  const overdriveShots = shotBoostTimer > 0 ? 1 : 0;
  const projectiles = Math.min(3, 1 + (upgrades.cannon >= 2 ? 1 : 0) + overdriveShots);
  return {
    radius: BASE_SHIP.radius,
    rotationSpeed: BASE_SHIP.rotationSpeed * (1 + upgrades.engine * 0.045),
    thrust: BASE_SHIP.thrust * engineMult,
    friction: BASE_SHIP.friction,
    maxSpeed: BASE_SHIP.maxSpeed * (1 + upgrades.engine * 0.06),
    bulletSpeed: BASE_SHIP.bulletSpeed + upgrades.cannon * 0.15 + upgrades.engine * 0.05,
    bulletLife: BASE_SHIP.bulletLife,
    bulletRadius: BASE_SHIP.bulletRadius,
    maxBullets: BASE_SHIP.maxBullets + Math.min(upgrades.cannon, 2),
    fireCooldown: BASE_SHIP.fireCooldown / (1 + upgrades.cannon * 0.08 + (shotBoostTimer > 0 ? 0.14 : 0)),
    projectiles,
    pickupRadius: 18 + upgrades.tractor * 5,
    magnetRadius: 56 + upgrades.tractor * 14,
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
  loadoutEl.textContent = `GUN ${toRoman(1 + upgrades.cannon)} • ENG ${upgrades.engine + 1} • TR ${upgrades.tractor} • SH ${shieldCharges}${shotBoostTimer > 0 ? ' • OD' : ''}`;
  waveEl.textContent = String(Math.max(1, wave));
  updateLivesDisplay();
  return stats;
}

function updateLivesDisplay() {
  livesEl.textContent = `1UP x${lives}`;
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
  waveBannerTimer = 1600;
  if (wave > 1) sfx.play('levelup');

  const count = activeDiff.startingAsteroids + Math.ceil((wave - 1) * 0.75);
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
    const speed = ASTEROID_SIZES.large.speed + Math.min((wave - 1) * 0.03, 0.22);
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
      { value: 'repair', weight: 40 },
      { value: 'shield', weight: 38 },
      { value: 'overdrive', weight: 22 },
    ]);
    pickups.push(createPickup('utility', utilityKey, asteroid.x, asteroid.y, 10, 0.85));
  }
}

function destroyAsteroid(index) {
  const asteroid = asteroids[index];
  const def = ASTEROID_SIZES[asteroid.size];
  const mineral = MINERAL_TYPES[asteroid.core];

  dropAsteroidRewards(asteroid);
  addEffect('explosion', asteroid.x, asteroid.y, def.drawSize);
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
        const pull = (1 - distance / shipStats.magnetRadius) * (0.08 + upgrades.tractor * 0.04);
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
  addEffect('shield', x, y, 56);
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
  addEffect('shipExplosion', ship.x, ship.y, 72);
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
  addEffect('explosion', ufo.x, ufo.y, 72);
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
      description: 'Tightens cadence; later tiers add a second firing lane.',
      level: `MK ${toRoman(1 + upgrades.cannon)}`,
      maxed: upgrades.cannon >= 3,
      cost: 58 + upgrades.cannon * 46,
      disabled: upgrades.cannon >= 3 || credits < 58 + upgrades.cannon * 46,
      buy() {
        if (upgrades.cannon >= 3) return false;
        const cost = 58 + upgrades.cannon * 46;
        if (credits < cost) return false;
        credits -= cost;
        upgrades.cannon += 1;
        sfx.play('powerup');
        return `Pulse Cannons tuned to MK ${toRoman(1 + upgrades.cannon)}.`;
      },
    },
    {
      key: 'engine',
      hotkey: '2',
      label: 'Afterburners',
      description: 'Small gains to thrust, turn response, and drift speed.',
      level: `T${upgrades.engine}`,
      maxed: upgrades.engine >= 3,
      cost: 44 + upgrades.engine * 34,
      disabled: upgrades.engine >= 3 || credits < 44 + upgrades.engine * 34,
      buy() {
        if (upgrades.engine >= 3) return false;
        const cost = 44 + upgrades.engine * 34;
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
      description: 'Widens salvage pickup and adds a gentler magnetic pull.',
      level: `T${upgrades.tractor}`,
      maxed: upgrades.tractor >= 2,
      cost: 40 + upgrades.tractor * 32,
      disabled: upgrades.tractor >= 2 || credits < 40 + upgrades.tractor * 32,
      buy() {
        if (upgrades.tractor >= 2) return false;
        const cost = 40 + upgrades.tractor * 32;
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
      description: 'Adds one starting shield per wave and grants one now.',
      level: `T${upgrades.shield}`,
      maxed: upgrades.shield >= 2,
      cost: 72 + upgrades.shield * 46,
      disabled: upgrades.shield >= 2 || credits < 72 + upgrades.shield * 46,
      buy() {
        if (upgrades.shield >= 2) return false;
        const cost = 72 + upgrades.shield * 46;
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
      description: 'Restore one hull point before the next wave launches.',
      level: lives < activeDiff.maxLives ? `${lives}/${activeDiff.maxLives}` : 'Full',
      maxed: lives >= activeDiff.maxLives,
      cost: 30 + wave * 7,
      disabled: lives >= activeDiff.maxLives || credits < 30 + wave * 7,
      buy() {
        const cost = 30 + wave * 7;
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
      `<div class="shop-item-meta"><span>Cost ${formatThousands(item.cost)}</span><span>${item.maxed ? 'MAX' : item.level}</span></div>`;
    shopItemsEl.appendChild(button);
  }
}

function renderSummaryTiles(items) {
  return `<div class="summary-grid">${items.map((item) => (
    `<div class="summary-tile"><span class="summary-kicker">${item.label}</span><span class="summary-value">${item.value}</span></div>`
  )).join('')}</div>`;
}

function renderSalvageSummary() {
  const minerals = Object.entries(MINERAL_TYPES)
    .map(([key, config]) => (currentWaveSalvage.minerals[key] > 0 ? `${config.label} ${currentWaveSalvage.minerals[key]}` : null))
    .filter(Boolean)
    .join(' • ');
  const utilities = currentWaveSalvage.utility.length ? currentWaveSalvage.utility.join(', ') : 'None';
  return renderSummaryTiles([
    { label: `Wave ${wave} Banked`, value: `${formatThousands(currentWaveSalvage.credits)} credits` },
    { label: 'Recovered Ore', value: minerals || 'No recovered ore' },
    { label: 'Special Pickups', value: utilities },
  ]);
}

function renderRunSummary() {
  const upgradesSummary = `Cannons MK ${toRoman(1 + upgrades.cannon)} • Engine ${upgrades.engine + 1} • Tractor ${upgrades.tractor} • Shield ${upgrades.shield}`;
  return renderSummaryTiles([
    { label: 'Unspent Credits', value: formatThousands(credits) },
    { label: 'Cargo Hold', value: summarizeCargo() },
    { label: 'Final Loadout', value: upgradesSummary },
  ]);
}

function enterUpgradeShop() {
  if (shopOpen || gameOver) return;
  shopOpen = true;
  overlayState = 'shop';
  overlay.style.display = 'flex';
  overlayTitle.textContent = 'UPGRADE DOCK';
  overlayMessage.textContent = `Wave ${wave} secured. Bank salvage, buy upgrades, then launch the next sortie.`;
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
  if (!spritesReady) return;
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
  effects = [];
  ufoTimer = 0;
  nextUfoTime = rand(UFO_INTERVAL_MIN, UFO_INTERVAL_MAX);
  cargoInventory = createCargoInventory();
  currentWaveSalvage = createWaveSalvage();
  upgrades = createUpgradeState();
  ship = createShip();

  overlayTitle.textContent = 'VOID DRIFTER';
  overlayMessage.textContent = 'Short bursts. Clear rocks, gather salvage, and rearm between waves.';
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
    updateEffects(dt);
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
  updateEffects(dt);
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
  const time = performance.now() * 0.0022;
  ctx.fillStyle = '#040608';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = 'rgba(27, 35, 48, 0.85)';
  for (let y = 0; y < CANVAS_H; y += 8) {
    ctx.fillRect(0, y, CANVAS_W, 1);
  }

  for (const star of stars) {
    const alpha = star.alpha + Math.sin(time * star.drift + star.phase) * 0.18;
    const size = star.radius > 1 ? 2 : 1;
    ctx.fillStyle = applyAlpha('#f7f3d6', clamp(alpha, 0.08, 0.9));
    ctx.fillRect(Math.round(star.x), Math.round(star.y), size, size);
  }
}

function drawAsteroids() {
  for (const asteroid of asteroids) {
    const frames = spriteAssets?.asteroid?.[asteroid.size];
    const frame = frames?.[Math.round(normalizeAngle(asteroid.rotAngle) / FULL_CIRCLE * frames.length) % frames.length];
    drawCenteredSprite(frame, asteroid.x, asteroid.y, ASTEROID_SIZES[asteroid.size].drawSize, ASTEROID_SIZES[asteroid.size].drawSize);
  }
}

function drawShip() {
  if (!ship || !ship.visible || !spriteAssets) return;

  const frame = rotationFrame(ship.angle, spriteAssets.ship.length);
  if (ship.thrusting) {
    drawCenteredSprite(spriteAssets.thrust[frame], ship.x, ship.y, PIXEL_STYLE.shipSize, PIXEL_STYLE.shipSize);
  }
  drawCenteredSprite(spriteAssets.ship[frame], ship.x, ship.y, PIXEL_STYLE.shipSize, PIXEL_STYLE.shipSize);

  if (shieldCharges > 0 || ship.invulnerable) {
    const shieldFrame = cycleFrame(performance.now(), spriteAssets.shield.length, 80);
    drawCenteredSprite(spriteAssets.shield[shieldFrame], ship.x, ship.y, 54, 54, shieldCharges > 0 ? 0.95 : 0.55);
  }
}

function drawBullets() {
  for (const bullet of bullets) {
    const dx = bullet.x - bullet.prevX;
    const dy = bullet.y - bullet.prevY;
    const angle = Math.atan2(dy || bullet.vy, dx || bullet.vx);
    ctx.save();
    ctx.translate(Math.round(bullet.x), Math.round(bullet.y));
    ctx.rotate(angle);
    ctx.fillStyle = bullet.color;
    ctx.fillRect(-6, -1, 8, 2);
    ctx.fillRect(-1, -2, 2, 4);
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = particle.life / particle.maxLife;
    ctx.fillStyle = applyAlpha(particle.color, alpha);
    const size = Math.max(1, Math.round(particle.radius * alpha));
    ctx.fillRect(Math.round(particle.x), Math.round(particle.y), size, size);
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
    const x = Math.round(pickup.x);
    const y = Math.round(pickup.y + Math.sin(pickup.bob) * 2.4);
    const size = pickup.kind === 'mineral' ? 10 : 12;
    ctx.fillStyle = config.color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
    ctx.fillStyle = '#f5f1e4';
    ctx.fillRect(x - 1, y - size / 2, 2, size);
    if (pickup.kind === 'utility') {
      ctx.fillRect(x - size / 2, y - 1, size, 2);
    }
  }
}

function drawUfo() {
  if (!ufo || !spriteAssets) return;

  const frame = cycleFrame(performance.now(), spriteAssets.ufo.length, 100);
  drawCenteredSprite(spriteAssets.ufo[frame], ufo.x, ufo.y, PIXEL_STYLE.ufoSize, PIXEL_STYLE.ufoSize);
}

function drawUfoBullets() {
  for (const bullet of ufoBullets) {
    ctx.fillStyle = '#ff6584';
    ctx.fillRect(Math.round(bullet.x) - 2, Math.round(bullet.y) - 2, 4, 4);
  }
}

function drawEffects() {
  if (!spriteAssets) return;
  for (const effect of effects) {
    if (effect.type === 'shield') {
      const frame = cycleFrame(effect.elapsed, spriteAssets.shield.length, 70);
      drawCenteredSprite(spriteAssets.shield[frame], effect.x, effect.y, effect.size, effect.size, 0.85);
      continue;
    }

    const frames = effect.type === 'shipExplosion' ? spriteAssets.shipExplosion : spriteAssets.explosion;
    const frameDuration = effect.type === 'shipExplosion' ? 30 : 30;
    const frame = frames[Math.min(frames.length - 1, Math.floor(effect.elapsed / frameDuration))];
    drawCenteredSprite(frame, effect.x, effect.y, effect.size, effect.size);
  }
}

function drawWaveBanner() {
  if (waveBannerTimer <= 0) return;
  const alpha = clamp(waveBannerTimer / 800, 0, 1);
  ctx.save();
  ctx.fillStyle = applyAlpha('#0f141b', alpha * 0.9);
  ctx.fillRect(CANVAS_W / 2 - 108, 12, 216, 28);
  ctx.strokeStyle = applyAlpha('#c79c46', alpha);
  ctx.strokeRect(CANVAS_W / 2 - 108, 12, 216, 28);
  ctx.fillStyle = applyAlpha('#f7f3d6', alpha);
  ctx.font = '14px var(--font-pixel, monospace)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`WAVE ${wave}`, CANVAS_W / 2, 26);
  ctx.restore();
}

function draw() {
  drawBackground();
  drawAsteroids();
  drawPickups();
  drawBullets();
  drawUfo();
  drawUfoBullets();
  drawEffects();
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
  overlayMessage.textContent = spritesReady
    ? 'Short bursts. Clear rocks, gather salvage, and rearm between waves.'
    : 'Sprite pack loading. Stand by.';
  overlaySummary.hidden = true;
  overlayRank.hidden = true;
  shopPanel.hidden = true;
  difficultySelector.style.display = 'flex';
  startBtn.textContent = spritesReady ? 'START GAME' : 'LOADING SPRITES';
  startBtn.disabled = !spritesReady;
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

loadSpriteSets()
  .then((assets) => {
    spriteAssets = assets;
    spritesReady = true;
    spriteLoadError = null;
    resetOverlayToStart();
    overlayRank.hidden = false;
    overlayRank.textContent = 'Maelstrom sprite pack ready.';
    setTimeout(() => {
      if (overlayState === 'start') {
        overlayRank.hidden = true;
      }
    }, 1200);
    draw();
  })
  .catch((error) => {
    console.error('Sprite load failed:', error);
    spriteLoadError = error;
    spritesReady = false;
    overlayRank.hidden = false;
    overlayRank.textContent = 'Sprite pack failed to load.';
    overlayMessage.textContent = 'Refresh to retry sprite loading.';
    startBtn.disabled = true;
    startBtn.textContent = 'SPRITES MISSING';
  });

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
