/**
 * Brick Blitz — Breakout game
 * - Paddle-and-ball brick breaking with neon aesthetics
 * - Normal, tough, and indestructible bricks
 * - Power-ups: wide paddle, multi-ball
 * - Level progression with increasing speed
 * - Score submission via api.post
 */

const CANVAS_W = 700;
const CANVAS_H = 520;

// ── Difficulty ────────────────────────────────────────────────────────────
const DIFFICULTY_CONFIG = {
  easy:   { label: 'EASY',   ballSpeed: 3.5, ballSpeedInc: 0.2, paddleWidth: 120, maxLives: 5 },
  normal: { label: 'NORMAL', ballSpeed: 4.5, ballSpeedInc: 0.35, paddleWidth: 100, maxLives: 3 },
  hard:   { label: 'HARD',   ballSpeed: 5.5, ballSpeedInc: 0.5,  paddleWidth: 80,  maxLives: 2 },
};
let currentDifficulty = localStorage.getItem('breakout-difficulty') || 'normal';
let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];
function setDifficulty(d) { currentDifficulty = d; activeDiff = DIFFICULTY_CONFIG[d]; localStorage.setItem('breakout-difficulty', d); }

// ── Colors ─────────────────────────────────────────────────────────────────
const PINK = '#ff3366';
const ROW_COLORS = ['#ff3366', '#ff6600', '#ffcc00', '#33ff66', '#3399ff', '#cc33ff', '#ff66cc'];
const TOUGH_DIM = 0.45; // opacity multiplier after first hit

// ── Layout constants ───────────────────────────────────────────────────────
const PADDLE_Y_OFFSET = 40; // distance from bottom
const PADDLE_HEIGHT = 14;
const PADDLE_SPEED = 7;
const BALL_RADIUS = 6;

const BRICK_ROWS = 6;
const BRICK_COLS = 10;
const BRICK_WIDTH = 62;
const BRICK_HEIGHT = 22;
const BRICK_PADDING = 4;
const BRICK_OFFSET_TOP = 50;
const BRICK_OFFSET_LEFT = (CANVAS_W - (BRICK_COLS * (BRICK_WIDTH + BRICK_PADDING) - BRICK_PADDING)) / 2;

const POWERUP_DROP_CHANCE = 0.20;
const POWERUP_FALL_SPEED = 2;
const POWERUP_SIZE = 18;
const WIDE_PADDLE_DURATION = 10000; // 10 seconds
const WIDE_PADDLE_MULT = 1.5;

// ── Brick types ────────────────────────────────────────────────────────────
const BRICK_NORMAL = 0;
const BRICK_TOUGH = 1;
const BRICK_INDESTRUCTIBLE = 2;

// ── Power-up types ─────────────────────────────────────────────────────────
const PU_WIDE = 'wide';
const PU_MULTI = 'multi';

// ── Game state ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const levelEl = document.getElementById('level');

let gameState = 'idle'; // idle | playing | paused | gameover
let score = 0;
let lives = activeDiff.maxLives;
let level = 1;
let paddle, balls, bricks, powerUps;
let widePaddleTimer = 0;
let keys = {};
let lastTime = 0;
let touchStartX = null;
let touchPaddleStartX = null;

// ── Paddle ─────────────────────────────────────────────────────────────────
function createPaddle() {
  return {
    x: CANVAS_W / 2 - activeDiff.paddleWidth / 2,
    y: CANVAS_H - PADDLE_Y_OFFSET,
    width: activeDiff.paddleWidth,
    height: PADDLE_HEIGHT,
  };
}

// ── Ball ───────────────────────────────────────────────────────────────────
function createBall(x, y, dx, dy) {
  const speed = activeDiff.ballSpeed + activeDiff.ballSpeedInc * (level - 1);
  return {
    x: x,
    y: y,
    dx: dx || 0,
    dy: dy || 0,
    radius: BALL_RADIUS,
    speed: speed,
    onPaddle: dx === undefined,
    trail: [],
  };
}

