import { test, describe } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import authRoutes from '../routes/auth.js';
import scoresRoutes, { lastSubmission } from '../routes/scores.js';
import leaderboardRoutes from '../routes/leaderboard.js';
import { db } from '../db.js';

async function buildApp() {
  // Clear rate limit state between app builds
  lastSubmission.clear();

  // Clean tables for isolation
  db.exec('DELETE FROM scores');
  db.exec('DELETE FROM users');

  const app = Fastify({ logger: false });

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: 'test-secret-key',
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(scoresRoutes, { prefix: '/api/scores' });
  await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });

  return app;
}

/**
 * Helper: register a user and return { id, username, token }
 */
async function registerUser(app, username, password = 'password123') {
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username, password },
  });
  const body = res.json();
  const tokenCookie = res.cookies.find((c) => c.name === 'token');
  return { id: body.id, username: body.username, token: tokenCookie.value };
}

/**
 * Helper: submit a score for a user (clears rate limiter first)
 */
async function submitScore(app, token, game, score) {
  lastSubmission.clear();
  return app.inject({
    method: 'POST',
    url: `/api/scores/${game}`,
    payload: { score },
    cookies: { token },
  });
}

// ──────────────────────────────────────────────
// POST /api/scores/:game
// ──────────────────────────────────────────────

describe('POST /api/scores/:game', () => {
  test('returns 201 with id and rank on valid submission', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'scorer1');
    const res = await submitScore(app, user.token, 'pacmaze', 5000);

    assert.strictEqual(res.statusCode, 201);
    const body = res.json();
    assert.ok(body.id, 'should have id');
    assert.strictEqual(body.rank, 1, 'first score should be rank 1');

    await app.close();
  });

  test('returns 401 without auth', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 1000 },
    });

    assert.strictEqual(res.statusCode, 401);

    await app.close();
  });

  test('returns 400 for invalid game', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'scorer2');
    const res = await submitScore(app, user.token, 'invalidgame', 1000);

    assert.strictEqual(res.statusCode, 400);
    const body = res.json();
    assert.ok(body.error.includes('Invalid game'));

    await app.close();
  });

  test('returns 400 for non-integer score', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'scorer3');
    const res = await submitScore(app, user.token, 'pacmaze', 3.14);

    assert.strictEqual(res.statusCode, 400);

    await app.close();
  });

  test('returns 400 for negative score', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'scorer4');
    const res = await submitScore(app, user.token, 'pacmaze', -1);

    assert.strictEqual(res.statusCode, 400);

    await app.close();
  });

  test('returns 400 for score over 999999', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'scorer5');
    const res = await submitScore(app, user.token, 'pacmaze', 1000000);

    assert.strictEqual(res.statusCode, 400);

    await app.close();
  });

  test('returns 429 on rate limit (two submissions within 30s)', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'ratelimited');

    // First submission -- do NOT clear rate limiter
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 1000 },
      cookies: { token: user.token },
    });
    assert.strictEqual(res1.statusCode, 201);

    // Second submission -- same user, same game, should be rate limited
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/scores/pacmaze',
      payload: { score: 2000 },
      cookies: { token: user.token },
    });
    assert.strictEqual(res2.statusCode, 429);

    lastSubmission.clear();
    await app.close();
  });

  test('validates all three game types are accepted', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'allgames');

    for (const game of ['pacmaze', 'neon-growth', 'space-invaders']) {
      const res = await submitScore(app, user.token, game, 100);
      assert.strictEqual(res.statusCode, 201, `${game} should be accepted`);
    }

    await app.close();
  });
});

// ──────────────────────────────────────────────
// GET /api/scores/:game
// ──────────────────────────────────────────────

describe('GET /api/scores/:game', () => {
  test('returns top 20 individual sessions in descending order (same player can appear multiple times)', async () => {
    const app = await buildApp();
    await app.ready();

    // Insert 12 users + scores directly in DB to avoid auth rate limiter
    const bcrypt = await import('bcryptjs');
    for (let i = 1; i <= 12; i++) {
      const username = `player${String(i).padStart(2, '0')}`;
      const hash = await bcrypt.default.hash('password123', 4);
      const user = db.prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id'
      ).get(username, hash);
      // Insert a high score and a low score per user (24 total sessions)
      db.prepare('INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)').run(user.id, 'pacmaze', i * 100);
      db.prepare('INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)').run(user.id, 'pacmaze', i * 10);
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.length, 20, 'should return max 20 individual sessions');
    assert.strictEqual(body[0].rank, 1);
    assert.strictEqual(body[0].score, 1200, 'highest score first');

    // Verify descending order
    for (let i = 1; i < body.length; i++) {
      assert.ok(body[i - 1].score >= body[i].score, 'should be in descending order');
    }

    // Verify a player can appear multiple times (player12 has both 1200 and 120)
    const player12Entries = body.filter(e => e.username === 'player12');
    assert.ok(player12Entries.length >= 1, 'player12 high score should appear');

    await app.close();
  });

  test('returns 400 for invalid game', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/bogus',
    });

    assert.strictEqual(res.statusCode, 400);

    await app.close();
  });

  test('returns empty array when no scores exist', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/neon-growth',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.deepStrictEqual(body, []);

    await app.close();
  });
});

// ──────────────────────────────────────────────
// GET /api/scores/:game/me
// ──────────────────────────────────────────────

