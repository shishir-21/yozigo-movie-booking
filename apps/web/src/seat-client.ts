import { ApiError } from './auth-client';

export interface ShowSeat {
  id: string;
  row: string;
  number: number;
  status: 'AVAILABLE' | 'UNAVAILABLE';
}

const REQUEST_TIMEOUT_MS = 15_000;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

export async function getShowSeats(showId: string): Promise<{ showId: string; seats: ShowSeat[] }> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/shows/${encodeURIComponent(showId)}/seats`, {
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
    | { showId: string; seats: ShowSeat[] }
    | null;

  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(errorBody?.error?.message ?? 'Unable to load seat availability.', response.status, errorBody?.error?.code);
  }
  return body as { showId: string; seats: ShowSeat[] };
}