// ── Bricks ─────────────────────────────────────────────────────────────────
function generateBricks() {
  const arr = [];
  const rows = BRICK_ROWS + Math.min(Math.floor((level - 1) / 2), 3); // max 9 rows
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < BRICK_COLS; c++) {
      const x = BRICK_OFFSET_LEFT + c * (BRICK_WIDTH + BRICK_PADDING);
      const y = BRICK_OFFSET_TOP + r * (BRICK_HEIGHT + BRICK_PADDING);
      const color = ROW_COLORS[r % ROW_COLORS.length];

      let type = BRICK_NORMAL;
      let hp = 1;
      let points = 10;

      // Tough bricks: more common in higher levels
      if (level >= 2 && Math.random() < 0.15 + level * 0.03) {
        type = BRICK_TOUGH;
        hp = 2;
        points = 25;
      }

      // Indestructible bricks: sparse, starting level 3
      if (level >= 3 && Math.random() < 0.06 + level * 0.01) {
        type = BRICK_INDESTRUCTIBLE;
        hp = Infinity;
        points = 0;
      }

      arr.push({ x, y, w: BRICK_WIDTH, h: BRICK_HEIGHT, color, type, hp, maxHp: hp, points, alive: true });
    }
  }
  return arr;
}

// ── Power-up ───────────────────────────────────────────────────────────────
function spawnPowerUp(x, y) {
  if (Math.random() > POWERUP_DROP_CHANCE) return;
  const kind = Math.random() < 0.5 ? PU_WIDE : PU_MULTI;
  powerUps.push({
    x: x,
    y: y,
    kind: kind,
    size: POWERUP_SIZE,
  });
}

// ── Init / Reset ───────────────────────────────────────────────────────────
function initGame() {
  score = 0;
  lives = activeDiff.maxLives;
  level = 1;
  widePaddleTimer = 0;
  paddle = createPaddle();
  balls = [createBall(paddle.x + paddle.width / 2, paddle.y - BALL_RADIUS)];
  bricks = generateBricks();
  powerUps = [];
  updateHUD();
}

function nextLevel() {
  level++;
  widePaddleTimer = 0;
  paddle.width = activeDiff.paddleWidth;
  paddle.x = CANVAS_W / 2 - paddle.width / 2;
  balls = [createBall(paddle.x + paddle.width / 2, paddle.y - BALL_RADIUS)];
  bricks = generateBricks();
  powerUps = [];
  updateHUD();
}

function updateHUD() {
  scoreEl.textContent = score;
  levelEl.textContent = level;
  let starStr = '';
  for (let i = 0; i < activeDiff.maxLives; i++) {
    starStr += i < lives ? '\u2733' : '\u2606';
  }
  livesEl.textContent = starStr;
}

// ── Launch ball ────────────────────────────────────────────────────────────
function launchBall(ball) {
  if (!ball.onPaddle) return;
  ball.onPaddle = false;
  const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.4;
  ball.dx = Math.cos(angle) * ball.speed;
  ball.dy = Math.sin(angle) * ball.speed;
}

// ── Input ──────────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (e.key === ' ' || e.code === 'Space') {
    e.preventDefault();
    if (gameState === 'playing') {
      for (const b of balls) {
        if (b.onPaddle) { launchBall(b); break; }
      }
    }
  }
});
document.addEventListener('keyup', (e) => { keys[e.key] = false; });

// Touch: drag on canvas to move paddle
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  touchStartX = t.clientX - rect.left;
  touchPaddleStartX = paddle.x;
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (touchStartX === null) return;
  const t = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const currentX = t.clientX - rect.left;
  const deltaX = (currentX - touchStartX) * scaleX;
  paddle.x = Math.max(0, Math.min(CANVAS_W - paddle.width, touchPaddleStartX + deltaX));
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  // If barely moved, treat as tap to launch
  if (touchStartX !== null) {
    const t = e.changedTouches[0];
    const rect = canvas.getBoundingClientRect();
    const endX = t.clientX - rect.left;
    if (Math.abs(endX - touchStartX) < 10) {
      for (const b of balls) {
        if (b.onPaddle) { launchBall(b); break; }
      }
    }
  }
  touchStartX = null;
  touchPaddleStartX = null;
}, { passive: false });

