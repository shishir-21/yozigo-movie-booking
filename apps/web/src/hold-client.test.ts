import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeatHold, releaseSeatHold } from './hold-client';

describe('seat hold client', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('creates a hold with bearer authorization and a seat ID', async () => {
    const payload = { hold: { id: 'hold-1', showId: 'show-1', seatId: 'seat-1', expiresAt: '2026-10-13T12:05:00.000Z', status: 'ACTIVE' as const }, expiresAt: '2026-10-13T12:05:00.000Z' };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    await expect(createSeatHold('show/1', 'seat-1', 'token-123')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/shows/show%2F1/holds', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer token-123', 'Content-Type': 'application/json' }),
      body: JSON.stringify({ seatId: 'seat-1' }),
    }));
  });

  it('releases a hold with authorization', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ released: true }), { status: 200 }));
    await expect(releaseSeatHold('show-1', 'hold-1', 'token-123')).resolves.toEqual({ released: true });
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/shows/show-1/holds/hold-1', expect.objectContaining({
      method: 'DELETE', headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
    }));
  });

  it('surfaces seat conflicts and network errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'SEAT_UNAVAILABLE', message: 'Seat taken.' } }), { status: 409 }));
    await expect(createSeatHold('show-1', 'seat-1', 'token')).rejects.toMatchObject({ status: 409, code: 'SEAT_UNAVAILABLE' });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('network down'));
    await expect(createSeatHold('show-1', 'seat-1', 'token')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
