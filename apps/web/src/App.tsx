import { useEffect, useState, type FormEvent } from 'react';
import { filterMovies, type MovieSort } from './movie-catalogue';
import { ApiError, getCurrentUser, login, register, type AuthUser } from './auth-client';
import { formatPrice, formatShowDate, getMovies, getMovieShows, type Movie, type MovieShow } from './movie-client';
import { getShowSeats, type ShowSeat } from './seat-client';
import { createSeatHold, releaseSeatHold, type SeatHold } from './hold-client';
import { confirmBooking, type BookingConfirmation } from './booking-client';
import { getBookingConfirmationView } from './booking-confirmation';
import { getCheckoutRecoveryMessage } from './checkout-recovery';
import { seatEventConnectionLabel, type SeatEventConnectionState } from './seat-events';
import { getCatalogueRequestOutcome } from './catalogue-refresh';
import { getShowtimeRequestOutcome } from './showtime-refresh';
import { getSeatRequestOutcome } from './seat-refresh';
import { formatHoldCountdown, getHoldCountdownUrgency, getHoldCountdownMessage } from './hold-countdown';
import { getSeatGridNavigationTarget } from './seat-grid-navigation';
import BookingHistory from './BookingHistory';
import AdminManagement from './AdminManagement';
import AccountSettings from './AccountSettings';

const TOKEN_KEY = 'yozigo_access_token';

type AuthMode = 'login' | 'register';

