/**
 * Photon Paddle — Pong vs CPU
 * - Player paddle (left, cyan) vs CPU paddle (right, pink)
 * - Ball with particle trail, angle-based paddle reflection
 * - Ball speed increases after each rally, resets on score
 * - Score to 10, rally count submitted to leaderboard
 * - Three difficulty modes: Easy, Normal, Hard
 */

const CANVAS_W = 700;
const CANVAS_H = 520;

// ── Paddle constants ────────────────────────────────────────────────────────
const PADDLE_W = 10;
const PADDLE_H = 80;
const PADDLE_MARGIN = 20;
const PADDLE_SPEED = 6;

// ── Ball constants ──────────────────────────────────────────────────────────
const BALL_RADIUS = 8;
const BALL_BASE_SPEED = 5;
const BALL_SPEED_INCREMENT = 0.3;
const BALL_MAX_SPEED = 12;

// ── Match constants ─────────────────────────────────────────────────────────
const WIN_SCORE = 10;

// ── Difficulty presets ──────────────────────────────────────────────────────
const DIFFICULTY = {
  easy:   { cpuSpeed: 2.5, reactionZone: 0.4 },
  normal: { cpuSpeed: 4.0, reactionZone: 0.6 },
  hard:   { cpuSpeed: 5.5, reactionZone: 0.85 },
};

// ── Colors ──────────────────────────────────────────────────────────────────
const COLOR_BALL = '#ffee00';
const COLOR_PLAYER = '#0ff';
const COLOR_CPU = '#f0f';
const COLOR_CENTER_LINE = 'rgba(255,238,0,0.15)';
const COLOR_BG = '#0a0a0a';

// ── Canvas setup ────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// ── DOM refs ────────────────────────────────────────────────────────────────
const playerScoreEl = document.getElementById('player-score');
const cpuScoreEl = document.getElementById('cpu-score');
const ralliesEl = document.getElementById('rallies');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const gameOverOverlay = document.getElementById('game-over-overlay');
const gameOverTitle = document.getElementById('game-over-title');
const gameOverInfo = document.getElementById('game-over-info');
const restartBtn = document.getElementById('restart-btn');

// ── Difficulty selector ─────────────────────────────────────────────────────
let selectedDifficulty = 'normal';
const diffBtns = document.querySelectorAll('.diff-btn');
diffBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    diffBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedDifficulty = btn.dataset.diff;
  });
});

// ── Game state ──────────────────────────────────────────────────────────────
let running = false;
let scoreSubmitted = false;
let lastTime = 0;

let playerY = 0;
let cpuY = 0;
let playerScore = 0;
let cpuScore = 0;
let totalRallies = 0;
let currentRally = 0;

let ballX = 0;
let ballY = 0;
let ballVX = 0;
let ballVY = 0;
let ballSpeed = BALL_BASE_SPEED;

// Particle trail
const particles = [];
const MAX_PARTICLES = 40;

// Input state
const keys = {};

// ── Input handling ──────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (['ArrowUp', 'ArrowDown', 'w', 's', ' '].includes(e.key)) {
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// ── Helper: reset ball to center ────────────────────────────────────────────
function resetBall(direction) {
  ballX = CANVAS_W / 2;
  ballY = CANVAS_H / 2;
  ballSpeed = BALL_BASE_SPEED;
  currentRally = 0;

  // Launch at a random angle between -30 and +30 degrees
  const angle = (Math.random() * 60 - 30) * (Math.PI / 180);
  ballVX = Math.cos(angle) * ballSpeed * direction;
  ballVY = Math.sin(angle) * ballSpeed;

  // Clear particles on reset
  particles.length = 0;
}

// ── Helper: spawn particle ──────────────────────────────────────────────────
function spawnParticle(x, y) {
  if (particles.length >= MAX_PARTICLES) {
    particles.shift();
  }
  particles.push({ x, y, life: 1.0 });
}

