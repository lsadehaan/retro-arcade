/**
 * Asteroid Defense Surge — Unit tests for game logic
 * Tests: enemy patterns, weapon behavior, collision, scoring, wave progression
 */
import { test, describe } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The game.js is a browser script with Canvas dependencies, so we need to
// extract the testable logic. We load it via a simulated module environment.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gameJsPath = path.join(__dirname, '..', '..', 'public', 'games', 'space-invaders', 'game.js');

// Since the game uses browser globals (document, localStorage, etc.), we need
// to strip the browser bootstrap code and evaluate just the class definitions.
const gameCode = readFileSync(gameJsPath, 'utf-8');

// Extract everything before the Bootstrap section
const bootstrapMarker = '// ── Bootstrap';
const logicCode = gameCode.substring(0, gameCode.indexOf(bootstrapMarker));

// Create a minimal browser-like environment for evaluation
const mockWindow = {
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  cancelAnimationFrame: () => {},
};

// Evaluate the logic code in an isolated context
const moduleExports = {};
const wrappedCode = `
  ${logicCode}
  moduleExports.GameEngine = GameEngine;
  moduleExports.OrbitalEnemy = OrbitalEnemy;
  moduleExports.BossEnemy = BossEnemy;
  moduleExports.Bullet = Bullet;
  moduleExports.LaserBeam = LaserBeam;
  moduleExports.PowerUp = PowerUp;
  moduleExports.Vector2 = Vector2;
  moduleExports.ENEMY_TYPES = ENEMY_TYPES;
  moduleExports.WEAPONS = WEAPONS;
  moduleExports.WEAPON_ORDER = WEAPON_ORDER;
  moduleExports.BOSS_WAVE_INTERVAL = BOSS_WAVE_INTERVAL;
  moduleExports.MAX_LIVES = MAX_LIVES;
  moduleExports.MAX_SHIELD = MAX_SHIELD;
  moduleExports.SHIELD_REGEN_PER_SEC = SHIELD_REGEN_PER_SEC;
  moduleExports.POWERUP_DROP_CHANCE = POWERUP_DROP_CHANCE;
`;

const fn = new Function(
  'moduleExports', 'document', 'localStorage', 'window',
  'performance', 'requestAnimationFrame', 'cancelAnimationFrame',
  'module', 'fetch',
  wrappedCode
);

fn(
  moduleExports,
  { getElementById: () => null, addEventListener: () => {} },
  { getItem: () => null, setItem: () => {} },
  mockWindow,
  mockWindow.performance,
  mockWindow.requestAnimationFrame,
  mockWindow.cancelAnimationFrame,
  { exports: {} },
  () => Promise.resolve({ json: () => ({}) }),
);

const {
  GameEngine, OrbitalEnemy, BossEnemy, Bullet, PowerUp, Vector2,
  MAX_LIVES, MAX_SHIELD,
} = moduleExports;

// ── Vector2 ──────────────────────────────────────────────────────────────────

describe('Vector2', () => {
  test('add returns correct sum', () => {
    const a = new Vector2(1, 2);
    const b = new Vector2(3, 4);
    const c = a.add(b);
    assert.strictEqual(c.x, 4);
    assert.strictEqual(c.y, 6);
  });

  test('normalize produces unit vector', () => {
    const v = new Vector2(3, 4);
    const n = v.normalize();
    assert.ok(Math.abs(n.mag() - 1) < 0.001, 'magnitude should be ~1');
  });

  test('zero vector normalizes to zero', () => {
    const v = new Vector2(0, 0);
    const n = v.normalize();
    assert.strictEqual(n.x, 0);
    assert.strictEqual(n.y, 0);
  });

  test('distTo computes distance', () => {
    const a = new Vector2(0, 0);
    const b = new Vector2(3, 4);
    assert.ok(Math.abs(a.distTo(b) - 5) < 0.001);
  });
});

// ── OrbitalEnemy ─────────────────────────────────────────────────────────────