function initials(name: string): string {
  return name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [moviesRefreshing, setMoviesRefreshing] = useState(false);
  const [moviesHasLoaded, setMoviesHasLoaded] = useState(false);
  const [moviesError, setMoviesError] = useState<string | null>(null);
  const [moviesRefreshError, setMoviesRefreshError] = useState<string | null>(null);
  const [movieSearch, setMovieSearch] = useState('');
  const [movieLanguage, setMovieLanguage] = useState('all');
  const [movieSort, setMovieSort] = useState<MovieSort>('featured');
  const [movieReload, setMovieReload] = useState(0);
  const [showtimeMovieId, setShowtimeMovieId] = useState<string | null>(null);
  const [showtimeOptions, setShowtimeOptions] = useState<MovieShow[]>([]);
  const [showtimesLoading, setShowtimesLoading] = useState(false);
  const [showtimesRefreshing, setShowtimesRefreshing] = useState(false);
  const [showtimesHasLoaded, setShowtimesHasLoaded] = useState(false);
  const [showtimesError, setShowtimesError] = useState<string | null>(null);
  const [showtimesRefreshError, setShowtimesRefreshError] = useState<string | null>(null);
  const [showtimesReload, setShowtimesReload] = useState(0);
  const [token, setToken] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [showSeats, setShowSeats] = useState<ShowSeat[]>([]);
  const [seatsLoading, setSeatsLoading] = useState(false);
  const [seatsRefreshing, setSeatsRefreshing] = useState(false);
  const [seatsHasLoaded, setSeatsHasLoaded] = useState(false);
  const [seatsLoadedForShowId, setSeatsLoadedForShowId] = useState<string | null>(null);
  const [seatsError, setSeatsError] = useState<string | null>(null);
  const [seatsRefreshError, setSeatsRefreshError] = useState<string | null>(null);
  const [activeHolds, setActiveHolds] = useState<SeatHold[]>([]);
  const [selectedShowPricePaise, setSelectedShowPricePaise] = useState(0);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [checkoutRecoveryMessage, setCheckoutRecoveryMessage] = useState<string | null>(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [seatReload, setSeatReload] = useState(0);
  const [seatEventsState, setSeatEventsState] = useState<SeatEventConnectionState>('connecting');
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [bookingConfirmation, setBookingConfirmation] = useState<BookingConfirmation | null>(null);
  const [bookingHistoryOpen, setBookingHistoryOpen] = useState(false);
  const [adminManagementOpen, setAdminManagementOpen] = useState(false);
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  const seatsOutcome = getSeatRequestOutcome({
    hasLoaded: seatsHasLoaded && seatsLoadedForShowId === selectedShowId,
    loading: seatsLoading,
    refreshing: seatsRefreshing,
    initialError: seatsError,
    refreshError: seatsRefreshError,
    seatCount: seatsLoadedForShowId === selectedShowId ? showSeats.length : 0,
  });
  const showtimesOutcome = getShowtimeRequestOutcome({
    hasLoaded: showtimesHasLoaded,
    loading: showtimesLoading,
    refreshing: showtimesRefreshing,
    initialError: showtimesError,
    refreshError: showtimesRefreshError,
    showCount: showtimeOptions.length,
  });
  const catalogueOutcome = getCatalogueRequestOutcome({
    hasLoaded: moviesHasLoaded,
    loading: moviesLoading,
    refreshing: moviesRefreshing,
    initialError: moviesError,
    refreshError: moviesRefreshError,
    movieCount: movies.length,
  });
  const holdCountdownUrgency = getHoldCountdownUrgency(holdSeconds);
  const holdCountdownMessage = getHoldCountdownMessage(holdCountdownUrgency);
  const visibleMovies = filterMovies(movies, { query: movieSearch, language: movieLanguage, sort: movieSort });
  const availableLanguages = [...new Set(movies.map((movie) => movie.language.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    if (activeHolds.length === 0) { setHoldSeconds(0); return; }
    const updateRemaining = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.ceil((Math.min(...activeHolds.map((hold) => new Date(hold.expiresAt).getTime())) - now) / 1000));
      setHoldSeconds(remaining);
      const unexpired = activeHolds.filter((hold) => new Date(hold.expiresAt).getTime() > now);
      if (unexpired.length !== activeHolds.length) {
        setActiveHolds(unexpired);
        setNotice('One or more seat holds expired. Seat availability is being refreshed; select your seats again if needed.');
        setSeatReload((value) => value + 1);
      }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeHolds]);

  useEffect(() => {
    let active = true;
    if (moviesHasLoaded) {
      setMoviesRefreshing(true);
      setMoviesRefreshError(null);
    } else {
      setMoviesLoading(true);
      setMoviesError(null);
    }
    getMovies()
      .then(({ movies: results }) => {
        if (!active) return;
        setMovies(results);
        setMoviesHasLoaded(true);
        setMoviesError(null);
        setMoviesRefreshError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to load movies. Please try again.';
        if (moviesHasLoaded) setMoviesRefreshError(message);
        else setMoviesError(message);
      })
      .finally(() => {
        if (active) {
          setMoviesLoading(false);
          setMoviesRefreshing(false);
        }
      });
    return () => { active = false; };
  }, [movieReload]);

  useEffect(() => {
    let active = true;
    const savedToken = sessionStorage.getItem(TOKEN_KEY);

    if (!savedToken) {
      setIsRestoringSession(false);
      return () => { active = false; };
    }

    getCurrentUser(savedToken)
      .then(({ user: currentUser }) => {
        if (!active) return;
        setUser(currentUser);
        setToken(savedToken);
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
        } else {
          setNotice('We could not verify your session. Check your connection and refresh the page.');
        }
      })
      .finally(() => {
        if (active) setIsRestoringSession(false);
      });

    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!showtimeMovieId) {
      setShowtimeOptions([]);
      setShowtimesLoading(false);
      setShowtimesRefreshing(false);
      setShowtimesHasLoaded(false);
      setShowtimesError(null);
      setShowtimesRefreshError(null);
      return;
    }
    let active = true;
    if (showtimesHasLoaded) {
      setShowtimesRefreshing(true);
      setShowtimesRefreshError(null);
    } else {
      setShowtimesLoading(true);
      setShowtimesError(null);
    }
    getMovieShows(showtimeMovieId)
      .then(({ shows }) => {
        if (!active) return;
        setShowtimeOptions(shows);
        setShowtimesHasLoaded(true);
        setShowtimesError(null);
        setShowtimesRefreshError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to load showtimes. Please try again.';
        if (showtimesHasLoaded) setShowtimesRefreshError(message);
        else setShowtimesError(message);
      })
      .finally(() => {
        if (!active) return;
        setShowtimesLoading(false);
        setShowtimesRefreshing(false);
      });
    return () => { active = false; };
  }, [showtimeMovieId, showtimesReload]);

  useEffect(() => {
    if (!selectedShowId) {
      setSeatsLoading(false);
      setSeatsRefreshing(false);
      setSeatsError(null);
      setSeatsRefreshError(null);
      return;
    }
    let active = true;
    const alreadyLoaded = seatsHasLoaded && seatsLoadedForShowId === selectedShowId;
    if (alreadyLoaded) {
      setSeatsRefreshing(true);
      setSeatsRefreshError(null);
    } else {
      setSeatsLoading(true);
      setSeatsError(null);
    }
    getShowSeats(selectedShowId)
      .then(({ seats }) => {
        if (!active) return;
        setShowSeats(seats);
        setSeatsHasLoaded(true);
        setSeatsLoadedForShowId(selectedShowId);
        setSeatsError(null);
        setSeatsRefreshError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Unable to load seat availability.';
        if (seatsHasLoaded && seatsLoadedForShowId === selectedShowId) setSeatsRefreshError(message);
        else setSeatsError(message);
      })
      .finally(() => {
        if (!active) return;
        setSeatsLoading(false);
        setSeatsRefreshing(false);
      });
    return () => { active = false; };
  }, [selectedShowId, seatReload]);

  useEffect(() => {
    if (!selectedShowId) { setSeatEventsState('unavailable'); return; }
    setSeatEventsState('connecting');
    const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
    let hasConnected = false;
    const source = new EventSource(`${apiBase}/api/shows/${encodeURIComponent(selectedShowId)}/seat-events`);
    source.onopen = () => {
      hasConnected = true;
      setSeatEventsState('connected');
    };
    source.addEventListener('seat-map-invalidated', () => {
      setSeatReload((value) => value + 1);
    });
    source.onerror = () => {
      setSeatEventsState(source.readyState === EventSource.CLOSED ? 'unavailable' : hasConnected ? 'reconnecting' : 'connecting');
    };
    return () => {
      source.close();
      setSeatEventsState('unavailable');
    };
  }, [selectedShowId]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);
    setIsSubmitting(true);

    try {
      const result = authMode === 'register'
        ? await register({ name: name.trim(), email: email.trim(), password })
        : await login({ email: email.trim(), password });

      sessionStorage.setItem(TOKEN_KEY, result.token);
      setToken(result.token);
      setUser(result.user);
      setAuthMode(null);
      setName('');
      setEmail('');
      setPassword('');
      setNotice(`Welcome${result.user.name ? `, ${result.user.name}` : ''}! You are signed in.`);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function openAuth(mode: AuthMode) {
    setAuthMode(mode);
    setFormError(null);
    setNotice(null);
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    setNotice('You have signed out.');
    setAuthMode(null);
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#movies">Skip to movie catalogue</a>
      <nav className="navbar">
        <a className="brand" href="#top" aria-label="Yozigo home"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a>
        <div className="nav-links"><a className="active" href="#movies">Movies</a><a href="#experiences">Experiences</a><a href="#about">About</a></div>
        <div className="nav-actions">
          {isRestoringSession ? <span className="session-loading" role="status">Checking session…</span> : user ? (
            <>
              <button className="signin booking-history-nav" type="button" onClick={() => setBookingHistoryOpen(true)}>My bookings</button>
              {user.role === 'ADMIN' && <button className="signin admin-nav" type="button" onClick={() => setAdminManagementOpen(true)}>Admin</button>}
              <button className="signin account-settings-nav" type="button" onClick={() => setAccountSettingsOpen(true)}>Account</button>
              <span className="user-greeting">Hi, {user.name}</span>
              <span className="avatar" aria-label={`Signed in as ${user.name}`}>{initials(user.name) || 'Y'}</span>
              <button className="signin signout" type="button" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <>
              <button className="signin" type="button" onClick={() => openAuth('login')}>Sign in</button>
              <button className="signup-nav" type="button" onClick={() => openAuth('register')}>Create account</button>
            </>
          )}
        </div>
      </nav>

      {notice && <p className="app-notice" role="status">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)}>×</button></p>}

      <section className="hero" id="top">
        <img className="hero-image" src="https://images.unsplash.com/photo-1489599849927-2ee91f9c5f8b?auto=format&fit=crop&w=2000&q=85" alt="" />
        <div className="hero-vignette" />
        <div className="hero-content">
          <span className="eyebrow"><span className="live-dot" /> YOUR NEXT GREAT NIGHT OUT</span>
          <h1>Stories are better<br /><em>on the big screen.</em></h1>
          <p>Find your seat. Feel every moment.</p>
          <a className="primary-cta" href="#movies">Explore movies <span>↗</span></a>
        </div>
        <div className="hero-meta"><span>01 / 03</span><span className="meta-line" /><span>THE CINEMA COLLECTION</span></div>
      </section>
      <section className="movies-section" id="movies">
        <div className="section-heading"><div><span className="section-kicker">HANDPICKED FOR YOU</span><h2>Now showing<span>.</span></h2></div><div className="catalogue-heading-actions"><span className="catalogue-count">{catalogueOutcome === 'initial-loading' ? 'Loading films…' : moviesRefreshing ? 'Refreshing films…' : `${visibleMovies.length} of ${movies.length} films`}</span>{moviesHasLoaded && <button className="clear-filters" type="button" onClick={() => { setMoviesRefreshError(null); setMovieReload((value) => value + 1); }} disabled={moviesRefreshing}>{moviesRefreshing ? 'Refreshing…' : 'Refresh films'}</button>}</div></div>
        {catalogueOutcome === 'refresh-error' && <div className="catalogue-state catalogue-error" role="alert"><p>We couldn’t refresh the catalogue. Your previously loaded films are still shown. {moviesRefreshError}</p><button type="button" onClick={() => { setMoviesRefreshError(null); setMovieReload((value) => value + 1); }}>Try again</button></div>}
        {moviesHasLoaded && moviesRefreshing && <p className="catalogue-refresh-status" role="status" aria-live="polite">Refreshing the movie catalogue. Your current results remain available.</p>}
        {catalogueOutcome !== 'initial-loading' && catalogueOutcome !== 'initial-error' && movies.length > 0 && <div className="catalogue-controls" aria-label="Movie catalogue filters">
          <label className="catalogue-search"><span>Search films</span><input type="search" value={movieSearch} onChange={(event) => setMovieSearch(event.target.value)} placeholder="Search by title…" /></label>
          <label><span>Language</span><select value={movieLanguage} onChange={(event) => setMovieLanguage(event.target.value)}><option value="all">All languages</option>{availableLanguages.map((language) => <option key={language} value={language}>{language}</option>)}</select></label>
          <label><span>Sort by</span><select value={movieSort} onChange={(event) => setMovieSort(event.target.value as MovieSort)}><option value="featured">Featured</option><option value="title">Title (A–Z)</option><option value="showtime">Next showtime</option></select></label>
          {(movieSearch || movieLanguage !== 'all' || movieSort !== 'featured') && <button className="clear-filters" type="button" onClick={() => { setMovieSearch(''); setMovieLanguage('all'); setMovieSort('featured'); }}>Clear filters</button>}
        </div>}
        {catalogueOutcome === 'initial-loading' ? (
          <p className="catalogue-state" role="status">Loading movies from the cinema catalogue…</p>
        ) : catalogueOutcome === 'initial-error' ? (
          <div className="catalogue-state catalogue-error" role="alert"><p>{moviesError}</p><button type="button" onClick={() => { setMoviesLoading(true); setMovieReload((value) => value + 1); }}>Try again</button></div>
        ) : catalogueOutcome === 'empty' ? (
          <p className="catalogue-state">No movies are available right now. Please check back soon.</p>
        ) : visibleMovies.length === 0 ? (
          <div className="catalogue-state catalogue-empty"><p>No films match your search.</p><button type="button" onClick={() => { setMovieSearch(''); setMovieLanguage('all'); setMovieSort('featured'); }}>Clear filters</button></div>
        ) : (
          <div className="movie-grid">{visibleMovies.map((movie, index) => <article className="movie-card" key={movie.id}>
            <div className="poster-wrap">{movie.posterUrl ? <img src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy" /> : <div className="poster-placeholder" aria-label="Poster unavailable">Y.</div>}<span className="movie-tag">{movie.nextShow ? 'NOW SHOWING' : 'COMING SOON'}</span><span className="poster-index">{String(index + 1).padStart(2, '0')}</span></div>
            <div className="movie-info"><div className="movie-title-row"><h3>{movie.title}</h3><span className="rating">{movie.rating}</span></div><p className="genre">{movie.description || 'Discover this film at Yozigo.'}</p><div className="movie-details"><span>{movie.language}</span><span className="detail-dot" /><span>{Math.floor(movie.durationMin / 60)}h {String(movie.durationMin % 60).padStart(2, '0')}m</span></div>
              {movie.nextShow && <div className="next-show"><span>Next: {formatShowDate(movie.nextShow.startsAt)}</span><strong>{formatPrice(movie.nextShow.pricePaise)}</strong></div>}
              <button type="button" className="seat-map-button" disabled={!movie.nextShow} onClick={() => { setShowtimeOptions([]); setShowtimesHasLoaded(false); setShowtimesError(null); setShowtimesRefreshError(null); setShowtimesLoading(false); setShowtimesRefreshing(false); setShowtimeMovieId(movie.id); setShowtimesError(null); }}>Choose showtime <span>↗</span></button></div>
          </article>)}</div>
        )}
      </section>
      <section className="experience-strip" id="experiences"><span className="strip-icon">✳</span><div><p className="section-kicker">THE YOZIGO EXPERIENCE</p><h2>Make a night of it.</h2></div><p className="strip-copy">Less scrolling, more story. Your cinema plans, all in one place.</p></section>
      <footer id="about"><a className="brand" href="#top"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a><span>Good stories bring us together.</span><span>© 2026 Yozigo · Internship project</span></footer>

      {bookingHistoryOpen && token && <BookingHistory token={token} onClose={() => setBookingHistoryOpen(false)} />}
      {adminManagementOpen && token && user?.role === 'ADMIN' && <AdminManagement token={token} onClose={() => setAdminManagementOpen(false)} />}
      {accountSettingsOpen && token && user && <AccountSettings token={token} user={user} onClose={() => setAccountSettingsOpen(false)} onUserUpdated={(updatedUser) => setUser(updatedUser)} />}

      {showtimeMovieId && (
        <div className="auth-backdrop showtime-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowtimeMovieId(null); }}>
          <section className="showtime-dialog" role="dialog" aria-modal="true" aria-labelledby="showtime-dialog-title">
            <button className="auth-close" type="button" aria-label="Close showtime picker" onClick={() => setShowtimeMovieId(null)}>×</button>
            <span className="section-kicker">PICK YOUR SCREENING</span>
            <h2 id="showtime-dialog-title">Choose a showtime<span>.</span></h2>
            <p className="auth-intro">Select a date and time to open the seat map. Prices are shown per ticket.</p>
            {showtimesOutcome === 'initial-loading' ? (
              <p className="catalogue-state" role="status">Loading upcoming showtimes…</p>
            ) : showtimesOutcome === 'initial-error' ? (
              <div className="catalogue-state catalogue-error" role="alert">
                <p>{showtimesError}</p>
                <button type="button" onClick={() => setShowtimesReload((value) => value + 1)}>Try again</button>
              </div>
            ) : (
              <>
                <div className="showtime-refresh-toolbar">
                  <p className="auth-intro">Choose a screening. Your current options stay visible during refresh.</p>
                  <button type="button" className="showtime-refresh-button" onClick={() => setShowtimesReload((value) => value + 1)} disabled={showtimesRefreshing}>
                    {showtimesRefreshing ? 'Refreshing…' : 'Refresh showtimes'}
                  </button>
                </div>
                {showtimesOutcome === 'refreshing' && <p className="booking-refresh-status" role="status">Refreshing upcoming showtimes. Your current options remain available.</p>}
                {showtimesOutcome === 'refresh-error' && (
                  <div className="catalogue-state catalogue-error" role="alert">
                    <p>We couldn’t refresh showtimes. Your previous options are still shown. {showtimesRefreshError}</p>
                    <button type="button" onClick={() => setShowtimesReload((value) => value + 1)}>Try again</button>
                  </div>
                )}
                {showtimesOutcome === 'empty' ? <p className="catalogue-state">There are no upcoming showtimes for this movie.</p> : (
                  <div className="showtime-options">{showtimeOptions.map((show) => <button key={show.id} type="button" className="showtime-option" onClick={() => { setShowtimeMovieId(null); setActiveHolds([]); setSelectedShowPricePaise(show.pricePaise); setBookingConfirmation(null); setSelectedShowId(show.id); }}><span>{formatShowDate(show.startsAt)}</span><strong>{formatPrice(show.pricePaise)}</strong><span className="showtime-cta">Choose seats ↗</span></button>)}</div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {selectedShowId && (
        <div className="auth-backdrop seat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedShowId(null); }}>
          <section className="seat-dialog" role="dialog" aria-modal="true" aria-labelledby="seat-dialog-title">
            <button className="auth-close" type="button" aria-label="Close seat map" onClick={() => setSelectedShowId(null)}>×</button>
            <span className="section-kicker">CHOOSE YOUR VIEW</span><h2 id="seat-dialog-title">Seat availability.</h2>
            <p className="auth-intro">Select up to six available seats. Each seat is held for five minutes; you must be signed in.</p>
            <div className="seat-live-status">
              <span role="status" aria-live="polite">{seatEventConnectionLabel(seatEventsState)}</span>
              <button type="button" className="seat-refresh-button" onClick={() => setSeatReload((value) => value + 1)} disabled={seatsLoading || seatsRefreshing}>
                {seatsRefreshing ? 'Refreshing seats…' : 'Refresh seats'}
              </button>
            </div>
            {seatsOutcome === 'refreshing' && <p className="catalogue-refresh-status" role="status" aria-live="polite">Refreshing availability. Your current seat map remains visible.</p>}
            {seatsOutcome === 'refresh-error' && <div className="catalogue-state catalogue-error" role="alert"><p>We couldn’t refresh seat availability. The map below is from the last successful response; seat status may have changed. {seatsRefreshError}</p><button type="button" onClick={() => { setSeatsRefreshError(null); setSeatReload((value) => value + 1); }}>Try again</button></div>}
            <div className="seat-screen">SCREEN</div>
            <div className="seat-legend"><span><i className="seat-key available" /> Available</span><span><i className="seat-key unavailable" /> Unavailable</span></div>
            {seatsOutcome === 'initial-loading' ? <p className="catalogue-state" role="status">Loading seat availability…</p> : seatsOutcome === 'initial-error' ? <div className="form-error" role="alert"><p>{seatsError}</p><button type="button" className="seat-refresh-button" onClick={() => { setSeatsError(null); setSeatReload((value) => value + 1); }}>Try again</button></div> : seatsOutcome === 'empty' ? <p className="catalogue-state">No seat availability was returned for this show. Please refresh to try again.</p> : <div className="seat-grid" aria-label="Cinema seats" onKeyDown={(event) => {
                const key = event.key;
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
                const currentButton = event.target as HTMLButtonElement;
                const currentSeatId = currentButton.dataset.seatId;
                if (!currentSeatId) return;
                const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-seat-id]'));
                const focusableIds = buttons.filter((button) => !button.disabled).map((button) => button.dataset.seatId).filter((id): id is string => Boolean(id));
                const targetId = getSeatGridNavigationTarget(showSeats, currentSeatId, key, focusableIds);
                if (!targetId) return;
                event.preventDefault();
                buttons.find((button) => button.dataset.seatId === targetId)?.focus();
              }}>{showSeats.map((seat) => { const mine = activeHolds.some((hold) => hold.seatId === seat.id); const unavailable = seat.status !== "AVAILABLE" && !mine; return <button key={seat.id} data-seat-id={seat.id} type="button" disabled={unavailable || holdBusy || seatsRefreshing || (activeHolds.length >= 6 && !mine)} className={"seat-tile " + (mine ? "held" : unavailable ? "unavailable" : "available")} aria-label={"Row " + seat.row + ", seat " + seat.number + (mine ? ", selected by you" : unavailable ? ", unavailable" : ", available")} onClick={async () => { setHoldError(null); if (!token || !user) { setHoldError("Please sign in before selecting seats."); openAuth("login"); return; } setHoldBusy(true); try { if (mine) { const existing = activeHolds.find((hold) => hold.seatId === seat.id); if (existing) { await releaseSeatHold(selectedShowId, existing.id, token); setActiveHolds((current) => current.filter((hold) => hold.id !== existing.id)); } } else { const result = await createSeatHold(selectedShowId, seat.id, token); setActiveHolds((current) => current.length < 6 ? [...current, result.hold] : current); } setSeatReload((value) => value + 1); } catch (error) { setHoldError(error instanceof Error ? error.message : "Unable to update this seat selection."); setSeatReload((value) => value + 1); } finally { setHoldBusy(false); } }}>{seat.row}{seat.number}</button>; })}</div>}
            <p className="seat-footnote">A seat hold lasts five minutes and expires automatically.</p>{activeHolds.length > 0 && <><div className={`selected-seat-summary hold-countdown-${holdCountdownUrgency}`}><span>{activeHolds.length} seat{activeHolds.length === 1 ? '' : 's'} selected: {activeHolds.map((hold) => { const seat = showSeats.find((item) => item.id === hold.seatId); return seat ? seat.row + seat.number : hold.seatId; }).join(', ')}</span><strong>{formatPrice(selectedShowPricePaise * activeHolds.length)}</strong><small>Hold expires in {formatHoldCountdown(holdSeconds)}. Maximum 6 seats per booking.</small></div><p className={`hold-countdown-announcement hold-countdown-${holdCountdownUrgency}`} role="status" aria-live="polite">{holdCountdownMessage}</p><div className="hold-status"><span>{activeHolds.length} seat{activeHolds.length === 1 ? '' : 's'} held</span><button type="button" disabled={holdBusy || checkoutBusy} onClick={async () => { if (!token) return; setHoldBusy(true); setHoldError(null); try { await Promise.all(activeHolds.map((hold) => releaseSeatHold(selectedShowId, hold.id, token))); setActiveHolds([]); setSeatReload((value) => value + 1); } catch (error) { setHoldError(error instanceof Error ? error.message : "Unable to release selected seats."); setSeatReload((value) => value + 1); } finally { setHoldBusy(false); } }}>Release selected seats</button></div><button className="mock-checkout" type="button" disabled={checkoutBusy || holdSeconds === 0 || !token} onClick={async () => { if (!token) return; setCheckoutBusy(true); setHoldError(null); setCheckoutRecoveryMessage(null); setBookingConfirmation(null); try { const result = await confirmBooking(selectedShowId, activeHolds.map((hold) => hold.id), token); setBookingConfirmation(result); setActiveHolds([]); setSeatReload((value) => value + 1); } catch (error) { const recoveryMessage = getCheckoutRecoveryMessage(error); if (recoveryMessage) { setCheckoutRecoveryMessage(recoveryMessage); } else { setHoldError(error instanceof Error ? error.message : "Unable to confirm this booking."); } setSeatReload((value) => value + 1); } finally { setCheckoutBusy(false); } }}>{checkoutBusy ? "Confirming demo booking…" : `Confirm ${activeHolds.length} seat${activeHolds.length === 1 ? '' : 's'} with demo payment`}</button><p className="field-hint">Demo only. No card details or real payment are collected.</p></>}{bookingConfirmation && (() => {
              const confirmationView = getBookingConfirmationView(bookingConfirmation);
              return (
                <section className="booking-confirmation" role="status" aria-labelledby="booking-confirmation-title">
                  <span className="booking-confirmation-kicker"><span aria-hidden="true">✓</span> BOOKING CONFIRMED</span>
                  <h3 id="booking-confirmation-title">You're all set.</h3>
                  <p className="booking-confirmation-reference">Booking reference <strong>{confirmationView.reference}</strong></p>
                  <dl className="booking-confirmation-details">
                    <div><dt>Movie</dt><dd>{confirmationView.movieTitle}</dd></div>
                    <div><dt>Showtime</dt><dd>{confirmationView.showtime}</dd></div>
                    <div><dt>Seats</dt><dd>{confirmationView.seats}</dd></div>
                    <div><dt>Total</dt><dd>{confirmationView.total}</dd></div>
                  </dl>
                  <p className="booking-confirmation-payment">{confirmationView.paymentMessage}</p>
                  {bookingConfirmation.alreadyConfirmed && <p className="booking-confirmation-note">This is your existing confirmed booking.</p>}
                  <div className="booking-confirmation-actions">
                    <button type="button" className="auth-submit" onClick={() => { setBookingHistoryOpen(true); setSelectedShowId(null); setBookingConfirmation(null); }}>View my bookings</button>
                    <button type="button" className="booking-confirmation-secondary" onClick={() => { setSelectedShowId(null); setBookingConfirmation(null); }}>Continue browsing</button>
                  </div>
                </section>
              );
            })()}{checkoutRecoveryMessage && <div className="checkout-recovery" role="alert"><p>{checkoutRecoveryMessage}</p><button type="button" onClick={() => { setSelectedShowId(null); setBookingConfirmation(null); setBookingHistoryOpen(true); }}>Open My bookings</button></div>}{holdError && <p className="hold-error" role="alert">{holdError}</p>}
          </section>
        </div>
      )}

      {authMode && (
        <div className="auth-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !isSubmitting) setAuthMode(null);
        }}>
          <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="auth-close" type="button" aria-label="Close authentication dialog" disabled={isSubmitting} onClick={() => setAuthMode(null)}>×</button>
            <span className="section-kicker">WELCOME TO YOZIGO</span>
            <h2 id="auth-title">{authMode === 'register' ? 'Create your account.' : 'Welcome back.'}</h2>
            <p className="auth-intro">{authMode === 'register' ? 'Create an account to get your cinema plans started.' : 'Sign in to continue your cinema plans.'}</p>
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {authMode === 'register' && (
                <label>
                  Full name
                  <input autoComplete="name" name="name" value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={80} required />
                </label>
              )}
              <label>
                Email address
                <input autoComplete="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
              </label>
              <label>
                Password
                <input autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={authMode === 'register' ? 8 : 1} maxLength={72} required />
                {authMode === 'register' && <span className="field-hint">Use at least 8 characters.</span>}
              </label>
              {formError && <p className="form-error" role="alert">{formError}</p>}
              <button className="auth-submit" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Please wait…' : authMode === 'register' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            <p className="auth-switch">
              {authMode === 'register' ? 'Already have an account?' : 'New to Yozigo?'}
              {' '}
              <button type="button" disabled={isSubmitting} onClick={() => openAuth(authMode === 'register' ? 'login' : 'register')}>
                {authMode === 'register' ? 'Sign in' : 'Create an account'}
              </button>
            </p>
            {token && <span className="visually-hidden">Signed in session available</span>}
          </section>
        </div>
      )}
    </main>
  );
}
