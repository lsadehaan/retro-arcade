import { test, before, after } from 'node:test';
import assert from 'node:assert';
import { app } from '../server.js';

before(async () => {
  await app.ready();
});

after(async () => {
  await app.close();
});

test('GET /api/scores/neon-growth returns empty array initially', async () => {
  const res = await app.inject({
    method: 'GET',
    url: '/api/scores/neon-growth',
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.ok(Array.isArray(body.scores), 'scores should be an array');
  assert.strictEqual(body.scores.length, 0, 'should be empty initially');
});

test('POST /api/scores with gameId neon-growth returns ok:true (no auth)', async () => {
  const res = await app.inject({
    method: 'POST',
    url: '/api/scores',
    payload: { gameId: 'neon-growth', score: 42 },
    headers: { 'content-type': 'application/json' },
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.strictEqual(body.ok, true, 'should return { ok: true }');
});

test('GET /api/scores/neon-growth still returns empty array when no auth on POST', async () => {
  // Without a valid JWT, score should not be persisted
  const res = await app.inject({
    method: 'GET',
    url: '/api/scores/neon-growth',
  });
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.payload);
  assert.ok(Array.isArray(body.scores), 'scores should be an array');
  assert.strictEqual(body.scores.length, 0, 'unauthenticated scores not saved');
});
