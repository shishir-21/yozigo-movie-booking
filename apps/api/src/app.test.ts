import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

vi.mock('./lib/prisma.js', () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() } },
}));

import { prisma } from './lib/prisma.js';
import { app } from './app.js';

const testUser = {
  id: 'user_test_123',
  name: 'Test Customer',
  email: 'customer@example.com',
  passwordHash: 'unused-hash',
  role: 'CUSTOMER' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('API foundation and authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    process.env.JWT_EXPIRES_IN = '1d';
  });

  it('returns a healthy API response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'yozigo-api' });
  });

  it('returns a consistent JSON response for unknown routes', async () => {
    const response = await request(app).get('/api/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('registers a customer with a hashed password and returns a safe user plus token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...testUser, email: 'customer@example.com' });

    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: ' Customer@Example.com ',
      password: 'strong-password',
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: testUser.id,
      name: testUser.name,
      email: testUser.email,
      role: 'CUSTOMER',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.token).toEqual(expect.any(String));

    const createArgs = vi.mocked(prisma.user.create).mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({ email: 'customer@example.com', role: 'CUSTOMER' });
    expect(await bcrypt.compare('strong-password', createArgs?.data.passwordHash as string)).toBe(true);
  });

  it('rejects invalid registration data without querying the database', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate email addresses', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(testUser);

    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: testUser.email,
      password: 'strong-password',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('logs in with valid credentials and never returns the password hash', async () => {
    const passwordHash = await bcrypt.hash('strong-password', 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...testUser, passwordHash });

    const response = await request(app).post('/api/auth/login').send({
      email: 'CUSTOMER@example.com',
      password: 'strong-password',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(testUser.email);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('returns the same authentication error for an unknown email or wrong password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await request(app).post('/api/auth/login').send({
      email: 'unknown@example.com',
      password: 'strong-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});
