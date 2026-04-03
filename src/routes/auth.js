/**
 * Auth routes plugin (stub — full implementation in a later issue)
 * Provides: POST /register, POST /login, POST /logout, GET /me
 */
async function authRoutes(fastify) {
  fastify.post('/register', async (_request, reply) => {
    return reply.send({ ok: true });
  });

  fastify.post('/login', async (_request, reply) => {
    return reply.send({ ok: true });
  });

  fastify.post('/logout', async (_request, reply) => {
    return reply.send({ ok: true });
  });

  fastify.get('/me', async (_request, reply) => {
    return reply.send({ ok: true });
  });
}

export default authRoutes;
