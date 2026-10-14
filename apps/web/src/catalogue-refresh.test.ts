import { describe, expect, it } from 'vitest';
import { getCatalogueRequestOutcome } from './catalogue-refresh';

const base = {
  hasLoaded: false,
  loading: true,
  refreshing: false,
  initialError: null,
  refreshError: null,
  movieCount: 0,
};

describe('movie catalogue request state', () => {
  it('shows initial loading before the first response', () => {
    expect(getCatalogueRequestOutcome(base)).toBe('initial-loading');
  });

  it('offers the initial error state when the first request fails', () => {
    expect(getCatalogueRequestOutcome({ ...base, loading: false, initialError: 'Offline' })).toBe('initial-error');
  });

  it('keeps the loaded catalogue available while refreshing', () => {
    expect(getCatalogueRequestOutcome({ ...base, hasLoaded: true, loading: false, refreshing: true, movieCount: 3 })).toBe('refreshing');
  });

  it('distinguishes a refresh failure from an initial-load failure', () => {
    expect(getCatalogueRequestOutcome({ ...base, hasLoaded: true, loading: false, refreshError: 'Offline', movieCount: 3 })).toBe('refresh-error');
  });

  it('shows an empty state only after a successful load with no movies', () => {
    expect(getCatalogueRequestOutcome({ ...base, hasLoaded: true, loading: false, movieCount: 0 })).toBe('empty');
  });

  it('shows the catalogue when a refresh succeeds', () => {
    expect(getCatalogueRequestOutcome({ ...base, hasLoaded: true, loading: false, movieCount: 3 })).toBe('ready');
  });
});