// ── Start game ──────────────────────────────────────────────────────────────
function startGame() {
  playerScore = 0;
  cpuScore = 0;
  totalRallies = 0;
  currentRally = 0;
  scoreSubmitted = false;

  playerY = (CANVAS_H - PADDLE_H) / 2;
  cpuY = (CANVAS_H - PADDLE_H) / 2;

  resetBall(1);

  updateHUD();
  overlay.style.display = 'none';
  gameOverOverlay.style.display = 'none';
  running = true;
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

// ── Update HUD ──────────────────────────────────────────────────────────────
function updateHUD() {
  playerScoreEl.textContent = playerScore;
  cpuScoreEl.textContent = cpuScore;
  ralliesEl.textContent = totalRallies;
}

// ── CPU AI ──────────────────────────────────────────────────────────────────
function updateCPU(dt) {
  const diff = DIFFICULTY[selectedDifficulty];
  const cpuCenter = cpuY + PADDLE_H / 2;

  // Only react when ball is in the CPU's reaction zone (right portion of field)
  const reactionX = CANVAS_W * (1 - diff.reactionZone);
  if (ballVX > 0 && ballX > reactionX) {
    const targetY = ballY;
    const delta = targetY - cpuCenter;
    const maxMove = diff.cpuSpeed * dt * 60;

    if (Math.abs(delta) > 2) {
      cpuY += Math.sign(delta) * Math.min(Math.abs(delta), maxMove);
    }
  } else {
    // Drift toward center when ball heading away
    const centerDelta = (CANVAS_H / 2) - cpuCenter;
    const driftSpeed = diff.cpuSpeed * 0.3 * dt * 60;
    if (Math.abs(centerDelta) > 2) {
      cpuY += Math.sign(centerDelta) * Math.min(Math.abs(centerDelta), driftSpeed);
    }
  }

  // Clamp
  cpuY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, cpuY));
}

// ── Ball-paddle collision ───────────────────────────────────────────────────
function checkPaddleCollision() {
  // Player paddle (left side)
  const playerPaddleRight = PADDLE_MARGIN + PADDLE_W;
  if (
    ballVX < 0 &&
    ballX - BALL_RADIUS <= playerPaddleRight &&
    ballX - BALL_RADIUS >= PADDLE_MARGIN - BALL_RADIUS &&
    ballY >= playerY &&
    ballY <= playerY + PADDLE_H
  ) {
    // Where on paddle did it hit? -1 (top) to 1 (bottom)
    const hitPos = ((ballY - playerY) / PADDLE_H) * 2 - 1;
    const maxAngle = 60 * (Math.PI / 180);
    const angle = hitPos * maxAngle;

    ballSpeed = Math.min(ballSpeed + BALL_SPEED_INCREMENT, BALL_MAX_SPEED);
    ballVX = Math.cos(angle) * ballSpeed;
    ballVY = Math.sin(angle) * ballSpeed;

    // Push ball out of paddle
    ballX = playerPaddleRight + BALL_RADIUS;

    currentRally++;
    totalRallies++;
    updateHUD();
    return;
  }

  // CPU paddle (right side)
  const cpuPaddleLeft = CANVAS_W - PADDLE_MARGIN - PADDLE_W;
  if (
    ballVX > 0 &&
    ballX + BALL_RADIUS >= cpuPaddleLeft &&
    ballX + BALL_RADIUS <= cpuPaddleLeft + PADDLE_W + BALL_RADIUS &&
    ballY >= cpuY &&
    ballY <= cpuY + PADDLE_H
  ) {
    const hitPos = ((ballY - cpuY) / PADDLE_H) * 2 - 1;
    const maxAngle = 60 * (Math.PI / 180);
    const angle = hitPos * maxAngle;

    ballSpeed = Math.min(ballSpeed + BALL_SPEED_INCREMENT, BALL_MAX_SPEED);
    ballVX = -Math.cos(angle) * ballSpeed;
    ballVY = Math.sin(angle) * ballSpeed;

    // Push ball out of paddle
    ballX = cpuPaddleLeft - BALL_RADIUS;

    currentRally++;
    totalRallies++;
    updateHUD();
  }
}

// ── Score check ─────────────────────────────────────────────────────────────
function checkScore() {
  // Ball went past left wall -> CPU scores
  if (ballX - BALL_RADIUS < 0) {
    cpuScore++;
    updateHUD();
    if (cpuScore >= WIN_SCORE) {
      endMatch(false);
    } else {
      resetBall(1); // Launch toward player
    }
    return;
  }

  // Ball went past right wall -> Player scores
  if (ballX + BALL_RADIUS > CANVAS_W) {
    playerScore++;
    updateHUD();
    if (playerScore >= WIN_SCORE) {
      endMatch(true);
    } else {
      resetBall(-1); // Launch toward CPU
    }
  }
}

