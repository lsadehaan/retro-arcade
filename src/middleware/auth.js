/**
 * JWT authentication preHandler middleware.
 * Reads the token from the `token` cookie, verifies it with @fastify/jwt,
 * and attaches the decoded payload to request.user.
 */
export async function authenticate(request, reply) {
  try {
    const token = request.cookies?.token;
    if (!token) {
      return reply.code(401).send({ ok: false, error: 'Unauthorized' });
    }
    request.user = await request.jwtVerify({ onlyCookie: true });
  } catch {
    return reply.code(401).send({ ok: false, error: 'Unauthorized' });
  }
}
