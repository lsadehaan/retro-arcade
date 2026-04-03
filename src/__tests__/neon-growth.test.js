/**
 * Neon Growth — Unit tests for game logic
 * Tests: Snake movement, segment growth, food types, trail, wall generation
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameJsPath = path.join(__dirname, '..', '..', 'public', 'games', 'snake', 'game.js');

const gameCode = readFileSync(gameJsPath, 'utf-8');

// Extract everything before the Bootstrap section
const bootstrapMarker = '// ── Bootstrap';
const logicCode = gameCode.substring(0, gameCode.indexOf(bootstrapMarker));

// Minimal browser-like environment
const mockPerformanceNow = (() => {
  let t = 0;
  return () => (t += 16);
})();

const moduleExports = {};
const wrappedCode = `
  ${logicCode}
  moduleExports.NeonGrowth = NeonGrowth;
  moduleExports.FOOD_TYPES = FOOD_TYPES;
  moduleExports.FOOD_KEYS = FOOD_KEYS;
  moduleExports.COLS = COLS;
  moduleExports.ROWS = ROWS;
  moduleExports.BASE_INTERVAL = BASE_INTERVAL;
  moduleExports.TRAIL_FADE_MS = TRAIL_FADE_MS;
  moduleExports.TRAIL_SOLID_MS = TRAIL_SOLID_MS;
  moduleExports.MAX_FOOD_ON_SCREEN = MAX_FOOD_ON_SCREEN;
`;

const fn = new Function(
  'moduleExports', 'document', 'localStorage', 'window',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame', 'fetch',
  wrappedCode
);

const makeDomEl = () => ({
  textContent: '', style: {}, innerHTML: '', className: '',
  appendChild: () => {}, addEventListener: () => {},
  querySelector: () => null, remove: () => {},
});

fn(
  moduleExports,
  { addEventListener: () => {}, createElement: makeDomEl },
  { getItem: () => null, setItem: () => {} },
  {},
  { now: mockPerformanceNow },
  () => 0,
  () => {},
  () => Promise.resolve(),
);

const {
  NeonGrowth, FOOD_TYPES, FOOD_KEYS, COLS, ROWS,
  BASE_INTERVAL, TRAIL_FADE_MS, TRAIL_SOLID_MS, MAX_FOOD_ON_SCREEN,
} = moduleExports;

// Helper: build a minimal game instance without canvas rendering
function buildGame() {
  const mockCtx = {
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arc: () => {},
    fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {},
    shadowColor: '', shadowBlur: 0, fillStyle: '', strokeStyle: '',
    lineWidth: 0, globalAlpha: 1,
  };
  const mockCanvas = { getContext: () => mockCtx, width: 0, height: 0 };
  const mockOverlay = { innerHTML: '', style: {}, appendChild: () => {}, querySelector: () => null };
  const mockEl = { textContent: '' };

  const game = new NeonGrowth(mockCanvas, mockOverlay, mockEl, mockEl, mockEl);
  game._reset();
  return game;
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe('Game constants', () => {
  test('board is 30x30 cells', () => {
    assert.strictEqual(COLS, 30);
    assert.strictEqual(ROWS, 30);
  });

  test('base tick interval is 150ms', () => {
    assert.strictEqual(BASE_INTERVAL, 150);
  });

  test('trail fades after 8s and is solid for first 6s', () => {
    assert.strictEqual(TRAIL_FADE_MS, 8000);
    assert.strictEqual(TRAIL_SOLID_MS, 6000);
  });

  test('max food on screen is 2', () => {
    assert.strictEqual(MAX_FOOD_ON_SCREEN, 2);
  });
});

// ── Food type definitions ─────────────────────────────────────────────────────

describe('Food types', () => {
  test('there are exactly 3 food types: gold, silver, diamond', () => {
    assert.deepStrictEqual(FOOD_KEYS, ['gold', 'silver', 'diamond']);
  });

  test('gold apple awards 50 points and 5 segments', () => {
    assert.strictEqual(FOOD_TYPES.gold.points, 50);
    assert.strictEqual(FOOD_TYPES.gold.segments, 5);
    assert.strictEqual(FOOD_TYPES.gold.speedDuration, 0, 'gold does not grant speed boost');
  });

  test('silver circle awards 25 points, 2 segments, and speed boost', () => {
    assert.strictEqual(FOOD_TYPES.silver.points, 25);
    assert.strictEqual(FOOD_TYPES.silver.segments, 2);
    assert.strictEqual(FOOD_TYPES.silver.speedMult, 1.3);
    assert.ok(FOOD_TYPES.silver.speedDuration > 0, 'silver grants a speed boost');
  });

  test('diamond awards 200 points and 10 segments', () => {
    assert.strictEqual(FOOD_TYPES.diamond.points, 200);
    assert.strictEqual(FOOD_TYPES.diamond.segments, 10);
    assert.strictEqual(FOOD_TYPES.diamond.speedDuration, 0, 'diamond does not grant speed boost');
  });
});

// ── Initial state ─────────────────────────────────────────────────────────────

describe('Game initialisation', () => {
  test('snake starts at board center with length 1', () => {
    const game = buildGame();
    assert.strictEqual(game.snake.length, 1);
    const midX = Math.floor(COLS / 2);
    const midY = Math.floor(ROWS / 2);
    assert.strictEqual(game.snake[0].x, midX);
    assert.strictEqual(game.snake[0].y, midY);
  });

  test('initial direction is right', () => {
    const game = buildGame();
    assert.strictEqual(game.dir, 'right');
  });

  test('score starts at 0', () => {
    const game = buildGame();
    assert.strictEqual(game.score, 0);
  });

  test('food is spawned on reset (up to MAX_FOOD_ON_SCREEN)', () => {
    const game = buildGame();
    assert.ok(game.foods.length > 0, 'food should be present on start');
    assert.ok(game.foods.length <= MAX_FOOD_ON_SCREEN);
  });

  test('trail and walls are empty on reset', () => {
    const game = buildGame();
    assert.strictEqual(game.trail.length, 0);
    assert.strictEqual(game.walls.size, 0);
  });
});

// ── Snake movement (_tick) ────────────────────────────────────────────────────

describe('Snake movement', () => {
  test('snake head moves right by one cell each tick', () => {
    const game = buildGame();
    game.foods = []; // prevent food interaction
    const startX = game.snake[0].x;
    const startY = game.snake[0].y;
    game.dir = 'right';

    game._tick();

    assert.strictEqual(game.snake[0].x, startX + 1);
    assert.strictEqual(game.snake[0].y, startY);
  });

  test('snake head moves left by one cell each tick', () => {
    const game = buildGame();
    game.foods = [];
    game.dir = 'left';
    const startX = game.snake[0].x;

    game._tick();

    assert.strictEqual(game.snake[0].x, startX - 1);
  });

  test('snake head moves up by one cell each tick', () => {
    const game = buildGame();
    game.foods = [];
    game.dir = 'up';
    const startY = game.snake[0].y;

    game._tick();

    assert.strictEqual(game.snake[0].y, startY - 1);
  });

  test('snake head moves down by one cell each tick', () => {
    const game = buildGame();
    game.foods = [];
    game.dir = 'down';
    const startY = game.snake[0].y;

    game._tick();

    assert.strictEqual(game.snake[0].y, startY + 1);
  });

  test('snake length stays constant when not growing', () => {
    const game = buildGame();
    game.foods = [];
    game._growQueue = 0;
    const initialLength = game.snake.length;

    game._tick();

    assert.strictEqual(game.snake.length, initialLength);
  });

  test('old head position is added to trail after each tick', () => {
    const game = buildGame();
    game.foods = [];
    const oldHeadX = game.snake[0].x;
    const oldHeadY = game.snake[0].y;

    game._tick();

    const trailHit = game.trail.some((t) => t.x === oldHeadX && t.y === oldHeadY);
    assert.ok(trailHit, 'old head position should appear in trail');
  });
});

// ── Direction buffering (180-degree reversal prevention) ──────────────────────

describe('Direction input buffering', () => {
  test('buffered direction is applied on next tick', () => {
    const game = buildGame();
    game.foods = [];
    game.dir = 'right';
    game._inputBuffer = 'up';

    game._tick();

    assert.strictEqual(game.dir, 'up');
    assert.strictEqual(game._inputBuffer, null, 'buffer cleared after use');
  });

  test('180-degree reversal is prevented', () => {
    const game = buildGame();
    game.foods = [];
    game.dir = 'right';
    game._inputBuffer = 'left'; // direct reversal — must be ignored

    game._tick();

    assert.strictEqual(game.dir, 'right', 'direction should not reverse 180 degrees');
  });
});

// ── Segment growth ────────────────────────────────────────────────────────────

describe('Segment growth', () => {
  test('growQueue decrements each tick and snake grows by one segment', () => {
    const game = buildGame();
    game.foods = [];
    game._growQueue = 3;
    const startLength = game.snake.length;

    game._tick(); // growQueue: 3 -> 2, length +1

    assert.strictEqual(game._growQueue, 2);
    assert.strictEqual(game.snake.length, startLength + 1);
  });

  test('snake grows by food.segments when food is eaten', () => {
    const game = buildGame();
    // Place a gold food exactly where snake head will move
    const head = game.snake[0];
    game.dir = 'right';
    const targetX = head.x + 1;
    const targetY = head.y;
    game.foods = [{ x: targetX, y: targetY, typeKey: 'gold', ...FOOD_TYPES.gold }];

    game._tick();

    assert.strictEqual(game._growQueue, FOOD_TYPES.gold.segments);
    assert.strictEqual(game.score, FOOD_TYPES.gold.points);
  });

  test('silver food triggers speed boost', () => {
    const game = buildGame();
    const head = game.snake[0];
    game.dir = 'right';
    const targetX = head.x + 1;
    const targetY = head.y;
    game.foods = [{ x: targetX, y: targetY, typeKey: 'silver', ...FOOD_TYPES.silver }];

    game._tick();

    assert.ok(game.speedBoostExpiry > 0, 'speed boost expiry should be set after eating silver');
  });

  test('diamond food adds 10 segments to growQueue', () => {
    const game = buildGame();
    const head = game.snake[0];
    game.dir = 'right';
    const targetX = head.x + 1;
    const targetY = head.y;
    game.foods = [{ x: targetX, y: targetY, typeKey: 'diamond', ...FOOD_TYPES.diamond }];

    game._tick();

    assert.strictEqual(game._growQueue, FOOD_TYPES.diamond.segments);
    assert.strictEqual(game.score, FOOD_TYPES.diamond.points);
  });
});

// ── Wall generation ───────────────────────────────────────────────────────────

describe('Wall generation', () => {
  test('walls spawn when segment count crosses a multiple of 10', () => {
    const game = buildGame();
    game._lastWallThreshold = 0;
    // Simulate segmentCount of 10
    game.segmentCount = 10;
    game._lastWallThreshold = 0;

    game._spawnWalls();

    assert.ok(game.walls.size > 0, 'walls should be spawned');
  });

  test('wall cells are stored as "x,y" strings', () => {
    const game = buildGame();
    game._spawnWalls();

    for (const key of game.walls) {
      assert.match(key, /^\d+,\d+$/, 'wall key format should be "x,y"');
    }
  });
});

// ── Collision detection ───────────────────────────────────────────────────────

describe('Collision detection', () => {
  test('game ends when snake hits left boundary', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'left';
    // Put head at x=0 so moving left goes out of bounds
    game.snake = [{ x: 0, y: Math.floor(ROWS / 2) }];

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on boundary collision');
  });

  test('game ends when snake hits right boundary', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'right';
    game.snake = [{ x: COLS - 1, y: Math.floor(ROWS / 2) }];

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on right boundary collision');
  });

  test('game ends when snake hits top boundary', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'up';
    game.snake = [{ x: Math.floor(COLS / 2), y: 0 }];

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on top boundary collision');
  });

  test('game ends when snake hits bottom boundary', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'down';
    game.snake = [{ x: Math.floor(COLS / 2), y: ROWS - 1 }];

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on bottom boundary collision');
  });

  test('game ends when snake collides with itself', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'right';
    // Create a snake body that fills the next cell to the right
    const headX = Math.floor(COLS / 2);
    const headY = Math.floor(ROWS / 2);
    game.snake = [
      { x: headX, y: headY },
      { x: headX + 1, y: headY }, // body segment right ahead
    ];

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on self collision');
  });

  test('game ends when snake hits a wall cell', () => {
    const game = buildGame();
    game.foods = [];
    game.running = true;
    game.dir = 'right';
    const headX = Math.floor(COLS / 2);
    const headY = Math.floor(ROWS / 2);
    game.snake = [{ x: headX, y: headY }];
    game.walls.add(`${headX + 1},${headY}`);

    game._tick();

    assert.strictEqual(game.running, false, 'game should end on wall collision');
  });
});

// ── _isFree helper ────────────────────────────────────────────────────────────

describe('_isFree()', () => {
  test('returns false for snake body cell', () => {
    const game = buildGame();
    const { x, y } = game.snake[0];
    assert.strictEqual(game._isFree(x, y), false);
  });

  test('returns false for wall cell', () => {
    const game = buildGame();
    game.walls.add('5,5');
    assert.strictEqual(game._isFree(5, 5), false);
  });

  test('returns false for food cell', () => {
    const game = buildGame();
    game.foods.push({ x: 3, y: 3, typeKey: 'gold', ...FOOD_TYPES.gold });
    assert.strictEqual(game._isFree(3, 3), false);
  });

  test('returns true for empty cell', () => {
    const game = buildGame();
    // Find a cell that is guaranteed empty (top-left corner, far from center snake)
    assert.strictEqual(game._isFree(0, 0), true);
  });
});

// ── Food spawning ─────────────────────────────────────────────────────────────

describe('Food spawning', () => {
  test('food count does not exceed MAX_FOOD_ON_SCREEN', () => {
    const game = buildGame();
    game.foods = [];
    game._spawnFood();
    assert.ok(game.foods.length <= MAX_FOOD_ON_SCREEN);
  });

  test('each spawned food has a valid type key', () => {
    const game = buildGame();
    for (const food of game.foods) {
      assert.ok(FOOD_KEYS.includes(food.typeKey), `typeKey "${food.typeKey}" should be valid`);
    }
  });

  test('food is not spawned on snake body', () => {
    const game = buildGame();
    const { x, y } = game.snake[0];
    const onSnake = game.foods.some((f) => f.x === x && f.y === y);
    assert.strictEqual(onSnake, false, 'food must not overlap snake');
  });
});
