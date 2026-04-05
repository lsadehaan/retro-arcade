/**
 * Neon Hopper — Frogger variant
 * Grid-based lane crossing: dodge vehicles, ride logs, fill 5 safe zones.
 * Neon aesthetic with purple frog, glowing vehicles, and neon river.
 */

const CANVAS_W = 700;
const CANVAS_H = 520;

// Grid dimensions
const COLS = 14;
const ROWS = 13;
const CELL_W = CANVAS_W / COLS;  // 50
const CELL_H = CANVAS_H / ROWS;  // 40

// Row layout (bottom=0, top=12):
// Row 0:  start zone (safe)
// Row 1-5: road lanes (vehicles)
// Row 6:  median/safe zone
// Row 7-11: river lanes (logs/lily pads)
// Row 12: safe zone slots at top

const ROW_START = 0;
const ROW_ROAD_MIN = 1;
const ROW_ROAD_MAX = 5;
const ROW_MEDIAN = 6;
const ROW_RIVER_MIN = 7;
const ROW_RIVER_MAX = 11;
const ROW_GOAL = 12;

// Colors
const COLOR_FROG = '#cc44ff';
const COLOR_FROG_GLOW = 'rgba(204,68,255,0.5)';
const COLOR_ROAD = '#1a1a2e';
const COLOR_MEDIAN = '#222244';
const COLOR_WATER = '#0a0a30';
const COLOR_WATER_GLOW = 'rgba(0,100,255,0.15)';
const COLOR_START = '#111122';
const COLOR_GOAL_BG = '#0d0d22';
const COLOR_GOAL_SLOT = '#224400';
const COLOR_GOAL_FILLED = '#00ff66';
const COLOR_LOG = '#33cc33';
const COLOR_LOG_GLOW = 'rgba(51,204,51,0.3)';
const COLOR_LILYPAD = '#22aa44';

const VEHICLE_COLORS = ['#ff3333', '#ff8800', '#ffff00', '#00ccff', '#ff44aa'];

const MAX_LIVES = 3;
const POINTS_PER_ROW = 10;
const POINTS_SAFE_ZONE = 50;
const TIME_BONUS_MULT = 5;

// ── Difficulty config ───────────────────────────────────────────────────────

const DIFFICULTY_CONFIG = {
  easy:   { label: 'EASY',   speedMult: 0.7, hitboxMult: 1.4, baseTimer: 40 },
  normal: { label: 'NORMAL', speedMult: 1.0, hitboxMult: 1.0, baseTimer: 30 },
  hard:   { label: 'HARD',   speedMult: 1.4, hitboxMult: 0.7, baseTimer: 20 },
};

let currentDifficulty = localStorage.getItem('hopper-difficulty') || 'normal';
// Cached config — updated when difficulty changes, avoids per-frame lookups
let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];

function setDifficulty(diff) {
  currentDifficulty = diff;
  activeDiff = DIFFICULTY_CONFIG[diff];
  localStorage.setItem('hopper-difficulty', diff);
}

// ── Haptic feedback ────────────────────────────────────────────────────────

function hapticPulse(ms) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

// ── Canvas & state ──────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');

const hudScore = document.getElementById('score');
const hudLives = document.getElementById('lives');
const hudLevel = document.getElementById('level');
const hudTime = document.getElementById('time');

let gameState = 'idle'; // idle | playing | dead | gameover
let score = 0;
let lives = MAX_LIVES;
let level = 1;
let timer = 30;
let lastTimestamp = 0;
let highestRow = 0; // tracks furthest row this life (for forward-only scoring)

// Frog position (grid coords)
let frogCol = 0;
let frogRow = 0;

// Safe zone slots (5 slots, evenly spaced at top row)
let safeSlots = [];
const SAFE_SLOT_COUNT = 5;
const SAFE_SLOT_COLS = [1, 4, 7, 10, 13]; // column centers for the 5 slots

// Lane definitions (populated per level)
let lanes = [];

// Input debounce — one hop per keypress
let hopLock = false;

// ── Lane class ──────────────────────────────────────────────────────────────

