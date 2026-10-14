export type CatalogueRequestOutcome =
  | 'initial-loading'
  | 'initial-error'
  | 'refreshing'
  | 'refresh-error'
  | 'empty'
  | 'ready';

export interface CatalogueRequestState {
  hasLoaded: boolean;
  loading: boolean;
  refreshing: boolean;
  initialError: string | null;
  refreshError: string | null;
  movieCount: number;
}

export function getCatalogueRequestOutcome(state: CatalogueRequestState): CatalogueRequestOutcome {
  if (!state.hasLoaded && state.loading) return 'initial-loading';
  if (!state.hasLoaded && state.initialError) return 'initial-error';
  if (state.refreshing) return 'refreshing';
  if (state.refreshError) return 'refresh-error';
  if (state.movieCount === 0) return 'empty';
  return 'ready';
}
