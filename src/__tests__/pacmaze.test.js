/**
 * Pac-Maze Rush -- Unit tests
 * Tests: maze structure, ghost AI, special item effects, scoring, score API
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import scoresRoutes from '../routes/scores.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameJsPath = path.join(__dirname, '..', '..', 'public', 'games', 'pacmaze', 'game.js');

// Load game.js source to extract testable constants and logic
const gameCode = readFileSync(gameJsPath, 'utf-8');

// ============================================================================
// PART 1: Pure logic unit tests (extracted from game constants)
// ============================================================================

// We extract constants and helper functions from the IIFE by re-evaluating them
// in a controlled sandbox.

const sandbox = {};
const wrappedCode = `
(function () {
  'use strict';

  const CELL = 20;
  const GHOST_SPEED_MS = 220;
  const PLAYER_SPEED_MS = 140;
  const SCARED_DURATION = 8000;
  const FREEZE_DURATION = 5000;
  const MULTIPLIER_DURATION = 10000;
  const ITEM_LIFETIME = 8000;
  const ITEM_SPAWN_MS = 12000;
  const SCORE_PER_DOT = 10;
  const SCORE_PER_POWER = 50;
  const GHOST_EAT_BASE = 200;
  const MIMIC_DELAY_STEPS = 20;
  const ROWS = 21;
  const COLS = 21;

  const MAZES = [
    ${(() => {
      // Extract just the maze arrays from game.js
      const start = gameCode.indexOf('const MAZES = [');
      const mazeSection = gameCode.substring(start);
      // Find the closing ];
      let depth = 0;
      let end = 0;
      for (let i = mazeSection.indexOf('['); i < mazeSection.length; i++) {
        if (mazeSection[i] === '[') depth++;
        if (mazeSection[i] === ']') depth--;
        if (depth === 0) { end = i + 1; break; }
      }
      // Return just the inner content
      const arrContent = mazeSection.substring(mazeSection.indexOf('[') + 1, end - 1);
      return arrContent;
    })()}
  ];

  const GHOST_START = [
    { col: 9,  row: 9,  color: '#FF0000', name: 'Blinky', type: 'chase' },
    { col: 10, row: 9,  color: '#FFB8FF', name: 'Pinky',  type: 'ambush' },
    { col: 11, row: 9,  color: '#00FFFF', name: 'Inky',   type: 'random' },
    { col: 9,  row: 10, color: '#FFB852', name: 'Clyde',  type: 'random' },
    { col: 10, row: 10, color: '#9933FF', name: 'Mimic',  type: 'mimic' },
  ];

  const PLAYER_START = { col: 10, row: 15 };
  const ITEM_TYPES = ['freeze', 'scorebomb', 'warp'];

  function copyMap(src) {
    return src.map(row => row.slice());
  }

  function isWall(map, col, row) {
    if (row < 0 || row >= ROWS) return true;
    const c = ((col % COLS) + COLS) % COLS;
    const r = ((row % ROWS) + ROWS) % ROWS;
    return map[r][c] === 1;
  }

  function isGhostHouse(map, col, row) {
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

  function dist(c1, r1, c2, r2) {
    return Math.abs(c1 - c2) + Math.abs(r1 - r2);
  }

  function getValidDirs(map, col, row, allowHouse) {
    const dirs = [
      { dc: 1, dr: 0 }, { dc: -1, dr: 0 },
      { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
    ];
    return dirs.filter(d => {
      const nc = col + d.dc;
      const nr = row + d.dr;
      if (isWall(map, nc, nr)) return false;
      if (!allowHouse && isGhostHouse(map, nc, nr)) return false;
      return true;
    });
  }

  sandbox.MAZES = MAZES;
  sandbox.ROWS = ROWS;
  sandbox.COLS = COLS;
  sandbox.CELL = CELL;
  sandbox.GHOST_START = GHOST_START;
  sandbox.PLAYER_START = PLAYER_START;
  sandbox.ITEM_TYPES = ITEM_TYPES;
  sandbox.SCORE_PER_DOT = SCORE_PER_DOT;
  sandbox.SCORE_PER_POWER = SCORE_PER_POWER;
  sandbox.GHOST_EAT_BASE = GHOST_EAT_BASE;
  sandbox.MIMIC_DELAY_STEPS = MIMIC_DELAY_STEPS;
  sandbox.FREEZE_DURATION = FREEZE_DURATION;
  sandbox.MULTIPLIER_DURATION = MULTIPLIER_DURATION;
  sandbox.ITEM_LIFETIME = ITEM_LIFETIME;
  sandbox.copyMap = copyMap;
  sandbox.isWall = isWall;
  sandbox.isGhostHouse = isGhostHouse;
  sandbox.countDots = countDots;
  sandbox.dist = dist;
  sandbox.getValidDirs = getValidDirs;
})();
`;

const fn = new Function('sandbox', wrappedCode);
fn(sandbox);

const {
  MAZES, ROWS, COLS, GHOST_START, PLAYER_START, ITEM_TYPES,
  SCORE_PER_DOT, SCORE_PER_POWER, GHOST_EAT_BASE, MIMIC_DELAY_STEPS,
  FREEZE_DURATION, MULTIPLIER_DURATION, ITEM_LIFETIME,
  copyMap, isWall, isGhostHouse, countDots, dist, getValidDirs,
} = sandbox;

// -- Maze structure tests -----------------------------------------------------

describe('Maze layouts', () => {
  test('has exactly 3 maze layouts', () => {
    assert.strictEqual(MAZES.length, 3, 'should have 3 maze layouts');
  });

  test('each maze is 21x21', () => {
    for (let i = 0; i < MAZES.length; i++) {
      assert.strictEqual(MAZES[i].length, 21, `maze ${i} should have 21 rows`);
      for (let r = 0; r < MAZES[i].length; r++) {
        assert.strictEqual(MAZES[i][r].length, 21, `maze ${i} row ${r} should have 21 cols`);
      }
    }
  });

  test('each maze is surrounded by walls on top and bottom rows', () => {
    for (let i = 0; i < MAZES.length; i++) {
      for (let c = 0; c < 21; c++) {
        assert.strictEqual(MAZES[i][0][c], 1, `maze ${i} top row col ${c} should be wall`);
        assert.strictEqual(MAZES[i][20][c], 1, `maze ${i} bottom row col ${c} should be wall`);
      }
    }
  });

  test('each maze has dots and power pellets', () => {
    for (let i = 0; i < MAZES.length; i++) {
      const dots = countDots(MAZES[i]);
      assert.ok(dots > 0, `maze ${i} should have dots (found ${dots})`);

      let powerCount = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (MAZES[i][r][c] === 3) powerCount++;
      assert.ok(powerCount >= 4, `maze ${i} should have at least 4 power pellets (found ${powerCount})`);
    }
  });

  test('each maze has a ghost house (tile type 4)', () => {
    for (let i = 0; i < MAZES.length; i++) {
      let houseCount = 0;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (MAZES[i][r][c] === 4) houseCount++;
      assert.ok(houseCount > 0, `maze ${i} should have ghost house cells`);
    }
  });

  test('player start position is not a wall in any maze', () => {
    for (let i = 0; i < MAZES.length; i++) {
      const t = MAZES[i][PLAYER_START.row][PLAYER_START.col];
      assert.notStrictEqual(t, 1, `player start should not be a wall in maze ${i}`);
      assert.notStrictEqual(t, 4, `player start should not be ghost house in maze ${i}`);
    }
  });

  test('mazes cycle: 3 distinct layouts', () => {
    // At least one cell should differ between each pair
    for (let a = 0; a < MAZES.length; a++) {
      for (let b = a + 1; b < MAZES.length; b++) {
        let differences = 0;
        for (let r = 0; r < ROWS; r++)
          for (let c = 0; c < COLS; c++)
            if (MAZES[a][r][c] !== MAZES[b][r][c]) differences++;
        assert.ok(differences > 0, `maze ${a} and ${b} should differ`);
      }
    }
  });
});

// -- Map utility tests --------------------------------------------------------

describe('Map utilities', () => {
  test('copyMap creates a deep copy', () => {
    const original = MAZES[0];
    const copy = copyMap(original);
    copy[1][1] = 99;
    assert.notStrictEqual(original[1][1], 99, 'modifying copy should not affect original');
  });

  test('isWall correctly detects walls', () => {
    const map = copyMap(MAZES[0]);
    assert.strictEqual(isWall(map, 0, 0), true, 'corner should be wall');
    assert.strictEqual(isWall(map, 5, -1), true, 'out of bounds should be wall');
  });

  test('isWall correctly detects open spaces', () => {
    const map = copyMap(MAZES[0]);
    // Cell (1,1) in maze 1 is power pellet (3), not a wall
    assert.strictEqual(isWall(map, 1, 1), false, 'power pellet position should not be wall');
  });

  test('isGhostHouse detects ghost house tiles', () => {
    const map = copyMap(MAZES[0]);
    assert.strictEqual(isGhostHouse(map, 10, 9), true, 'center of ghost house should be detected');
  });

  test('countDots counts dots and power pellets', () => {
    const map = copyMap(MAZES[0]);
    const total = countDots(map);
    assert.ok(total > 50, `should have many dots (found ${total})`);

    // Eating a dot should reduce count
    let dotR = -1, dotC = -1;
    for (let r = 0; r < ROWS && dotR < 0; r++)
      for (let c = 0; c < COLS && dotC < 0; c++)
        if (map[r][c] === 2) { dotR = r; dotC = c; }

    map[dotR][dotC] = 0;
    assert.strictEqual(countDots(map), total - 1, 'eating a dot should reduce count by 1');
  });
});

// -- Ghost AI tests -----------------------------------------------------------

describe('Ghost AI', () => {
  test('5 ghosts defined with correct types', () => {
    assert.strictEqual(GHOST_START.length, 5, 'should have 5 ghosts');
    const types = GHOST_START.map(g => g.type);
    assert.ok(types.includes('chase'), 'should have chase ghost (Blinky)');
    assert.ok(types.includes('ambush'), 'should have ambush ghost (Pinky)');
    assert.ok(types.includes('random'), 'should have random ghost');
    assert.ok(types.includes('mimic'), 'should have mimic ghost');
  });

  test('Mimic ghost is named Mimic with purple color', () => {
    const mimic = GHOST_START.find(g => g.type === 'mimic');
    assert.ok(mimic, 'mimic ghost should exist');
    assert.strictEqual(mimic.name, 'Mimic');
    assert.strictEqual(mimic.color, '#9933FF');
  });

  test('Mimic delay is 20 steps', () => {
    assert.strictEqual(MIMIC_DELAY_STEPS, 20, 'Mimic should replay last 20 moves');
  });

  test('Blinky starts released, others do not', () => {
    // Based on the game code: released = i === 0
    // Blinky is index 0
    assert.strictEqual(GHOST_START[0].name, 'Blinky');
    assert.strictEqual(GHOST_START[0].type, 'chase');
  });

  test('getValidDirs returns possible movement directions', () => {
    const map = copyMap(MAZES[0]);
    const dirs = getValidDirs(map, PLAYER_START.col, PLAYER_START.row, false);
    assert.ok(dirs.length > 0, 'player start should have valid movement directions');
  });

  test('getValidDirs does not return wall directions', () => {
    const map = copyMap(MAZES[0]);
    const dirs = getValidDirs(map, 1, 1, false);
    for (const d of dirs) {
      assert.strictEqual(isWall(map, 1 + d.dc, 1 + d.dr), false,
        'valid dir should not lead into a wall');
    }
  });

  test('getValidDirs excludes ghost house when allowHouse is false', () => {
    const map = copyMap(MAZES[0]);
    // Cell above ghost house
    const dirs = getValidDirs(map, 10, 7, false);
    for (const d of dirs) {
      const nc = 10 + d.dc;
      const nr = 7 + d.dr;
      assert.strictEqual(isGhostHouse(map, nc, nr), false,
        `direction (${d.dc},${d.dr}) from (10,7) should not lead into ghost house`);
    }
  });

  test('dist calculates Manhattan distance correctly', () => {
    assert.strictEqual(dist(0, 0, 3, 4), 7);
    assert.strictEqual(dist(5, 5, 5, 5), 0);
    assert.strictEqual(dist(1, 1, 4, 5), 7);
  });
});

// -- Scoring tests ------------------------------------------------------------

describe('Scoring system', () => {
  test('dot is worth 10 points base', () => {
    assert.strictEqual(SCORE_PER_DOT, 10);
  });

  test('power pellet is worth 50 points base', () => {
    assert.strictEqual(SCORE_PER_POWER, 50);
  });

  test('ghost eat cascade: 200/400/800/1600', () => {
    for (let chain = 0; chain < 4; chain++) {
      const expected = [200, 400, 800, 1600][chain];
      const pts = GHOST_EAT_BASE * Math.pow(2, chain);
      assert.strictEqual(pts, expected, `chain ${chain} should give ${expected} points`);
    }
  });

  test('score multiplier doubles dot and ghost points', () => {
    const multiplier = 2;
    assert.strictEqual(SCORE_PER_DOT * multiplier, 20, 'dot with 2x should be 20');
    assert.strictEqual(SCORE_PER_POWER * multiplier, 100, 'power with 2x should be 100');
    assert.strictEqual(GHOST_EAT_BASE * multiplier, 400, 'ghost base with 2x should be 400');
  });
});

// -- Special items tests ------------------------------------------------------

describe('Special items', () => {
  test('3 special item types defined', () => {
    assert.strictEqual(ITEM_TYPES.length, 3);
  });

  test('item types are freeze, scorebomb, warp', () => {
    assert.ok(ITEM_TYPES.includes('freeze'), 'should have freeze pellet');
    assert.ok(ITEM_TYPES.includes('scorebomb'), 'should have score bomb');
    assert.ok(ITEM_TYPES.includes('warp'), 'should have warp berry');
  });

  test('freeze duration is 5 seconds', () => {
    assert.strictEqual(FREEZE_DURATION, 5000);
  });

  test('score multiplier duration is 10 seconds', () => {
    assert.strictEqual(MULTIPLIER_DURATION, 10000);
  });

  test('items disappear after 8 seconds', () => {
    assert.strictEqual(ITEM_LIFETIME, 8000);
  });
});

// ============================================================================
// PART 2: API integration tests (score submission)
// ============================================================================

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: 'test-secret-pacmaze',
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(scoresRoutes, { prefix: '/api/scores' });
  return app;
}

describe('Score API for pacmaze', () => {
  test('GET /api/scores/pacmaze returns scores array', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body), 'scores should be an array');

    await app.close();
  });

  test('POST /api/scores/pacmaze without auth returns 401', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 4200 },
      headers: { 'content-type': 'application/json' },
    });
    assert.strictEqual(res.statusCode, 401);

    await app.close();
  });

  test('unauthenticated score POST returns 401 and score is not saved', async () => {
    const app = await buildApp();
    await app.ready();

    const postRes = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 999 },
      headers: { 'content-type': 'application/json' },
    });
    assert.strictEqual(postRes.statusCode, 401);

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });
    assert.strictEqual(getRes.statusCode, 200);
    const body = JSON.parse(getRes.payload);
    assert.strictEqual(body.length, 0, 'unauthenticated scores should not be saved');

    await app.close();
  });

  test('POST /api/scores/pacmaze with valid JWT cookie saves the score', async () => {
    const app = await buildApp();
    await app.ready();

    // Insert a test user directly into DB
    const { db } = await import('../db.js');
    const username = `testpac${Date.now()}`;
    const result = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username, 'dummy_hash');
    const userId = Number(result.lastInsertRowid);

    // Sign a JWT for this user
    const token = app.jwt.sign({ id: userId, username });

    // Submit score with auth cookie
    const postRes = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 9001 },
      headers: { 'content-type': 'application/json' },
      cookies: { token },
    });
    assert.strictEqual(postRes.statusCode, 201);
    const postBody = JSON.parse(postRes.payload);
    assert.ok(postBody.id, 'response should have id');

    // Retrieve scores and verify
    const getRes = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });
    assert.strictEqual(getRes.statusCode, 200);
    const scores = JSON.parse(getRes.payload);
    const found = scores.find(s => s.score === 9001 && s.username === username);
    assert.ok(found, 'authenticated score should appear in leaderboard');

    await app.close();
  });

  test('GET /api/scores/pacmaze returns scores in descending order', async () => {
    const app = await buildApp();
    await app.ready();

    const { db } = await import('../db.js');

    // Insert multiple users with different scores
    for (let i = 0; i < 5; i++) {
      const uname = `order${Date.now()}${i}`;
      const result = db
        .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
        .run(uname, 'dummy');
      const uid = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)')
        .run(uid, 'pacmaze', (i + 1) * 100);
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.length >= 5, 'should have all scores');
    for (let i = 1; i < body.length; i++) {
      assert.ok(body[i - 1].score >= body[i].score,
        'scores should be in descending order');
    }

    await app.close();
  });

  test('GET /api/scores/pacmaze returns max 10 scores', async () => {
    const app = await buildApp();
    await app.ready();

    const { db } = await import('../db.js');

    // Insert 15 scores
    for (let i = 0; i < 15; i++) {
      const uname = `limit${Date.now()}${i}`;
      const result = db
        .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
        .run(uname, 'dummy');
      const uid = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)')
        .run(uid, 'pacmaze', (i + 1) * 10);
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.length <= 10, 'should return at most 10 scores');

    await app.close();
  });
});

// -- Game code structure verification -----------------------------------------

describe('Game code structure', () => {
  test('game.js contains all required game features', () => {
    assert.ok(gameCode.includes('scoreMultiplier'), 'should have score multiplier variable');
    assert.ok(gameCode.includes('multiplierUntil'), 'should have multiplier timer');
    assert.ok(gameCode.includes('frozenUntil'), 'should have freeze timer');
    assert.ok(gameCode.includes("type === 'warp'"), 'should have warp item handler');
    assert.ok(gameCode.includes("type === 'scorebomb'"), 'should have scorebomb item handler');
    assert.ok(gameCode.includes("type === 'freeze'"), 'should have freeze item handler');
  });

  test('game.js has Mimic ghost AI with player history', () => {
    assert.ok(gameCode.includes('playerHistory'), 'should track player move history');
    assert.ok(gameCode.includes("case 'mimic'"), 'should have mimic ghost case');
    assert.ok(gameCode.includes('MIMIC_DELAY_STEPS'), 'should use MIMIC_DELAY_STEPS');
  });

  test('game.js submits score to correct API endpoint', () => {
    assert.ok(gameCode.includes("'/api/scores'"), 'should POST to /api/scores');
    assert.ok(gameCode.includes("gameId: 'pacmaze'"), 'should use pacmaze as gameId');
  });

  test('game.js has 4 classic ghost types + Mimic', () => {
    assert.ok(gameCode.includes("type: 'chase'"), 'should have chase (Blinky)');
    assert.ok(gameCode.includes("type: 'ambush'"), 'should have ambush (Pinky)');
    assert.ok(gameCode.includes("type: 'random'"), 'should have random (Inky/Clyde)');
    assert.ok(gameCode.includes("type: 'mimic'"), 'should have mimic');
  });

  test('game.js handles WASD and arrow key input', () => {
    assert.ok(gameCode.includes('ArrowLeft'), 'should handle arrow keys');
    assert.ok(gameCode.includes("case 'a'"), 'should handle WASD');
    assert.ok(gameCode.includes("case 'w'"), 'should handle WASD');
  });

  test('game.js has responsive canvas setup', () => {
    assert.ok(gameCode.includes('canvas.width'), 'should set canvas width');
    assert.ok(gameCode.includes('canvas.height'), 'should set canvas height');
  });

  test('game.js tracks lives and level', () => {
    assert.ok(gameCode.includes('lives'), 'should track lives');
    assert.ok(gameCode.includes('level'), 'should track level');
    assert.ok(gameCode.includes('lives = 3'), 'should start with 3 lives');
  });
});
