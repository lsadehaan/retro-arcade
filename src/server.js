import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import authRoutes from './routes/auth.js';
import scoresRoutes from './routes/scores.js';
import leaderboardRoutes from './routes/leaderboard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET environment variable is required');

const corsOrigin = process.env.CORS_ORIGIN;
if (!corsOrigin) throw new Error('CORS_ORIGIN environment variable is required');

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCookie);

await app.register(fastifyJwt, {
  secret: jwtSecret,
  cookie: { cookieName: 'token', signed: false },
});

await app.register(fastifyCors, {
  origin: corsOrigin.split(',').map(o => o.trim()),
  credentials: true,
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});

// Routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(scoresRoutes, { prefix: '/api/scores' });
await app.register(leaderboardRoutes, { prefix: '/api/leaderboard' });

// Health check
app.get('/api/health', async () => ({ ok: true }));

// Start
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const start = async () => {
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
