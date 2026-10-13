import { useEffect, useState } from 'react';
import { ApiError } from './auth-client';
import { getMyBookings, type ConfirmedBooking } from './booking-client';

interface BookingHistoryProps {
  token: string;
  onClose: () => void;
}

function formatBookingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatAmount(amountPaise: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amountPaise / 100);
}

function bookingReference(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

export default function BookingHistory({ token, onClose }: BookingHistoryProps) {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    getMyBookings(token)
      .then(({ bookings: results }) => {
        if (active) setBookings(results);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof ApiError && reason.status === 401) {
          setError('Your session has expired. Please sign in again to view your bookings.');
        } else {
          setError(reason instanceof Error ? reason.message : 'Unable to load your bookings. Please try again.');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [token, reloadKey]);

  return (
    <div className="auth-backdrop booking-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="booking-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-history-title">
        <button className="auth-close" type="button" aria-label="Close booking history" onClick={onClose}>×</button>
        <span className="section-kicker">YOUR YOZIGO ACCOUNT</span>
        <h2 id="booking-history-title">My bookings<span>.</span></h2>
        <p className="auth-intro">Your confirmed cinema plans, all in one place.</p>

        {loading ? (
          <p className="catalogue-state" role="status">Loading your bookings…</p>
        ) : error ? (
          <div className="catalogue-state catalogue-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="booking-empty">
            <span aria-hidden="true">✳</span>
            <h3>No bookings yet</h3>
            <p>When you book a movie, your tickets will appear here.</p>
            <button type="button" className="auth-submit" onClick={onClose}>Explore movies</button>
          </div>
        ) : (
          <div className="booking-list">
            {bookings.map((booking) => (
              <article className="booking-card" key={booking.id}>
                <div className="booking-card-heading">
                  <div>
                    <span className="section-kicker">BOOKING {bookingReference(booking.id)}</span>
                    <h3>{booking.movieTitle}</h3>
                  </div>
                  <span className={`booking-status ${booking.status.toLowerCase()}`}>{booking.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span>
                </div>
                <div className="booking-meta">
                  <span><strong>Booked</strong>{formatBookingDate(booking.createdAt)}</span>
                  <span><strong>Seats</strong>{booking.seats.length ? booking.seats.map((seat) => `${seat.row}${seat.number}`).join(', ') : 'Not available'}</span>
                  <span><strong>Total</strong>{formatAmount(booking.amountPaise)}</span>
                </div>
                <p className="booking-show-id">Show reference: {booking.showId.slice(0, 8).toUpperCase()}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
