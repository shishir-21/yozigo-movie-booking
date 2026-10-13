import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ApiError } from './auth-client';
import AdminShowReport from './AdminShowReport';
import AdminAnalytics from './AdminAnalytics';
import {
  createAdminMovie, createAdminShow, deleteAdminMovie, deleteAdminShow,
  getAdminMovies, getAdminShows, updateAdminMovie, updateAdminShow,
  type AdminMovie, type AdminShow, type MovieRating,
} from './admin-client';

type Tab = 'movies' | 'shows' | 'analytics';
type MovieDraft = { title: string; posterUrl: string; language: string; durationMin: string; rating: MovieRating; description: string };
type ShowDraft = { movieId: string; startsAt: string; priceRupees: string };
const emptyMovie: MovieDraft = { title: '', posterUrl: '', language: 'English', durationMin: '120', rating: 'UA', description: '' };
const emptyShow: ShowDraft = { movieId: '', startsAt: '', priceRupees: '' };

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function formatRupees(paise: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
}

export default function AdminManagement({ token, onClose }: { token: string; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('movies');
  const [movies, setMovies] = useState<AdminMovie[]>([]);
  const [shows, setShows] = useState<AdminShow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingMovie, setEditingMovie] = useState<string | null>(null);
  const [editingShow, setEditingShow] = useState<string | null>(null);
  const [reportShow, setReportShow] = useState<AdminShow | null>(null);
  const [movieDraft, setMovieDraft] = useState<MovieDraft>(emptyMovie);
  const [showDraft, setShowDraft] = useState<ShowDraft>(emptyShow);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [movieResult, showResult] = await Promise.all([getAdminMovies(token), getAdminShows(token)]);
      setMovies(movieResult.movies);
      setShows(showResult.shows);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load admin data.');
      if (reason instanceof ApiError && reason.status === 401) setError('Your admin session expired. Sign out and sign in again.');
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void reload(); }, [reload]);

  function startMovieEdit(movie: AdminMovie) {
    setEditingMovie(movie.id);
    setMovieDraft({ title: movie.title, posterUrl: movie.posterUrl ?? '', language: movie.language, durationMin: String(movie.durationMin), rating: movie.rating, description: movie.description ?? '' });
    setError(null); setSuccess(null);
  }
  function startShowEdit(show: AdminShow) {
    setEditingShow(show.id);
    setShowDraft({ movieId: show.movieId, startsAt: toLocalDateTime(show.startsAt), priceRupees: (show.pricePaise / 100).toFixed(2) });
    setError(null); setSuccess(null);
  }

  async function submitMovie(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    const payload = { title: movieDraft.title.trim(), posterUrl: movieDraft.posterUrl.trim() || null, language: movieDraft.language.trim(), durationMin: Number(movieDraft.durationMin), rating: movieDraft.rating, description: movieDraft.description.trim() };
    try {
      if (editingMovie) await updateAdminMovie(token, editingMovie, payload);
      else await createAdminMovie(token, payload);
      setSuccess(editingMovie ? 'Movie updated.' : 'Movie created.');
      setEditingMovie(null); setMovieDraft(emptyMovie); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save movie.'); }
    finally { setBusy(false); }
  }

  async function submitShow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setSuccess(null);
    const startsAt = new Date(showDraft.startsAt);
    const price = Number(showDraft.priceRupees);
    if (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date()) { setError('Choose a future showtime.'); setBusy(false); return; }
    if (!Number.isFinite(price) || price <= 0) { setError('Ticket price must be greater than zero.'); setBusy(false); return; }
    const payload = { movieId: showDraft.movieId, startsAt: startsAt.toISOString(), pricePaise: Math.round(price * 100) };
    try {
      if (editingShow) await updateAdminShow(token, editingShow, payload);
      else await createAdminShow(token, payload);
      setSuccess(editingShow ? 'Show updated.' : 'Show created.');
      setEditingShow(null); setShowDraft(emptyShow); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save show.'); }
    finally { setBusy(false); }
  }

  async function removeMovie(movie: AdminMovie) {
    if (!window.confirm(`Delete "${movie.title}"? Movies with scheduled shows cannot be deleted.`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try { await deleteAdminMovie(token, movie.id); setSuccess('Movie deleted.'); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete movie.'); }
    finally { setBusy(false); }
  }
  async function removeShow(show: AdminShow) {
    if (!window.confirm(`Delete the show for "${show.movie.title}" on ${formatDate(show.startsAt)}?`)) return;
    setBusy(true); setError(null); setSuccess(null);
    try { await deleteAdminShow(token, show.id); setSuccess('Show deleted.'); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to delete show.'); }
    finally { setBusy(false); }
  }

  return <div className="auth-backdrop admin-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <button className="auth-close" type="button" aria-label="Close admin management" disabled={busy} onClick={onClose}>×</button>
      <span className="section-kicker">YOZIGO OPERATIONS</span>
      <h2 id="admin-title">Admin <span>management.</span></h2>
      <p className="auth-intro">Manage the catalogue and schedule. The API validates permissions and screening conflicts.</p>
      <div className="admin-tabs" role="tablist" aria-label="Management sections">
        <button type="button" role="tab" aria-selected={tab === 'movies'} className={tab === 'movies' ? 'selected' : ''} onClick={() => { setTab('movies'); setError(null); }}>Movies ({movies.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'shows'} className={tab === 'shows' ? 'selected' : ''} onClick={() => { setTab('shows'); setError(null); }}>Shows ({shows.length})</button>
        <button type="button" role="tab" aria-selected={tab === 'analytics'} className={tab === 'analytics' ? 'selected' : ''} onClick={() => { setTab('analytics'); setError(null); }}>Analytics</button>
      </div>
      {error && <p className="admin-message error" role="alert">{error}{error.includes('session expired') && <span> Please sign in again.</span>}</p>}
      {success && <p className="admin-message success" role="status">{success}</p>}
      {loading ? <p className="catalogue-state" role="status">Loading admin data…</p> : <>
        {tab === 'analytics' ? <AdminAnalytics token={token} /> : tab === 'movies' ? <>
          <form className="admin-form" onSubmit={submitMovie}>
            <h3>{editingMovie ? 'Edit movie' : 'Add a movie'}</h3>
            <div className="admin-form-grid">
              <label>Title<input required maxLength={160} value={movieDraft.title} onChange={(e) => setMovieDraft({ ...movieDraft, title: e.target.value })} /></label>
              <label>Language<input required maxLength={60} value={movieDraft.language} onChange={(e) => setMovieDraft({ ...movieDraft, language: e.target.value })} /></label>
              <label>Duration (minutes)<input required type="number" min="1" max="600" value={movieDraft.durationMin} onChange={(e) => setMovieDraft({ ...movieDraft, durationMin: e.target.value })} /></label>
              <label>Rating<select value={movieDraft.rating} onChange={(e) => setMovieDraft({ ...movieDraft, rating: e.target.value as MovieRating })}><option value="U">U</option><option value="UA">UA</option><option value="A">A</option></select></label>
              <label className="wide">Poster URL<input type="url" maxLength={2048} value={movieDraft.posterUrl} onChange={(e) => setMovieDraft({ ...movieDraft, posterUrl: e.target.value })} placeholder="https://…" /></label>
              <label className="wide">Description<textarea maxLength={2000} rows={2} value={movieDraft.description} onChange={(e) => setMovieDraft({ ...movieDraft, description: e.target.value })} /></label>
            </div>
            <div className="admin-form-actions"><button className="auth-submit" disabled={busy} type="submit">{busy ? 'Saving…' : editingMovie ? 'Save movie' : 'Create movie'}</button>{editingMovie && <button type="button" className="admin-secondary" disabled={busy} onClick={() => { setEditingMovie(null); setMovieDraft(emptyMovie); }}>Cancel edit</button>}</div>
          </form>
          <div className="admin-record-list"><h3>Movies</h3>{movies.length === 0 ? <p className="catalogue-state">No movies yet. Add the first movie above.</p> : movies.map((movie) => <article className="admin-record" key={movie.id}><div><strong>{movie.title}</strong><p>{movie.language} · {movie.durationMin} min · {movie.rating} · {movie._count?.shows ?? 0} shows</p></div><div className="admin-record-actions"><button type="button" disabled={busy} onClick={() => startMovieEdit(movie)}>Edit</button><button type="button" className="danger" disabled={busy} onClick={() => void removeMovie(movie)}>Delete</button></div></article>)}</div>
        </> : <>
          <form className="admin-form" onSubmit={submitShow}>
            <h3>{editingShow ? 'Edit show' : 'Schedule a show'}</h3>
            <div className="admin-form-grid">
              <label className="wide">Movie<select required value={showDraft.movieId} onChange={(e) => setShowDraft({ ...showDraft, movieId: e.target.value })}><option value="">Choose a movie</option>{movies.map((movie) => <option key={movie.id} value={movie.id}>{movie.title} ({movie.durationMin} min)</option>)}</select></label>
              <label>Start time<input required type="datetime-local" value={showDraft.startsAt} onChange={(e) => setShowDraft({ ...showDraft, startsAt: e.target.value })} /></label>
              <label>Ticket price (INR)<input required type="number" min="0.01" step="0.01" value={showDraft.priceRupees} onChange={(e) => setShowDraft({ ...showDraft, priceRupees: e.target.value })} placeholder="250.00" /></label>
            </div>
            <div className="admin-form-actions"><button className="auth-submit" disabled={busy || movies.length === 0} type="submit">{busy ? 'Saving…' : editingShow ? 'Save show' : 'Create show'}</button>{editingShow && <button type="button" className="admin-secondary" disabled={busy} onClick={() => { setEditingShow(null); setShowDraft(emptyShow); }}>Cancel edit</button>}</div>
            <p className="field-hint">Screenings require a 15-minute turnaround buffer. Conflicts are checked by the API.</p>
          </form>
          <div className="admin-record-list"><h3>Scheduled shows</h3>{shows.length === 0 ? <p className="catalogue-state">No shows scheduled yet.</p> : shows.map((show) => <article className="admin-record" key={show.id}><div><strong>{show.movie.title}</strong><p>{formatDate(show.startsAt)} · {formatRupees(show.pricePaise)} · {show.movie.durationMin} min</p></div><div className="admin-record-actions"><button type="button" disabled={busy} onClick={() => setReportShow(show)}>Report</button><button type="button" disabled={busy} onClick={() => startShowEdit(show)}>Edit</button><button type="button" className="danger" disabled={busy} onClick={() => void removeShow(show)}>Delete</button></div></article>)}</div>
        </>}
      </>}
      <button type="button" className="admin-refresh" disabled={loading || busy} onClick={() => void reload()}>Refresh catalogue</button>
    </section>
    {reportShow && <AdminShowReport token={token} showId={reportShow.id} onClose={() => setReportShow(null)} />}
  </div>;
}
