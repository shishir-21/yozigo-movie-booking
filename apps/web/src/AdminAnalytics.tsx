import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from './auth-client';
import { getAdminAnalytics, type AdminAnalytics } from './admin-client';

function money(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function csvCell(value: string | number): string {
  const text = String(value);
  const safe = /^[=+@\\-\\t\\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
function exportCsv(analytics: AdminAnalytics) {
  const rows: Array<Array<string | number>> = [
    ['Movie', 'Show start', 'Confirmed bookings', 'Seats sold', 'Capacity', 'Occupancy (%)', 'Mock-payment collection (INR)'],
    ...analytics.shows.map((show) => [
      show.movieTitle,
      dateTime(show.startsAt),
      show.confirmedBookings,
      show.seatsSold,
      show.capacity,
      show.percentageFull,
      (show.moneyCollectedPaise / 100).toFixed(2),
    ]),
    [],
    ['Summary', 'Value'],
    ['Shows in report', analytics.showCount],
    ['Confirmed bookings', analytics.confirmedBookings],
    ['Seats sold', analytics.seatsSold],
    ['Total capacity', analytics.capacity],
    ['Mock-payment collection (INR)', (analytics.moneyCollectedPaise / 100).toFixed(2)],
  ];
  const csv = rows.map((row) => row.map((cell) => csvCell(cell ?? '')).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `yozigo-admin-analytics-${analytics.from ?? 'all'}-to-${analytics.to ?? 'dates'}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function AdminAnalytics({ token }: { token: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getAdminAnalytics(token, applied);
      setAnalytics(result.analytics);
    } catch (reason) {
      setError(reason instanceof ApiError && reason.status === 401
        ? 'Your admin session expired. Sign out and sign in again.'
        : reason instanceof Error ? reason.message : 'Unable to load analytics.');
    } finally {
      setLoading(false);
    }
  }, [token, applied]);

  useEffect(() => { void reload(); }, [reload]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (from && to && from > to) {
      setError('The start date must be on or before the end date.');
      return;
    }
    setApplied({ ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }

  return <section className="admin-analytics" aria-labelledby="analytics-title">
    <div className="admin-analytics-heading">
      <div><h3 id="analytics-title">Performance overview</h3><p className="field-hint">Confirmed bookings only. Collection totals represent simulated checkout payments, not real transactions.</p></div>
      <button type="button" className="admin-secondary" disabled={loading || !analytics} onClick={() => analytics && exportCsv(analytics)}>Export CSV</button>
    </div>
    <form className="admin-analytics-filters" onSubmit={applyFilters}>
      <label>Show date from<input type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
      <label>Show date to<input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
      <button type="submit" className="auth-submit" disabled={loading}>Apply filters</button>
      <button type="button" className="admin-secondary" disabled={loading && !analytics} onClick={() => { setFrom(''); setTo(''); setApplied({}); }}>Clear</button>
    </form>
    {error && <p className="admin-message error" role="alert">{error} <button type="button" onClick={() => void reload()}>Retry</button></p>}
    {loading ? <p className="catalogue-state" role="status">Loading analytics…</p> : analytics && <>
      <div className="admin-analytics-metrics">
        <article><span>Shows</span><strong>{analytics.showCount}</strong></article>
        <article><span>Confirmed bookings</span><strong>{analytics.confirmedBookings}</strong></article>
        <article><span>Seats sold</span><strong>{analytics.seatsSold} <small>/ {analytics.capacity}</small></strong></article>
        <article><span>Mock-payment collection</span><strong>{money(analytics.moneyCollectedPaise)}</strong></article>
      </div>
      {analytics.shows.length === 0 ? <p className="catalogue-state">No shows match this date range. Try clearing the filters or choosing another range.</p> : <div className="admin-analytics-table-wrap">
        <table className="admin-analytics-table">
          <thead><tr><th>Movie / showtime</th><th>Bookings</th><th>Seats sold</th><th>Occupancy</th><th>Mock collection</th></tr></thead>
          <tbody>{analytics.shows.map((show) => <tr key={show.showId}>
            <td><strong>{show.movieTitle}</strong><span>{dateTime(show.startsAt)}</span></td>
            <td>{show.confirmedBookings}</td>
            <td>{show.seatsSold} / {show.capacity}</td>
            <td><div className="admin-occupancy"><span style={{ width: `${Math.min(100, show.percentageFull)}%` }} /></div><small>{show.percentageFull.toFixed(2)}%</small></td>
            <td>{money(show.moneyCollectedPaise)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>;
}
