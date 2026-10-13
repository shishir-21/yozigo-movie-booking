import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './auth-client';
import { createAdminMovie, deleteAdminShow, getAdminMovies, getAdminShowReport, getAdminShows, updateAdminShow } from './admin-client';

describe('admin client', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads movies with the admin bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ movies: [{ id: 'm1', title: 'Demo' }] }), { status: 200 }));
    await expect(getAdminMovies('admin-token')).resolves.toMatchObject({ movies: [{ id: 'm1' }] });
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/admin/movies', expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }) }));
  });

  it('sends validated movie payloads to create', async () => {
    const input = { title: 'Demo', language: 'English', durationMin: 120, rating: 'UA' as const, description: 'Sample', posterUrl: null };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ movie: { id: 'm1', ...input } }), { status: 201 }));
    await createAdminMovie('admin-token', input);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/admin/movies', expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }));
  });

  it('supports show updates and delete with encoded IDs', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ show: { id: 's/1' } }), { status: 200 }));
    await updateAdminShow('admin-token', 's/1', { pricePaise: 25000 });
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/admin/shows/s%2F1', expect.objectContaining({ method: 'PATCH' }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(deleteAdminShow('admin-token', 's/1')).resolves.toBeNull();
  });

  it('loads show report metrics and booking details with the admin token', async () => {
    const payload = { report: { show: { id: 'show-1', movieTitle: 'Demo', startsAt: '2026-10-15T18:00:00.000Z', pricePaise: 25000, durationMin: 120 }, capacity: 80, seatsBooked: 2, percentageFull: 2.5, moneyCollectedPaise: 50000, seats: [{ id: 'seat-1', row: 'A', number: 1, status: 'BOOKED' }], bookings: [] } };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));
    await expect(getAdminShowReport('admin-token', 'show/1')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/admin/shows/show%2F1/report', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer admin-token' }),
    }));
  });

  it('surfaces forbidden and network errors', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'FORBIDDEN', message: 'Administrator access is required.' } }), { status: 403 }));
    await expect(getAdminShows('customer-token')).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('offline'));
    await expect(getAdminMovies('token')).rejects.toBeInstanceOf(ApiError);
  });
});