// ── Collision helpers ──────────────────────────────────────────────────────
function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return (dx * dx + dy * dy) < (cr * cr);
}

// ── Update ─────────────────────────────────────────────────────────────────
function update(dt) {
  if (gameState !== 'playing') return;

  const dtSec = dt / 1000;

  // Wide paddle timer
  if (widePaddleTimer > 0) {
    widePaddleTimer -= dt;
    if (widePaddleTimer <= 0) {
      widePaddleTimer = 0;
      paddle.width = activeDiff.paddleWidth;
      // Clamp paddle position
      if (paddle.x + paddle.width > CANVAS_W) paddle.x = CANVAS_W - paddle.width;
    }
  }

  // Move paddle
  const moveLeft = keys['ArrowLeft'] || keys['a'] || keys['A'];
  const moveRight = keys['ArrowRight'] || keys['d'] || keys['D'];
  if (moveLeft) paddle.x -= PADDLE_SPEED;
  if (moveRight) paddle.x += PADDLE_SPEED;
  paddle.x = Math.max(0, Math.min(CANVAS_W - paddle.width, paddle.x));

  // Update balls
  const deadBalls = [];
  for (let i = 0; i < balls.length; i++) {
    const ball = balls[i];

    // Ball on paddle follows paddle
    if (ball.onPaddle) {
      ball.x = paddle.x + paddle.width / 2;
      ball.y = paddle.y - ball.radius;
      continue;
    }

    // Store trail
    ball.trail.push({ x: ball.x, y: ball.y });
    if (ball.trail.length > 8) ball.trail.shift();

    // Move
    ball.x += ball.dx;
    ball.y += ball.dy;

    // Wall collisions
    if (ball.x - ball.radius <= 0) {
      ball.x = ball.radius;
      ball.dx = Math.abs(ball.dx);
    }
    if (ball.x + ball.radius >= CANVAS_W) {
      ball.x = CANVAS_W - ball.radius;
      ball.dx = -Math.abs(ball.dx);
    }
    if (ball.y - ball.radius <= 0) {
      ball.y = ball.radius;
      ball.dy = Math.abs(ball.dy);
    }

    // Bottom — lose ball
    if (ball.y + ball.radius >= CANVAS_H) {
      deadBalls.push(i);
      continue;
    }

    // Paddle collision
    if (circleRectCollision(ball.x, ball.y, ball.radius, paddle.x, paddle.y, paddle.width, paddle.height) && ball.dy > 0) {
      // Calculate hit position: -1 (left edge) to 1 (right edge)
      const hitPos = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const clampedHit = Math.max(-0.9, Math.min(0.9, hitPos));
      const angle = clampedHit * (Math.PI / 3); // max ~60 degrees from vertical
      const speed = ball.speed;
      ball.dx = Math.sin(angle) * speed;
      ball.dy = -Math.cos(angle) * speed;
      ball.y = paddle.y - ball.radius;
    }

    // Brick collisions
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (!circleRectCollision(ball.x, ball.y, ball.radius, brick.x, brick.y, brick.w, brick.h)) continue;

      // Determine bounce direction
      const prevX = ball.x - ball.dx;
      const prevY = ball.y - ball.dy;
      const fromLeft = prevX < brick.x;
      const fromRight = prevX > brick.x + brick.w;
      const fromTop = prevY < brick.y;
      const fromBottom = prevY > brick.y + brick.h;

      if (fromLeft || fromRight) ball.dx = -ball.dx;
      if (fromTop || fromBottom) ball.dy = -ball.dy;
      if (!fromLeft && !fromRight && !fromTop && !fromBottom) ball.dy = -ball.dy;

      // Damage brick
      if (brick.type !== BRICK_INDESTRUCTIBLE) {
        brick.hp--;
        if (brick.hp <= 0) {
          brick.alive = false;
          score += brick.points;
          spawnPowerUp(brick.x + brick.w / 2, brick.y + brick.h / 2);
        }
      }
      break; // one brick per frame per ball
    }
  }

  // Remove dead balls (iterate in reverse)
  for (let i = deadBalls.length - 1; i >= 0; i--) {
    balls.splice(deadBalls[i], 1);
  }

  // If no balls left, lose a life
  if (balls.length === 0) {
    lives--;
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(100);
    updateHUD();
    if (lives <= 0) {
      gameOver();
      return;
    }
    // Reset ball on paddle
    balls = [createBall(paddle.x + paddle.width / 2, paddle.y - BALL_RADIUS)];
  }

  // Update power-ups
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const pu = powerUps[i];
    pu.y += POWERUP_FALL_SPEED;

    // Off screen
    if (pu.y > CANVAS_H) {
      powerUps.splice(i, 1);
      continue;
    }

    // Catch with paddle
    if (pu.x > paddle.x && pu.x < paddle.x + paddle.width &&
        pu.y + pu.size / 2 > paddle.y && pu.y - pu.size / 2 < paddle.y + paddle.height) {
      applyPowerUp(pu.kind);
      powerUps.splice(i, 1);
    }
  }

  // Check level complete (all breakable bricks destroyed)
  const breakableLeft = bricks.filter(b => b.alive && b.type !== BRICK_INDESTRUCTIBLE).length;
  if (breakableLeft === 0) {
    nextLevel();
  }

  updateHUD();
}

