import { useEffect, useState } from 'react';
import { ApiError } from './auth-client';
import { cancelBooking, getMyBookings, type ConfirmedBooking } from './booking-client';
import './booking-ticket.css';
import { filterBookings, type BookingHistoryFilter } from './booking-history-filter';
import { bookingReference, formatBookingAmount, formatBookingDate } from './booking-ticket';
import { getBookingHistoryLoadState } from './booking-history-refresh';
import { getCancellationRecoveryMessage } from './cancellation-recovery';
import { getCancellationConfirmationDetails } from './cancellation-confirmation';

interface BookingHistoryProps {
  token: string;
  onClose: () => void;
}

export default function BookingHistory({ token, onClose }: BookingHistoryProps) {
  const [bookings, setBookings] = useState<ConfirmedBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [pendingCancellation, setPendingCancellation] = useState<ConfirmedBooking | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [printingBookingId, setPrintingBookingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<BookingHistoryFilter>('ALL');
  const filterOptions: Array<{ value: BookingHistoryFilter; label: string }> = [
    { value: 'ALL', label: 'All bookings' },
    { value: 'UPCOMING', label: 'Upcoming' },
    { value: 'PAST', label: 'Past shows' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];
  const visibleBookings = filterBookings(bookings, activeFilter);
  const loadState = getBookingHistoryLoadState({ loading, error, bookingCount: bookings.length });
  const cancellationDetails = pendingCancellation ? getCancellationConfirmationDetails(pendingCancellation) : null;

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

  useEffect(() => {
    if (!printingBookingId) return;
    const finishPrinting = () => setPrintingBookingId(null);
    window.addEventListener('afterprint', finishPrinting);
    window.requestAnimationFrame(() => window.print());
    return () => window.removeEventListener('afterprint', finishPrinting);
  }, [printingBookingId]);

  useEffect(() => {
    if (!pendingCancellation || cancellingId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingCancellation(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [pendingCancellation, cancellingId]);

  async function confirmCancellation() {
    const booking = pendingCancellation;
    if (!booking || cancellingId) return;
    setPendingCancellation(null);
    setCancellingId(booking.id);
    setActionMessage(null);
    setActionError(null);
    try {
      const result = await cancelBooking(booking.id, token);
      setActionMessage(result.message);
      setReloadKey((value) => value + 1);
    } catch (reason) {
      const recoveryMessage = getCancellationRecoveryMessage(reason);
      if (recoveryMessage) {
        setActionMessage(recoveryMessage);
        setReloadKey((value) => value + 1);
      } else {
        setActionError(reason instanceof Error ? reason.message : 'Unable to cancel this booking.');
      }
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="auth-backdrop booking-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !pendingCancellation && !cancellingId) onClose();
    }}>
      <section className="booking-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-history-title">
        <button className="auth-close" type="button" aria-label="Close booking history" onClick={onClose}>×</button>
        <span className="section-kicker">YOUR YOZIGO ACCOUNT</span>
        <h2 id="booking-history-title">My bookings<span>.</span></h2>
        <div className="booking-history-toolbar">
          <p className="auth-intro">Your confirmed cinema plans, all in one place.</p>
          <button
            type="button"
            className="booking-history-refresh"
            onClick={() => setReloadKey((value) => value + 1)}
            disabled={loading || cancellingId !== null}
            aria-label={loading ? 'Refreshing bookings' : 'Refresh bookings'}
          >
            {loading ? 'Refreshing…' : 'Refresh bookings'}
          </button>
        </div>

        {actionMessage && <p className="booking-action-message" role="status">{actionMessage}</p>}
        {actionError && <p className="catalogue-state catalogue-error" role="alert">{actionError}</p>}

        {loadState === 'refreshing' && <p className="booking-refresh-status" role="status">Refreshing your bookings. Your current list stays visible.</p>}
        {loadState === 'refresh-error' && (
          <p className="catalogue-state catalogue-error" role="alert">
            We couldn't refresh your bookings. Your previously loaded list is still shown. {error}
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button>
          </p>
        )}

        {loadState === 'initial-loading' ? (
          <p className="catalogue-state" role="status">Loading your bookings…</p>
        ) : loadState === 'initial-error' ? (
          <div className="catalogue-state catalogue-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button>
          </div>
        ) : loadState === 'empty' ? (
          <div className="booking-empty">
            <span aria-hidden="true">✳</span>
            <h3>No bookings yet</h3>
            <p>When you book a movie, your tickets will appear here.</p>
            <button type="button" className="auth-submit" onClick={onClose}>Explore movies</button>
          </div>
        ) : bookings.length > 0 ? (
          <>
            <div className="booking-history-filters" role="group" aria-label="Filter bookings">
              {filterOptions.map((option) => {
                const count = filterBookings(bookings, option.value).length;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={activeFilter === option.value ? 'selected' : ''}
                    aria-pressed={activeFilter === option.value}
                    onClick={() => setActiveFilter(option.value)}
                  >
                    {option.label}<span>{count}</span>
                  </button>
                );
              })}
            </div>
            {visibleBookings.length === 0 ? (
              <div className="booking-filter-empty" role="status">
                <h3>No {activeFilter === 'UPCOMING' ? 'upcoming shows' : activeFilter === 'PAST' ? 'past shows' : 'cancelled bookings'} found</h3>
                <p>Try another filter to see your bookings.</p>
              </div>
            ) : (
              <div className="booking-list">
                {visibleBookings.map((booking) => (
                  <article className={`booking-card${printingBookingId === booking.id ? ' booking-card-printing' : ''}`} key={booking.id}>
                    <div className="booking-card-heading">
                      <div>
                        <span className="section-kicker">BOOKING {bookingReference(booking.id)}</span>
                        <h3>{booking.movieTitle}</h3>
                      </div>
                      <span className={`booking-status ${booking.status.toLowerCase()}`}>{booking.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span>
                    </div>
                    <div className="booking-meta">
                      <span><strong>Showtime</strong>{formatBookingDate(booking.startsAt)}</span>
                      <span><strong>Booked</strong>{formatBookingDate(booking.createdAt)}</span>
                      <span><strong>Seats</strong>{booking.seats.length ? booking.seats.map((seat) => `${seat.row}${seat.number}`).join(', ') : 'Not available'}</span>
                      <span><strong>Total</strong>{formatBookingAmount(booking.amountPaise)}</span>
                    </div>
                    <p className="booking-show-id">Show reference: {booking.showId.slice(0, 8).toUpperCase()}</p>
                    {booking.status === 'CONFIRMED' && (
                      <div className="booking-ticket-actions">
                        <button type="button" className="booking-print-button" onClick={() => setPrintingBookingId(booking.id)} disabled={printingBookingId !== null}>Print ticket</button>
                        <button
                          type="button"
                          className="booking-cancel-button"
                          onClick={() => setPendingCancellation(booking)}
                          disabled={cancellingId !== null || pendingCancellation !== null}
                        >
                          {cancellingId === booking.id ? 'Cancelling…' : 'Cancel booking'}
                        </button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        ) : null}

        {pendingCancellation && cancellationDetails && (
          <div className="booking-cancel-confirm-backdrop">
            <section
              className="booking-cancel-confirm"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="booking-cancel-confirm-title"
              aria-describedby="booking-cancel-confirm-description"
            >
              <span className="section-kicker">PLEASE CONFIRM</span>
              <h3 id="booking-cancel-confirm-title">Cancel this booking?</h3>
              <p id="booking-cancel-confirm-description">
                You are about to cancel <strong>{cancellationDetails.movieTitle}</strong> (booking {cancellationDetails.reference}) for {cancellationDetails.showtime}.
                Cancellation is allowed only more than two hours before the showtime.
              </p>
              <div className="booking-cancel-confirm-actions">
                <button type="button" className="booking-cancel-keep" autoFocus onClick={() => setPendingCancellation(null)}>Keep booking</button>
                <button type="button" className="booking-cancel-confirm-submit" onClick={() => void confirmCancellation()}>Confirm cancellation</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
