# retro-arcade -- Project Instructions

## Project Overview

Retro Arcade is a web-based platform hosting classic game remakes with unique twists, user authentication, per-game leaderboards, and an overall F1-style points leaderboard. Users sign up, play games, and compete for top rankings.

**Tech stack:** Node.js, Fastify, SQLite (better-sqlite3), HTML5 Canvas (vanilla JS), bcryptjs, JWT (httpOnly cookies)
**Repository:** https://github.com/lsadehaan/retro-arcade

## Directory Layout

```
retro-arcade/
  src/
    server.js             # Fastify app entry point
    db.js                 # SQLite connection + schema init
    routes/
      auth.js             # POST /api/auth/register|login|logout, GET /api/auth/me
      scores.js           # POST/GET /api/scores/:game
      leaderboard.js      # GET /api/leaderboard
    middleware/
      auth.js             # JWT verification middleware
    utils/
      f1-points.js        # F1 scoring system calculator
  public/
    index.html            # Landing/home page
    login.html            # Login page
    register.html         # Registration page
    leaderboard.html      # Overall + per-game leaderboard page
    games/
      pacman/
        index.html        # Pac-Maze Rush game page
        game.js           # Game logic
      snake/
        index.html        # Neon Growth game page
        game.js           # Game logic
      space-invaders/
        index.html        # Asteroid Defense Surge game page
        game.js           # Game logic
    css/
      main.css            # Global retro arcade styling
    js/
      api.js              # Shared fetch wrapper + auth state
  tests/
    unit/                 # Collocated unit tests (*.test.js)
    e2e/                  # Playwright E2E tests
  .github/
    workflows/
      ci.yml              # Lint + test on every PR
  docker/
    Dockerfile
    docker-compose.test.yml
  .env.example
  package.json
```

## How to Run

### Development

```bash
npm install
cp .env.example .env
npm run dev        # starts Fastify with nodemon on port 3000
```

### Tests

```bash
# Tier 1 -- run before every PR
npm run test       # Jest unit tests
npm run lint       # ESLint
npm run typecheck  # (if TypeScript added later)

# In Docker
docker compose -f docker/docker-compose.test.yml run --rm app npm test
```

### Build

```bash
npm run build      # bundles public/js with esbuild
```

## Architecture

The server is a Fastify app serving both the REST API and static frontend. SQLite stores users, sessions, and scores. The frontend is vanilla JS with HTML5 Canvas for games. Auth uses JWT stored in httpOnly cookies. F1-style points are computed on-the-fly from per-game rank data.

Key files:
- `src/server.js` -- Fastify app, plugin registration, static file serving
- `src/db.js` -- SQLite init, schema migrations, query helpers
- `public/games/*/game.js` -- Individual game engines (Canvas-based)

## MCP Tools Available

| Tool | Purpose |
|------|---------|
| GitHub MCP | Issue and PR management |
| Playwright MCP | E2E test automation |

## Agent Workflow

1. Pick up a `ready` issue from the board
2. Self-assign and move to `in-progress`
3. Create branch: `feat/<issue-number>-<slug>`
4. Implement per the task contract requirements
5. **Run `codex review --uncommitted` (MANDATORY)** — fix Critical/Major findings
6. Write tests
7. **Run `codex review --uncommitted` on tests (MANDATORY)** — add missing test cases
8. Run Tier 1 tests in Docker (must pass before PR)
9. **Run `codex review --uncommitted` final review (MANDATORY)** — last check before PR
10. Open PR with issue link, test evidence, and Codex review summary
11. Address review feedback from QA Architect
12. Wait for `approved` label and Orchestrator merge

## Conventions

### Code Style

- Fastify-idiomatic patterns. Follow existing code in repo.
- ESLint + Prettier for formatting: `npm run lint`
- ES2022 modules (import/export), Node.js 20+.

### Naming

- Files: `kebab-case.js`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Database tables: `snake_case`

### Git

- Branch names: `feat/<issue>-<slug>`, `fix/<issue>-<slug>`
- Commit messages: conventional commits (`feat:`, `fix:`, `test:`, `chore:`, `docs:`)
- One logical change per commit. Squash WIP commits before PR.

### Testing

- Unit tests next to source: `name.test.js`
- E2E tests in `tests/e2e/`
- Test names describe behavior: `"returns 401 when token is missing"`

### Error Handling

- Never swallow errors silently
- Return appropriate HTTP status codes
- Log errors with context using Fastify's built-in logger (pino)

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `PORT` | Server port | No (default 3000) |
| `JWT_SECRET` | JWT signing secret | Yes |
| `DB_PATH` | SQLite file path | No (default ./db/arcade.sqlite3) |
| `NODE_ENV` | Environment (development/production) | No |

See `.env.example` for all variables.

## Games

### Pac-Maze Rush (Pac-Man variant)
Classic Pac-Man with:
- New ghost type: **Mimic** — copies Pac-Man's last 5 moves with a delay
- Multiple hand-crafted maze layouts (cycles through each level)
- Special items: Freeze pellet (all ghosts freeze 5s), Score Bomb (2x multiplier 10s), Warp Berry (teleport to random empty cell)

### Neon Growth (Snake variant)
Snake with neon aesthetics and:
- Fading neon trail — collision-enabled but fades over 8 seconds
- Random wall generation every 10 segments grown
- Three food types: Gold Apple (+5 segs), Silver Circle (+2 segs, speed boost), Diamond (+10 segs, massive points)

### Asteroid Defense Surge (Space Invaders variant)
Space Invaders with:
- Orbital enemy movement patterns instead of linear marching
- 5 weapon tiers unlockable during play
- Boss waves every 5 rounds
- Risk/reward power-up stacking from defeated enemies

## Deployment

- **Preview**: Ephemeral VPS via DevOps Agent on PR creation
- **Production**: Hetzner VPS with Cloudflare tunnel
- **Rollback**: `git revert` + redeploy
