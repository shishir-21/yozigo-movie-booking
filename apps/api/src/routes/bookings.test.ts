import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import express from 'express';

const { tx, transaction } = vi.hoisted(() => ({
  tx: {
    booking: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    seatHold: { findFirst: vi.fn(), update: vi.fn() },
    seatClaim: { findUnique: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  },
  transaction: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: transaction,
    booking: tx.booking,
    seatHold: tx.seatHold,
    seatClaim: tx.seatClaim,
  },
}));

import { bookingsRouter } from './bookings.js';

const app = express();
app.use(express.json());
app.use('/api', bookingsRouter);
const userId = 'customer-1';
const token = () => jwt.sign({}, process.env.JWT_SECRET as string, { subject: userId, expiresIn: '1h' });
const future = new Date(Date.now() + 60 * 60 * 1000);
const booking = {
  id: 'booking-1', userId, showId: 'show-1', amountPaise: 25000, status: 'CONFIRMED',
  createdAt: new Date(), holdId: 'hold-1',
  show: { movie: { title: 'Demo Movie' } },
  seats: [{ seatId: 'seat-1', seat: { row: 'A', number: 1 } }],
};

describe('mock payment and booking confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    transaction.mockImplementation(async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx));
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

  it('confirms an active owned hold and converts its claim atomically', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    tx.seatHold.findFirst.mockResolvedValue({ id: 'hold-1', showId: 'show-1', seatId: 'seat-1', userId, expiresAt: future, status: 'ACTIVE', show: { id: 'show-1', startsAt: future, pricePaise: 25000 } });
    tx.seatClaim.findUnique.mockResolvedValue({ id: 'claim-1', showId: 'show-1', seatId: 'seat-1', userId, kind: 'HOLD', expiresAt: future });
    tx.booking.create.mockResolvedValue(booking);
    tx.seatClaim.updateMany.mockResolvedValue({ count: 1 });
    tx.seatHold.update.mockResolvedValue({ id: 'hold-1', status: 'CONVERTED' });

    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'hold-1' });
    expect(response.status).toBe(201);
    expect(response.body.booking).toMatchObject({ id: 'booking-1', status: 'CONFIRMED', amountPaise: 25000, movieTitle: 'Demo Movie' });
    expect(response.body.payment).toMatchObject({ mode: 'MOCK', status: 'SUCCEEDED' });
    expect(tx.seatHold.update).toHaveBeenCalledWith({ where: { id: 'hold-1' }, data: { status: 'CONVERTED' } });
    expect(tx.seatClaim.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { kind: 'BOOKED', expiresAt: null } }));
  });

  it('rejects expired holds', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    tx.seatHold.findFirst.mockResolvedValue({ id: 'hold-1', showId: 'show-1', seatId: 'seat-1', userId, expiresAt: new Date(Date.now() - 1000), status: 'ACTIVE', show: { id: 'show-1', startsAt: future, pricePaise: 25000 } });
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'hold-1' });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('HOLD_EXPIRED');
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate booking when a successful request is retried', async () => {
    tx.booking.findUnique.mockResolvedValue(booking);
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'hold-1' });
    expect(response.status).toBe(200);
    expect(response.body.alreadyConfirmed).toBe(true);
    expect(tx.booking.create).not.toHaveBeenCalled();
  });

  it('rejects a hold that belongs to another customer or does not exist', async () => {
    tx.booking.findUnique.mockResolvedValue(null);
    tx.seatHold.findFirst.mockResolvedValue(null);
    const response = await request(app).post('/api/shows/show-1/bookings').set('Authorization', `Bearer ${token()}`).send({ holdId: 'someone-elses-hold' });
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('HOLD_NOT_FOUND');
  });
});

describe('customer booking cancellation (assignment bonus flow 8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    transaction.mockImplementation(async (callback: (transactionClient: typeof tx) => Promise<unknown>) => callback(tx));
  });

  it('requires authentication', async () => {
    const response = await request(app).post('/api/bookings/booking-1/cancel');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('cancels an owned confirmed booking and releases its booked seat claim atomically', async () => {
    tx.booking.findUnique.mockResolvedValue({
      ...booking,
      status: 'CONFIRMED',
      seats: [{ seatId: 'seat-1' }],
      show: { startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000) },
    });
    tx.booking.update.mockResolvedValue({ id: 'booking-1', status: 'CANCELLED' });
    tx.seatClaim.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(app).post('/api/bookings/booking-1/cancel').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(200);
    expect(response.body.booking).toEqual({ id: 'booking-1', status: 'CANCELLED' });
    expect(tx.booking.update).toHaveBeenCalledWith({ where: { id: 'booking-1' }, data: { status: 'CANCELLED' } });
    expect(tx.seatClaim.deleteMany).toHaveBeenCalledWith({
      where: { showId: 'show-1', seatId: { in: ['seat-1'] }, userId, kind: 'BOOKED' },
    });
  });

  it('does not reveal or cancel another customer\'s booking', async () => {
    tx.booking.findUnique.mockResolvedValue({ ...booking, userId: 'other-customer', seats: [{ seatId: 'seat-1' }], show: { startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000) } });
    const response = await request(app).post('/api/bookings/booking-1/cancel').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('BOOKING_NOT_FOUND');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation within two hours of showtime', async () => {
    tx.booking.findUnique.mockResolvedValue({ ...booking, status: 'CONFIRMED', seats: [{ seatId: 'seat-1' }], show: { startsAt: new Date(Date.now() + 90 * 60 * 1000) } });
    const response = await request(app).post('/api/bookings/booking-1/cancel').set('Authorization', `Bearer ${token()}`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('CANCELLATION_WINDOW_CLOSED');
    expect(tx.booking.update).not.toHaveBeenCalled();
  });

  it('rejects past shows and already-cancelled bookings', async () => {
    tx.booking.findUnique.mockResolvedValueOnce({ ...booking, status: 'CONFIRMED', seats: [{ seatId: 'seat-1' }], show: { startsAt: new Date(Date.now() - 60_000) } });
    const past = await request(app).post('/api/bookings/booking-1/cancel').set('Authorization', `Bearer ${token()}`);
    expect(past.status).toBe(409);
    expect(past.body.error.code).toBe('CANCELLATION_WINDOW_CLOSED');

    tx.booking.findUnique.mockResolvedValueOnce({ ...booking, status: 'CANCELLED', seats: [{ seatId: 'seat-1' }], show: { startsAt: new Date(Date.now() + 4 * 60 * 60 * 1000) } });
    const repeated = await request(app).post('/api/bookings/booking-1/cancel').set('Authorization', `Bearer ${token()}`);
    expect(repeated.status).toBe(409);
    expect(repeated.body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  });
});

