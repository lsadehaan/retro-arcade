import { db } from '../db.js';
import { pointsForPosition } from '../utils/f1-points.js';

const GAMES = ['pacman', 'snake', 'space-invaders'];

/**
 * Computes per-game rankings (best score per user) for a given game.
 * Returns array of { user_id, username, rank, points } ordered by rank.
 */
function computeGameRankings(gameId) {
  const rows = db.prepare(`
    SELECT s.user_id, u.username, MAX(s.score) AS best
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.game_id = ?
    GROUP BY s.user_id
    ORDER BY best DESC
  `).all(gameId);

  return rows.map((row, i) => ({
    user_id: row.user_id,
    username: row.username,
    rank: i + 1,
    points: pointsForPosition(i + 1),
  }));
}

async function leaderboardRoutes(fastify) {
  // GET /api/leaderboard -- overall F1-style leaderboard
  fastify.get('/', async (_request, reply) => {
    // Compute rankings per game
    const gameRankings = {};
    for (const game of GAMES) {
      gameRankings[game] = computeGameRankings(game);
    }

    // Aggregate points per user across all games
    const userMap = new Map(); // userId -> { username, total_points, breakdown }

    for (const game of GAMES) {
      for (const entry of gameRankings[game]) {
        let userData = userMap.get(entry.user_id);
        if (!userData) {
          userData = {
            username: entry.username,
            total_points: 0,
            breakdown: {},
          };
          userMap.set(entry.user_id, userData);
        }
        userData.total_points += entry.points;
        userData.breakdown[game] = {
          points: entry.points,
          rank: entry.rank,
        };
      }
    }

    // Sort by total_points descending, then alphabetically by username for ties
    const sorted = [...userMap.values()]
      .sort((a, b) => b.total_points - a.total_points || a.username.localeCompare(b.username));

    const result = sorted.map((entry, i) => ({
      rank: i + 1,
      username: entry.username,
      total_points: entry.total_points,
      breakdown: entry.breakdown,
    }));

    return reply.send(result);
  });
}

export default leaderboardRoutes;
