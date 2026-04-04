/* Pac-Maze Rush -- Canvas game
   Tiles: 0=empty, 1=wall, 2=dot, 3=power-pellet, 4=ghost-house
*/

(function () {
  'use strict';

  // -- Constants ----------------------------------------------------------------
  const CELL = 20;          // px per cell
  const GHOST_SPEED_MS = 220;
  const PLAYER_SPEED_MS = 140;
  const SCARED_DURATION = 8000;     // ms ghosts stay scared
  const FREEZE_DURATION = 5000;     // ms freeze pellet effect
  const MULTIPLIER_DURATION = 10000; // ms score bomb effect
  const ITEM_LIFETIME = 8000;       // ms special item stays on board
  const ITEM_SPAWN_MS = 12000;      // ms between special item spawns
  const SCORE_PER_DOT = 10;
  const SCORE_PER_POWER = 50;
  const GHOST_EAT_BASE = 200;

  // -- Maze layouts (3 layouts, 21x21) ------------------------------------------
  // 0=empty(no dot), 1=wall, 2=dot, 3=power-pellet, 4=ghost-house
  const MAZES = [
    // Maze 1 -- classic
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,3,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,3,1],
      [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
      [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,1,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,1,2,1],
      [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
      [1,1,1,1,2,1,1,1,0,0,1,0,0,1,1,1,2,1,1,1,1],
      [1,1,1,1,2,1,0,0,4,4,4,4,4,0,0,1,2,1,1,1,1],
      [0,0,0,0,2,0,0,4,4,4,4,4,4,4,0,0,2,0,0,0,0],
      [1,1,1,1,2,1,0,4,4,4,4,4,4,4,0,1,2,1,1,1,1],
      [1,1,1,1,2,1,0,0,0,0,0,0,0,0,0,1,2,1,1,1,1],
      [1,1,1,1,2,1,0,1,1,1,1,1,1,1,0,1,2,1,1,1,1],
      [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
      [1,2,1,1,2,1,1,1,2,1,1,1,2,1,1,1,2,1,1,2,1],
      [1,3,2,1,2,2,2,2,2,2,0,2,2,2,2,2,2,1,2,3,1],
      [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
      [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
      [1,2,1,1,1,1,1,1,2,1,1,1,2,1,1,1,1,1,1,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    // Maze 2 -- open centre
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,3,2,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2,2,3,1],
      [1,2,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,2,1],
      [1,2,1,1,1,2,2,2,1,1,1,1,1,2,2,2,1,1,1,2,1],
      [1,2,2,2,2,2,1,2,2,2,2,2,2,2,1,2,2,2,2,2,1],
      [1,1,1,2,1,1,1,1,1,0,0,0,1,1,1,1,1,2,1,1,1],
      [0,0,1,2,1,1,0,0,0,4,4,4,0,0,0,1,1,2,1,0,0],
      [0,0,1,2,1,0,0,4,4,4,4,4,4,4,0,0,1,2,1,0,0],
      [0,0,1,2,2,2,2,4,4,4,4,4,4,4,2,2,2,2,1,0,0],
      [0,0,0,2,0,0,0,4,4,4,4,4,4,4,0,0,0,2,0,0,0],
      [0,0,1,2,2,2,2,4,4,4,4,4,4,4,2,2,2,2,1,0,0],
      [0,0,1,2,1,0,0,0,0,0,0,0,0,0,0,0,1,2,1,0,0],
      [0,0,1,2,1,1,0,1,1,1,1,1,1,1,0,1,1,2,1,0,0],
      [1,1,1,2,1,1,1,1,1,0,0,0,1,1,1,1,1,2,1,1,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,2,1,1,2,1,1,1,2,1,2,1,2,1,1,1,2,1,1,2,1],
      [1,3,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,3,1],
      [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
      [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
    // Maze 3 -- tunnel sides
    [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,3,2,2,2,1,2,2,2,2,2,2,2,2,2,1,2,2,2,3,1],
      [1,2,1,1,2,1,2,1,1,2,1,2,1,1,2,1,2,1,1,2,1],
      [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
      [1,1,1,2,1,1,1,2,1,1,1,1,1,2,1,1,1,2,1,1,1],
      [0,0,1,2,1,0,1,2,1,1,1,1,1,2,1,0,1,2,1,0,0],
      [0,0,1,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,1,0,0],
      [0,0,1,1,1,2,1,0,4,4,4,4,4,0,1,2,1,1,1,0,0],
      [0,0,0,0,0,2,0,0,4,4,4,4,4,0,0,2,0,0,0,0,0],
      [0,0,0,0,0,2,0,4,4,4,4,4,4,4,0,2,0,0,0,0,0],
      [0,0,1,1,1,2,1,0,0,0,0,0,0,0,1,2,1,1,1,0,0],
      [0,0,1,2,2,2,1,1,1,1,0,1,1,1,1,2,2,2,1,0,0],
      [0,0,1,2,1,2,1,0,0,0,0,0,0,0,1,2,1,2,1,0,0],
      [1,1,1,2,1,2,1,1,1,0,1,0,1,1,1,2,1,2,1,1,1],
      [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
      [1,2,1,1,2,1,1,1,2,1,2,1,2,1,1,1,2,1,1,2,1],
      [1,3,2,1,2,2,2,2,2,2,2,2,2,2,2,2,2,1,2,3,1],
      [1,1,2,1,2,1,2,1,1,1,1,1,1,1,2,1,2,1,2,1,1],
      [1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1,2,2,2,2,1],
      [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    ],
  ];

  const ROWS = 21;
  const COLS = 21;

  // -- Ghost starting positions ---------------------------------------------------
  // Ghost house is centred around rows 8-10, cols 7-13
  const GHOST_START = [
    { col: 9,  row: 9,  color: '#FF0000', name: 'Blinky', type: 'chase' },
    { col: 10, row: 9,  color: '#FFB8FF', name: 'Pinky',  type: 'ambush' },
    { col: 11, row: 9,  color: '#00FFFF', name: 'Inky',   type: 'random' },
    { col: 9,  row: 10, color: '#FFB852', name: 'Clyde',  type: 'random' },
    { col: 10, row: 10, color: '#9933FF', name: 'Mimic',  type: 'mimic' },
  ];

  const PLAYER_START = { col: 10, row: 15 };

  // -- Game state -----------------------------------------------------------------
  let canvas, ctx;
  let state = 'menu'; // 'menu' | 'playing' | 'dead' | 'gameover' | 'levelcomplete'
  let score = 0, lives = 3, level = 1, mazeIndex = 0;
  let map;           // current mutable map (copy of MAZES[mazeIndex])
  let totalDots;
  let player;
  let ghosts;
  let ghostEatChain;

  // Timers
  let lastPlayerMove = 0;
  let lastGhostMove = 0;
  let scaredUntil = 0;
  let frozenUntil = 0;
  let scoreMultiplier = 1;
  let multiplierUntil = 0;

  // Player history for Mimic ghost
  const MIMIC_DELAY_STEPS = 20; // last 20 moves with ~3s delay
  let playerHistory = [];

  // Special items
  let specialItem = null; // { col, row, type, spawnedAt }
  let lastItemSpawn = 0;

  // Input
  let inputDir = null; // { dc, dr } buffered input
  let playerDir = { dc: 0, dr: 0 }; // current movement direction

  // Animation
  let mouthOpen = true;
  let mouthTimer = 0;
  const MOUTH_SPEED = 200;

  // Ghost release timer
  let releaseTimer = 0;
  const RELEASE_INTERVAL = 3000;

  // -- Canvas setup ---------------------------------------------------------------
  function setupCanvas() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    canvas.width  = COLS * CELL;
    canvas.height = ROWS * CELL;
  }

  // -- Map utilities --------------------------------------------------------------
  function copyMap(src) {
    return src.map(row => row.slice());
  }

  function isWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    // Tunnel: col wraps
    const c = ((col % COLS) + COLS) % COLS;
    const r = ((row % ROWS) + ROWS) % ROWS;
    const t = map[r][c];
    return t === 1;
  }

  function isGhostHouse(col, row) {
    const c = ((col % COLS) + COLS) % COLS;
    const r = ((row % ROWS) + ROWS) % ROWS;
    return map[r][c] === 4;
  }

  function countDots(m) {
    let n = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (m[r][c] === 2 || m[r][c] === 3) n++;
    return n;
  }

  // -- Level init -----------------------------------------------------------------
  function initLevel(lvl, idx) {
    level = lvl;
    mazeIndex = idx % MAZES.length;
    map = copyMap(MAZES[mazeIndex]);
    totalDots = countDots(map);
    ghostEatChain = 0;
    scaredUntil = 0;
    frozenUntil = 0;
    scoreMultiplier = 1;
    multiplierUntil = 0;
    specialItem = null;
    lastItemSpawn = performance.now();
    playerHistory = [];
    releaseTimer = 0;

    player = {
      col: PLAYER_START.col,
      row: PLAYER_START.row,
      x: PLAYER_START.col * CELL + CELL / 2,
      y: PLAYER_START.row * CELL + CELL / 2,
      prevX: PLAYER_START.col * CELL + CELL / 2,
      prevY: PLAYER_START.row * CELL + CELL / 2,
      moveStart: 0,
      alive: true,
    };
    playerDir = { dc: 0, dr: 0 };
    inputDir = null;

    ghosts = GHOST_START.map((g, i) => ({
      col: g.col,
      row: g.row,
      x: g.col * CELL + CELL / 2,
      y: g.row * CELL + CELL / 2,
      prevX: g.col * CELL + CELL / 2,
      prevY: g.row * CELL + CELL / 2,
      moveStart: 0,
      color: g.color,
      name: g.name,
      type: g.type,
      dir: { dc: 0, dr: 0 },
      released: i === 0, // Blinky starts released
      releaseIndex: i,
      mimicStep: 0,
      dead: false, // eaten while scared
      deadTimer: 0,
    }));
  }

  function initGame() {
    score = 0;
    lives = 3;
    initLevel(1, 0);
  }

  // -- Ghost AI -------------------------------------------------------------------
  function getValidDirs(col, row, allowHouse) {
    const dirs = [
      { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
      { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
    ];
    return dirs.filter(d => {
      const nc = col + d.dc;
      const nr = row + d.dr;
      if (isWall(nc, nr)) return false;
      if (!allowHouse && isGhostHouse(nc, nr)) return false;
      return true;
    });
  }

  function dist(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  function moveGhost(ghost, now) {
    if (!ghost.released) return;
    if (ghost.dead) {
      ghost.deadTimer -= GHOST_SPEED_MS;
      if (ghost.deadTimer <= 0) {
        // Return ghost to house
        ghost.col = GHOST_START[ghost.releaseIndex].col;
        ghost.row = GHOST_START[ghost.releaseIndex].row;
        ghost.prevX = ghost.col * CELL + CELL / 2;
        ghost.prevY = ghost.row * CELL + CELL / 2;
        ghost.x = ghost.prevX;
        ghost.y = ghost.prevY;
        ghost.moveStart = 0;
        ghost.dead = false;
      }
      return;
    }

    const scared = now < scaredUntil;
    const frozen  = now < frozenUntil;
    if (frozen) return;

    // Allow ghosts in the ghost house to move through house tiles to escape
    const inHouse = isGhostHouse(ghost.col, ghost.row);
    const valid = getValidDirs(ghost.col, ghost.row, inHouse);
    if (valid.length === 0) return;

    // Avoid reversing unless only option
    const nonReverse = valid.filter(d => !(d.dc === -ghost.dir.dc && d.dr === -ghost.dir.dr));
    const candidates = nonReverse.length > 0 ? nonReverse : valid;

    let chosen;

    if (inHouse) {
      // Exiting ghost house: prioritize moving up to escape
      const upDir = candidates.find(d => d.dr === -1 && d.dc === 0);
      chosen = upDir || candidates[0];
    } else if (scared) {
      // Flee from player
      chosen = candidates.reduce((best, d) => {
        const nc = ghost.col + d.dc, nr = ghost.row + d.dr;
        return dist(nc, nr, player.col, player.row) > dist(ghost.col + best.dc, ghost.row + best.dr, player.col, player.row)
          ? d : best;
      }, candidates[0]);
    } else {
      switch (ghost.type) {
        case 'chase':
          // Blinky: head directly toward player
          chosen = candidates.reduce((best, d) => {
            const nc = ghost.col + d.dc, nr = ghost.row + d.dr;
            return dist(nc, nr, player.col, player.row) < dist(ghost.col + best.dc, ghost.row + best.dr, player.col, player.row)
              ? d : best;
          }, candidates[0]);
          break;

        case 'ambush':
          // Pinky: target 4 tiles ahead of player
          {
            const tc = player.col + playerDir.dc * 4;
            const tr = player.row + playerDir.dr * 4;
            chosen = candidates.reduce((best, d) => {
              const nc = ghost.col + d.dc, nr = ghost.row + d.dr;
              return dist(nc, nr, tc, tr) < dist(ghost.col + best.dc, ghost.row + best.dr, tc, tr)
                ? d : best;
            }, candidates[0]);
          }
          break;

        case 'mimic':
          // Replay player's recorded position from MIMIC_DELAY_STEPS steps ago
          if (playerHistory.length >= MIMIC_DELAY_STEPS) {
            const target = playerHistory[playerHistory.length - MIMIC_DELAY_STEPS];
            chosen = candidates.reduce((best, d) => {
              const nc = ghost.col + d.dc, nr = ghost.row + d.dr;
              return dist(nc, nr, target.col, target.row) < dist(ghost.col + best.dc, ghost.row + best.dr, target.col, target.row)
                ? d : best;
            }, candidates[0]);
          } else {
            chosen = candidates[Math.floor(Math.random() * candidates.length)];
          }
          break;

        default:
          // Random (Inky, Clyde)
          chosen = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    ghost.dir = chosen;
    ghost.prevX = ghost.col * CELL + CELL / 2;
    ghost.prevY = ghost.row * CELL + CELL / 2;
    ghost.moveStart = now;
    ghost.col += chosen.dc;
    ghost.row += chosen.dr;
    // Tunnel wrap
    ghost.col = ((ghost.col % COLS) + COLS) % COLS;
    ghost.row = ((ghost.row % ROWS) + ROWS) % ROWS;
  }

  // -- Player movement ------------------------------------------------------------
  function tryMove(dc, dr, now) {
    const nc = ((player.col + dc + COLS) % COLS);
    const nr = ((player.row + dr + ROWS) % ROWS);
    if (isWall(nc, nr)) return false;
    if (isGhostHouse(nc, nr)) return false;

    player.prevX = player.col * CELL + CELL / 2;
    player.prevY = player.row * CELL + CELL / 2;
    player.moveStart = now;
    player.col = nc;
    player.row = nr;
    playerDir = { dc, dr };

    // Record history for Mimic
    playerHistory.push({ col: nc, row: nr });
    if (playerHistory.length > MIMIC_DELAY_STEPS + 10) {
      playerHistory.shift();
    }

    // Eat dot
    const t = map[nr][nc];
    if (t === 2) {
      map[nr][nc] = 0;
      score += SCORE_PER_DOT * scoreMultiplier;
      totalDots--;
    } else if (t === 3) {
      map[nr][nc] = 0;
      score += SCORE_PER_POWER * scoreMultiplier;
      totalDots--;
      scaredUntil = performance.now() + SCARED_DURATION;
      ghostEatChain = 0;
    }

    // Eat special item
    if (specialItem && specialItem.col === nc && specialItem.row === nr) {
      applySpecialItem(specialItem.type);
      specialItem = null;
    }

    return true;
  }

  // -- Special items --------------------------------------------------------------
  const ITEM_TYPES = ['freeze', 'scorebomb', 'warp'];

  function findEmptyCells() {
    const empty = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (map[r][c] === 0 && !(player.col === c && player.row === r))
          empty.push({ col: c, row: r });
    return empty;
  }

  function spawnSpecialItem(now) {
    const empty = findEmptyCells();
    if (empty.length === 0) return;
    const cell = empty[Math.floor(Math.random() * empty.length)];
    const type = ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)];
    specialItem = { col: cell.col, row: cell.row, type, spawnedAt: now };
  }

  function applySpecialItem(type) {
    const now = performance.now();
    if (type === 'freeze') {
      frozenUntil = now + FREEZE_DURATION;
    } else if (type === 'scorebomb') {
      scoreMultiplier = 2;
      multiplierUntil = now + MULTIPLIER_DURATION;
    } else if (type === 'warp') {
      // Teleport to random safe empty cell (no ghost nearby)
      const empty = findEmptyCells();
      const safe = empty.filter(cell => {
        return !ghosts.some(g => g.released && !g.dead &&
          Math.abs(g.col - cell.col) + Math.abs(g.row - cell.row) < 3);
      });
      const candidates = safe.length > 0 ? safe : empty;
      if (candidates.length > 0) {
        const dest = candidates[Math.floor(Math.random() * candidates.length)];
        player.col = dest.col;
        player.row = dest.row;
        player.prevX = dest.col * CELL + CELL / 2;
        player.prevY = dest.row * CELL + CELL / 2;
        player.x = player.prevX;
        player.y = player.prevY;
        player.moveStart = 0;
      }
    }
  }

  // -- Collision ------------------------------------------------------------------
  function checkCollisions(now) {
    for (const ghost of ghosts) {
      if (ghost.dead) continue;
      if (!ghost.released) continue;
      if (ghost.col === player.col && ghost.row === player.row) {
        if (now < scaredUntil) {
          // Eat ghost (200/400/800/1600 cascade)
          const pts = GHOST_EAT_BASE * Math.pow(2, ghostEatChain) * scoreMultiplier;
          score += pts;
          ghostEatChain++;
          ghost.dead = true;
          ghost.deadTimer = 4000; // respawn after 4s
        } else {
          // Player hit
          playerHit();
        }
      }
    }
  }

  function playerHit() {
    lives--;
    if (lives <= 0) {
      state = 'gameover';
      submitScore();
      showOverlay('GAME OVER', `Final Score: ${score}`, 'PLAY AGAIN', startGame);
    } else {
      // Reset positions
      player.col = PLAYER_START.col;
      player.row = PLAYER_START.row;
      player.prevX = player.col * CELL + CELL / 2;
      player.prevY = player.row * CELL + CELL / 2;
      player.x = player.prevX;
      player.y = player.prevY;
      player.moveStart = 0;
      playerDir = { dc: 0, dr: 0 };
      inputDir = null;
      ghosts.forEach((g, i) => {
        g.col = GHOST_START[i].col;
        g.row = GHOST_START[i].row;
        g.prevX = g.col * CELL + CELL / 2;
        g.prevY = g.row * CELL + CELL / 2;
        g.x = g.prevX;
        g.y = g.prevY;
        g.moveStart = 0;
        g.dead = false;
        g.released = i === 0;
        g.dir = { dc: 0, dr: 0 };
      });
      scaredUntil = 0;
      frozenUntil = 0;
      scoreMultiplier = 1;
      multiplierUntil = 0;
      releaseTimer = 0;
    }
  }

  // -- Score submission -----------------------------------------------------------
  function submitScore() {
    fetch('/api/scores/pacmaze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ score }),
    })
      .then(async (res) => {
        if (res.status === 401) {
          showOverlayMessage('Log in to save your score');
        } else if (res.status === 429) {
          showOverlayMessage('Score already submitted recently');
        } else if (res.ok) {
          const data = await res.json();
          showOverlayMessage(`Saved! You ranked #${data.rank}`);
          if (window.loadMiniLeaderboard) window.loadMiniLeaderboard();
        } else {
          showOverlayMessage('Score could not be saved');
        }
      })
      .catch((err) => {
        console.error('Score submission failed:', err);
        showOverlayMessage('Score could not be saved');
      });
  }

  // -- Overlay helpers ------------------------------------------------------------
  function showOverlay(title, msg, btnText, btnAction) {
    const overlay = document.getElementById('overlay');
    overlay.style.display = 'flex';
    overlay.innerHTML = '';

    const h2 = document.createElement('h2');
    h2.textContent = title;

    const p = document.createElement('p');
    p.textContent = msg;

    const btn = document.createElement('button');
    btn.id = 'overlay-btn';
    btn.textContent = btnText;
    btn.addEventListener('click', () => {
      overlay.style.display = 'none';
      btnAction();
    });

    overlay.append(h2, p, btn);
  }

  function showOverlayMessage(msg) {
    const overlay = document.getElementById('overlay');
    const existing = overlay.querySelector('.overlay-status');
    if (existing) existing.remove();
    const p = document.createElement('p');
    p.className = 'overlay-status';
    p.style.fontSize = '0.85rem';
    p.style.color = '#FFD700';
    p.style.marginTop = '4px';
    p.textContent = msg;
    overlay.appendChild(p);
  }

  function hideOverlay() {
    document.getElementById('overlay').style.display = 'none';
  }

  // -- HUD update -----------------------------------------------------------------
  function updateHUD() {
    document.getElementById('score-display').textContent = score;
    document.getElementById('lives-display').textContent = lives;
    document.getElementById('level-display').textContent = level;
  }

  // -- Smooth interpolation -------------------------------------------------------
  function interpolate(entity, speedMs, now) {
    const targetX = entity.col * CELL + CELL / 2;
    const targetY = entity.row * CELL + CELL / 2;
    if (!entity.moveStart) {
      entity.x = targetX;
      entity.y = targetY;
      return;
    }
    // Snap on tunnel wrap (distance > 1 cell means wrap-around)
    if (Math.abs(targetX - entity.prevX) > CELL * 1.5 ||
        Math.abs(targetY - entity.prevY) > CELL * 1.5) {
      entity.x = targetX;
      entity.y = targetY;
      return;
    }
    const t = Math.max(0, Math.min((now - entity.moveStart) / speedMs, 1));
    entity.x = entity.prevX + (targetX - entity.prevX) * t;
    entity.y = entity.prevY + (targetY - entity.prevY) * t;
  }

  // -- Drawing --------------------------------------------------------------------
  function drawMaze() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = map[r][c];
        const x = c * CELL;
        const y = r * CELL;

        if (t === 1) {
          ctx.fillStyle = '#1a1aff';
          ctx.fillRect(x, y, CELL, CELL);
          // Inner highlight
          ctx.fillStyle = '#3333ff';
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        } else {
          ctx.fillStyle = '#000';
          ctx.fillRect(x, y, CELL, CELL);
        }

        if (t === 2) {
          // Dot
          ctx.fillStyle = '#FFE5B4';
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === 3) {
          // Power pellet (pulsing)
          const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 200);
          ctx.fillStyle = `rgba(255, 255, 255, ${pulse})`;
          ctx.beginPath();
          ctx.arc(x + CELL / 2, y + CELL / 2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  function drawSpecialItem() {
    if (!specialItem) return;
    const x = specialItem.col * CELL;
    const y = specialItem.row * CELL;
    ctx.font = `${CELL - 2}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let icon;
    if (specialItem.type === 'freeze')    icon = '\u2744';    // snowflake
    if (specialItem.type === 'scorebomb') icon = '\u2B50';    // star
    if (specialItem.type === 'warp')      icon = '\u{1F300}'; // portal/cyclone
    ctx.fillText(icon, x + CELL / 2, y + CELL / 2);
  }

  function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const r = CELL / 2 - 2;

    ctx.fillStyle = scoreMultiplier > 1 ? '#FF6600' : '#FFD700';
    ctx.beginPath();

    const mouth = mouthOpen ? 0.25 : 0.05;
    let angle = 0; // facing right by default
    if (playerDir.dc === -1) angle = Math.PI;
    if (playerDir.dr === 1)  angle = Math.PI / 2;
    if (playerDir.dr === -1) angle = -Math.PI / 2;

    ctx.moveTo(x, y);
    ctx.arc(x, y, r, angle + mouth * Math.PI, angle + (2 - mouth) * Math.PI);
    ctx.closePath();
    ctx.fill();

    // Score multiplier glow ring
    if (scoreMultiplier > 1) {
      ctx.strokeStyle = '#FF6600';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawGhosts(now) {
    for (const ghost of ghosts) {
      if (!ghost.released) continue;
      if (ghost.dead) continue;

      const x = ghost.x;
      const y = ghost.y;
      const r = CELL / 2 - 2;

      const scared = now < scaredUntil;
      const blinking = scared && (scaredUntil - now < 2000) && (Math.floor(Date.now() / 250) % 2 === 0);

      ctx.fillStyle = scared ? (blinking ? '#fff' : '#0000ff') : ghost.color;

      // Ghost body (rounded top + zigzag bottom)
      ctx.beginPath();
      ctx.arc(x, y - r * 0.1, r, Math.PI, 0);
      // Zigzag bottom
      const bottom = y + r - 2;
      const left = x - r;
      const right = x + r;
      ctx.lineTo(right, bottom);
      const segs = 3;
      const segW = (right - left) / segs;
      for (let i = 0; i <= segs; i++) {
        const sx = right - i * segW;
        const sy = (i % 2 === 0) ? bottom : bottom - 5;
        ctx.lineTo(sx, sy);
      }
      ctx.lineTo(left, bottom);
      ctx.closePath();
      ctx.fill();

      // Eyes (unless scared)
      if (!scared) {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x - 3, y - 3, 3, 0, Math.PI * 2);
        ctx.arc(x + 3, y - 3, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#00f';
        ctx.beginPath();
        ctx.arc(x - 3 + ghost.dir.dc, y - 3 + ghost.dir.dr, 1.5, 0, Math.PI * 2);
        ctx.arc(x + 3 + ghost.dir.dc, y - 3 + ghost.dir.dr, 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Scared face
        ctx.fillStyle = blinking ? '#000' : '#FFD700';
        ctx.beginPath();
        ctx.arc(x - 3, y - 2, 2, 0, Math.PI * 2);
        ctx.arc(x + 3, y - 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Mimic ghost label
      if (ghost.type === 'mimic' && !scared) {
        ctx.fillStyle = '#fff';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('M', x, y + r + 8);
      }
    }
  }

  function drawStatusEffects(now) {
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    let effectY = 12;

    if (now < scaredUntil) {
      ctx.fillStyle = '#00f';
      ctx.fillText('SCARED ' + Math.ceil((scaredUntil - now) / 1000) + 's', 4, effectY);
      effectY += 14;
    }
    if (now < frozenUntil) {
      ctx.fillStyle = '#0ff';
      ctx.fillText('FROZEN ' + Math.ceil((frozenUntil - now) / 1000) + 's', 4, effectY);
      effectY += 14;
    }
    if (scoreMultiplier > 1 && now < multiplierUntil) {
      ctx.fillStyle = '#f60';
      ctx.fillText('2x SCORE ' + Math.ceil((multiplierUntil - now) / 1000) + 's', 4, effectY);
    }
  }

  function draw(now) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    drawSpecialItem();
    drawPlayer();
    drawGhosts(now);
    drawStatusEffects(now);
  }

  // -- Main game loop -------------------------------------------------------------
  let lastFrame = 0;

  function gameLoop(ts) {
    if (state !== 'playing') return;

    const now = performance.now();
    const dt = ts - lastFrame;
    lastFrame = ts;

    // Mouth animation
    mouthTimer += dt;
    if (mouthTimer > MOUTH_SPEED) {
      mouthOpen = !mouthOpen;
      mouthTimer = 0;
    }

    // Player move
    if (now - lastPlayerMove > PLAYER_SPEED_MS) {
      // Try buffered input first, then continue current direction
      let moved = false;
      if (inputDir) {
        moved = tryMove(inputDir.dc, inputDir.dr, now);
        if (moved) {
          playerDir = inputDir;
          inputDir = null;
        }
      }
      if (!moved && (playerDir.dc !== 0 || playerDir.dr !== 0)) {
        tryMove(playerDir.dc, playerDir.dr, now);
      }
      lastPlayerMove = now;
    }

    // Ghost release
    releaseTimer += dt;
    if (releaseTimer > RELEASE_INTERVAL) {
      releaseTimer = 0;
      const next = ghosts.find(g => !g.released);
      if (next) {
        next.released = true;
        // Move toward house exit
        next.col = 10; next.row = 8;
        next.prevX = next.col * CELL + CELL / 2;
        next.prevY = next.row * CELL + CELL / 2;
        next.x = next.prevX;
        next.y = next.prevY;
        next.moveStart = 0;
      }
    }

    // Ghost movement
    if (now - lastGhostMove > GHOST_SPEED_MS) {
      ghosts.forEach(g => moveGhost(g, now));
      lastGhostMove = now;
    }

    // Score multiplier expiry
    if (scoreMultiplier > 1 && now > multiplierUntil) {
      scoreMultiplier = 1;
    }

    // Special item spawn / expiry
    if (!specialItem && now - lastItemSpawn > ITEM_SPAWN_MS) {
      spawnSpecialItem(now);
      lastItemSpawn = now;
    }
    if (specialItem && now - specialItem.spawnedAt > ITEM_LIFETIME) {
      specialItem = null;
      lastItemSpawn = now;
    }

    // Collisions
    checkCollisions(now);
    if (state !== 'playing') {
      updateHUD();
      return;
    }

    // Level complete
    if (totalDots <= 0) {
      state = 'levelcomplete';
      showOverlay(
        'LEVEL COMPLETE!',
        `Score: ${score} -- Ready for Level ${level + 1}?`,
        'NEXT LEVEL',
        () => {
          initLevel(level + 1, mazeIndex + 1);
          state = 'playing';
          lastFrame = performance.now();
          requestAnimationFrame(gameLoop);
        }
      );
    }

    // Smooth interpolation for rendering
    interpolate(player, PLAYER_SPEED_MS, now);
    ghosts.forEach(g => { if (g.released && !g.dead) interpolate(g, GHOST_SPEED_MS, now); });

    updateHUD();
    draw(now);
    requestAnimationFrame(gameLoop);
  }

  // -- Input ----------------------------------------------------------------------
  document.addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A': inputDir = { dc: -1, dr: 0 }; e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': inputDir = { dc:  1, dr: 0 }; e.preventDefault(); break;
      case 'ArrowUp':    case 'w': case 'W': inputDir = { dc: 0, dr: -1 }; e.preventDefault(); break;
      case 'ArrowDown':  case 's': case 'S': inputDir = { dc: 0, dr:  1 }; e.preventDefault(); break;
    }
  });

  // -- Touch input (swipe detection) ---------------------------------------------
  (function bindTouch() {
    let touchStartX = 0;
    let touchStartY = 0;

    // Wait for canvas to be set up, then bind
    window.addEventListener('load', () => {
      const c = document.getElementById('game-canvas');

      c.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
      }, { passive: false });

      c.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (state !== 'playing') return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);

        if (Math.max(absDx, absDy) < 30) return;

        if (absDx > absDy) {
          inputDir = dx > 0 ? { dc: 1, dr: 0 } : { dc: -1, dr: 0 };
        } else {
          inputDir = dy > 0 ? { dc: 0, dr: 1 } : { dc: 0, dr: -1 };
        }
      }, { passive: false });
    });
  })();

  // -- Start ----------------------------------------------------------------------
  function startGame() {
    initGame();
    state = 'playing';
    lastFrame = performance.now();
    lastPlayerMove = lastFrame;
    lastGhostMove = lastFrame;
    hideOverlay();
    requestAnimationFrame(gameLoop);
  }

  window.addEventListener('load', () => {
    setupCanvas();
    updateHUD();

    document.getElementById('start-btn').addEventListener('click', () => {
      startGame();
    });
  });
})();
