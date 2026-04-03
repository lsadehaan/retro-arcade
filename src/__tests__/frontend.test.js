import { test } from 'node:test';
import assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = resolve(__dirname, '..', '..', 'public');

// ──────────────────────────────────────────────
// Static file existence tests
// ──────────────────────────────────────────────

test('public/index.html exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'index.html')));
});

test('public/leaderboard.html exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'leaderboard.html')));
});

test('public/auth/login.html exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'auth', 'login.html')));
});

test('public/auth/register.html exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'auth', 'register.html')));
});

test('public/css/main.css exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'css', 'main.css')));
});

test('public/js/api.js exists', () => {
  assert.ok(existsSync(resolve(publicDir, 'js', 'api.js')));
});

test('game pages exist for all three games', () => {
  const games = ['pacmaze', 'snake', 'space-invaders'];
  for (const game of games) {
    assert.ok(
      existsSync(resolve(publicDir, 'games', game, 'index.html')),
      `Missing: public/games/${game}/index.html`
    );
  }
});

// ──────────────────────────────────────────────
// HTML structure tests
// ──────────────────────────────────────────────

test('index.html contains navbar with brand link', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('class="navbar"'), 'should have navbar');
  assert.ok(html.includes('RETRO ARCADE'), 'should have brand text');
});

test('index.html contains 3 game cards', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('PAC-MAZE RUSH'), 'should mention Pac-Maze Rush');
  assert.ok(html.includes('NEON GROWTH'), 'should mention Neon Growth');
  assert.ok(html.includes('ASTEROID DEFENSE SURGE'), 'should mention Asteroid Defense Surge');
});

test('index.html links to games', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('/games/pacmaze/'), 'should link to pacmaze');
  assert.ok(html.includes('/games/snake/'), 'should link to snake');
  assert.ok(html.includes('/games/space-invaders/'), 'should link to space-invaders');
});

test('index.html links to leaderboard', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('/leaderboard.html'), 'should link to leaderboard');
});

test('index.html has login and register links', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('/auth/login.html'), 'should link to login');
  assert.ok(html.includes('/auth/register.html'), 'should link to register');
});

test('index.html includes api.js and main.css', () => {
  const html = readFileSync(resolve(publicDir, 'index.html'), 'utf8');
  assert.ok(html.includes('/js/api.js'), 'should include api.js');
  assert.ok(html.includes('/css/main.css'), 'should include main.css');
});

test('login.html has username and password fields', () => {
  const html = readFileSync(resolve(publicDir, 'auth', 'login.html'), 'utf8');
  assert.ok(html.includes('id="username"'), 'should have username field');
  assert.ok(html.includes('id="password"'), 'should have password field');
  assert.ok(html.includes('/api/auth/login'), 'should POST to /api/auth/login');
});

test('register.html has username, password, and confirm-password fields', () => {
  const html = readFileSync(resolve(publicDir, 'auth', 'register.html'), 'utf8');
  assert.ok(html.includes('id="username"'), 'should have username field');
  assert.ok(html.includes('id="password"'), 'should have password field');
  assert.ok(html.includes('id="confirm-password"'), 'should have confirm-password field');
  assert.ok(html.includes('/api/auth/register'), 'should POST to /api/auth/register');
});

test('leaderboard.html has overall and per-game tabs', () => {
  const html = readFileSync(resolve(publicDir, 'leaderboard.html'), 'utf8');
  assert.ok(html.includes('data-tab="overall"'), 'should have overall tab');
  assert.ok(html.includes('data-tab="per-game"'), 'should have per-game tab');
  assert.ok(html.includes('/api/leaderboard'), 'should fetch from leaderboard API');
});

test('leaderboard.html has game selector dropdown', () => {
  const html = readFileSync(resolve(publicDir, 'leaderboard.html'), 'utf8');
  assert.ok(html.includes('id="game-selector"'), 'should have game selector');
  assert.ok(html.includes('value="pacmaze"'), 'should have pacmaze option');
  assert.ok(html.includes('value="neon-growth"'), 'should have neon-growth option');
  assert.ok(html.includes('value="space-invaders"'), 'should have space-invaders option');
});

test('main.css contains Press Start 2P font import', () => {
  const css = readFileSync(resolve(publicDir, 'css', 'main.css'), 'utf8');
  assert.ok(css.includes('Press+Start+2P'), 'should import Press Start 2P font');
});

test('main.css has CRT scanline effect', () => {
  const css = readFileSync(resolve(publicDir, 'css', 'main.css'), 'utf8');
  assert.ok(css.includes('repeating-linear-gradient'), 'should have scanline gradient');
});

test('api.js exports api object with get, post, getUser, logout', () => {
  const js = readFileSync(resolve(publicDir, 'js', 'api.js'), 'utf8');
  assert.ok(js.includes('api.get'), 'should reference api.get');
  assert.ok(js.includes('api.post'), 'should reference api.post');
  assert.ok(js.includes('api.getUser'), 'should reference api.getUser');
  assert.ok(js.includes('api.logout'), 'should reference api.logout');
});

test('game pages include navbar and leaderboard panel', () => {
  const games = ['pacmaze', 'snake', 'space-invaders'];
  for (const game of games) {
    const html = readFileSync(resolve(publicDir, 'games', game, 'index.html'), 'utf8');
    assert.ok(html.includes('class="navbar"'), `${game}: should have navbar`);
    assert.ok(html.includes('class="game-leaderboard"'), `${game}: should have leaderboard panel`);
    assert.ok(html.includes('/js/api.js'), `${game}: should include api.js`);
    assert.ok(html.includes('/css/main.css'), `${game}: should include main.css`);
  }
});

// ──────────────────────────────────────────────
// HTTP route test (GET / serves HTML)
// ──────────────────────────────────────────────

test('GET / returns HTML via Fastify static', async () => {
  // Dynamic import to avoid issues with DB in other tests
  const Fastify = (await import('fastify')).default;
  const fastifyStatic = (await import('@fastify/static')).default;

  const app = Fastify({ logger: false });
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  const res = await app.inject({ method: 'GET', url: '/' });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'), 'should serve HTML');
  assert.ok(res.body.includes('RETRO ARCADE'), 'should contain site title');

  await app.close();
});

test('GET /leaderboard.html returns HTML via Fastify static', async () => {
  const Fastify = (await import('fastify')).default;
  const fastifyStatic = (await import('@fastify/static')).default;

  const app = Fastify({ logger: false });
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  const res = await app.inject({ method: 'GET', url: '/leaderboard.html' });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'), 'should serve HTML');
  assert.ok(res.body.includes('Leaderboard'), 'should contain leaderboard heading');

  await app.close();
});

test('GET /auth/login.html returns HTML via Fastify static', async () => {
  const Fastify = (await import('fastify')).default;
  const fastifyStatic = (await import('@fastify/static')).default;

  const app = Fastify({ logger: false });
  await app.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  const res = await app.inject({ method: 'GET', url: '/auth/login.html' });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.headers['content-type'].includes('text/html'), 'should serve HTML');
  assert.ok(res.body.includes('LOGIN'), 'should contain login heading');

  await app.close();
});
