import { ApiError } from './auth-client';

export interface SeatHold {
  id: string;
  showId: string;
  seatId: string;
  expiresAt: string;
  status: 'ACTIVE';
}

const REQUEST_TIMEOUT_MS = 15_000;

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

async function holdRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
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
    | T | null;
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(errorBody?.error?.message ?? 'Unable to update this seat hold.', response.status, errorBody?.error?.code);
  }
  return body as T;
}

export function createSeatHold(showId: string, seatId: string, token: string): Promise<{ hold: SeatHold; expiresAt: string }> {
  return holdRequest<{ hold: SeatHold; expiresAt: string }>(
    `/api/shows/${encodeURIComponent(showId)}/holds`, token,
    { method: 'POST', body: JSON.stringify({ seatId }) },
  );
}

export function releaseSeatHold(showId: string, holdId: string, token: string): Promise<{ released: true }> {
  return holdRequest<{ released: true }>(
    `/api/shows/${encodeURIComponent(showId)}/holds/${encodeURIComponent(holdId)}`, token,
    { method: 'DELETE' },
  );
}