class Lane {
  constructor(row, type, speed, objects) {
    this.row = row;
    this.type = type; // 'road' | 'river'
    this.speed = speed; // pixels per second, negative = left
    this.objects = objects; // array of { x, width, color }
  }
}

// ── Level generation ────────────────────────────────────────────────────────

function generateLanes(lvl) {
  const result = [];
  const diff = activeDiff;
  const speedMult = (1 + (lvl - 1) * 0.15) * diff.speedMult;

  // Road lanes (rows 1-5)
  const roadSpeeds = [60, 80, 50, 90, 70];
  const roadDirs = [1, -1, 1, -1, 1];

  for (let i = 0; i < 5; i++) {
    const row = ROW_ROAD_MIN + i;
    const speed = roadSpeeds[i] * speedMult * roadDirs[i];
    const objects = [];
    const isTruck = i % 2 === 1;
    const objWidth = isTruck ? CELL_W * 2 : CELL_W;
    const count = isTruck ? 3 : 4;
    const gap = CANVAS_W / count;

    for (let j = 0; j < count; j++) {
      objects.push({
        x: j * gap,
        width: objWidth,
        color: VEHICLE_COLORS[i % VEHICLE_COLORS.length],
        isTruck: isTruck,
      });
    }

    result.push(new Lane(row, 'road', speed, objects));
  }

  // River lanes (rows 7-11)
  const riverSpeeds = [45, 65, 40, 55, 50];
  const riverDirs = [-1, 1, -1, 1, -1];

  for (let i = 0; i < 5; i++) {
    const row = ROW_RIVER_MIN + i;
    const speed = riverSpeeds[i] * speedMult * riverDirs[i];
    const objects = [];

    // Fewer/smaller logs at higher levels
    const logSizeBase = (i % 2 === 0) ? 3 : 2;
    const logSize = Math.max(1.5, logSizeBase - (lvl - 1) * 0.15);
    const logWidth = CELL_W * logSize;
    const count = (i % 2 === 0) ? 3 : 4;
    const gap = CANVAS_W / count;

    for (let j = 0; j < count; j++) {
      objects.push({
        x: j * gap + Math.random() * 20,
        width: logWidth,
        color: (j % 3 === 0) ? COLOR_LILYPAD : COLOR_LOG,
        isLog: true,
      });
    }

    result.push(new Lane(row, 'river', speed, objects));
  }

  return result;
}

// ── Game init / reset ───────────────────────────────────────────────────────

function resetFrog() {
  frogCol = Math.floor(COLS / 2);
  frogRow = ROW_START;
  highestRow = 0;
}

function initLevel() {
  lanes = generateLanes(level);
  safeSlots = new Array(SAFE_SLOT_COUNT).fill(false);
  resetFrog();
  timer = activeDiff.baseTimer;
}

function startGame() {
  score = 0;
  lives = MAX_LIVES;
  level = 1;
  gameState = 'playing';
  initLevel();
  overlay.style.display = 'none';
  updateHUD();
  sfx.play('start');
  lastTimestamp = performance.now();
  requestAnimationFrame(gameLoop);
}

function showGameOver() {
  gameState = 'gameover';
  sfx.play('gameover');
  overlay.querySelector('h2').textContent = 'GAME OVER';
  const diffLabel = activeDiff.label;
  overlay.querySelector('p').innerHTML =
    'Final Score: ' + score.toLocaleString() + '<br>Level: ' + level +
    '<br>Difficulty: ' + diffLabel +
    '<br><br>Press START to try again';
  startBtn.textContent = 'PLAY AGAIN';
  overlay.style.display = 'flex';
  // Re-show difficulty selector
  const diffSelector = document.getElementById('difficulty-selector');
  if (diffSelector) diffSelector.style.display = 'flex';
  submitScore();
}

function die() {
  lives--;
  sfx.play('damage');
  hapticPulse(150); // longer vibration on death
  updateHUD();
  if (lives <= 0) {
    showGameOver();
    return;
  }
  gameState = 'dead';
  // Brief flash then reset frog
  setTimeout(() => {
    if (gameState === 'dead') {
      resetFrog();
      timer = activeDiff.baseTimer;
      highestRow = 0;
      gameState = 'playing';
    }
  }, 600);
}

