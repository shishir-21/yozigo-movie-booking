import { useEffect, useState } from 'react';
import { ApiError } from './auth-client';
import { getAdminShowReport, type AdminShowReport } from './admin-client';

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}
function reference(id: string): string { return id.slice(0, 8).toUpperCase(); }

export default function AdminShowReport({ token, showId, onClose }: { token: string; showId: string; onClose: () => void }) {
  const [report, setReport] = useState<AdminShowReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getAdminShowReport(token, showId)
      .then(({ report: result }) => { if (active) setReport(result); })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof ApiError && reason.status === 401
          ? 'Your admin session expired. Sign in again to view reports.'
          : reason instanceof Error ? reason.message : 'Unable to load the show report.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, showId, reloadKey]);

  return <div className="auth-backdrop report-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby="show-report-title">
      <button className="auth-close" type="button" aria-label="Close show report" onClick={onClose}>×</button>
      <span className="section-kicker">YOZIGO OPERATIONS</span>
      <h2 id="show-report-title">Show <span>report.</span></h2>
      {loading ? <p className="catalogue-state" role="status">Loading show report…</p> : error ? <div className="catalogue-state catalogue-error" role="alert"><p>{error}</p><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Try again</button></div> : report && <>
        <h3 className="report-movie-title">{report.show.movieTitle}</h3>
        <p className="report-show-date">{formatDate(report.show.startsAt)} · {report.show.durationMin} min · {formatRupees(report.show.pricePaise)} per seat</p>
        <div className="report-metrics">
          <article><span>Seats booked</span><strong>{report.seatsBooked} / {report.capacity}</strong></article>
          <article><span>Occupancy</span><strong>{report.percentageFull}%</strong></article>
          <article><span>Money collected</span><strong>{formatRupees(report.moneyCollectedPaise)}</strong></article>
        </div>
        <div className="report-section">
          <h3>Seat map <span>{report.seats.length} seats</span></h3>
          <div className="report-seat-legend"><span><i className="report-seat-dot available" /> Available</span><span><i className="report-seat-dot booked" /> Booked</span></div>
          <div className="report-seat-grid">
            {report.seats.map((seat) => <div key={seat.id} className={`report-seat ${seat.status.toLowerCase()}`} title={`Seat ${seat.row}${seat.number}: ${seat.status.toLowerCase()}`}>{seat.row}{seat.number}</div>)}
          </div>
        </div>
        <div className="report-section">
          <h3>Bookings <span>{report.bookings.length} records</span></h3>
          {report.bookings.length === 0 ? <p className="catalogue-state">No bookings for this show yet.</p> : <div className="report-bookings">
            {report.bookings.map((booking) => <article className="report-booking" key={booking.id}>
              <div className="report-booking-heading"><div><strong>{booking.customer.name}</strong><span>{booking.customer.email}</span></div><span className={`booking-status ${booking.status.toLowerCase()}`}>{booking.status === 'CONFIRMED' ? 'Confirmed' : 'Cancelled'}</span></div>
              <div className="report-booking-meta"><span>Ref. {reference(booking.id)}</span><span>{booking.seats.length ? booking.seats.map((seat) => `${seat.row}${seat.number}`).join(', ') : 'No seats'}</span><span>{formatRupees(booking.amountPaise)}</span></div>
              <p>{formatDate(booking.createdAt)}</p>
            </article>)}
          </div>}
        </div>
        <button type="button" className="admin-refresh" onClick={() => setReloadKey((value) => value + 1)}>Refresh report</button>
      </>}
    </section>
  </div>;
}
