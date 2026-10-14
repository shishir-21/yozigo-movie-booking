import type { ConfirmedBooking } from './booking-client';
import { bookingReference, formatBookingDate } from './booking-ticket';

export interface CancellationConfirmationDetails {
  reference: string;
  movieTitle: string;
  showtime: string;
}

/** Builds display-safe details for the in-app cancellation confirmation. */
export function getCancellationConfirmationDetails(
  booking: Pick<ConfirmedBooking, 'id' | 'movieTitle' | 'startsAt'>,
): CancellationConfirmationDetails {
  return {
    reference: bookingReference(booking.id),
    movieTitle: booking.movieTitle?.trim() || 'Movie details unavailable',
    showtime: formatBookingDate(booking.startsAt),
  };
}