// ── HUD ─────────────────────────────────────────────────────────────────────

function updateHUD() {
  hudScore.textContent = score;
  hudLevel.textContent = level;
  hudTime.textContent = Math.ceil(timer);
  const lifeStr = '\u2733'.repeat(Math.max(0, lives));
  hudLives.textContent = lifeStr || 'NONE';
}

// ── Input ───────────────────────────────────────────────────────────────────

const keys = {};

document.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
    e.preventDefault();
  }

  const key = e.key;
  if (keys[key]) return; // already held
  keys[key] = true;

  handleHop(key);
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

function handleHop(key) {
  let dr = 0, dc = 0;
  if (key === 'ArrowUp' || key === 'w' || key === 'W') dr = 1;
  else if (key === 'ArrowDown' || key === 's' || key === 'S') dr = -1;
  else if (key === 'ArrowLeft' || key === 'a' || key === 'A') dc = -1;
  else if (key === 'ArrowRight' || key === 'd' || key === 'D') dc = 1;
  else return;

  const newRow = frogRow + dr;
  const newCol = frogCol + dc;

  if (newCol < 0 || newCol >= COLS) return;
  if (newRow < ROW_START || newRow > ROW_GOAL) return;

  frogRow = newRow;
  frogCol = newCol;

  hapticPulse(20); // short pulse on hop

  // Forward progress scoring
  if (frogRow > highestRow) {
    score += POINTS_PER_ROW * (frogRow - highestRow);
    highestRow = frogRow;
  }
}

// ── Swipe detection ────────────────────────────────────────────────────────

(function initSwipeDetection() {
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;
  const MIN_SWIPE_DIST = 30;
  const MAX_SWIPE_TIME = 400; // ms

  canvas.addEventListener('touchstart', (e) => {
    if (gameState !== 'playing') return;
    const t = e.touches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
    touchStartTime = Date.now();
  }, { passive: true });

  canvas.addEventListener('touchend', (e) => {
    if (gameState !== 'playing') return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;
    const elapsed = Date.now() - touchStartTime;

    if (elapsed > MAX_SWIPE_TIME) return;

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < MIN_SWIPE_DIST && absDy < MIN_SWIPE_DIST) return;

    let key;
    if (absDx > absDy) {
      key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
    } else {
      key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
    }

    handleHop(key);
  }, { passive: true });
})();

// ── Collision detection ─────────────────────────────────────────────────────

function getFrogPixelX() {
  return frogCol * CELL_W + CELL_W / 2;
}

function getFrogPixelY() {
  return CANVAS_H - (frogRow + 1) * CELL_H + CELL_H / 2;
}

function getLane(row) {
  return lanes.find(l => l.row === row);
}

function checkCollisions() {
  if (gameState !== 'playing') return;

  const frogX = getFrogPixelX();
  const diff = activeDiff;
  const frogHalfW = CELL_W * 0.35;

  // Goal row — check if frog landed in a safe slot
  if (frogRow === ROW_GOAL) {
    let landed = false;
    for (let i = 0; i < SAFE_SLOT_COUNT; i++) {
      const slotCenterX = SAFE_SLOT_COLS[i] * CELL_W + CELL_W / 2;
      if (Math.abs(frogX - slotCenterX) < CELL_W * 0.8) {
        if (safeSlots[i]) {
          // Already filled — die
          die();
          return;
        }
        safeSlots[i] = true;
        landed = true;
        const timeBonus = Math.floor(timer) * TIME_BONUS_MULT;
        score += POINTS_SAFE_ZONE + timeBonus;

        // Check if all slots filled
        if (safeSlots.every(Boolean)) {
          sfx.play('levelup');
          level++;
          initLevel();
          updateHUD();
          return;
        }

        sfx.play('score');

        // Reset for next crossing
        resetFrog();
        timer = diff.baseTimer;
        highestRow = 0;
        updateHUD();
        return;
      }
    }
    // Didn't land on a slot — die (hit barrier)
    if (!landed) {
      die();
      return;
    }
  }

  // Road lanes — vehicle collision
  // Frog hitbox shrinks on easy (harder to get hit), grows on hard
  if (frogRow >= ROW_ROAD_MIN && frogRow <= ROW_ROAD_MAX) {
    const lane = getLane(frogRow);
    if (lane) {
      const vehicleHitbox = frogHalfW / diff.hitboxMult;
      for (const obj of lane.objects) {
        const objLeft = obj.x;
        const objRight = obj.x + obj.width;
        if (frogX + vehicleHitbox > objLeft && frogX - vehicleHitbox < objRight) {
          die();
          return;
        }
      }
    }
  }

  // River lanes — must be on a log or die
  // Frog hitbox grows on easy (easier to land on logs), shrinks on hard
  if (frogRow >= ROW_RIVER_MIN && frogRow <= ROW_RIVER_MAX) {
    const lane = getLane(frogRow);
    if (lane) {
      let onLog = false;
      const logHitbox = frogHalfW * diff.hitboxMult;
      for (const obj of lane.objects) {
        const objLeft = obj.x;
        const objRight = obj.x + obj.width;
        if (frogX + logHitbox > objLeft && frogX - logHitbox < objRight) {
          onLog = true;
          break;
        }
      }
      if (!onLog) {
        die();
        return;
      }
    }
  }
}

