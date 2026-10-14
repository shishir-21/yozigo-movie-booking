import { describe, expect, it } from 'vitest';
import { getBookingConfirmationView } from './booking-confirmation';
import type { BookingConfirmation } from './booking-client';

const confirmation: BookingConfirmation = {
  booking: {
    id: 'ab12cd34ef56',
    showId: 'show-1',
    movieTitle: 'Aurora',
    amountPaise: 50000,
    status: 'CONFIRMED',
    createdAt: '2026-10-14T09:00:00.000Z',
    startsAt: '2026-10-20T18:30:00.000Z',
    seats: [
      { id: 'seat-1', row: 'A', number: 1 },
      { id: 'seat-2', row: 'A', number: 2 },
    ],
  },
  payment: { mode: 'MOCK', status: 'SUCCEEDED', message: 'Demo payment succeeded.' },
  alreadyConfirmed: false,
};

describe('booking confirmation presentation', () => {
  it('shows the server booking reference, movie, all seats, and total', () => {
    const view = getBookingConfirmationView(confirmation);
    expect(view.reference).toBe('AB12CD34');
    expect(view.movieTitle).toBe('Aurora');
    expect(view.seats).toBe('A1, A2');
    expect(view.total).toContain('500');
    expect(view.total).toContain('₹');
  });

  it('makes the mock-payment limitation explicit', () => {
    expect(getBookingConfirmationView(confirmation).paymentMessage).toContain('No real money was charged');
  });

  it('handles invalid dates and empty seat details without throwing', () => {
    const partial = {
      ...confirmation,
      booking: { ...confirmation.booking, startsAt: 'not-a-date', seats: [] },
    };
    const view = getBookingConfirmationView(partial);
    expect(view.showtime).toBe('Date unavailable');
    expect(view.seats).toBe('Seat details unavailable');
  });

  it('does not hide an idempotently returned booking', () => {
    expect(getBookingConfirmationView({ ...confirmation, alreadyConfirmed: true }).alreadyConfirmed).toBe(true);
  });
});
