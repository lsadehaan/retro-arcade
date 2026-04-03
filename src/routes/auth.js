/**
 * Auth routes plugin — register, login, logout, me
 * Provides: POST /register, POST /login, POST /logout, GET /me
 */
import bcrypt from 'bcryptjs';
import rateLimit from '@fastify/rate-limit';
import { db } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const BCRYPT_ROUNDS = 12;
const USERNAME_RE = /^[a-zA-Z0-9]{3,20}$/;

async function authRoutes(fastify) {
  await fastify.register(rateLimit, { max: 10, timeWindow: '1 minute' });

  // POST /api/auth/register
  fastify.post('/register', async (request, reply) => {
    const { username, password } = request.body ?? {};

    if (!username || !USERNAME_RE.test(username)) {
      return reply.code(400).send({ error: 'Username must be 3-20 alphanumeric characters' });
    }
    if (!password || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
      const stmt = db.prepare(
        'INSERT INTO users (username, password_hash) VALUES (?, ?) RETURNING id, username'
      );
      user = stmt.get(username, passwordHash);
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return reply.code(409).send({ error: 'Username already taken' });
      }
      throw err;
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username });
    const isProduction = process.env.NODE_ENV === 'production';

    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.code(201).send({ id: user.id, username: user.username });
  });

  // POST /api/auth/login
  fastify.post('/login', async (request, reply) => {
    const { username, password } = request.body ?? {};

    if (!username || !password) {
      return reply.code(400).send({ error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT id, username, password_hash FROM users WHERE username = ?').get(username);
    if (!user) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid credentials' });
    }

    const token = fastify.jwt.sign({ id: user.id, username: user.username });
    const isProduction = process.env.NODE_ENV === 'production';

    reply.setCookie('token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: isProduction,
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    return reply.send({ id: user.id, username: user.username });
  });

  // POST /api/auth/logout
  fastify.post('/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return reply.send({ ok: true });
  });

  // GET /api/auth/me
  fastify.get('/me', { preHandler: authenticate }, async (request, reply) => {
    return reply.send({ id: request.user.id, username: request.user.username });
  });
}

export default authRoutes;
