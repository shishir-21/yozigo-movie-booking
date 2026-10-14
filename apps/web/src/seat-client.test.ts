import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShowSeats } from './seat-client';

describe('show seat availability client', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads seat availability for an encoded show ID', async () => {
    const payload = { showId: 'show-1', seats: [{ id: 'seat-1', row: 'A', number: 1, status: 'AVAILABLE' as const }] };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await expect(getShowSeats('show/1')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/shows/show%2F1/seats', expect.objectContaining({ headers: { Accept: 'application/json' }, signal: expect.any(AbortSignal) }));
  });

  it('surfaces missing-show API errors and network failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'SHOW_NOT_FOUND', message: 'This show could not be found.' } }), { status: 404 }));
    await expect(getShowSeats('missing')).rejects.toMatchObject({ status: 404, code: 'SHOW_NOT_FOUND' });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(getShowSeats('show-1')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });
});
