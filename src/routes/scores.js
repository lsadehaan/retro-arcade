import { db } from '../db.js';

async function scoresRoutes(fastify) {
  /**
   * POST /api/scores
   * Body: { gameId: string, score: number }
   * If the request has a valid JWT cookie, saves the score for the authenticated user.
   * Always returns { ok: true }.
   */
  fastify.post('/', async (request, reply) => {
    const { gameId, score } = request.body ?? {};

    // Try to authenticate -- non-fatal if missing/invalid
    let userId = null;
    try {
      const token = request.cookies?.token;
      if (token) {
        const decoded = await request.jwtVerify({ onlyCookie: true });
        userId = decoded?.id ?? null;
      }
    } catch {
      // Not logged in -- still return ok
    }

    if (userId && gameId != null && score != null) {
      db.prepare(
        'INSERT INTO scores (user_id, game_id, score) VALUES (?, ?, ?)'
      ).run(userId, String(gameId), Number(score));
    }

    return reply.send({ ok: true });
  });

  /**
   * GET /api/scores/:gameId
   * Returns top 10 scores for a game with usernames.
   * Response: { scores: [{ username, score, createdAt }] }
   */
  fastify.get('/:gameId', async (request, reply) => {
    const { gameId } = request.params;
    const rows = db
      .prepare(
        `SELECT u.username, s.score, s.created_at AS createdAt
         FROM scores s
         JOIN users u ON u.id = s.user_id
         WHERE s.game_id = ?
         ORDER BY s.score DESC
         LIMIT 10`
      )
      .all(gameId);

    return reply.send({ scores: rows });
  });
}

export default scoresRoutes;
