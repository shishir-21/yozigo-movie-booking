import { describe, expect, it } from 'vitest';
import type { ConfirmedBooking } from './booking-client';
import { filterBookings } from './booking-history-filter';

const now = new Date('2026-10-14T12:00:00.000Z');

function booking(id: string, startsAt: string, status: ConfirmedBooking['status'] = 'CONFIRMED'): ConfirmedBooking {
  return {
    id, showId: 'show-1', movieTitle: `Movie ${id}`, amountPaise: 25000,
    status, createdAt: '2026-10-01T10:00:00.000Z', startsAt,
    seats: [{ id: 'seat-1', row: 'A', number: 1 }],
  };
}

const bookings = [
  booking('future-late', '2026-10-20T18:30:00.000Z'),
  booking('past', '2026-10-10T18:30:00.000Z'),
  booking('future-soon', '2026-10-15T18:30:00.000Z'),
  booking('cancelled', '2026-10-25T18:30:00.000Z', 'CANCELLED'),
  booking('invalid', 'not-a-date'),
];

describe('booking history filters', () => {
  it('returns every booking for All, with the latest showtime first', () => {
    expect(filterBookings(bookings, 'ALL', now).map(({ id }) => id)).toEqual([
      'cancelled', 'future-late', 'future-soon', 'past', 'invalid',
    ]);
  });

  it('shows confirmed future bookings with the soonest show first', () => {
    expect(filterBookings(bookings, 'UPCOMING', now).map(({ id }) => id)).toEqual([
      'future-soon', 'future-late',
    ]);
  });

  it('shows confirmed past bookings newest first and safely excludes invalid dates', () => {
    expect(filterBookings(bookings, 'PAST', now).map(({ id }) => id)).toEqual(['past']);
  });

  it('shows cancelled bookings regardless of their showtime', () => {
    expect(filterBookings(bookings, 'CANCELLED', now).map(({ id }) => id)).toEqual(['cancelled']);
  });
});
