import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    movie: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    show: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    booking: { findFirst: vi.fn(), findMany: vi.fn() },
    seat: { findMany: vi.fn() },
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

  it('returns occupancy, collected amount, bookings, and an 80-seat map for admins', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60_000);
    vi.mocked(prisma.show.findUnique).mockResolvedValue({
      id: 'show-1', startsAt, pricePaise: 25000, movie: { title: 'Demo Movie', durationMin: 120 },
    } as never);
    vi.mocked(prisma.seat.findMany).mockResolvedValue([
      { id: 'seat-a1', row: 'A', number: 1 },
      { id: 'seat-a2', row: 'A', number: 2 },
    ] as never);
    vi.mocked(prisma.booking.findMany).mockResolvedValue([
      {
        id: 'booking-1', status: 'CONFIRMED', amountPaise: 25000, createdAt: new Date(),
        user: { id: 'customer-1', name: 'Test Customer', email: 'customer@example.com' },
        seats: [{ seatId: 'seat-a1', seat: { id: 'seat-a1', row: 'A', number: 1 } }],
      },
      {
        id: 'booking-2', status: 'CANCELLED', amountPaise: 25000, createdAt: new Date(),
        user: { id: 'customer-2', name: 'Cancelled Customer', email: 'cancelled@example.com' },
        seats: [{ seatId: 'seat-a2', seat: { id: 'seat-a2', row: 'A', number: 2 } }],
      },
    ] as never);

    const response = await request(app).get('/api/admin/shows/show-1/report').set('Authorization', `Bearer ${tokenFor(admin.id)}`);
    expect(response.status).toBe(200);
    expect(response.body.report).toMatchObject({
      capacity: 2,
      seatsBooked: 1,
      percentageFull: 50,
      moneyCollectedPaise: 25000,
      seats: [{ id: 'seat-a1', status: 'BOOKED' }, { id: 'seat-a2', status: 'AVAILABLE' }],
      bookings: [
        { id: 'booking-1', status: 'CONFIRMED', customer: { email: 'customer@example.com' } },
        { id: 'booking-2', status: 'CANCELLED', customer: { email: 'cancelled@example.com' } },
      ],
    });
  });

  it('rejects customer access to show reports', async () => {
    const response = await request(app).get('/api/admin/shows/show-1/report').set('Authorization', `Bearer ${tokenFor(customer.id)}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(prisma.seat.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown show report', async () => {
    vi.mocked(prisma.show.findUnique).mockResolvedValue(null);
    const response = await request(app).get('/api/admin/shows/missing/report').set('Authorization', `Bearer ${tokenFor(admin.id)}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SHOW_NOT_FOUND');
  });


  it('returns date-filtered analytics using confirmed bookings only', async () => {
    vi.mocked(prisma.show.findMany).mockResolvedValue([{
      id: 'show-analytics',
      startsAt: new Date('2026-10-15T18:00:00.000Z'),
      movie: { title: 'Analytics Movie' },
      bookings: [
        { status: 'CONFIRMED', amountPaise: 50000, seats: [{ id: 'seat-1' }, { id: 'seat-2' }] },
        { status: 'CANCELLED', amountPaise: 25000, seats: [{ id: 'seat-3' }] },
      ],
    }] as never);
    vi.mocked(prisma.seat.findMany).mockResolvedValue(Array.from({ length: 80 }, (_, index) => ({ id: `seat-${index}` })) as never);

    const response = await request(app)
      .get('/api/admin/analytics?from=2026-10-15&to=2026-10-15')
      .set('Authorization', `Bearer ${tokenFor(admin.id)}`);

    expect(response.status).toBe(200);
    expect(response.body.analytics).toMatchObject({
      from: '2026-10-15',
      to: '2026-10-15',
      showCount: 1,
      confirmedBookings: 1,
      seatsSold: 2,
      capacity: 80,
      moneyCollectedPaise: 50000,
      shows: [{
        showId: 'show-analytics',
        movieTitle: 'Analytics Movie',
        capacity: 80,
        confirmedBookings: 1,
        seatsSold: 2,
        percentageFull: 2.5,
        moneyCollectedPaise: 50000,
      }],
    });
    expect(prisma.show.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { startsAt: { gte: new Date('2026-10-15T00:00:00.000Z'), lt: new Date('2026-10-16T00:00:00.000Z') } },
    }));
  });

  it('rejects invalid analytics date ranges and customer access', async () => {
    const invalid = await request(app)
      .get('/api/admin/analytics?from=2026-10-20&to=2026-10-10')
      .set('Authorization', `Bearer ${tokenFor(admin.id)}`);
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');

    const forbidden = await request(app)
      .get('/api/admin/analytics')
      .set('Authorization', `Bearer ${tokenFor(customer.id)}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

});
