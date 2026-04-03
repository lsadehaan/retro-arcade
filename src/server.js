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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

// Plugins
await app.register(fastifyCookie);

await app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET ?? 'changeme',
  cookie: { cookieName: 'token', signed: false },
});

await app.register(fastifyCors, {
  origin: process.env.CORS_ORIGIN ?? true,
  credentials: true,
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
});

// Routes
await app.register(authRoutes, { prefix: '/api/auth' });
await app.register(scoresRoutes, { prefix: '/api/scores' });

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
