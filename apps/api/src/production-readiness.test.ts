import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

vi.mock('./lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    movie: { findMany: vi.fn(), findUnique: vi.fn() },
    show: { findMany: vi.fn(), findUnique: vi.fn() },
    seat: { findMany: vi.fn() },
    seatHold: { findMany: vi.fn() },
    bookingSeat: { findMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { app } from './app.js';
import { prisma } from './lib/prisma.js';
import { resetRateLimitersForTests } from './middleware/security.js';

describe('production readiness middleware', () => {
  beforeEach(() => resetRateLimitersForTests());

  it('adds a generated request ID to responses', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-request-id'].length).toBeGreaterThan(10);
  });

  it('reports database readiness when the database query succeeds', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([]);
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ status: 'ready', service: 'yozigo-api', database: 'ok' });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('returns a safe 503 readiness response when the database query fails', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(new Error('database credentials must not leak'));
    const response = await request(app).get('/api/health/ready');
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({
      status: 'not_ready',
      error: { code: 'DATABASE_UNAVAILABLE', message: 'Database is not ready' },
    });
    expect(JSON.stringify(response.body)).not.toContain('credentials');
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('preserves a safe caller-supplied request ID', async () => {
    const response = await request(app).get('/api/health').set('X-Request-Id', 'test-request.123');
    expect(response.headers['x-request-id']).toBe('test-request.123');
  });

  it('replaces unsafe caller-supplied request IDs', async () => {
    const response = await request(app).get('/api/health').set('X-Request-Id', 'bad id');
    expect(response.headers['x-request-id']).not.toContain(' ');
    expect(response.headers['x-request-id']).not.toBe('bad id');
  });

  it('allows the configured local origin and rejects unlisted origins', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const denied = await request(app).get('/api/health').set('Origin', 'https://untrusted.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate limits repeated registration attempts and returns retry guidance', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post('/api/auth/register').send({});
      expect(response.status).toBe(400);
    }
    const limited = await request(app).post('/api/auth/register').send({});
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.requestId).toBe(limited.headers['x-request-id']);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['ratelimit-limit']).toBe('5');
  });

  it('rate limits login attempts independently from registration', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app).post('/api/auth/register').send({});
    }
    const login = await request(app).post('/api/auth/login').send({});
    expect(login.status).toBe(400);
    expect(login.headers['ratelimit-limit']).toBe('10');
  });
});
