export type SeatRequestOutcome =
  | 'initial-loading'
  | 'initial-error'
  | 'ready'
  | 'refreshing'
  | 'refresh-error'
  | 'empty';

export function getSeatRequestOutcome(input: {
  hasLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  initialError: string | null;
  refreshError: string | null;
  seatCount: number;
}): SeatRequestOutcome {
  if (!input.hasLoaded) {
    if (input.loading) return 'initial-loading';
    if (input.initialError) return 'initial-error';
    return input.seatCount === 0 ? 'empty' : 'ready';
  }
  if (input.refreshing) return 'refreshing';
  if (input.refreshError) return 'refresh-error';
  return input.seatCount === 0 ? 'empty' : 'ready';
}
