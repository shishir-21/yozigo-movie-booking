import { describe, expect, it } from 'vitest';
import { bookingReference, formatBookingAmount, formatBookingDate } from './booking-ticket';

describe('printable booking ticket helpers', () => {
  it('creates a short uppercase booking reference', () => {
    expect(bookingReference('ab12cd34ef56')).toBe('AB12CD34');
  });

  it('formats ticket totals in Indian rupees from paise', () => {
    expect(formatBookingAmount(25000)).toContain('250');
    expect(formatBookingAmount(25000)).toContain('₹');
  });

  it('formats valid showtimes and handles invalid dates safely', () => {
    expect(formatBookingDate('2026-10-20T18:30:00.000Z')).not.toBe('Date unavailable');
    expect(formatBookingDate('not-a-date')).toBe('Date unavailable');
  });
});
