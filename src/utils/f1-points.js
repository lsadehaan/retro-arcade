/**
 * F1 championship points system.
 * Maps finishing position (1-based) to points.
 */
const F1_POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

/**
 * Returns the F1 points for a given 1-based position.
 * Positions 1-10 earn points, 11+ earn 0.
 *
 * @param {number} position - 1-based finishing position
 * @returns {number} points awarded
 */
export function pointsForPosition(position) {
  if (!Number.isInteger(position) || position < 1) {
    return 0;
  }
  return F1_POINTS_TABLE[position - 1] ?? 0;
}

export { F1_POINTS_TABLE };
