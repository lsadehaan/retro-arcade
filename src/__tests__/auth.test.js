import { test, before, after } from 'node:test';
import assert from 'node:assert';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import authRoutes from '../routes/auth.js';

// Build a fresh test app for each test suite
async function buildApp() {
  const app = Fastify({ logger: false });

  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: 'test-secret-key',
    cookie: { cookieName: 'token', signed: false },
  });
  await app.register(authRoutes, { prefix: '/api/auth' });

  return app;
}

// ──────────────────────────────────────────────
// Register
// ──────────────────────────────────────────────

test('register: success — 201 with id and username + sets cookie', async () => {
  const app = await buildApp();
  before(() => app.listen({ port: 0 }));
  after(() => app.close());

  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'alice123', password: 'secure123' },
  });

  assert.strictEqual(res.statusCode, 201);
  const body = res.json();
  assert.ok(body.id, 'should have id');
  assert.strictEqual(body.username, 'alice123');

  const cookies = res.cookies;
  assert.ok(cookies.some((c) => c.name === 'token'), 'should set token cookie');

  await app.close();
});

test('register: duplicate username — 409', async () => {
  const app = await buildApp();
  await app.ready();

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'dupuser', password: 'password1' },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'dupuser', password: 'password2' },
  });

  assert.strictEqual(res.statusCode, 409);
  const body = res.json();
  assert.ok(body.error, 'should have error message');

  await app.close();
});

test('register: password too short — 400', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'shortpw', password: 'abc' },
  });

  assert.strictEqual(res.statusCode, 400);
  const body = res.json();
  assert.ok(body.error, 'should have error message');

  await app.close();
});

test('register: username too short — 400', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'ab', password: 'password123' },
  });

  assert.strictEqual(res.statusCode, 400);
  const body = res.json();
  assert.ok(body.error, 'should have error message');

  await app.close();
});

test('register: username with special chars — 400', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'bad-user!', password: 'password123' },
  });

  assert.strictEqual(res.statusCode, 400);

  await app.close();
});

// ──────────────────────────────────────────────
// Login
// ──────────────────────────────────────────────

test('login: success + cookie set — 200', async () => {
  const app = await buildApp();
  await app.ready();

  // Register first
  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'loginuser', password: 'mypassword' },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'loginuser', password: 'mypassword' },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.id, 'should have id');
  assert.strictEqual(body.username, 'loginuser');

  const cookies = res.cookies;
  assert.ok(cookies.some((c) => c.name === 'token'), 'should set token cookie');

  await app.close();
});

test('login: wrong password — 401', async () => {
  const app = await buildApp();
  await app.ready();

  await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'wrongpw', password: 'correctpassword' },
  });

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'wrongpw', password: 'wrongpassword' },
  });

  assert.strictEqual(res.statusCode, 401);
  const body = res.json();
  assert.strictEqual(body.error, 'Invalid credentials');

  await app.close();
});

test('login: unknown user — 401', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { username: 'nobody123', password: 'somepassword' },
  });

  assert.strictEqual(res.statusCode, 401);
  const body = res.json();
  assert.strictEqual(body.error, 'Invalid credentials');

  await app.close();
});

// ──────────────────────────────────────────────
// Logout
// ──────────────────────────────────────────────

test('logout: clears cookie — 200', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/logout',
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.strictEqual(body.ok, true);

  // Cookie should be cleared (maxAge=0 or expires in the past)
  const tokenCookie = res.cookies.find((c) => c.name === 'token');
  if (tokenCookie) {
    assert.ok(
      tokenCookie.maxAge === 0 || (tokenCookie.expires && new Date(tokenCookie.expires) <= new Date()),
      'token cookie should be cleared'
    );
  }

  await app.close();
});

// ──────────────────────────────────────────────
// Me
// ──────────────────────────────────────────────

test('me: authenticated returns user — 200', async () => {
  const app = await buildApp();
  await app.ready();

  // Register to get a cookie
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { username: 'meuser', password: 'mepassword' },
  });

  const tokenCookie = regRes.cookies.find((c) => c.name === 'token');
  assert.ok(tokenCookie, 'registration should set token cookie');

  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { token: tokenCookie.value },
  });

  assert.strictEqual(res.statusCode, 200);
  const body = res.json();
  assert.ok(body.id, 'should have id');
  assert.strictEqual(body.username, 'meuser');

  await app.close();
});

test('me: unauthenticated — 401', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
  });

  assert.strictEqual(res.statusCode, 401);
  const body = res.json();
  assert.ok(body.error, 'should have error message');

  await app.close();
});

test('me: invalid token — 401', async () => {
  const app = await buildApp();
  await app.ready();

  const res = await app.inject({
    method: 'GET',
    url: '/api/auth/me',
    cookies: { token: 'not-a-valid-jwt-token' },
  });

  assert.strictEqual(res.statusCode, 401);

  await app.close();
});
