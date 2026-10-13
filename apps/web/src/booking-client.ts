import { ApiError } from './auth-client';

export interface ConfirmedBooking {
  id: string;
  showId: string;
  movieTitle: string;
  amountPaise: number;
  status: 'CONFIRMED' | 'CANCELLED';
  createdAt: string;
  seats: Array<{ id: string; row: string; number: number }>;
}

export interface BookingConfirmation {
  booking: ConfirmedBooking;
  payment: { mode: 'MOCK'; status: 'SUCCEEDED'; message: string };
  alreadyConfirmed: boolean;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:4000';

async function bookingRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Unable to reach Yozigo. Check that the API server is running.', 0, 'NETWORK_ERROR');
  }
  const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | T | null;
  if (!response.ok) {
    const errorBody = body as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(errorBody?.error?.message ?? 'Unable to complete this booking.', response.status, errorBody?.error?.code);
  }
  return body as T;
}

export function confirmBooking(showId: string, holdId: string, token: string, mockPaymentResult: 'SUCCESS' | 'DECLINED' = 'SUCCESS'): Promise<BookingConfirmation> {
  return bookingRequest<BookingConfirmation>(`/api/shows/${encodeURIComponent(showId)}/bookings`, token, {
    method: 'POST',
    body: JSON.stringify({ holdId, mockPaymentResult }),
  });
}

export function getMyBookings(token: string): Promise<{ bookings: ConfirmedBooking[] }> {
  return bookingRequest<{ bookings: ConfirmedBooking[] }>('/api/bookings/me', token);
}
export interface BookingCancellation {
  booking: { id: string; status: 'CANCELLED' };
  message: string;
}

export function cancelBooking(bookingId: string, token: string): Promise<BookingCancellation> {
  return bookingRequest<BookingCancellation>(`/api/bookings/${encodeURIComponent(bookingId)}/cancel`, token, {
    method: 'POST',
  });
}

