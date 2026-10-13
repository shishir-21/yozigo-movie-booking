import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const tx = {
  booking: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  seatHold: { findFirst: vi.fn(), update: vi.fn() },
  seatClaim: { findUnique: vi.fn(), updateMany: vi.fn() },
};
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    ...tx,
  },
}));

import { prisma } from '../lib/prisma.js';
import { bookingsRouter } from './bookings.js';
import express from 'express';

const app = express();
app.use(express.json());
app.use('/api', bookingsRouter);
const userId = 'customer-1';
const token = () => jwt.sign({}, process.env.JWT_SECRET as string, { subject: userId, expiresIn: '1h' });

describe('mock payment and booking confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx) as never);
  });

  it('requires authentication', async () => {
    const response = await request(app).post('/api/shows/show-1/bookings').send({ holdId: 'hold-1' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('does not confirm a declined mock payment', async () => {
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'hold-1', mockPaymentResult: 'DECLINED' });
    expect(response.status).toBe(402);
    expect(response.body.error.code).toBe('MOCK_PAYMENT_DECLINED');
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('rejects expired holds', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    tx.seatHold.findFirst.mockResolvedValue({ id: 'hold-1', showId: 'show-1', seatId: 'seat-1', userId, expiresAt: new Date(Date.now() - 1000), status: 'ACTIVE', show: { id: 'show-1', startsAt: new Date(Date.now() + 3600000), pricePaise: 25000 } });
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'hold-1' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HOLD_EXPIRED');
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a hold that belongs to another customer', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    tx.seatHold.findFirst.mockResolvedValue(null);
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'someone-elses-hold' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HOLD_NOT_FOUND');
  });
});