// ── End match ───────────────────────────────────────────────────────────────
async function endMatch(playerWon) {
  running = false;
  gameOverTitle.textContent = playerWon ? 'YOU WIN!' : 'YOU LOSE';
  gameOverTitle.style.color = playerWon ? '#0f0' : '#f44';
  gameOverInfo.textContent = `Final: ${playerScore} - ${cpuScore} | Total rallies: ${totalRallies}`;
  gameOverOverlay.style.display = 'flex';

  // Submit score
  if (!scoreSubmitted) {
    scoreSubmitted = true;
    try {
      await api.post('/api/scores/pong', { score: totalRallies });
    } catch (err) {
      console.error('Score submission failed:', err);
    }
    if (typeof window.loadMiniLeaderboard === 'function') {
      window.loadMiniLeaderboard();
    }
  }
}

// ── Main game loop ──────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!running) return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
  lastTime = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(gameLoop);
}

// ── Update ──────────────────────────────────────────────────────────────────
function update(dt) {
  const scaledDt = dt * 60; // normalize to ~60fps

  // Player paddle movement
  if (keys['ArrowUp'] || keys['w'] || keys['W']) {
    playerY -= PADDLE_SPEED * scaledDt;
  }
  if (keys['ArrowDown'] || keys['s'] || keys['S']) {
    playerY += PADDLE_SPEED * scaledDt;
  }
  playerY = Math.max(0, Math.min(CANVAS_H - PADDLE_H, playerY));

  // CPU movement
  updateCPU(dt);

  // Ball movement
  ballX += ballVX * scaledDt;
  ballY += ballVY * scaledDt;

  // Top/bottom wall bounce
  if (ballY - BALL_RADIUS <= 0) {
    ballY = BALL_RADIUS;
    ballVY = Math.abs(ballVY);
  }
  if (ballY + BALL_RADIUS >= CANVAS_H) {
    ballY = CANVAS_H - BALL_RADIUS;
    ballVY = -Math.abs(ballVY);
  }

  // Paddle collisions
  checkPaddleCollision();

  // Score check
  checkScore();

  // Spawn particle trail
  spawnParticle(ballX, ballY);

  // Decay particles
  for (let i = particles.length - 1; i >= 0; i--) {
    particles[i].life -= dt * 3;
    if (particles[i].life <= 0) {
      particles.splice(i, 1);
    }
  }
}

// ── Draw ────────────────────────────────────────────────────────────────────
function draw() {
  // Background
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Center dashed line
  ctx.setLineDash([8, 8]);
  ctx.strokeStyle = COLOR_CENTER_LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CANVAS_W / 2, 0);
  ctx.lineTo(CANVAS_W / 2, CANVAS_H);
  ctx.stroke();
  ctx.setLineDash([]);

  // Score display (large, in center)
  ctx.font = '48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,238,0,0.12)';
  ctx.fillText(playerScore + '   ' + cpuScore, CANVAS_W / 2, 20);

  // Particle trail
  for (const p of particles) {
    const alpha = p.life * 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, BALL_RADIUS * 0.5 * p.life, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,238,0,${alpha})`;
    ctx.fill();
  }

  // Ball with glow
  ctx.shadowColor = COLOR_BALL;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_BALL;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Player paddle with glow
  ctx.shadowColor = COLOR_PLAYER;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLOR_PLAYER;
  ctx.fillRect(PADDLE_MARGIN, playerY, PADDLE_W, PADDLE_H);
  ctx.shadowBlur = 0;

  // CPU paddle with glow
  ctx.shadowColor = COLOR_CPU;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLOR_CPU;
  ctx.fillRect(CANVAS_W - PADDLE_MARGIN - PADDLE_W, cpuY, PADDLE_W, PADDLE_H);
  ctx.shadowBlur = 0;
}

// ── Event listeners ─────────────────────────────────────────────────────────
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', () => {
  gameOverOverlay.style.display = 'none';
  overlay.style.display = 'flex';
});
