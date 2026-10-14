import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    movie: { findMany: vi.fn() },
    booking: { findUnique: vi.fn(), findMany: vi.fn() },
    seatHold: { findFirst: vi.fn(), update: vi.fn() },
    seatClaim: { deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('./lib/prisma.js', () => ({ prisma: mocks.prisma }));

import { app } from './app.js';

const secret = 'test-only-secret-with-at-least-32-characters';

function customerToken(userId = 'customer-a') {
  return jwt.sign({ role: 'CUSTOMER' }, secret, { subject: userId, expiresIn: '1h' });
}

describe('resource authorization regression tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = secret;
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.prisma) => unknown) => callback(mocks.prisma));
  });

  it('rejects a customer from admin endpoints using the database-backed role', async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ id: 'customer-a', role: 'CUSTOMER' });

    const response = await request(app)
      .get('/api/admin/movies')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('FORBIDDEN');
    expect(mocks.prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'customer-a' },
      select: { id: true, role: true },
    });
    expect(mocks.prisma.movie.findMany).not.toHaveBeenCalled();
  });

  it('scopes booking history to the authenticated customer in the database query', async () => {
    mocks.prisma.booking.findMany.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/bookings/me')
      .set('Authorization', `Bearer ${customerToken('customer-a')}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ bookings: [] });
    expect(mocks.prisma.booking.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'customer-a' },
    }));
  });

  it('does not allow one customer to cancel another customer\'s booking', async () => {
    mocks.prisma.booking.findUnique.mockResolvedValue({
      id: 'booking-b',
      userId: 'customer-b',
      seats: [{ seatId: 'seat-a1' }],
      show: { startsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });

    const response = await request(app)
      .post('/api/bookings/booking-b/cancel')
      .set('Authorization', `Bearer ${customerToken('customer-a')}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    expect(mocks.prisma.seatClaim.deleteMany).not.toHaveBeenCalled();
  });

  it('scopes hold release to the authenticated customer and hides another customer\'s hold', async () => {
    mocks.prisma.seatHold.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .delete('/api/shows/show-1/holds/hold-b')
      .set('Authorization', `Bearer ${customerToken('customer-a')}`);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HOLD_NOT_FOUND');
    expect(mocks.prisma.seatHold.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'hold-b', showId: 'show-1', userId: 'customer-a', status: 'ACTIVE' },
    }));
    expect(mocks.prisma.seatHold.update).not.toHaveBeenCalled();
    expect(mocks.prisma.seatClaim.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects protected booking and hold operations without authentication', async () => {
    const bookingResponse = await request(app).get('/api/bookings/me');
    const holdResponse = await request(app).delete('/api/shows/show-1/holds/hold-1');

    expect(bookingResponse.status).toBe(401);
    expect(bookingResponse.body.error.code).toBe('UNAUTHORIZED');
    expect(holdResponse.status).toBe(401);
    expect(holdResponse.body.error.code).toBe('UNAUTHORIZED');
    expect(mocks.prisma.booking.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.seatHold.findFirst).not.toHaveBeenCalled();
  });
});
