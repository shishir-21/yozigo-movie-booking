import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    movie: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    show: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    booking: { findFirst: vi.fn() },
    seatClaim: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../lib/prisma.js';
import { app } from '../app.js';

const secret = 'test-only-secret-with-at-least-32-characters';
const customer = { id: 'customer-1', role: 'CUSTOMER' as const };
const admin = { id: 'admin-1', role: 'ADMIN' as const };

function tokenFor(userId: string) {
  return jwt.sign({ role: userId === admin.id ? 'ADMIN' : 'CUSTOMER' }, secret, { subject: userId, expiresIn: '1h' });
}

describe('admin movie and show management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = secret;
    vi.mocked(prisma.user.findUnique).mockImplementation(async ({ where }: never) => {
      const id = (where as { id: string }).id;
      return id === admin.id ? admin as never : id === customer.id ? customer as never : null;
    });
  });

  it('rejects requests without authentication', async () => {
    const response = await request(app).get('/api/admin/movies');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects authenticated customers from admin routes', async () => {
    const response = await request(app).get('/api/admin/movies').set('Authorization', `Bearer ${tokenFor(customer.id)}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(prisma.movie.findMany).not.toHaveBeenCalled();
  });

  it('validates movie data before writing', async () => {
    const response = await request(app)
      .post('/api/admin/movies')
      .set('Authorization', `Bearer ${tokenFor(admin.id)}`)
      .send({ title: '', language: 'English', durationMin: -1, rating: 'PG' });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(prisma.movie.create).not.toHaveBeenCalled();
  });

  it('rejects a show that overlaps another screening and its turnaround buffer', async () => {
    const start = new Date(Date.now() + 48 * 60 * 60_000);
    vi.mocked(prisma.movie.findUnique).mockResolvedValue({ id: 'movie-2', durationMin: 120 } as never);
    vi.mocked(prisma.show.findMany).mockResolvedValue([{
      id: 'existing-show',
      startsAt: new Date(start.getTime() - 60 * 60_000),
      movie: { durationMin: 120 },
    }] as never);

    const response = await request(app)
      .post('/api/admin/shows')
      .set('Authorization', `Bearer ${tokenFor(admin.id)}`)
      .send({ movieId: 'movie-2', startsAt: start.toISOString(), pricePaise: 25000 });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('RESOURCE_CONFLICT');
    expect(prisma.show.create).not.toHaveBeenCalled();
  });
});
