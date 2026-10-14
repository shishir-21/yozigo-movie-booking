import { describe, expect, it } from 'vitest';
import { getCancellationConfirmationDetails } from './cancellation-confirmation';

describe('booking cancellation confirmation details', () => {
  it('shows the booking reference, movie title, and formatted showtime', () => {
    const details = getCancellationConfirmationDetails({
      id: 'ab12cd34ef56',
      movieTitle: 'Demo Movie',
      startsAt: '2026-10-20T18:30:00.000Z',
    });

    expect(details.reference).toBe('AB12CD34');
    expect(details.movieTitle).toBe('Demo Movie');
    expect(details.showtime).not.toBe('Date unavailable');
  });

  it('uses safe fallbacks when booking display details are missing or invalid', () => {
    const details = getCancellationConfirmationDetails({
      id: '12345678',
      movieTitle: '   ',
      startsAt: 'not-a-date',
    });

    expect(details.movieTitle).toBe('Movie details unavailable');
    expect(details.showtime).toBe('Date unavailable');
  });
});
