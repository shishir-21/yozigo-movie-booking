import { describe, expect, it } from 'vitest';
import { getSeatRequestOutcome } from './seat-refresh';

describe('getSeatRequestOutcome', () => {
  it('shows initial loading before the first successful response', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: false, loading: true, refreshing: false,
      initialError: null, refreshError: null, seatCount: 0,
    })).toBe('initial-loading');
  });

  it('keeps the initial error distinct and retryable', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: false, loading: false, refreshing: false,
      initialError: 'API unavailable', refreshError: null, seatCount: 0,
    })).toBe('initial-error');
  });

  it('shows the empty state only after a successful response with no seats', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: true, loading: false, refreshing: false,
      initialError: null, refreshError: null, seatCount: 0,
    })).toBe('empty');
  });

  it('keeps the existing map visible while refreshing', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: true, loading: false, refreshing: true,
      initialError: null, refreshError: null, seatCount: 80,
    })).toBe('refreshing');
  });

  it('preserves the existing map and reports a refresh failure', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: true, loading: false, refreshing: false,
      initialError: null, refreshError: 'Connection lost', seatCount: 80,
    })).toBe('refresh-error');
  });

  it('returns ready when loaded seats are available and no request is active', () => {
    expect(getSeatRequestOutcome({
      hasLoaded: true, loading: false, refreshing: false,
      initialError: null, refreshError: null, seatCount: 80,
    })).toBe('ready');
  });
});