describe('OrbitalEnemy', () => {
  test('enemy moves in orbital pattern', () => {
    const enemy = new OrbitalEnemy({
      type: 'scout',
      centerX: 200,
      centerY: 100,
      radiusX: 50,
      radiusY: 30,
      angle: 0,
      angularSpeed: 1,
    });

    const startX = enemy.x;
    const startY = enemy.y;

    // Update for some time
    enemy.update(0.5);

    // Position should have changed
    assert.notStrictEqual(enemy.x, startX, 'x should change');
    assert.notStrictEqual(enemy.y, startY, 'y should change');

    // Should still be roughly within orbit radius of center
    const dx = enemy.x - enemy.centerX;
    const dy = enemy.y - enemy.centerY;
    assert.ok(Math.abs(dx) <= enemy.radiusX + 1, 'should stay within radiusX');
    assert.ok(Math.abs(dy) <= enemy.radiusY + 1, 'should stay within radiusY');
  });

  test('enemy orbits elliptically (x and y radii differ)', () => {
    const enemy = new OrbitalEnemy({
      type: 'scout',
      centerX: 200,
      centerY: 100,
      radiusX: 80,
      radiusY: 30,
      angle: 0,
      angularSpeed: 1,
    });

    // At angle 0: x = centerX + radiusX, y = centerY
    assert.ok(Math.abs(enemy.x - 280) < 1, 'at angle 0, x = center + radiusX');
    assert.ok(Math.abs(enemy.y - 100) < 1, 'at angle 0, y = centerY');

    // At angle PI/2: x = centerX, y = centerY + radiusY
    enemy.angle = Math.PI / 2;
    enemy._updatePosition();
    assert.ok(Math.abs(enemy.x - 200) < 1, 'at PI/2, x = centerX');
    assert.ok(Math.abs(enemy.y - 130) < 1, 'at PI/2, y = center + radiusY');
  });

  test('takeDamage reduces HP and kills at 0', () => {
    const enemy = new OrbitalEnemy({
      type: 'scout',
      centerX: 200, centerY: 100,
      radiusX: 50, radiusY: 30,
      angle: 0, angularSpeed: 1,
    });

    assert.strictEqual(enemy.hp, 1);
    const killed = enemy.takeDamage(1);
    assert.strictEqual(killed, true, 'should be killed');
    assert.strictEqual(enemy.alive, false);
  });

  test('takeDamage does not kill if damage < hp', () => {
    const enemy = new OrbitalEnemy({
      type: 'heavy',
      centerX: 200, centerY: 100,
      radiusX: 50, radiusY: 30,
      angle: 0, angularSpeed: 1,
    });

    assert.strictEqual(enemy.hp, 4);
    const killed = enemy.takeDamage(2);
    assert.strictEqual(killed, false);
    assert.strictEqual(enemy.hp, 2);
    assert.strictEqual(enemy.alive, true);
  });
});

// ── BossEnemy ────────────────────────────────────────────────────────────────

describe('BossEnemy', () => {
  test('boss has isBoss flag and larger radius', () => {
    const boss = new BossEnemy({
      type: 'heavy',
      centerX: 350, centerY: 100,
      radiusX: 100, radiusY: 40,
      angle: 0, angularSpeed: 0.3,
      hp: 40,
    });

    assert.strictEqual(boss.isBoss, true);
    assert.strictEqual(boss.drawRadius, 28);
    assert.strictEqual(boss.hp, 40);
  });

  test('boss shield phase blocks damage', () => {
    const boss = new BossEnemy({
      type: 'heavy',
      centerX: 350, centerY: 100,
      radiusX: 100, radiusY: 40,
      angle: 0, angularSpeed: 0.3,
      hp: 40,
    });

    // Force shield phase
    boss.shieldPhase = true;
    boss.shieldTimer = 1.5;

    const killed = boss.takeDamage(100);
    assert.strictEqual(killed, false, 'should not take damage during shield phase');
    assert.strictEqual(boss.hp, 40, 'HP unchanged during shield');
  });

  test('boss takes damage when shield is down', () => {
    const boss = new BossEnemy({
      type: 'heavy',
      centerX: 350, centerY: 100,
      radiusX: 100, radiusY: 40,
      angle: 0, angularSpeed: 0.3,
      hp: 40,
    });

    boss.shieldPhase = false;
    boss.takeDamage(10);
    assert.strictEqual(boss.hp, 30);
  });

  test('boss shield phase toggles via update', () => {
    const boss = new BossEnemy({
      type: 'heavy',
      centerX: 350, centerY: 100,
      radiusX: 100, radiusY: 40,
      angle: 0, angularSpeed: 0.3,
      hp: 40,
    });

    // Start with no shield, force cooldown to expire
    boss.shieldPhase = false;
    boss.shieldCooldown = 0;

    boss.update(0.016);
    // Shield should now be active
    assert.strictEqual(boss.shieldPhase, true, 'shield should activate when cooldown expires');
    assert.ok(boss.shieldTimer > 0, 'shield timer should be set');
  });
});

