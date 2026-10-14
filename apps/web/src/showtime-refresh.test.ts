import { describe, expect, it } from 'vitest';
import { getShowtimeRequestOutcome } from './showtime-refresh';

const base = {
  hasLoaded: false,
  loading: true,
  refreshing: false,
  initialError: null,
  refreshError: null,
  showCount: 0,
};

describe('showtime request state', () => {
  it('shows initial loading before the first response', () => {
    expect(getShowtimeRequestOutcome(base)).toBe('initial-loading');
  });

  it('offers retry when the first request fails', () => {
    expect(getShowtimeRequestOutcome({ ...base, loading: false, initialError: 'Offline' })).toBe('initial-error');
  });

  it('keeps existing showtimes available while refreshing', () => {
    expect(getShowtimeRequestOutcome({ ...base, hasLoaded: true, loading: false, refreshing: true, showCount: 2 })).toBe('refreshing');
  });

  it('distinguishes refresh failure from initial failure', () => {
    expect(getShowtimeRequestOutcome({ ...base, hasLoaded: true, loading: false, refreshError: 'Offline', showCount: 2 })).toBe('refresh-error');
  });

  it('shows empty only after a successful response with no showtimes', () => {
    expect(getShowtimeRequestOutcome({ ...base, hasLoaded: true, loading: false, showCount: 0 })).toBe('empty');
  });

  it('shows loaded showtimes after a successful refresh', () => {
    expect(getShowtimeRequestOutcome({ ...base, hasLoaded: true, loading: false, showCount: 2 })).toBe('ready');
  });
});