function applyPowerUp(kind) {
  if (kind === PU_WIDE) {
    paddle.width = activeDiff.paddleWidth * WIDE_PADDLE_MULT;
    if (paddle.x + paddle.width > CANVAS_W) paddle.x = CANVAS_W - paddle.width;
    widePaddleTimer = WIDE_PADDLE_DURATION;
  } else if (kind === PU_MULTI) {
    // Spawn 2 extra balls from the position of the first active ball
    const src = balls.find(b => !b.onPaddle) || balls[0];
    if (src) {
      const speed = src.speed;
      const b1 = createBall(src.x, src.y, 0, 0);
      b1.onPaddle = false;
      b1.dx = speed * Math.cos(Math.PI / 4);
      b1.dy = -speed * Math.sin(Math.PI / 4);
      b1.speed = speed;
      const b2 = createBall(src.x, src.y, 0, 0);
      b2.onPaddle = false;
      b2.dx = -speed * Math.cos(Math.PI / 4);
      b2.dy = -speed * Math.sin(Math.PI / 4);
      b2.speed = speed;
      balls.push(b1, b2);
    }
  }
}

// ── Game over ──────────────────────────────────────────────────────────────
async function gameOver() {
  if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150);
  gameState = 'gameover';
  overlay.style.display = 'flex';
  overlay.querySelector('h2').textContent = 'GAME OVER';
  overlay.querySelector('p').innerHTML =
    'Final Score: <strong>' + score + '</strong><br>Level Reached: ' + level;
  startBtn.textContent = 'PLAY AGAIN';
  const diffSel = document.getElementById('difficulty-selector');
  if (diffSel) diffSel.style.display = '';

  // Submit score
  try {
    await api.post('/api/scores/breakout', { score, difficulty: currentDifficulty });
  } catch (err) {
    console.error('Score submission failed:', err);
  }

  // Refresh mini-leaderboard
  if (window.loadMiniLeaderboard) window.loadMiniLeaderboard();
}

