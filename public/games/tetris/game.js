/**
 * Neon Stack — Tetris with neon glow aesthetic
 * All 7 tetrominoes, SRS wall kicks, ghost piece, hold, next preview,
 * line clearing with scoring, level progression, score submission.
 */
(function () {
  'use strict';

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const CANVAS_W = 700;
  const CANVAS_H = 520;

  // ── Playfield geometry ────────────────────────────────────────────────────
  const COLS = 10;
  const ROWS = 20;
  const CELL = 24;
  const FIELD_W = COLS * CELL;          // 240
  const FIELD_H = ROWS * CELL;          // 480
  const FIELD_X = Math.floor((CANVAS_W - FIELD_W) / 2);   // centered
  const FIELD_Y = Math.floor((CANVAS_H - FIELD_H) / 2);   // centered

  // ── Side panel positions ──────────────────────────────────────────────────
  const HOLD_X = FIELD_X - 130;
  const HOLD_Y = FIELD_Y + 10;
  const NEXT_X = FIELD_X + FIELD_W + 20;
  const NEXT_Y = FIELD_Y + 10;

  // ── Tetromino definitions ─────────────────────────────────────────────────
  // Each piece has 4 rotation states (0, 1, 2, 3)
  const PIECES = {
    I: {
      color: '#0ff',
      states: [
        [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
        [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
        [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
        [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
      ],
    },
    O: {
      color: '#ff0',
      states: [
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
        [[1,1],[1,1]],
      ],
    },
    T: {
      color: '#a0f',
      states: [
        [[0,1,0],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,1],[0,1,0]],
        [[0,1,0],[1,1,0],[0,1,0]],
      ],
    },
    S: {
      color: '#0f0',
      states: [
        [[0,1,1],[1,1,0],[0,0,0]],
        [[0,1,0],[0,1,1],[0,0,1]],
        [[0,0,0],[0,1,1],[1,1,0]],
        [[1,0,0],[1,1,0],[0,1,0]],
      ],
    },
    Z: {
      color: '#f00',
      states: [
        [[1,1,0],[0,1,1],[0,0,0]],
        [[0,0,1],[0,1,1],[0,1,0]],
        [[0,0,0],[1,1,0],[0,1,1]],
        [[0,1,0],[1,1,0],[1,0,0]],
      ],
    },
    J: {
      color: '#00f',
      states: [
        [[1,0,0],[1,1,1],[0,0,0]],
        [[0,1,1],[0,1,0],[0,1,0]],
        [[0,0,0],[1,1,1],[0,0,1]],
        [[0,1,0],[0,1,0],[1,1,0]],
      ],
    },
    L: {
      color: '#ff8800',
      states: [
        [[0,0,1],[1,1,1],[0,0,0]],
        [[0,1,0],[0,1,0],[0,1,1]],
        [[0,0,0],[1,1,1],[1,0,0]],
        [[1,1,0],[0,1,0],[0,1,0]],
      ],
    },
  };

  const PIECE_NAMES = Object.keys(PIECES);

  // ── SRS wall-kick data ────────────────────────────────────────────────────
  // For J, L, S, T, Z (3x3 pieces)
  const WALL_KICKS_JLSTZ = {
    '0>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '1>0': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '1>2': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    '2>1': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    '2>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    '3>2': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '3>0': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
    '0>3': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  };

  // For I piece (4x4)
  const WALL_KICKS_I = {
    '0>1': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '1>0': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '1>2': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
    '2>1': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '2>3': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
    '3>2': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
    '3>0': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
    '0>3': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  };

  // ── Scoring ───────────────────────────────────────────────────────────────
  const LINE_SCORES = [0, 100, 300, 500, 800];

  // ── Difficulty ────────────────────────────────────────────────────────────
  const DIFFICULTY_CONFIG = {
    easy:   { label: 'EASY',   baseDropInterval: 1200, levelSpeedDecrease: 60, minDropInterval: 100 },
    normal: { label: 'NORMAL', baseDropInterval: 1000, levelSpeedDecrease: 80, minDropInterval: 50 },
    hard:   { label: 'HARD',   baseDropInterval: 800,  levelSpeedDecrease: 100, minDropInterval: 30 },
  };
  let currentDifficulty = localStorage.getItem('tetris-difficulty') || 'normal';
  let activeDiff = DIFFICULTY_CONFIG[currentDifficulty];
  function setDifficulty(d) { currentDifficulty = d; activeDiff = DIFFICULTY_CONFIG[d]; localStorage.setItem('tetris-difficulty', d); }

  // ── Game state ────────────────────────────────────────────────────────────
  let board = [];           // ROWS x COLS, each cell null or color string
  let currentPiece = null;  // { name, rotation, x, y }
  let nextPiece = null;
  let holdPiece = null;
  let holdUsed = false;     // can only hold once per drop
  let score = 0;
  let level = 1;
  let lines = 0;
  let gameOver = false;
  let running = false;
  let dropInterval = activeDiff.baseDropInterval;
  let dropAccumulator = 0;
  let lastTime = 0;
  let bag = [];

  // ── HUD elements ──────────────────────────────────────────────────────────
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const linesEl = document.getElementById('lines');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('start-btn');

  // ── 7-bag random generator ────────────────────────────────────────────────
  function refillBag() {
    bag = [...PIECE_NAMES];
    // Fisher-Yates shuffle
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }

  function nextFromBag() {
    if (bag.length === 0) refillBag();
    return bag.pop();
  }

  // ── Board helpers ─────────────────────────────────────────────────────────
  function createBoard() {
    const b = [];
    for (let r = 0; r < ROWS; r++) {
      b.push(new Array(COLS).fill(null));
    }
    return b;
  }

  function getShape(name, rotation) {
    return PIECES[name].states[rotation];
  }

  function collides(name, rotation, px, py) {
    const shape = getShape(name, rotation);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = px + c;
        const by = py + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx] !== null) return true;
      }
    }
    return false;
  }

  function lockPiece() {
    const shape = getShape(currentPiece.name, currentPiece.rotation);
    const color = PIECES[currentPiece.name].color;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = currentPiece.x + c;
        const by = currentPiece.y + r;
        if (by >= 0 && by < ROWS && bx >= 0 && bx < COLS) {
          board[by][bx] = color;
        }
      }
    }
  }

  function clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r].every(cell => cell !== null)) {
        board.splice(r, 1);
        board.unshift(new Array(COLS).fill(null));
        cleared++;
        r++; // recheck same row index
      }
    }
    return cleared;
  }

  function ghostY() {
    let gy = currentPiece.y;
    while (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x, gy + 1)) {
      gy++;
    }
    return gy;
  }

  // ── Piece spawn ───────────────────────────────────────────────────────────
  function spawnPiece(name) {
    const shape = getShape(name, 0);
    const px = Math.floor((COLS - shape[0].length) / 2);
    const py = -1;  // start just above visible area
    if (collides(name, 0, px, py)) {
      // game over
      return null;
    }
    return { name, rotation: 0, x: px, y: py };
  }

  function spawnNext() {
    currentPiece = nextPiece ? { ...nextPiece } : null;
    if (!currentPiece) {
      const name = nextFromBag();
      currentPiece = spawnPiece(name);
    } else {
      // Re-spawn with position
      currentPiece = spawnPiece(currentPiece.name);
    }
    const nn = nextFromBag();
    nextPiece = { name: nn, rotation: 0, x: 0, y: 0 };
    holdUsed = false;

    if (!currentPiece) {
      endGame();
    }
  }

  // ── Rotation with SRS wall kicks ──────────────────────────────────────────
  function tryRotate(dir) {
    if (!currentPiece) return;
    const oldRot = currentPiece.rotation;
    const newRot = (oldRot + dir + 4) % 4;
    const kickTable = currentPiece.name === 'I' ? WALL_KICKS_I : (currentPiece.name === 'O' ? null : WALL_KICKS_JLSTZ);

    if (!kickTable) {
      // O piece: no kicks needed, rotation is identity
      return;
    }

    const key = oldRot + '>' + newRot;
    const kicks = kickTable[key];
    if (!kicks) return;

    for (const [dx, dy] of kicks) {
      if (!collides(currentPiece.name, newRot, currentPiece.x + dx, currentPiece.y - dy)) {
        currentPiece.rotation = newRot;
        currentPiece.x += dx;
        currentPiece.y -= dy;
        return;
      }
    }
  }

  // ── Hold piece ────────────────────────────────────────────────────────────
  function doHold() {
    if (!currentPiece || holdUsed) return;
    holdUsed = true;
    const heldName = currentPiece.name;
    if (holdPiece) {
      const swapName = holdPiece;
      holdPiece = heldName;
      currentPiece = spawnPiece(swapName);
      if (!currentPiece) endGame();
    } else {
      holdPiece = heldName;
      spawnNext();
    }
  }

  // ── Movement ──────────────────────────────────────────────────────────────
  function moveLeft() {
    if (!currentPiece) return;
    if (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x - 1, currentPiece.y)) {
      currentPiece.x--;
    }
  }

  function moveRight() {
    if (!currentPiece) return;
    if (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x + 1, currentPiece.y)) {
      currentPiece.x++;
    }
  }

  function softDrop() {
    if (!currentPiece) return;
    if (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
      score += 1;
      updateHud();
    }
  }

  function hardDrop() {
    if (!currentPiece) return;
    let dist = 0;
    while (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
      dist++;
    }
    score += dist * 2;
    lockAndAdvance();
  }

  function lockAndAdvance() {
    lockPiece();
    const cleared = clearLines();
    if (cleared > 0 && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(cleared > 1 ? 80 : 40);
    if (cleared > 0) {
      if (cleared >= 4) {
        sfx.play('powerup');
      } else {
        sfx.play('score');
      }
      score += LINE_SCORES[cleared] * level;
      lines += cleared;
      const newLevel = Math.floor(lines / 10) + 1;
      if (newLevel > level) {
        level = newLevel;
        dropInterval = Math.max(activeDiff.minDropInterval, activeDiff.baseDropInterval - (level - 1) * activeDiff.levelSpeedDecrease);
        sfx.play('levelup');
      }
    }
    updateHud();
    spawnNext();
  }

  function gravityDrop() {
    if (!currentPiece) return;
    if (!collides(currentPiece.name, currentPiece.rotation, currentPiece.x, currentPiece.y + 1)) {
      currentPiece.y++;
    } else {
      lockAndAdvance();
    }
  }

  // ── HUD update ────────────────────────────────────────────────────────────
  function updateHud() {
    scoreEl.textContent = score.toLocaleString();
    levelEl.textContent = level;
    linesEl.textContent = lines;
  }

  // ── Drawing ───────────────────────────────────────────────────────────────
  function drawBlock(x, y, color, alpha) {
    const px = FIELD_X + x * CELL;
    const py = FIELD_Y + y * CELL;
    ctx.save();
    ctx.globalAlpha = alpha || 1;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.shadowBlur = 0;
    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(px + 2, py + 2, CELL - 6, 3);
    ctx.restore();
  }

  function drawBoard() {
    // Background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Field background
    ctx.fillStyle = '#111';
    ctx.fillRect(FIELD_X, FIELD_Y, FIELD_W, FIELD_H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(FIELD_X, FIELD_Y + r * CELL);
      ctx.lineTo(FIELD_X + FIELD_W, FIELD_Y + r * CELL);
      ctx.stroke();
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(FIELD_X + c * CELL, FIELD_Y);
      ctx.lineTo(FIELD_X + c * CELL, FIELD_Y + FIELD_H);
      ctx.stroke();
    }

    // Locked blocks
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c]) {
          drawBlock(c, r, board[r][c], 1);
        }
      }
    }
  }

  function drawCurrentPiece() {
    if (!currentPiece) return;
    const shape = getShape(currentPiece.name, currentPiece.rotation);
    const color = PIECES[currentPiece.name].color;

    // Ghost piece
    const gy = ghostY();
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const by = gy + r;
        if (by >= 0) {
          drawBlock(currentPiece.x + c, by, color, 0.2);
        }
      }
    }

    // Actual piece
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const by = currentPiece.y + r;
        if (by >= 0) {
          drawBlock(currentPiece.x + c, by, color, 1);
        }
      }
    }
  }

  function drawMiniPiece(name, cx, cy, label) {
    if (!name) return;
    const shape = getShape(name, 0);
    const color = PIECES[name].color;
    const miniCell = 16;

    // Label
    ctx.save();
    ctx.fillStyle = '#ff8800';
    ctx.shadowColor = '#ff8800';
    ctx.shadowBlur = 4;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx + (shape[0].length * miniCell) / 2, cy - 8);
    ctx.restore();

    // Draw blocks
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const px = cx + c * miniCell;
        const py = cy + r * miniCell;
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.fillRect(px + 1, py + 1, miniCell - 2, miniCell - 2);
        ctx.shadowBlur = 0;
        ctx.restore();
      }
    }
  }

  function drawSidePanels() {
    // Hold panel
    ctx.save();
    ctx.strokeStyle = 'rgba(255,136,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(HOLD_X - 5, HOLD_Y - 25, 110, 90);
    ctx.restore();
    drawMiniPiece(holdPiece, HOLD_X + 15, HOLD_Y + 5, 'HOLD');

    // Next panel
    ctx.save();
    ctx.strokeStyle = 'rgba(255,136,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(NEXT_X - 5, NEXT_Y - 25, 110, 90);
    ctx.restore();
    if (nextPiece) {
      drawMiniPiece(nextPiece.name, NEXT_X + 15, NEXT_Y + 5, 'NEXT');
    }

    // Level/Lines info on right side below Next
    ctx.save();
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SPEED: ' + dropInterval + 'ms', NEXT_X, NEXT_Y + 90);
    ctx.restore();
  }

  function draw() {
    drawBoard();
    drawCurrentPiece();
    drawSidePanels();
  }

  // Swipe detection for piece movement
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
      const absDx = Math.abs(dx), absDy = Math.abs(dy);
      if (absDx < 30 && absDy < 30) return;
      var key;
      if (absDx > absDy) {
        key = dx > 0 ? 'ArrowRight' : 'ArrowLeft';
      } else {
        key = dy > 0 ? 'ArrowDown' : 'ArrowUp';
      }
      document.dispatchEvent(new KeyboardEvent('keydown', { key: key, bubbles: true }));
      setTimeout(function() {
        document.dispatchEvent(new KeyboardEvent('keyup', { key: key, bubbles: true }));
      }, 50);
    }, { passive: true });
  })();

  // ── Game loop ─────────────────────────────────────────────────────────────
  function gameLoop(timestamp) {
    if (!running) return;
    if (!lastTime) lastTime = timestamp;
    const dt = timestamp - lastTime;
    lastTime = timestamp;

    dropAccumulator += dt;
    if (dropAccumulator >= dropInterval) {
      dropAccumulator -= dropInterval;
      gravityDrop();
    }

    draw();
    requestAnimationFrame(gameLoop);
  }

  // ── Game over ─────────────────────────────────────────────────────────────
  async function endGame() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(150);
    sfx.play('gameover');
    gameOver = true;
    running = false;

    // Show overlay with final score
    overlay.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.textContent = 'GAME OVER';
    const p = document.createElement('p');
    p.textContent = 'Final Score: ' + score.toLocaleString() + ' | Level: ' + level + ' | Lines: ' + lines;
    const btn = document.createElement('button');
    btn.textContent = 'PLAY AGAIN';
    btn.addEventListener('click', startGame);
    // Re-add difficulty selector
    const diffDiv = document.createElement('div');
    diffDiv.id = 'difficulty-selector';
    ['easy','normal','hard'].forEach(d => {
      const b = document.createElement('button');
      b.className = 'diff-btn' + (d === currentDifficulty ? ' diff-active' : '');
      b.dataset.difficulty = d;
      b.textContent = d.charAt(0).toUpperCase() + d.slice(1);
      diffDiv.appendChild(b);
    });
    overlay.append(h2, p, diffDiv, btn);
    overlay.style.display = 'flex';
    initDifficultySelector();

    // Submit score
    try {
      const user = await api.getUser();
      if (user) {
        await api.post('/api/scores/tetris', { score, difficulty: currentDifficulty });
        if (typeof loadMiniLeaderboard === 'function') loadMiniLeaderboard();
      }
    } catch (err) {
      console.error('Score submission failed:', err);
    }
  }

  // ── Start game ────────────────────────────────────────────────────────────
  function startGame() {
    board = createBoard();
    score = 0;
    level = 1;
    lines = 0;
    dropInterval = activeDiff.baseDropInterval;
    dropAccumulator = 0;
    lastTime = 0;
    gameOver = false;
    holdPiece = null;
    holdUsed = false;
    bag = [];
    currentPiece = null;
    nextPiece = null;

    refillBag();
    const firstName = nextFromBag();
    nextPiece = { name: firstName, rotation: 0, x: 0, y: 0 };
    spawnNext();

    updateHud();
    overlay.style.display = 'none';
    // Hide difficulty selector during gameplay
    const diffSelector = document.getElementById('difficulty-selector');
    if (diffSelector) diffSelector.style.display = 'none';
    running = true;
    sfx.play('start');
    requestAnimationFrame(gameLoop);
  }

  // ── Input handling ────────────────────────────────────────────────────────
  const keysDown = {};

  document.addEventListener('keydown', (e) => {
    if (!running || gameOver) return;
    if (keysDown[e.key]) return; // prevent repeat for rotation/hard-drop
    keysDown[e.key] = true;

    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
      case 'A':
        moveLeft();
        e.preventDefault();
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        moveRight();
        e.preventDefault();
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        softDrop();
        e.preventDefault();
        break;
      case 'ArrowUp':
      case 'w':
      case 'W':
        tryRotate(1);
        e.preventDefault();
        break;
      case ' ':
        hardDrop();
        e.preventDefault();
        break;
      case 'c':
      case 'C':
        doHold();
        e.preventDefault();
        break;
    }
  });

  document.addEventListener('keyup', (e) => {
    delete keysDown[e.key];
  });

  // Allow repeated soft drop & movement when holding key
  let softDropTimer = null;
  let moveLeftTimer = null;
  let moveRightTimer = null;

  document.addEventListener('keydown', (e) => {
    if (!running || gameOver) return;
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      if (!softDropTimer) {
        softDropTimer = setInterval(() => {
          if (running && !gameOver) softDrop();
        }, 50);
      }
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      if (!moveLeftTimer) {
        moveLeftTimer = setInterval(() => {
          if (running && !gameOver) moveLeft();
        }, 80);
      }
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      if (!moveRightTimer) {
        moveRightTimer = setInterval(() => {
          if (running && !gameOver) moveRight();
        }, 80);
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      clearInterval(softDropTimer);
      softDropTimer = null;
    }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      clearInterval(moveLeftTimer);
      moveLeftTimer = null;
    }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      clearInterval(moveRightTimer);
      moveRightTimer = null;
    }
  });

  // ── Difficulty selector ────────────────────────────────────────────────────
  function initDifficultySelector() {
    const selector = document.getElementById('difficulty-selector');
    if (!selector) return;

    const buttons = selector.querySelectorAll('[data-difficulty]');
    buttons.forEach(btn => {
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

  // ── Start button ──────────────────────────────────────────────────────────
  startBtn.addEventListener('click', startGame);
  initDifficultySelector();

  // Initial draw
  board = createBoard();
  draw();
})();
