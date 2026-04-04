import { db } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const VALID_GAMES = ['pacmaze', 'neon-growth', 'space-invaders', 'frogger', 'pong'];
const MAX_SCORE = 999999;
const RATE_LIMIT_WINDOW_MS = 3 * 1000; // 3 seconds — prevents double-submit without blocking back-to-back games

// In-memory rate limiter: key = `userId:gameId` -> timestamp of last submission
const lastSubmission = new Map();

// Prune stale entries every 60s to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of lastSubmission) {
    if (now - ts > RATE_LIMIT_WINDOW_MS) {
      lastSubmission.delete(key);
    }
  }
}, 60_000).unref();

function isRateLimited(userId, gameId) {
  const key = `${userId}:${gameId}`;
  const now = Date.now();
  const last = lastSubmission.get(key);
  if (last && now - last < RATE_LIMIT_WINDOW_MS) {
    return true;
  }
  lastSubmission.set(key, now);
  return false;
}

async function scoresRoutes(fastify) {
  // POST /api/scores/:game -- submit a score (requires auth)
  fastify.post('/:game', { preHandler: authenticate }, async (request, reply) => {
    const { game } = request.params;

    if (!VALID_GAMES.includes(game)) {
      return reply.code(400).send({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(', ')}` });
    }

    const { score } = request.body ?? {};

    if (score == null || !Number.isInteger(score) || score < 0 || score > MAX_SCORE) {
      return reply.code(400).send({ error: 'Score must be an integer between 0 and 999999' });
    }

    const userId = request.user.id;

    if (isRateLimited(userId, game)) {
      return reply.code(429).send({ error: 'Rate limit exceeded. Please wait a few seconds before submitting again.' });
    }

    const row = db.prepare(
      'INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?) RETURNING id'
    ).get(userId, game, score);

    // Calculate current rank (best score per user, position of this user)
    const rankRow = db.prepare(`
      WITH best_scores AS (
        SELECT user_id, MAX(score) AS best
        FROM scores
        WHERE game_id = ?
        GROUP BY user_id
      )
      SELECT COUNT(*) + 1 AS rank
      FROM best_scores
      WHERE best > (SELECT MAX(score) FROM scores WHERE user_id = ? AND game_id = ?)
    `).get(game, userId, game);

    return reply.code(201).send({ id: row.id, rank: rankRow.rank });
  });

  // GET /api/scores/:game -- top 10 per game (best score per user)
  fastify.get('/:game', async (request, reply) => {
    const { game } = request.params;

    if (!VALID_GAMES.includes(game)) {
      return reply.code(400).send({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(', ')}` });
    }

    const rows = db.prepare(`
      SELECT u.username, bs.best AS score, bs.submitted_at
      FROM (
        SELECT user_id, MAX(score) AS best, MAX(created_at) AS submitted_at
        FROM scores
        WHERE game_id = ?
        GROUP BY user_id
      ) bs
      JOIN users u ON u.id = bs.user_id
      ORDER BY bs.best DESC
      LIMIT 10
    `).all(game);

    const scores = rows.map((row, i) => ({
      rank: i + 1,
      username: row.username,
      score: row.score,
      submitted_at: row.submitted_at,
    }));

    return reply.send(scores);
  });

  // GET /api/scores/:game/me -- current user's best score + rank (requires auth)
  fastify.get('/:game/me', { preHandler: authenticate }, async (request, reply) => {
    const { game } = request.params;

    if (!VALID_GAMES.includes(game)) {
      return reply.code(400).send({ error: `Invalid game. Must be one of: ${VALID_GAMES.join(', ')}` });
    }

    const userId = request.user.id;

    const bestRow = db.prepare(`
      SELECT MAX(score) AS score, MAX(created_at) AS submitted_at
      FROM scores
      WHERE user_id = ? AND game_id = ?
    `).get(userId, game);

    if (!bestRow || bestRow.score == null) {
      return reply.code(404).send({ error: 'No scores found for this game' });
    }

    const rankRow = db.prepare(`
      WITH best_scores AS (
        SELECT user_id, MAX(score) AS best
        FROM scores
        WHERE game_id = ?
        GROUP BY user_id
      )
      SELECT COUNT(*) + 1 AS rank
      FROM best_scores
      WHERE best > ?
    `).get(game, bestRow.score);

    return reply.send({
      score: bestRow.score,
      submitted_at: bestRow.submitted_at,
      rank: rankRow.rank,
    });
  });
}

// Export for testing
export { VALID_GAMES, lastSubmission };
export default scoresRoutes;
