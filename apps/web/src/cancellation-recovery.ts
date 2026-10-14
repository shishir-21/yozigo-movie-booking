import { ApiError } from './auth-client';

export const AMBIGUOUS_CANCELLATION_MESSAGE =
  'We could not confirm the cancellation result. Your booking may already be cancelled. Refresh My bookings and check its status before trying to cancel again.';

/** Returns recovery guidance only when the server may have processed the request. */
export function getCancellationRecoveryMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 0 || (error.code !== 'REQUEST_TIMEOUT' && error.code !== 'NETWORK_ERROR')) return null;
  return AMBIGUOUS_CANCELLATION_MESSAGE;
}