// ── Bullet ───────────────────────────────────────────────────────────────────

describe('Bullet', () => {
  test('bullet moves in straight line', () => {
    const b = new Bullet(100, 100, 0, -500, 1, '#fff');
    b.update(0.1);
    assert.ok(Math.abs(b.x - 100) < 0.01, 'x unchanged for vertical bullet');
    assert.ok(Math.abs(b.y - 50) < 0.01, 'y should decrease');
  });

  test('bullet dies when leaving canvas', () => {
    const b = new Bullet(100, 5, 0, -500, 1, '#fff');
    b.update(0.1); // y = 5 - 50 = -45
    assert.strictEqual(b.alive, false, 'should die when off screen');
  });

  test('homing bullet tracks enemies', () => {
    const b = new Bullet(100, 300, 0, -200, 1, '#fff', false, true);
    const enemies = [
      { alive: true, x: 200, y: 200 }, // target to the right and up
    ];

    b.update(0.1, enemies);
    // Bullet should now have some positive vx (tracking right)
    assert.ok(b.vx > 0, 'homing bullet should start tracking to the right');
  });

  test('non-homing bullet ignores enemies', () => {
    const b = new Bullet(100, 300, 0, -200, 1, '#fff', false, false);
    const vxBefore = b.vx;
    b.update(0.1, [{ alive: true, x: 200, y: 200 }]);
    assert.strictEqual(b.vx, vxBefore, 'non-homing should not change direction');
  });
});

// ── PowerUp ──────────────────────────────────────────────────────────────────

describe('PowerUp', () => {
  test('power-up falls downward', () => {
    const p = new PowerUp(100, 100, 'spread');
    const startY = p.y;
    p.update(0.5);
    assert.ok(p.y > startY, 'should fall down');
    assert.strictEqual(p.alive, true, 'should still be alive on screen');
  });

  test('power-up dies when off screen', () => {
    const p = new PowerUp(100, 540, 'spread');
    p.update(1);
    assert.strictEqual(p.alive, false);
  });
});

// ── GameEngine ───────────────────────────────────────────────────────────────

describe('GameEngine — initialization', () => {
  test('starts with correct defaults', () => {
    const engine = new GameEngine(700, 520);
    const state = engine.getState();

    assert.strictEqual(state.lives, MAX_LIVES);
    assert.strictEqual(state.shield, MAX_SHIELD);
    assert.strictEqual(state.score, 0);
    assert.strictEqual(state.wave, 1);
    assert.strictEqual(state.weapon, 'basic');
    assert.strictEqual(state.weaponLevel, 1);
    assert.strictEqual(state.gameOver, false);
    assert.ok(state.enemyCount > 0, 'wave 1 should spawn enemies');
  });

  test('enemies are spawned in wave 1', () => {
    const engine = new GameEngine(700, 520);
    assert.ok(engine.enemies.length > 0, 'should have enemies');
    // All enemies should be OrbitalEnemy instances
    for (const e of engine.enemies) {
      assert.ok(e instanceof OrbitalEnemy, 'enemies should be OrbitalEnemy');
    }
  });
});

