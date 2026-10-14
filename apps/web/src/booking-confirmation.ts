import type { BookingConfirmation } from './booking-client';
import { bookingReference, formatBookingAmount, formatBookingDate } from './booking-ticket';

export interface BookingConfirmationView {
  reference: string;
  movieTitle: string;
  showtime: string;
  seats: string;
  total: string;
  paymentMessage: string;
  alreadyConfirmed: boolean;
}

/** Maps the server's booking result into safe, display-ready confirmation details. */
export function getBookingConfirmationView(result: BookingConfirmation): BookingConfirmationView {
  const booking = result.booking;
  const seats = Array.isArray(booking.seats)
    ? booking.seats.map((seat) => `${seat.row}${seat.number}`).filter(Boolean).join(', ')
    : '';

  return {
    reference: booking.id ? bookingReference(booking.id) : 'Unavailable',
    movieTitle: booking.movieTitle?.trim() || 'Movie details unavailable',
    showtime: booking.startsAt ? formatBookingDate(booking.startsAt) : 'Date unavailable',
    seats: seats || 'Seat details unavailable',
    total: Number.isFinite(booking.amountPaise) ? formatBookingAmount(booking.amountPaise) : 'Total unavailable',
    paymentMessage: result.payment?.mode === 'MOCK'
      ? 'Demo payment confirmed. No real money was charged.'
      : 'Payment details unavailable.',
    alreadyConfirmed: Boolean(result.alreadyConfirmed),
  };
}
