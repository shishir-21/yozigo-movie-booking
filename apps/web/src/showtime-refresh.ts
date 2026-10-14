export type ShowtimeRequestOutcome =
  | 'initial-loading'
  | 'initial-error'
  | 'refreshing'
  | 'refresh-error'
  | 'empty'
  | 'ready';

export interface ShowtimeRequestState {
  hasLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  initialError: string | null;
  refreshError: string | null;
  showCount: number;
}

/** Distinguish initial showtime loading from refresh recovery without hiding valid options. */
export function getShowtimeRequestOutcome(state: ShowtimeRequestState): ShowtimeRequestOutcome {
  if (!state.hasLoaded && state.loading) return 'initial-loading';
  if (!state.hasLoaded && state.initialError) return 'initial-error';
  if (state.refreshing) return 'refreshing';
  if (state.refreshError) return 'refresh-error';
  if (state.showCount === 0) return 'empty';
  return 'ready';
}
