import { ApiError } from './auth-client';

export interface MovieShow {
  id: string;
  startsAt: string;
  pricePaise: number;
}

export interface Movie {
  id: string;
  title: string;
  posterUrl: string | null;
  language: string;
  durationMin: number;
  rating: 'U' | 'UA' | 'A';
  description: string;
  nextShow: MovieShow | null;
}

const REQUEST_TIMEOUT_MS = 15_000;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

async function movieRequest<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError('The request took too long. Please try again.', 0, 'REQUEST_TIMEOUT');
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Unable to reach Yozigo. Check that the API server is running.', 0, 'NETWORK_ERROR');
  }

  const body = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | T
    | null;

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      errorBody?.error?.message ?? 'Something went wrong. Please try again.',
      response.status,
      errorBody?.error?.code,
    );
  }

  return body as T;
}

export function getMovies(): Promise<{ movies: Movie[] }> {
  return movieRequest<{ movies: Movie[] }>('/api/movies');
}

export function getMovieShows(movieId: string): Promise<{ shows: MovieShow[] }> {
  return movieRequest<{ shows: MovieShow[] }>(`/api/movies/${encodeURIComponent(movieId)}/shows`);
}

export function formatShowDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatPrice(pricePaise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(pricePaise / 100);
}
