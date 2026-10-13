import { ApiError } from './auth-client';

export type MovieRating = 'U' | 'UA' | 'A';
export interface AdminMovie {
  id: string;
  title: string;
  posterUrl: string | null;
  language: string;
  durationMin: number;
  rating: MovieRating;
  description: string;
  _count?: { shows: number };
}
export interface AdminShow {
  id: string;
  movieId: string;
  startsAt: string;
  pricePaise: number;
  movie: { title: string; durationMin: number };
}

export interface AdminShowReport {
  show: { id: string; movieTitle: string; startsAt: string; pricePaise: number; durationMin: number };
  capacity: number;
  seatsBooked: number;
  percentageFull: number;
  moneyCollectedPaise: number;
  seats: Array<{ id: string; row: string; number: number; status: 'AVAILABLE' | 'BOOKED' }>;
  bookings: Array<{
    id: string;
    customer: { id: string; name: string; email: string };
    status: 'CONFIRMED' | 'CANCELLED';
    createdAt: string;
    amountPaise: number;
    seats: Array<{ id: string; row: string; number: number }>;
  }>;
}


export interface AdminAnalytics {
  from: string | null;
  to: string | null;
  showCount: number;
  confirmedBookings: number;
  seatsSold: number;
  capacity: number;
  moneyCollectedPaise: number;
  shows: Array<{
    showId: string;
    movieTitle: string;
    startsAt: string;
    capacity: number;
    confirmedBookings: number;
    seatsSold: number;
    percentageFull: number;
    moneyCollectedPaise: number;
  }>;
}

export interface MovieInput {
  title: string;
  posterUrl?: string | null;
  language: string;
  durationMin: number;
  rating: MovieRating;
  description?: string;
}
export interface ShowInput { movieId: string; startsAt: string; pricePaise: number }

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

async function adminRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Unable to reach Yozigo. Check that the API server is running.', 0, 'NETWORK_ERROR');
  }
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(errorBody?.error?.message ?? 'Unable to complete the admin request.', response.status, errorBody?.error?.code);
  }
  return body as T;
}

export const getAdminMovies = (token: string) => adminRequest<{ movies: AdminMovie[] }>('/api/admin/movies', token);
export const createAdminMovie = (token: string, input: MovieInput) => adminRequest<{ movie: AdminMovie }>('/api/admin/movies', token, { method: 'POST', body: JSON.stringify(input) });
export const updateAdminMovie = (token: string, movieId: string, input: Partial<MovieInput>) => adminRequest<{ movie: AdminMovie }>(`/api/admin/movies/${encodeURIComponent(movieId)}`, token, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteAdminMovie = (token: string, movieId: string) => adminRequest<void>(`/api/admin/movies/${encodeURIComponent(movieId)}`, token, { method: 'DELETE' });
export const getAdminShows = (token: string) => adminRequest<{ shows: AdminShow[] }>('/api/admin/shows', token);
export const createAdminShow = (token: string, input: ShowInput) => adminRequest<{ show: AdminShow }>('/api/admin/shows', token, { method: 'POST', body: JSON.stringify(input) });
export const updateAdminShow = (token: string, showId: string, input: Partial<ShowInput>) => adminRequest<{ show: AdminShow }>(`/api/admin/shows/${encodeURIComponent(showId)}`, token, { method: 'PATCH', body: JSON.stringify(input) });
export const deleteAdminShow = (token: string, showId: string) => adminRequest<void>(`/api/admin/shows/${encodeURIComponent(showId)}`, token, { method: 'DELETE' });

export const getAdminShowReport = (token: string, showId: string) => adminRequest<{ report: AdminShowReport }>(`/api/admin/shows/${encodeURIComponent(showId)}/report`, token);

export const getAdminAnalytics = (token: string, filters: { from?: string; to?: string } = {}) => {
  const params = new URLSearchParams();
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  const query = params.toString();
  return adminRequest<{ analytics: AdminAnalytics }>(`/api/admin/analytics${query ? `?${query}` : ''}`, token);
};
