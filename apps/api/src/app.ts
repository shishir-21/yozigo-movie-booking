import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { authRouter } from './routes/auth.js';
import { moviesRouter } from './routes/movies.js';
import { seatsRouter } from './routes/seats.js';
import { holdsRouter } from './routes/holds.js';
import { bookingsRouter } from './routes/bookings.js';
import { adminRouter } from './routes/admin.js';
import { liveSeatsRouter } from './routes/live-seats.js';
import { createRateLimiter, requestId } from './middleware/security.js';
import { prisma } from './lib/prisma.js';

export const app = express();

app.disable('x-powered-by');
app.use(requestId);
app.use(helmet());

const allowedOrigins = (process.env.WEB_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // Non-browser clients do not send Origin and remain supported.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 600,
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'yozigo-api' });
});

app.get('/api/health/ready', async (_request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.status(200).json({ status: 'ready', service: 'yozigo-api', database: 'ok' });
  } catch {
    response.status(503).json({
      status: 'not_ready',
      service: 'yozigo-api',
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database is not ready',
        requestId: response.locals.requestId,
      },
    });
  }
});

app.use('/api/auth/register', createRateLimiter({
  limit: Number(process.env.AUTH_REGISTER_RATE_LIMIT_MAX) || 5,
  keyPrefix: 'register',
}));
app.use('/api/auth/login', createRateLimiter({
  limit: Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX) || 10,
  keyPrefix: 'login',
}));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/movies', moviesRouter);
app.use('/api/shows', liveSeatsRouter);
app.use('/api/shows', seatsRouter);
app.use('/api/shows', holdsRouter);
app.use('/api', bookingsRouter);

app.use((_request, response) => {
  response.status(404).json({
    error: { code: 'NOT_FOUND', message: 'Route not found', requestId: response.locals.requestId },
  });
});

app.use((error: unknown, request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const requestId = String(response.locals.requestId ?? 'unknown');
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  // Never log request bodies, authorization headers, passwords, or raw error messages.
  console.error(JSON.stringify({
    level: 'error',
    event: 'unhandled_api_error',
    requestId,
    method: request.method,
    path: request.path,
    errorName,
  }));
  response.status(500).json({
    error: { code: 'INTERNAL_SERVER_ERROR', message: 'Something went wrong', requestId },
  });
});
