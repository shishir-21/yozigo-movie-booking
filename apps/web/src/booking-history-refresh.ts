export type BookingHistoryLoadState =
  | 'initial-loading'
  | 'initial-error'
  | 'refreshing'
  | 'refresh-error'
  | 'empty'
  | 'ready';

export function getBookingHistoryLoadState(input: {
  loading: boolean;
  error: string | null;
  bookingCount: number;
}): BookingHistoryLoadState {
  if (input.loading && input.bookingCount === 0) return 'initial-loading';
  if (input.error && input.bookingCount === 0) return 'initial-error';
  if (input.loading) return 'refreshing';
  if (input.error) return 'refresh-error';
  if (input.bookingCount === 0) return 'empty';
  return 'ready';
}
