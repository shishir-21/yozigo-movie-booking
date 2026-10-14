import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './auth-client';
import { formatPrice, formatShowDate, getMovieShows, getMovies } from './movie-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('movie browsing API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the public movie catalogue', async () => {
    const payload = { movies: [{
      id: 'movie-1',
      title: 'The Last Horizon',
      posterUrl: null,
      language: 'English',
      durationMin: 128,
      rating: 'UA',
      description: 'A space adventure',
      nextShow: { id: 'show-1', startsAt: '2026-11-01T18:00:00.000Z', pricePaise: 25000 },
    }] };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    await expect(getMovies()).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/movies', expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('loads shows for an encoded movie ID', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ shows: [] }));

    await expect(getMovieShows('movie/id')).resolves.toEqual({ shows: [] });
    expect(fetch).toHaveBeenCalledWith('http://localhost:4000/api/movies/movie%2Fid/shows', expect.objectContaining({
      headers: { Accept: 'application/json' },
      signal: expect.any(AbortSignal),
    }));
  });

  it('surfaces API errors and network failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      error: { code: 'MOVIE_NOT_FOUND', message: 'This movie could not be found.' },
    }, 404));
    await expect(getMovieShows('missing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      code: 'MOVIE_NOT_FOUND',
    } satisfies Partial<ApiError>);

    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(getMovies()).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('formats prices in rupees and show dates for display', () => {
    expect(formatPrice(25000)).toContain('250');
    expect(formatShowDate('2026-11-01T18:00:00.000Z')).toContain('Nov');
  });
});