describe('GameEngine — orbital enemy movement', () => {
  test('enemies move each update tick', () => {
    const engine = new GameEngine(700, 520);
    const firstEnemy = engine.enemies[0];
    const startX = firstEnemy.x;
    const startY = firstEnemy.y;

    engine.update(0.016); // ~1 frame

    assert.ok(
      firstEnemy.x !== startX || firstEnemy.y !== startY,
      'enemy position should change after update'
    );
  });
});

describe('GameEngine — weapon system', () => {
  test('basic weapon fires single bullet upward', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = []; // clear enemies to prevent wave advancement
    engine.keys.fire = true;

    engine.update(0.016);

    assert.ok(engine.playerBullets.length >= 1, 'should fire at least one bullet');
    const b = engine.playerBullets[0];
    assert.ok(b.vy < 0, 'bullet should move upward');
    assert.strictEqual(b.vx, 0, 'basic bullet goes straight up');
  });

  test('spread weapon fires multiple bullets', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.weapon = 'spread';
    engine.keys.fire = true;

    engine.update(0.016);

    assert.ok(engine.playerBullets.length >= 3, 'spread should fire 3+ bullets');
    // Check that bullets have different vx values
    const vxSet = new Set(engine.playerBullets.map((b) => b.vx));
    assert.ok(vxSet.size > 1, 'spread bullets should have different horizontal velocities');
  });

  test('charge weapon accumulates charge while held', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.weapon = 'charge';
    engine.keys.fire = true;

    engine.update(0.5);

    assert.ok(engine.chargeTime > 0, 'charge should accumulate');
    assert.strictEqual(engine.playerBullets.length, 0, 'no bullet while charging');
  });

  test('charge weapon fires on release', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.weapon = 'charge';

    // Hold fire
    engine.keys.fire = true;
    engine.update(1.0);

    // Release fire
    engine.keys.fire = false;
    engine.update(0.016);

    assert.ok(engine.playerBullets.length >= 1, 'should fire charge shot on release');
    assert.strictEqual(engine.chargeTime, 0, 'charge time should reset');
  });

  test('laser weapon drains charge meter', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.weapon = 'laser';

    assert.strictEqual(engine.laserCharge, 100, 'starts with full charge');

    engine.keys.fire = true;
    engine.update(0.5);

    assert.ok(engine.laserCharge < 100, 'laser charge should drain');
    assert.strictEqual(engine.laserActive, true, 'laser should be active');
  });

  test('laser recharges when not firing', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.weapon = 'laser';
    engine.laserCharge = 50;

    engine.keys.fire = false;
    engine.update(1.0);

    assert.ok(engine.laserCharge > 50, 'laser should recharge');
  });

  test('missile weapon fires homing bullet', () => {
    const engine = new GameEngine(700, 520);
    engine.weapon = 'missile';
    engine.keys.fire = true;

    engine.update(0.016);

    assert.ok(engine.playerBullets.length >= 1, 'should fire missile');
    const m = engine.playerBullets[0];
    assert.strictEqual(m.homing, true, 'missile should be homing');
  });
});

describe('GameEngine — power-up collection', () => {
  test('collecting same weapon type stacks level', () => {
    const engine = new GameEngine(700, 520);
    engine.weapon = 'spread';
    engine.weaponLevel = 1;

    // Simulate collecting a spread power-up
    engine._collectPowerUp(new PowerUp(0, 0, 'spread'));
    assert.strictEqual(engine.weaponLevel, 2, 'should upgrade to level 2');

    engine._collectPowerUp(new PowerUp(0, 0, 'spread'));
    assert.strictEqual(engine.weaponLevel, 3, 'should upgrade to level 3');

    // Max level 3
    engine._collectPowerUp(new PowerUp(0, 0, 'spread'));
    assert.strictEqual(engine.weaponLevel, 3, 'should cap at level 3');
  });

  test('collecting different weapon type switches weapon', () => {
    const engine = new GameEngine(700, 520);
    engine.weapon = 'basic';
    engine.weaponLevel = 2;

    engine._collectPowerUp(new PowerUp(0, 0, 'missile'));
    assert.strictEqual(engine.weapon, 'missile', 'should switch to missile');
    assert.strictEqual(engine.weaponLevel, 1, 'should reset level to 1');
  });

  test('shield power-up restores shield HP', () => {
    const engine = new GameEngine(700, 520);
    engine.shield = 50;

    engine._collectPowerUp(new PowerUp(0, 0, 'shield'));
    assert.ok(engine.shield > 50, 'shield should increase');
    assert.ok(engine.shield <= MAX_SHIELD, 'shield should not exceed max');
  });
});

