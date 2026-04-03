# Retro Arcade — System Architecture

## Overview

Retro Arcade is a single-server web application that serves HTML5 canvas games with user authentication and leaderboards. The architecture prioritises simplicity and low operational overhead.

## System Diagram

```
Browser
  ├── Static files (HTML/CSS/JS/Canvas games)
  │     └── served by Fastify static plugin
  └── REST API (JSON)
        ├── POST /api/auth/register|login|logout
        ├── GET  /api/auth/me
        ├── POST /api/scores/:game          (protected)
        ├── GET  /api/scores/:game          (top 10)
        └── GET  /api/leaderboard           (F1 points)

Fastify (Node.js 20)
  ├── Plugins: @fastify/cookie, @fastify/jwt, @fastify/static
  ├── Routes: auth, scores, leaderboard
  └── SQLite (better-sqlite3)
        ├── users
        ├── scores
        └── sessions (optional, JWT is stateless)
```

## Database Schema

```sql
CREATE TABLE users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT    UNIQUE NOT NULL,
  password_hash TEXT   NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE scores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_name    TEXT    NOT NULL,  -- 'pacman' | 'snake' | 'space-invaders'
  score        INTEGER NOT NULL,
  submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scores_game_score ON scores(game_name, score DESC);
CREATE INDEX idx_scores_user       ON scores(user_id, game_name);
```

## Auth Flow

1. User POSTs `/api/auth/register` with `{ username, password }`
2. Server hashes password with bcryptjs (12 rounds) and inserts user
3. Server signs a JWT `{ userId, username }` and sets it as an httpOnly cookie
4. Subsequent requests include the cookie automatically
5. Protected routes verify the JWT via `@fastify/jwt`

## Leaderboard & F1 Points

Per-game leaderboard: top score per user per game (not all-time entries — one entry per player).

F1 points (overall leaderboard):
```
Position → Points
1        → 25
2        → 18
3        → 15
4        → 12
5        → 10
6        → 8
7        → 6
8        → 4
9        → 2
10       → 1
11+      → 0
```

Overall leaderboard sums each user's F1 points across all three games.

## Score Submission Security

- JWT required (authenticated users only)
- Server-side sanity check: score must be a positive integer ≤ 999999
- Rate limit: max 1 submission per game per 30 seconds per user
- Scores are stored individually; best score per user is derived on query

## Frontend Architecture

Pure vanilla JS — no framework. Each game is a self-contained ES module using the Canvas 2D API with `requestAnimationFrame` loops. Shared utilities:

- `public/js/api.js` — fetch wrapper that handles auth headers and JSON parsing
- `public/js/leaderboard.js` — leaderboard rendering helpers

Games communicate scores to the server via `api.js` when a game-over event fires.

## Technology Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Runtime | Node.js 20 | LTS, excellent SQLite support |
| Framework | Fastify | Fast, low overhead, great plugin ecosystem |
| Database | SQLite (better-sqlite3) | Zero-ops, sync API, perfect for this scale |
| Auth | JWT in httpOnly cookie | Secure against XSS, stateless |
| Password hashing | bcryptjs 12 rounds | Industry standard, pure JS (no native deps) |
| Game engine | Vanilla Canvas 2D | No dependencies, full control, fast |
| Bundler | esbuild | Fastest bundler, zero config |
| Tests | Jest + Playwright | Unit + E2E coverage |
