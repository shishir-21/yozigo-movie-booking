import { describe, expect, it } from 'vitest';
import { getBookingHistoryLoadState } from './booking-history-refresh';

describe('booking history loading states', () => {
  it('shows the initial loading state when no bookings have loaded yet', () => {
    expect(getBookingHistoryLoadState({ loading: true, error: null, bookingCount: 0 })).toBe('initial-loading');
  });

  it('shows an initial error with no cached bookings', () => {
    expect(getBookingHistoryLoadState({ loading: false, error: 'Network unavailable', bookingCount: 0 })).toBe('initial-error');
  });

  it('keeps the existing list visible while refreshing', () => {
    expect(getBookingHistoryLoadState({ loading: true, error: null, bookingCount: 3 })).toBe('refreshing');
  });

  it('preserves the existing list when refresh fails', () => {
    expect(getBookingHistoryLoadState({ loading: false, error: 'Request timed out', bookingCount: 3 })).toBe('refresh-error');
  });

  it('shows the empty state only after a successful empty response', () => {
    expect(getBookingHistoryLoadState({ loading: false, error: null, bookingCount: 0 })).toBe('empty');
  });

  it('shows loaded bookings after a successful response', () => {
    expect(getBookingHistoryLoadState({ loading: false, error: null, bookingCount: 3 })).toBe('ready');
  });
});
