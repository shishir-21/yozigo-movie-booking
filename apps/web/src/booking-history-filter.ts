import type { ConfirmedBooking } from './booking-client';

export type BookingHistoryFilter = 'ALL' | 'UPCOMING' | 'PAST' | 'CANCELLED';

/** Filter customer bookings by status and showtime, keeping invalid dates safe to display. */
export function filterBookings(
  bookings: ConfirmedBooking[],
  filter: BookingHistoryFilter,
  now: Date = new Date(),
): ConfirmedBooking[] {
  const nowTime = now.getTime();
  const filtered = bookings.filter((booking) => {
    if (filter === 'ALL') return true;
    if (filter === 'CANCELLED') return booking.status === 'CANCELLED';
    if (booking.status !== 'CONFIRMED') return false;

    const showTime = new Date(booking.startsAt).getTime();
    if (!Number.isFinite(showTime)) return false;
    return filter === 'UPCOMING' ? showTime > nowTime : showTime <= nowTime;
  });

  return filtered.sort((a, b) => {
    const aTime = new Date(a.startsAt).getTime();
    const bTime = new Date(b.startsAt).getTime();
    const safeA = Number.isFinite(aTime) ? aTime : 0;
    const safeB = Number.isFinite(bTime) ? bTime : 0;
    return filter === 'UPCOMING' ? safeA - safeB : safeB - safeA;
  });
}
