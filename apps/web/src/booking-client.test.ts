import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cancelBooking, confirmBooking, getMyBookings } from './booking-client';

describe('booking client', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('confirms a booking using the mock payment endpoint and bearer token', async () => {
    const payload = { booking: { id: 'booking-1', showId: 'show-1', movieTitle: 'Demo', amountPaise: 25000, status: 'CONFIRMED' as const, createdAt: '2026-10-14T10:00:00.000Z', startsAt: '2026-10-20T18:30:00.000Z', seats: [{ id: 'seat-1', row: 'A', number: 1 }] }, payment: { mode: 'MOCK' as const, status: 'SUCCEEDED' as const, message: 'Demo payment only. No real money was charged.' }, alreadyConfirmed: false };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await expect(confirmBooking('show/1', 'hold-1', 'token-123')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/shows/show%2F1/bookings', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' }),
      body: JSON.stringify({ holdId: 'hold-1', mockPaymentResult: 'SUCCESS' }),
    }));
  });

  it('sends multiple hold IDs for a single checkout', async () => {
    const payload = { booking: { id: 'booking-2', showId: 'show-1', movieTitle: 'Demo', amountPaise: 50000, status: 'CONFIRMED' as const, createdAt: '2026-10-14T10:00:00.000Z', startsAt: '2026-10-20T18:30:00.000Z', seats: [{ id: 'seat-1', row: 'A', number: 1 }, { id: 'seat-2', row: 'A', number: 2 }] }, payment: { mode: 'MOCK' as const, status: 'SUCCEEDED' as const, message: 'Demo payment only. No real money was charged.' }, alreadyConfirmed: false };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 201 }));
    await expect(confirmBooking('show-1', ['hold-1', 'hold-2'], 'token-123')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/shows/show-1/bookings', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ holdIds: ['hold-1', 'hold-2'], mockPaymentResult: 'SUCCESS' }),
    }));
  });

  it('loads customer booking history including the actual showtime', async () => {
    const payload = { bookings: [{ id: 'booking-1', showId: 'show-1', movieTitle: 'Demo', amountPaise: 25000, status: 'CONFIRMED' as const, createdAt: '2026-10-14T10:00:00.000Z', startsAt: '2026-10-20T18:30:00.000Z', seats: [{ id: 'seat-1', row: 'A', number: 1 }] }] };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(getMyBookings('token-123')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/bookings/me', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token-123' }) }));
  });

  it('cancels a booking using the authenticated cancellation endpoint', async () => {
    const payload = { booking: { id: 'booking-1', status: 'CANCELLED' as const }, message: 'Booking cancelled. Your seats are available again.' };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(cancelBooking('booking/1', 'token-123')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/bookings/booking%2F1/cancel', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }));
  });

  it('surfaces conflicts and network errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'HOLD_EXPIRED', message: 'Hold expired.' } }), { status: 409 }));
    await expect(confirmBooking('show-1', 'hold-1', 'token')).rejects.toMatchObject({ status: 409, code: 'HOLD_EXPIRED' });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network down'));
    await expect(confirmBooking('show-1', 'hold-1', 'token')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
