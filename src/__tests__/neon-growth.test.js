import { test, before, after } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import authRoutes from '../routes/auth.js';
import scoresRoutes from '../routes/scores.js';

async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: 'test-secret-key',
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(scoresRoutes, { prefix: '/api/scores' });

  return app;
}

test('GET /api/scores/neon-growth returns empty array initially', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'GET',
    url: '/api/scores/neon-growth',
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.ok(Array.isArray(body.scores), 'scores should be an array');

  await app.close();
});

test('POST /api/scores with gameId neon-growth returns ok:true (no auth)', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/scores',
    payload: { gameId: 'neon-growth', score: 42 },
    headers: { 'content-type': 'application/json' },
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.ok, true, 'should return { ok: true }');

  await app.close();
});

test('GET /api/scores/neon-growth does not persist unauthenticated POST', async () => {
  const app = await buildApp();
  await app.ready();

  // POST without auth
  await app.inject({
    method: 'POST',
    url: '/api/scores',
    payload: { gameId: 'neon-growth-noauth', score: 99 },
    headers: { 'content-type': 'application/json' },
  });

  // GET should not have the unauthenticated score
  const res = await app.inject({
    method: 'GET',
    url: '/api/scores/neon-growth-noauth',
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.ok(Array.isArray(body.scores), 'scores should be an array');
  assert.strictEqual(body.scores.length, 0, 'unauthenticated scores not saved');

  await app.close();
});

test('score persistence: authenticated POST then GET returns the submitted score', async () => {
  const app = await buildApp();
  await app.ready();

  // 1. Register a user to get a JWT cookie
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'ngscoreuser', password: 'password123' },
    headers: { 'content-type': 'application/json' },
  });
  assert.strictEqual(regRes.statusCode, 201, 'registration should succeed');
  const tokenCookie = regRes.cookies.find((c) => c.name === 'token');
  assert.ok(tokenCookie, 'registration should set token cookie');

  // 2. Submit a score via POST /api/scores (authenticated)
  const postRes = await app.inject({
    method: 'POST',
    url: '/api/scores',
    payload: { gameId: 'neon-growth', score: 1337 },
    headers: { 'content-type': 'application/json' },
    cookies: { token: tokenCookie.value },
  });
  assert.strictEqual(postRes.statusCode, 200);
  const postBody = JSON.parse(postRes.payload);
  assert.strictEqual(postBody.ok, true, 'POST should return { ok: true }');

  // 3. GET /api/scores/neon-growth and assert the submitted score appears
  const getRes = await app.inject({
    method: 'GET',
    url: '/api/scores/neon-growth',
  });
  assert.strictEqual(getRes.statusCode, 200);
  const getBody = JSON.parse(getRes.payload);
  assert.ok(Array.isArray(getBody.scores), 'scores should be an array');
  assert.ok(getBody.scores.length >= 1, 'should have at least one score');

  const found = getBody.scores.find(
    (s) => s.username === 'ngscoreuser' && s.score === 1337
  );
  assert.ok(found, 'submitted score should appear in GET response');

  await app.close();
});