describe('GET /api/scores/:game/me', () => {
  test('returns user best score and rank', async () => {
    const app = await buildApp();
    await app.ready();

    const alice = await registerUser(app, 'alice');
    const bob = await registerUser(app, 'bob');

    // Alice scores higher
    await submitScore(app, alice.token, 'neon-growth', 5000);
    await submitScore(app, bob.token, 'neon-growth', 3000);

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/neon-growth/me',
      cookies: { token: bob.token },
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.strictEqual(body.score, 3000);
    assert.strictEqual(body.rank, 2, 'bob should be rank 2');

    await app.close();
  });

  test('returns 401 without auth', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze/me',
    });

    assert.strictEqual(res.statusCode, 401);

    await app.close();
  });

  test('returns 404 when user has no scores', async () => {
    const app = await buildApp();
    await app.ready();

    const user = await registerUser(app, 'noscore');

    const res = await app.inject({
      method: 'GET',
      url: '/api/scores/pacmaze/me',
      cookies: { token: user.token },
    });

    assert.strictEqual(res.statusCode, 404);

    await app.close();
  });
});

// ──────────────────────────────────────────────
// GET /api/leaderboard (F1-style)
// ──────────────────────────────────────────────

describe('GET /api/leaderboard', () => {
  test('returns correct F1 points with seeded data', async () => {
    const app = await buildApp();
    await app.ready();

    const alice = await registerUser(app, 'alice');
    const bob = await registerUser(app, 'bob');
    const charlie = await registerUser(app, 'charlie');

    // Pacmaze: alice 1st (25pts), bob 2nd (18pts), charlie 3rd (15pts)
    await submitScore(app, alice.token, 'pacmaze', 9000);
    await submitScore(app, bob.token, 'pacmaze', 7000);
    await submitScore(app, charlie.token, 'pacmaze', 5000);

    // Neon-growth: bob 1st (25pts), charlie 2nd (18pts), alice 3rd (15pts)
    await submitScore(app, bob.token, 'neon-growth', 8000);
    await submitScore(app, charlie.token, 'neon-growth', 6000);
    await submitScore(app, alice.token, 'neon-growth', 4000);

    // Space Invaders: charlie 1st (25pts), alice 2nd (18pts), bob 3rd (15pts)
    await submitScore(app, charlie.token, 'space-invaders', 10000);
    await submitScore(app, alice.token, 'space-invaders', 8000);
    await submitScore(app, bob.token, 'space-invaders', 6000);

    const res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();

    // All should have 25+18+15 = 58 points, sorted alphabetically on tie
    assert.strictEqual(body.length, 3);

    for (const entry of body) {
      assert.strictEqual(entry.total_points, 58, `${entry.username} should have 58 points`);
    }

    // Alphabetically: alice, bob, charlie
    assert.strictEqual(body[0].username, 'alice');
    assert.strictEqual(body[0].rank, 1);
    assert.strictEqual(body[1].username, 'bob');
    assert.strictEqual(body[1].rank, 2);
    assert.strictEqual(body[2].username, 'charlie');
    assert.strictEqual(body[2].rank, 3);

    // Verify breakdown structure
    assert.deepStrictEqual(body[0].breakdown.pacmaze, { points: 25, rank: 1 });
    assert.deepStrictEqual(body[0].breakdown['neon-growth'], { points: 15, rank: 3 });
    assert.deepStrictEqual(body[0].breakdown['space-invaders'], { points: 18, rank: 2 });

    await app.close();
  });

  test('returns empty array when no scores exist', async () => {
    const app = await buildApp();
    await app.ready();

    const res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();
    assert.deepStrictEqual(body, []);

    await app.close();
  });

  test('handles users who only played some games', async () => {
    const app = await buildApp();
    await app.ready();

    const alice = await registerUser(app, 'alice');
    const bob = await registerUser(app, 'bob');

    // Alice plays all games
    await submitScore(app, alice.token, 'pacmaze', 9000);
    await submitScore(app, alice.token, 'neon-growth', 8000);
    await submitScore(app, alice.token, 'space-invaders', 7000);

    // Bob only plays pacmaze
    await submitScore(app, bob.token, 'pacmaze', 10000);

    const res = await app.inject({
      method: 'GET',
      url: '/api/leaderboard',
    });

    assert.strictEqual(res.statusCode, 200);
    const body = res.json();

    // Bob: 25 (1st in pacman). Alice: 18 (2nd in pacman) + 25 (snake) + 25 (space-invaders) = 68
    const aliceEntry = body.find((e) => e.username === 'alice');
    const bobEntry = body.find((e) => e.username === 'bob');

    assert.strictEqual(aliceEntry.total_points, 68);
    assert.strictEqual(bobEntry.total_points, 25);
    assert.strictEqual(body[0].username, 'alice', 'alice should be rank 1');

    // Bob should not have neon-growth or space-invaders in breakdown
    assert.strictEqual(bobEntry.breakdown['neon-growth'], undefined);
    assert.strictEqual(bobEntry.breakdown['space-invaders'], undefined);

    await app.close();
  });
});

// ──────────────────────────────────────────────
// F1 Points Utility
// ──────────────────────────────────────────────

describe('F1 points utility', () => {
  test('positions 1-10 return correct points', async () => {
    const { pointsForPosition } = await import('../utils/f1-points.js');

    const expected = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(
        pointsForPosition(i + 1),
        expected[i],
        `position ${i + 1} should give ${expected[i]} points`
      );
    }
  });

  test('positions 11+ return 0 points', async () => {
    const { pointsForPosition } = await import('../utils/f1-points.js');

    assert.strictEqual(pointsForPosition(11), 0);
    assert.strictEqual(pointsForPosition(50), 0);
    assert.strictEqual(pointsForPosition(100), 0);
  });

  test('invalid positions return 0 points', async () => {
    const { pointsForPosition } = await import('../utils/f1-points.js');

    assert.strictEqual(pointsForPosition(0), 0);
    assert.strictEqual(pointsForPosition(-1), 0);
    assert.strictEqual(pointsForPosition(1.5), 0);
  });
});
