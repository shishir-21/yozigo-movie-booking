import { ApiError } from './auth-client';

export const AMBIGUOUS_CHECKOUT_MESSAGE =
  'We could not confirm the result of this request. Your booking may already be complete. Open My bookings and refresh the list before trying checkout again.';

/** Returns guidance only when the client cannot know whether checkout reached the server. */
export function getCheckoutRecoveryMessage(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status !== 0 || (error.code !== 'REQUEST_TIMEOUT' && error.code !== 'NETWORK_ERROR')) return null;
  return AMBIGUOUS_CHECKOUT_MESSAGE;
}