// ── Update ──────────────────────────────────────────────────────────────────

function update(dt) {
  if (gameState !== 'playing' && gameState !== 'dead') return;

  // Update timer
  if (gameState === 'playing') {
    timer -= dt;
    if (timer <= 0) {
      timer = 0;
      die();
      return;
    }
  }

  // Move lane objects
  for (const lane of lanes) {
    for (const obj of lane.objects) {
      obj.x += lane.speed * dt;

      // Wrap around
      if (lane.speed > 0 && obj.x > CANVAS_W) {
        obj.x = -obj.width;
      } else if (lane.speed < 0 && obj.x + obj.width < 0) {
        obj.x = CANVAS_W;
      }
    }
  }

  // Frog rides log (move with log velocity)
  if (gameState === 'playing' && frogRow >= ROW_RIVER_MIN && frogRow <= ROW_RIVER_MAX) {
    const lane = getLane(frogRow);
    if (lane) {
      const drift = lane.speed * dt;
      // Convert pixel drift to column drift
      frogCol += drift / CELL_W;

      // If frog drifts off screen, die
      if (frogCol < -0.5 || frogCol >= COLS + 0.5) {
        die();
        return;
      }
    }
  }

  // Check collisions
  if (gameState === 'playing') {
    checkCollisions();
  }

  updateHUD();
}

// ── Rendering ───────────────────────────────────────────────────────────────

