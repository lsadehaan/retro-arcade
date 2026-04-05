/**
 * Neon Growth — Snake variant
 * - Dark canvas with glowing neon snake
 * - Fading trail: segments persist for 8 seconds; collidable for first 6 seconds
 * - 3 food types: Gold Apple, Silver Circle, Diamond
 * - Random wall generation every 10 segments
 * - Score submission to POST /api/scores on game over
 */

const CELL = 20;
const COLS = 30;
const ROWS = 30;
const CANVAS_W = COLS * CELL;  // 600
const CANVAS_H = ROWS * CELL;  // 600

// Trail timing
const TRAIL_FADE_MS = 8000;    // fade duration total
const TRAIL_SOLID_MS = 6000;   // collidable for first 6s

// Food type definitions
const FOOD_TYPES = {
  gold: {
    label: 'Gold Apple',
    color: '#ffd700',
    glow: '#ffd700',
    points: 50,
    segments: 5,
    speedMult: 1,
    speedDuration: 0,
    shrink: 0,
  },
  silver: {
    label: 'Silver Circle',
    color: '#c0c0c0',
    glow: '#c0c0c0',
    points: 25,
    segments: 2,
    speedMult: 1.3,
    speedDuration: 5000,
    shrink: 0,
  },
  diamond: {
    label: 'Diamond',
    color: '#00cfff',
    glow: '#00cfff',
    points: 200,
    segments: 10,
    speedMult: 1,
    speedDuration: 0,
    shrink: 0,
  },
};

const FOOD_KEYS = Object.keys(FOOD_TYPES);
const MAX_FOOD_ON_SCREEN = 2;

// Base tick interval (ms between moves)
const BASE_INTERVAL = 150;

class NeonGrowth {
  constructor(canvas, overlay, scoreEl, highScoreEl, segmentsEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.overlay = overlay;
    this.scoreEl = scoreEl;
    this.highScoreEl = highScoreEl;
    this.segmentsEl = segmentsEl;

    this.highScore = parseInt(localStorage.getItem('neonGrowthHighScore') ?? '0', 10);
    this.highScoreEl.textContent = this.highScore;

    this.running = false;
    this.gameOverFlag = false;
    this._lastTime = 0;
    this._accumulated = 0;
    this._rafId = null;
    this._inputBuffer = null;

    this._bindKeys();
  }

  // ── Input ──────────────────────────────────────────────────────────────

  _bindKeys() {
    document.addEventListener('keydown', (e) => {
      const map = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
        w: 'up', W: 'up', s: 'down', S: 'down',
        a: 'left', A: 'left', d: 'right', D: 'right',
      };
      const dir = map[e.key];
      if (!dir) return;
      // Prevent default scroll
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if (this.running) this._inputBuffer = dir;
    });