describe('GameEngine — collision detection', () => {
  test('player bullet kills enemy and awards score', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.score = 0;

    // Place a scout enemy at known position
    const enemy = new OrbitalEnemy({
      type: 'scout',
      centerX: 350, centerY: 100,
      radiusX: 0, radiusY: 0,  // stationary
      angle: 0, angularSpeed: 0,
    });
    engine.enemies.push(enemy);

    // Place a bullet right on the enemy
    const bullet = new Bullet(350, 100, 0, -500, 10, '#fff');
    engine.playerBullets.push(bullet);

    engine._checkCollisions(0.016);

    assert.strictEqual(enemy.alive, false, 'enemy should be dead');
    assert.strictEqual(bullet.alive, false, 'bullet should be consumed');
    assert.ok(engine.score > 0, 'score should increase');
  });

  test('enemy bullet damages player shield', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = MAX_SHIELD;
    engine.invincibleTimer = 0;

    // Place enemy bullet on player
    const bullet = new Bullet(engine.playerX, engine.playerY, 0, 0, 1, '#f00');
    engine.enemyBullets.push(bullet);

    engine._checkCollisions(0.016);

    assert.ok(engine.shield < MAX_SHIELD, 'shield should decrease');
    assert.strictEqual(bullet.alive, false, 'enemy bullet consumed');
  });

  test('player loses life when shield is 0', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = 0;
    engine.invincibleTimer = 0;

    const bullet = new Bullet(engine.playerX, engine.playerY, 0, 0, 1, '#f00');
    engine.enemyBullets.push(bullet);

    engine._checkCollisions(0.016);

    assert.strictEqual(engine.lives, MAX_LIVES - 1, 'should lose a life');
  });

  test('game over when all lives lost', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = 0;
    engine.lives = 1;
    engine.invincibleTimer = 0;

    const bullet = new Bullet(engine.playerX, engine.playerY, 0, 0, 1, '#f00');
    engine.enemyBullets.push(bullet);

    engine._checkCollisions(0.016);

    assert.strictEqual(engine.lives, 0);
    assert.strictEqual(engine.gameOver, true, 'game should be over');
  });
});

describe('GameEngine — scoring', () => {
  test('score formula: wave * enemy_type_multiplier', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.score = 0;
    engine.wave = 3;

    const enemy = new OrbitalEnemy({
      type: 'drone', // points = 20
      centerX: 350, centerY: 100,
      radiusX: 0, radiusY: 0,
      angle: 0, angularSpeed: 0,
    });
    engine.enemies.push(enemy);

    // Kill it
    engine._onEnemyKilled(enemy);

    assert.strictEqual(engine.score, 3 * 20, 'score should be wave * points');
  });

  test('boss kill score: wave * 500', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.score = 0;
    engine.wave = 5;

    const boss = new BossEnemy({
      type: 'heavy',
      centerX: 350, centerY: 100,
      radiusX: 100, radiusY: 40,
      angle: 0, angularSpeed: 0.3,
      hp: 40,
    });
    boss.points = 500; // boss multiplier is 500
    engine.enemies.push(boss);

    engine._onEnemyKilled(boss);

    // Score = wave * 500 = 5 * 500 = 2500
    assert.strictEqual(engine.score, 5 * 500, 'boss score = wave * 500');
  });
});