// ── Draw ───────────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Background
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Draw bricks
  for (const brick of bricks) {
    if (!brick.alive) continue;

    ctx.save();

    if (brick.type === BRICK_INDESTRUCTIBLE) {
      // Hatched/X pattern for indestructible
      ctx.fillStyle = '#333';
      ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.strokeRect(brick.x, brick.y, brick.w, brick.h);
      // Draw X
      ctx.beginPath();
      ctx.moveTo(brick.x + 2, brick.y + 2);
      ctx.lineTo(brick.x + brick.w - 2, brick.y + brick.h - 2);
      ctx.moveTo(brick.x + brick.w - 2, brick.y + 2);
      ctx.lineTo(brick.x + 2, brick.y + brick.h - 2);
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      // Colored brick with glow
      const alpha = (brick.type === BRICK_TOUGH && brick.hp < brick.maxHp) ? TOUGH_DIM : 1;
      ctx.globalAlpha = alpha;
      ctx.shadowColor = brick.color;
      ctx.shadowBlur = 8;
      ctx.fillStyle = brick.color;
      ctx.fillRect(brick.x, brick.y, brick.w, brick.h);
      ctx.shadowBlur = 0;

      // Inner highlight
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(brick.x + 2, brick.y + 2, brick.w - 4, 4);
      ctx.globalAlpha = 1;

      // Tough brick indicator: border
      if (brick.type === BRICK_TOUGH) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(brick.x + 1, brick.y + 1, brick.w - 2, brick.h - 2);
      }
    }

    ctx.restore();
  }

  // Draw power-ups
  for (const pu of powerUps) {
    ctx.save();
    ctx.shadowBlur = 10;
    if (pu.kind === PU_WIDE) {
      ctx.shadowColor = '#33ff66';
      ctx.fillStyle = '#33ff66';
    } else {
      ctx.shadowColor = '#3399ff';
      ctx.fillStyle = '#3399ff';
    }
    // Draw diamond shape
    ctx.beginPath();
    ctx.moveTo(pu.x, pu.y - pu.size / 2);
    ctx.lineTo(pu.x + pu.size / 2, pu.y);
    ctx.lineTo(pu.x, pu.y + pu.size / 2);
    ctx.lineTo(pu.x - pu.size / 2, pu.y);
    ctx.closePath();
    ctx.fill();
    // Label
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pu.kind === PU_WIDE ? 'W' : 'M', pu.x, pu.y);
    ctx.restore();
  }

  // Draw paddle
  ctx.save();
  ctx.shadowColor = PINK;
  ctx.shadowBlur = 12;
  ctx.fillStyle = PINK;
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
  // Paddle highlight
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(paddle.x + 3, paddle.y + 2, paddle.width - 6, 3);
  // Wide paddle glow indicator
  if (widePaddleTimer > 0) {
    ctx.strokeStyle = '#33ff66';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#33ff66';
    ctx.shadowBlur = 8;
    ctx.strokeRect(paddle.x - 1, paddle.y - 1, paddle.width + 2, paddle.height + 2);
  }
  ctx.restore();

  // Draw balls
  for (const ball of balls) {
    // Trail
    ctx.save();
    for (let t = 0; t < ball.trail.length; t++) {
      const tp = ball.trail[t];
      const alpha = (t + 1) / ball.trail.length * 0.3;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y, ball.radius * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,51,102,' + alpha + ')';
      ctx.fill();
    }
    ctx.restore();

    // Ball
    ctx.save();
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.shadowBlur = 0;
    // Inner glow
    ctx.beginPath();
    ctx.arc(ball.x - 1, ball.y - 1, ball.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,51,102,0.6)';
    ctx.fill();
    ctx.restore();
  }
}

// ── Game loop ──────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (gameState !== 'playing') return;

  const dt = lastTime ? Math.min(timestamp - lastTime, 33) : 16; // cap at ~30fps min
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ── Start ──────────────────────────────────────────────────────────────────
startBtn.addEventListener('click', () => {
  if (gameState === 'idle' || gameState === 'gameover') {
    initGame();
  }
  overlay.style.display = 'none';
  const diffSel = document.getElementById('difficulty-selector');
  if (diffSel) diffSel.style.display = 'none';
  gameState = 'playing';
  lastTime = 0;
  requestAnimationFrame(gameLoop);
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

// Initial draw
initGame();
draw();