    this._bindTouch();
  }

  _bindTouch() {
    if (!this.canvas.addEventListener) return;
    let touchStartX = 0;
    let touchStartY = 0;

    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }, { passive: false });

    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      if (!this.running) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Require minimum 30px swipe
      if (Math.max(absDx, absDy) < 30) return;

      // Pick dominant axis
      if (absDx > absDy) {
        this._inputBuffer = dx > 0 ? 'right' : 'left';
      } else {
        this._inputBuffer = dy > 0 ? 'down' : 'up';
      }
    }, { passive: false });
  }

  // ── Game state ─────────────────────────────────────────────────────────

  _reset() {
    const midX = Math.floor(COLS / 2);
    const midY = Math.floor(ROWS / 2);
    this.snake = [{ x: midX, y: midY }];
    this.dir = 'right';
    this.pendingDir = 'right';
    this.score = 0;
    this.segmentCount = 1;
    this._inputBuffer = null;

    // Trail: array of { x, y, born: timestamp }
    this.trail = [];

    // Walls: Set of "x,y"
    this.walls = new Set();
    this._lastWallThreshold = 0;

    // Food items on screen: [{ x, y, type, ...foodDef }]
    this.foods = [];

    // Speed boost
    this.speedBoostExpiry = 0;

    // Grow queue: how many extra segments to add
    this._growQueue = 0;

    this._spawnFood();
    this._updateHUD();
  }

  // ── Spawn helpers ──────────────────────────────────────────────────────

  _isFree(x, y) {
    if (this.walls.has(`${x},${y}`)) return false;
    if (this.snake.some((s) => s.x === x && s.y === y)) return false;
    if (this.foods.some((f) => f.x === x && f.y === y)) return false;
    if (this.trail.some((t) => t.x === x && t.y === y)) return false;
    return true;
  }

  _randomFreeCell() {
    let attempts = 0;
    while (attempts < 2000) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (this._isFree(x, y)) return { x, y };
      attempts++;
    }
    return null;
  }

  _spawnFood() {
    while (this.foods.length < MAX_FOOD_ON_SCREEN) {
      const cell = this._randomFreeCell();
      if (!cell) break;
      const typeKey = FOOD_KEYS[Math.floor(Math.random() * FOOD_KEYS.length)];
      this.foods.push({ ...cell, typeKey, ...FOOD_TYPES[typeKey] });
    }
  }

  _spawnWalls() {
    for (let i = 0; i < 3; i++) {
      const cell = this._randomFreeCell();
      if (cell) this.walls.add(`${cell.x},${cell.y}`);
    }
  }

  // ── Main game loop ─────────────────────────────────────────────────────

  start() {
    this._reset();
    this.running = true;
    this.gameOverFlag = false;
    this._lastTime = performance.now();
    this._accumulated = 0;
    this._loop(this._lastTime);
  }

  _currentInterval() {
    if (performance.now() < this.speedBoostExpiry) return BASE_INTERVAL / 1.3;
    return BASE_INTERVAL;
  }

  _loop(ts) {
    if (!this.running) return;
    const dt = ts - this._lastTime;
    this._lastTime = ts;
    this._accumulated += dt;

    const interval = this._currentInterval();
    while (this._accumulated >= interval) {
      this._tick();
      this._accumulated -= interval;
      if (!this.running) break;
    }

    this._draw(ts);
    this._rafId = requestAnimationFrame((t) => this._loop(t));
  }

  _tick() {
    // Apply buffered direction (prevent 180-degree reversal)
    if (this._inputBuffer) {
      const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (this._inputBuffer !== opposite[this.dir]) {
        this.dir = this._inputBuffer;
      }
      this._inputBuffer = null;
    }

    const head = this.snake[0];
    const deltas = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
    const [dx, dy] = deltas[this.dir];
    const nx = head.x + dx;
    const ny = head.y + dy;

    // Wall wrap — no wrapping, collide with boundary
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
      this._endGame();
      return;
    }

    // Collision: self
    if (this.snake.some((s) => s.x === nx && s.y === ny)) {
      this._endGame();
      return;
    }

    // Collision: walls
    if (this.walls.has(`${nx},${ny}`)) {
      this._endGame();
      return;
    }

    // Collision: solid trail (born within TRAIL_SOLID_MS)
    const now = performance.now();
    const solidTrailHit = this.trail.some(
      (t) => t.x === nx && t.y === ny && now - t.born < TRAIL_SOLID_MS
    );
    if (solidTrailHit) {
      this._endGame();
      return;
    }

    // Move: add new head, mark old head as trail
    const oldHead = { ...head };
    this.snake.unshift({ x: nx, y: ny });

    // Add old head position to trail
    this.trail.push({ x: oldHead.x, y: oldHead.y, born: now });

    // Remove tail (unless growing)
    if (this._growQueue > 0) {
      this._growQueue--;
    } else {
      this.snake.pop();
    }

    // Prune expired trail segments
    this.trail = this.trail.filter((t) => now - t.born < TRAIL_FADE_MS);

    // Check food
    const foodIdx = this.foods.findIndex((f) => f.x === nx && f.y === ny);
    if (foodIdx !== -1) {
      const food = this.foods[foodIdx];
      this.foods.splice(foodIdx, 1);
      this.score += food.points;

      // Grow
      this._growQueue += food.segments;

      // Speed boost
      if (food.speedDuration > 0) {
        this.speedBoostExpiry = now + food.speedDuration;
      }

      this.segmentCount = this.snake.length + this._growQueue;
      this._updateHUD();

      // Wall generation every 10 segments
      const threshold = Math.floor(this.segmentCount / 10) * 10;
      if (threshold > 0 && threshold > this._lastWallThreshold) {
        this._lastWallThreshold = threshold;
        this._spawnWalls();
      }

      this._spawnFood();
    }
  }

  _endGame() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150);
    this.running = false;
    if (cancelAnimationFrame) cancelAnimationFrame(this._rafId);

    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('neonGrowthHighScore', String(this.highScore));
      this.highScoreEl.textContent = this.highScore;
    }

    // Submit score with feedback
    fetch('/api/scores/neon-growth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ score: this.score }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          this._showOverlayMessage('Log in to save your score');
        } else if (res.status === 429) {
          this._showOverlayMessage('Score already submitted recently');
        } else if (res.ok) {
          const data = await res.json();
          this._showOverlayMessage(`Saved! You ranked #${data.rank}`);
          if (window.loadMiniLeaderboard) window.loadMiniLeaderboard();
        } else {
          this._showOverlayMessage('Score could not be saved');
        }
      })
      .catch((err) => {
        console.error('Score submission failed:', err);
        this._showOverlayMessage('Score could not be saved');
      });

    this._showGameOver();
  }

  _showOverlayMessage(msg) {
    const ov = this.overlay;
    const existing = ov.querySelector('.overlay-status');
    if (existing) existing.remove();
    const p = document.createElement('p');
    p.className = 'overlay-status';
    p.style.fontSize = '0.85rem';
    p.style.color = '#0ff';
    p.style.marginTop = '4px';
    p.textContent = msg;
    ov.appendChild(p);
  }

  _showGameOver() {
    const ov = this.overlay;
    ov.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = 'GAME OVER';

    const p = document.createElement('p');
    p.textContent = `Score: ${this.score}  |  Best: ${this.highScore}`;

    const btn = document.createElement('button');
    btn.textContent = 'PLAY AGAIN';
    btn.addEventListener('click', () => {
      ov.style.display = 'none';
      this.start();
    });

    ov.appendChild(h2);
    ov.appendChild(p);
    ov.appendChild(btn);
    ov.style.display = 'flex';
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  _draw(ts) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    this._drawGrid(ctx);
    this._drawTrail(ctx, ts);
    this._drawWalls(ctx);
    this._drawFoods(ctx, ts);
    this._drawSnake(ctx);
  }

  _drawGrid(ctx) {
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.04)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, CANVAS_H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(CANVAS_W, y * CELL);
      ctx.stroke();
    }
  }

  _drawTrail(ctx, ts) {
    const now = ts ?? performance.now();
    for (const seg of this.trail) {
      const age = now - seg.born;
      if (age >= TRAIL_FADE_MS) continue;
      const alpha = 1 - age / TRAIL_FADE_MS;
      const solid = age < TRAIL_SOLID_MS;

      ctx.save();
      ctx.globalAlpha = alpha * 0.6;
      if (solid) {
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 8;
        ctx.fillStyle = `rgba(0, 200, 200, ${alpha})`;
      } else {
        ctx.shadowColor = '#0ff';
        ctx.shadowBlur = 4;
        ctx.fillStyle = `rgba(0, 100, 120, ${alpha * 0.5})`;
      }
      ctx.fillRect(seg.x * CELL + 2, seg.y * CELL + 2, CELL - 4, CELL - 4);
      ctx.restore();
    }
  }

  _drawWalls(ctx) {
    ctx.save();
    ctx.shadowColor = '#f0f';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#8800aa';
    for (const key of this.walls) {
      const [x, y] = key.split(',').map(Number);
      ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
      // Border
      ctx.strokeStyle = '#f0f';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
    }
    ctx.restore();
  }

  _drawFoods(ctx, ts) {
    const pulse = Math.sin((ts ?? performance.now()) / 300) * 0.3 + 0.7;
    for (const food of this.foods) {
      const cx = food.x * CELL + CELL / 2;
      const cy = food.y * CELL + CELL / 2;
      const r = (CELL / 2 - 3) * pulse;

      ctx.save();
      ctx.shadowColor = food.glow;
      ctx.shadowBlur = 16;
      ctx.fillStyle = food.color;

      if (food.typeKey === 'gold') {
        // Apple: circle
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (food.typeKey === 'silver') {
        // Silver: circle with outline
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else if (food.typeKey === 'diamond') {
        // Diamond: rotated square
        const s = r * 1.1;
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-s / 2, -s / 2, s, s);
      }

      ctx.restore();
    }
  }

  _drawSnake(ctx) {
    const len = this.snake.length;
    for (let i = len - 1; i >= 0; i--) {
      const seg = this.snake[i];
      const t = i === 0 ? 1 : 1 - i / len;
      // Head is brightest cyan, tail fades to darker teal
      const r = Math.round(0 * t);
      const g = Math.round(220 + 35 * t);
      const b = Math.round(180 + 75 * t);

      ctx.save();
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.shadowBlur = i === 0 ? 20 : 10;
      ctx.fillStyle = `rgb(${r},${g},${b})`;

      if (i === 0) {
        // Head: slightly larger
        ctx.fillRect(seg.x * CELL, seg.y * CELL, CELL, CELL);
        // Eyes
        ctx.fillStyle = '#000';
        ctx.shadowBlur = 0;
        const eyeSize = 3;
        if (this.dir === 'right' || this.dir === 'left') {
          const ex = this.dir === 'right' ? seg.x * CELL + CELL - 6 : seg.x * CELL + 3;
          ctx.fillRect(ex, seg.y * CELL + 4, eyeSize, eyeSize);
          ctx.fillRect(ex, seg.y * CELL + CELL - 4 - eyeSize, eyeSize, eyeSize);
        } else {
          const ey = this.dir === 'down' ? seg.y * CELL + CELL - 6 : seg.y * CELL + 3;
          ctx.fillRect(seg.x * CELL + 4, ey, eyeSize, eyeSize);
          ctx.fillRect(seg.x * CELL + CELL - 4 - eyeSize, ey, eyeSize, eyeSize);
        }
      } else {
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
      }
      ctx.restore();
    }
  }

  _updateHUD() {
    this.scoreEl.textContent = this.score;
    this.highScoreEl.textContent = this.highScore;
    this.segmentsEl.textContent = this.snake.length + this._growQueue;
  }
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

const overlay = document.getElementById('overlay');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('high-score');
const segmentsEl = document.getElementById('segments');

const game = new NeonGrowth(canvas, overlay, scoreEl, highScoreEl, segmentsEl);

document.getElementById('start-btn').addEventListener('click', () => {
  overlay.style.display = 'none';
  game.start();
});