describe('GameEngine — wave progression', () => {
  test('clearing all enemies starts next wave', () => {
    const engine = new GameEngine(700, 520);
    assert.strictEqual(engine.wave, 1);

    // Kill all enemies
    for (const e of engine.enemies) e.alive = false;
    engine.enemies = engine.enemies.filter((e) => e.alive);

    engine.update(0.016);
    assert.strictEqual(engine.wave, 2, 'should advance to wave 2');
    assert.ok(engine.enemies.length > 0, 'new enemies should spawn');
  });

  test('boss wave spawns boss every 5 waves', () => {
    const engine = new GameEngine(700, 520);

    // Advance to wave 5
    engine.wave = 4;
    engine.enemies = [];

    engine.update(0.016); // triggers wave 5

    assert.strictEqual(engine.wave, 5);
    const bosses = engine.enemies.filter((e) => e.isBoss);
    assert.ok(bosses.length >= 1, 'wave 5 should have a boss');
  });

  test('enemy count increases with wave (non-boss waves)', () => {
    // Compare wave 1 (7 enemies expected) vs wave 4 (13 enemies expected)
    // Both are non-boss waves (boss at 5, 10, 15...)
    const engine1 = new GameEngine(700, 520);
    // wave 1 has 5 + 1*2 = 7 enemies (capped at 30)
    const count1 = engine1.enemies.length;

    const engine2 = new GameEngine(700, 520);
    engine2.enemies = [];
    engine2.wave = 3; // will advance to 4
    engine2._startNextWave(); // wave 4: 5 + 4*2 = 13 enemies
    const count2 = engine2.enemies.length;

    assert.ok(count2 > count1, `wave 4 (${count2}) should have more enemies than wave 1 (${count1})`);
  });
});

describe('GameEngine — shield regeneration', () => {
  test('shield regenerates at 5 HP/sec', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = 50;

    engine._regenerateShield(1.0); // 1 second

    assert.strictEqual(engine.shield, 55, 'should gain 5 HP after 1 second');
  });

  test('shield caps at max', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = 98;

    engine._regenerateShield(1.0);

    assert.strictEqual(engine.shield, MAX_SHIELD, 'should cap at max');
  });
});

describe('GameEngine — invincibility', () => {
  test('player cannot be hit during invincibility', () => {
    const engine = new GameEngine(700, 520);
    engine.enemies = [];
    engine.shield = 0;
    engine.invincibleTimer = 1.0;

    const bullet = new Bullet(engine.playerX, engine.playerY, 0, 0, 1, '#f00');
    engine.enemyBullets.push(bullet);

    engine._checkCollisions(0.016);

    assert.strictEqual(engine.lives, MAX_LIVES, 'lives should not change during invincibility');
    assert.strictEqual(bullet.alive, true, 'bullet should not be consumed');
  });
});

// ── API score submission test ────────────────────────────────────────────────

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import scoresRoutes from '../routes/scores.js';
import { db } from '../db.js';

const JWT_SECRET = 'test-secret-space-invaders';

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: JWT_SECRET,
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(scoresRoutes, { prefix: '/api/scores' });
  await app.ready();
  return app;
}

function createTestUser(username) {
  const result = db
    .prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)")
    .run(username, 'hashed_pw');
  return { id: result.lastInsertRowid, username };
}

describe('Score API — space-invaders', () => {
  test('GET /api/scores/space-invaders returns scores array', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/space-invaders',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(Array.isArray(body.scores), 'scores should be an array');

    await app.close();
  });

  test('POST /api/scores/ with gameId space-invaders returns ok', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: '/api/scores/',
      payload: { gameId: 'space-invaders', score: 12345 },
      headers: { 'content-type': 'application/json' },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.strictEqual(body.ok, true);

    await app.close();
  });

  test('POST /api/scores/ saves score for authenticated user', async () => {
    const app = await buildApp();
    const user = createTestUser(`si_scorer_${Date.now()}`);
    const token = app.jwt.sign({ id: user.id, username: user.username });

    const res = await app.inject({
      method: 'POST',
      url: '/api/scores/',
      cookies: { token },
      payload: { gameId: 'space-invaders', score: 99999 },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.ok, true);

    // Verify persisted
    const saved = db
      .prepare('SELECT * FROM scores WHERE user_id = ? AND game_id = ? AND score = ?')
      .get(user.id, 'space-invaders', 99999);
    assert.ok(saved, 'score should be saved in DB');
    assert.strictEqual(saved.game_id, 'space-invaders');
    assert.strictEqual(saved.score, 99999);

    await app.close();
  });
});
