# retro-arcade — Product Definition

## Summary
Retro Arcade is a browser-based arcade site that serves a collection of neon-styled HTML5 games from a single Fastify server. Players can visit the landing page, launch games directly in the browser, and compare scores on per-game and overall leaderboards. Registered users can create an account, log in, and save scores via a cookie-backed session token. Based on the current repo, the primary audience is players using the web app directly rather than administrators, content editors, or external API consumers.

## Features
- Game catalog and play:
  - Home page at `/` with eight game cards: Pac-Maze Rush, Neon Growth, Asteroid Defense Surge, Neon Hopper, Photon Paddle, Neon Stack, Brick Blitz, and Void Drifter.
  - Individual game pages under `/games/.../` implemented with Canvas-based gameplay and per-game HUDs.
  - Difficulty selection on each observed game page (`easy`, `normal`, `hard`).
  - Keyboard controls across games, plus touch/mobile controls shown on each current game page.
- Competition and scoring:
  - Mini "Top Scores" panel on each game page, populated from `/api/scores/:game`.
  - Home page top-score previews for every game card.
  - Score submission API at `/api/scores/:game` for authenticated users, with per-submission rank returned by the backend.
  - Per-game leaderboard view on `/leaderboard.html`.
  - Overall leaderboard on `/leaderboard.html` using F1-style points aggregated across games.
  - Current signed-in player is highlighted in leaderboard tables.
- Accounts and session handling:
  - Registration page at `/auth/register.html`.
  - Login page at `/auth/login.html`.
  - Logout from the shared navbar.
  - Auth state fetched from `/api/auth/me` and reflected in the navbar.
  - Username/password auth with JWT stored in an HTTP-only cookie.
- UI personalization and shell:
  - Shared neon arcade shell with navbar, footer, and custom `404.html`.
  - Sound effects toggle persisted in `localStorage`.
  - Theme toggle between `neon` and `kids`, also persisted in `localStorage`.
  - Leaderboard auto-refresh every 30 seconds.

## User Flows
1. A visitor lands on `/`, sees the arcade branding, top-score snippets, and the eight available games, then chooses a game to open.
2. If the visitor wants saved scores, they register or log in through `/auth/register.html` or `/auth/login.html`; otherwise they can still open and play games anonymously.
3. On a game page, the player chooses a difficulty, starts the game, and plays using keyboard or touch controls while watching the in-game HUD and mini leaderboard.
4. When a run ends, the frontend attempts to submit the score to `/api/scores/:game`. Persisted score saving requires authentication; some games explicitly show "Log in to save your score" on `401`, while others only save when a user session is present.
5. The player visits `/leaderboard.html` to compare the overall championship table or switch to per-game rankings for a specific title.

## Scope
- In scope right now:
  - Serving a static browser frontend plus JSON APIs from one Node/Fastify app.
  - Eight playable game routes currently present in `public/games/`.
  - Local account creation, login/logout, and cookie-based authenticated score submission.
  - SQLite-backed storage for users and scores.
  - Per-game scoreboards, overall F1-style leaderboard, sound/theme preferences, and a custom 404 page.
- Explicitly out of scope based on the current repo:
  - Multiplayer, chat, friends, clans, or social features.
  - Admin tooling, moderation tools, or content-management flows.
  - Payments, ads, subscriptions, or in-app purchases.
  - Email verification, password reset, or external identity providers.
  - Native mobile apps or downloadable desktop clients.
  - Public write APIs for third-party integrations beyond the site's own frontend.
- Accuracy notes from the repo:
  - Internal naming is inconsistent for Neon Growth: the public page is `/games/snake/`, while scores and leaderboard data use the game id `neon-growth`.
  - Existing tests and `docs/architecture/system-architecture.md` still describe an earlier smaller game set in places, but the current public UI and route code expose eight games.

## Tech Stack
- Languages: JavaScript (ES modules), HTML, CSS.
- Backend: Node.js with Fastify.
- Fastify plugins: `@fastify/static`, `@fastify/jwt`, `@fastify/cookie`, `@fastify/cors`, `@fastify/rate-limit`.
- Data/storage: SQLite via `better-sqlite3`.
- Auth/security: JWT in HTTP-only cookies, password hashing with `bcryptjs`.
- Frontend approach: framework-free static pages and Canvas 2D games, with Web Audio API sound effects and `localStorage` for client preferences.
- Tooling: `esbuild` for bundling the server, `nodemon` for local dev, `eslint` for linting, and Node's built-in test runner for automated tests.