function drawBackground() {
  // Start zone
  ctx.fillStyle = COLOR_START;
  ctx.fillRect(0, CANVAS_H - CELL_H, CANVAS_W, CELL_H);

  // Road lanes
  for (let r = ROW_ROAD_MIN; r <= ROW_ROAD_MAX; r++) {
    const y = CANVAS_H - (r + 1) * CELL_H;
    ctx.fillStyle = COLOR_ROAD;
    ctx.fillRect(0, y, CANVAS_W, CELL_H);

    // Lane dividers
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(0, y + CELL_H);
    ctx.lineTo(CANVAS_W, y + CELL_H);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Median
  ctx.fillStyle = COLOR_MEDIAN;
  ctx.fillRect(0, CANVAS_H - (ROW_MEDIAN + 1) * CELL_H, CANVAS_W, CELL_H);

  // River lanes
  for (let r = ROW_RIVER_MIN; r <= ROW_RIVER_MAX; r++) {
    const y = CANVAS_H - (r + 1) * CELL_H;
    ctx.fillStyle = COLOR_WATER;
    ctx.fillRect(0, y, CANVAS_W, CELL_H);

    // Water glow effect
    ctx.fillStyle = COLOR_WATER_GLOW;
    ctx.fillRect(0, y, CANVAS_W, CELL_H);
  }

  // Goal row
  const goalY = CANVAS_H - (ROW_GOAL + 1) * CELL_H;
  ctx.fillStyle = COLOR_GOAL_BG;
  ctx.fillRect(0, goalY, CANVAS_W, CELL_H);

  // Safe slots
  for (let i = 0; i < SAFE_SLOT_COUNT; i++) {
    const slotX = SAFE_SLOT_COLS[i] * CELL_W;
    const slotY = goalY;
    if (safeSlots[i]) {
      ctx.fillStyle = COLOR_GOAL_FILLED;
      ctx.shadowColor = COLOR_GOAL_FILLED;
      ctx.shadowBlur = 12;
      ctx.fillRect(slotX - CELL_W * 0.3, slotY + 4, CELL_W * 1.2, CELL_H - 8);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = COLOR_GOAL_SLOT;
      ctx.fillRect(slotX - CELL_W * 0.3, slotY + 4, CELL_W * 1.2, CELL_H - 8);
      // Slot border glow
      ctx.strokeStyle = 'rgba(0,255,100,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(slotX - CELL_W * 0.3, slotY + 4, CELL_W * 1.2, CELL_H - 8);
    }
  }
}

function drawLaneObjects() {
  for (const lane of lanes) {
    for (const obj of lane.objects) {
      const y = CANVAS_H - (lane.row + 1) * CELL_H;

      if (lane.type === 'road') {
        // Vehicle glow
        ctx.shadowColor = obj.color;
        ctx.shadowBlur = 10;
        ctx.fillStyle = obj.color;

        const vx = obj.x;
        const vy = y + 6;
        const vw = obj.width;
        const vh = CELL_H - 12;

        // Vehicle body
        ctx.fillRect(vx, vy, vw, vh);

        // Vehicle detail (windshield)
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 0;
        if (obj.isTruck) {
          ctx.fillRect(vx + vw * 0.7, vy + 3, vw * 0.15, vh - 6);
        } else {
          ctx.fillRect(vx + vw * 0.25, vy + 3, vw * 0.3, vh - 6);
        }
      } else {
        // Log / lily pad
        ctx.shadowColor = COLOR_LOG_GLOW;
        ctx.shadowBlur = 8;
        ctx.fillStyle = obj.color;

        const lx = obj.x;
        const ly = y + 5;
        const lw = obj.width;
        const lh = CELL_H - 10;

        // Rounded log shape
        const radius = 6;
        ctx.beginPath();
        ctx.moveTo(lx + radius, ly);
        ctx.lineTo(lx + lw - radius, ly);
        ctx.quadraticCurveTo(lx + lw, ly, lx + lw, ly + radius);
        ctx.lineTo(lx + lw, ly + lh - radius);
        ctx.quadraticCurveTo(lx + lw, ly + lh, lx + lw - radius, ly + lh);
        ctx.lineTo(lx + radius, ly + lh);
        ctx.quadraticCurveTo(lx, ly + lh, lx, ly + lh - radius);
        ctx.lineTo(lx, ly + radius);
        ctx.quadraticCurveTo(lx, ly, lx + radius, ly);
        ctx.closePath();
        ctx.fill();

        // Log grain lines
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.lineWidth = 1;
        ctx.shadowBlur = 0;
        for (let g = lx + 15; g < lx + lw - 5; g += 20) {
          ctx.beginPath();
          ctx.moveTo(g, ly + 3);
          ctx.lineTo(g, ly + lh - 3);
          ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
  }
}

function drawFrog() {
  if (gameState === 'dead') {
    // Flash effect
    if (Math.floor(performance.now() / 100) % 2 === 0) return;
  }

  const fx = frogCol * CELL_W + CELL_W / 2;
  const fy = CANVAS_H - (frogRow + 1) * CELL_H + CELL_H / 2;
  const size = CELL_W * 0.38;

  // Glow
  ctx.shadowColor = COLOR_FROG;
  ctx.shadowBlur = 15;

  // Body
  ctx.fillStyle = COLOR_FROG;
  ctx.beginPath();
  ctx.ellipse(fx, fy, size, size * 0.85, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#fff';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(fx - size * 0.35, fy - size * 0.25, 4, 0, Math.PI * 2);
  ctx.arc(fx + size * 0.35, fy - size * 0.25, 4, 0, Math.PI * 2);
  ctx.fill();

  // Pupils
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(fx - size * 0.35, fy - size * 0.2, 2, 0, Math.PI * 2);
  ctx.arc(fx + size * 0.35, fy - size * 0.2, 2, 0, Math.PI * 2);
  ctx.fill();

  // Legs (small lines)
  ctx.strokeStyle = COLOR_FROG;
  ctx.lineWidth = 3;
  ctx.shadowColor = COLOR_FROG;
  ctx.shadowBlur = 6;
  // Back legs
  ctx.beginPath();
  ctx.moveTo(fx - size * 0.6, fy + size * 0.5);
  ctx.lineTo(fx - size * 1.0, fy + size * 0.9);
  ctx.moveTo(fx + size * 0.6, fy + size * 0.5);
  ctx.lineTo(fx + size * 1.0, fy + size * 0.9);
  ctx.stroke();
  // Front legs
  ctx.beginPath();
  ctx.moveTo(fx - size * 0.5, fy - size * 0.1);
  ctx.lineTo(fx - size * 0.9, fy + size * 0.3);
  ctx.moveTo(fx + size * 0.5, fy - size * 0.1);
  ctx.lineTo(fx + size * 0.9, fy + size * 0.3);
  ctx.stroke();

  ctx.shadowBlur = 0;
}

function drawTimerBar() {
  const diff = activeDiff;
  const barWidth = CANVAS_W - 20;
  const barHeight = 4;
  const barX = 10;
  const barY = CANVAS_H - 8;
  const fillRatio = Math.max(0, timer / diff.baseTimer);

  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX, barY, barWidth, barHeight);

  // Color changes as time runs out
  let barColor;
  if (fillRatio > 0.5) barColor = '#00ff66';
  else if (fillRatio > 0.25) barColor = '#ffcc00';
  else barColor = '#ff3333';

  ctx.fillStyle = barColor;
  ctx.shadowColor = barColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(barX, barY, barWidth * fillRatio, barHeight);
  ctx.shadowBlur = 0;
}

function render() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background fill
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  drawBackground();
  drawLaneObjects();
  drawFrog();
  drawTimerBar();
}

// ── Game loop ───────────────────────────────────────────────────────────────

function gameLoop(timestamp) {
  if (gameState === 'idle' || gameState === 'gameover') return;

  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // cap delta
  lastTimestamp = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// ── Score submission ────────────────────────────────────────────────────────

async function submitScore() {
  if (score <= 0) return;
  try {
    const res = await api.post('/api/scores/frogger', {
      score,
      difficulty: currentDifficulty,
    });
    if (res && res.ok) {
      const data = await res.json();
      const rankMsg = data.rank ? ' (Rank #' + data.rank + ')' : '';
      console.log('Score submitted:', score, rankMsg);
    }
  } catch (err) {
    console.error('Score submission failed:', err);
  }
  // Refresh mini leaderboard
  if (typeof window.loadMiniLeaderboard === 'function') {
    window.loadMiniLeaderboard();
  }
}

// ── Difficulty selector ────────────────────────────────────────────────────

function initDifficultySelector() {
  const selector = document.getElementById('difficulty-selector');
  if (!selector) return;

  const buttons = selector.querySelectorAll('[data-difficulty]');
  buttons.forEach(btn => {
    // Set initial active state
    if (btn.dataset.difficulty === currentDifficulty) {
      btn.classList.add('diff-active');
    }

    btn.addEventListener('click', () => {
      setDifficulty(btn.dataset.difficulty);
      buttons.forEach(b => b.classList.remove('diff-active'));
      btn.classList.add('diff-active');
    });
  });
}

// ── Start button ────────────────────────────────────────────────────────────

startBtn.addEventListener('click', () => {
  // Hide difficulty selector during gameplay
  const diffSelector = document.getElementById('difficulty-selector');
  if (diffSelector) diffSelector.style.display = 'none';
  startGame();
});

// Initial render so canvas isn't blank
initLevel();
render();
initDifficultySelector();
