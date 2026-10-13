import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, getCurrentUser, login, register, type AuthUser } from './auth-client';
import { formatPrice, formatShowDate, getMovies, type Movie } from './movie-client';
import { getShowSeats, type ShowSeat } from './seat-client';
import { createSeatHold, releaseSeatHold, type SeatHold } from './hold-client';
import { confirmBooking } from './booking-client';
import BookingHistory from './BookingHistory';

const TOKEN_KEY = 'yozigo_access_token';

type AuthMode = 'login' | 'register';

function initials(name: string): string {
  return name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [moviesError, setMoviesError] = useState<string | null>(null);
  const [movieReload, setMovieReload] = useState(0);
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
  const [seatsError, setSeatsError] = useState<string | null>(null);
  const [activeHold, setActiveHold] = useState<SeatHold | null>(null);
  const [holdSeconds, setHoldSeconds] = useState(0);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [seatReload, setSeatReload] = useState(0);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<string | null>(null);
  const [bookingHistoryOpen, setBookingHistoryOpen] = useState(false);

  useEffect(() => {
    if (!activeHold) { setHoldSeconds(0); return; }
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((new Date(activeHold.expiresAt).getTime() - Date.now()) / 1000));
      setHoldSeconds(remaining);
      if (remaining === 0) { setActiveHold(null); setSeatReload((value) => value + 1); }
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [activeHold]);

  useEffect(() => {
    let active = true;
    getMovies()
      .then(({ movies: results }) => {
        if (!active) return;
        setMovies(results);
        setMoviesError(null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setMoviesError(error instanceof Error ? error.message : 'Unable to load movies. Please try again.');
      })
      .finally(() => {
        if (active) setMoviesLoading(false);
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
    if (!selectedShowId) return;
    let active = true;
    setSeatsLoading(true);
    setSeatsError(null);
    getShowSeats(selectedShowId)
      .then(({ seats }) => { if (active) setShowSeats(seats); })
      .catch((error: unknown) => { if (active) setSeatsError(error instanceof Error ? error.message : 'Unable to load seat availability.'); })
      .finally(() => { if (active) setSeatsLoading(false); });
    return () => { active = false; };
  }, [selectedShowId, seatReload]);

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
      <nav className="navbar">
        <a className="brand" href="#top" aria-label="Yozigo home"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a>
        <div className="nav-links"><a className="active" href="#movies">Movies</a><a href="#experiences">Experiences</a><a href="#about">About</a></div>
        <div className="nav-actions">
          {isRestoringSession ? <span className="session-loading" role="status">Checking session…</span> : user ? (
            <>
              <button className="signin booking-history-nav" type="button" onClick={() => setBookingHistoryOpen(true)}>My bookings</button>
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
        <div className="section-heading"><div><span className="section-kicker">HANDPICKED FOR YOU</span><h2>Now showing<span>.</span></h2></div><span className="catalogue-count">{moviesLoading ? 'Loading films…' : `${movies.length} films`}</span></div>
        {moviesLoading ? (
          <p className="catalogue-state" role="status">Loading movies from the cinema catalogue…</p>
        ) : moviesError ? (
          <div className="catalogue-state catalogue-error" role="alert"><p>{moviesError}</p><button type="button" onClick={() => { setMoviesLoading(true); setMovieReload((value) => value + 1); }}>Try again</button></div>
        ) : movies.length === 0 ? (
          <p className="catalogue-state">No movies are available right now. Please check back soon.</p>
        ) : (
          <div className="movie-grid">{movies.map((movie, index) => <article className="movie-card" key={movie.id}>
            <div className="poster-wrap">{movie.posterUrl ? <img src={movie.posterUrl} alt={`${movie.title} poster`} loading="lazy" /> : <div className="poster-placeholder" aria-label="Poster unavailable">Y.</div>}<span className="movie-tag">{movie.nextShow ? 'NOW SHOWING' : 'COMING SOON'}</span><span className="poster-index">{String(index + 1).padStart(2, '0')}</span></div>
            <div className="movie-info"><div className="movie-title-row"><h3>{movie.title}</h3><span className="rating">{movie.rating}</span></div><p className="genre">{movie.description || 'Discover this film at Yozigo.'}</p><div className="movie-details"><span>{movie.language}</span><span className="detail-dot" /><span>{Math.floor(movie.durationMin / 60)}h {String(movie.durationMin % 60).padStart(2, '0')}m</span></div>
              {movie.nextShow && <><div className="next-show"><span>{formatShowDate(movie.nextShow.startsAt)}</span><strong>{formatPrice(movie.nextShow.pricePaise)}</strong></div><button type="button" className="seat-map-button" onClick={() => setSelectedShowId(movie.nextShow!.id)}>View seats <span>↗</span></button></>}
              <button type="button" className="book-button" disabled aria-label={movie.nextShow ? `Booking for ${movie.title} will be available soon` : `${movie.title} has no upcoming shows`}>{movie.nextShow ? 'Booking opens soon' : 'No upcoming shows'} <span>↗</span></button></div>
          </article>)}</div>
        )}
      </section>
      <section className="experience-strip" id="experiences"><span className="strip-icon">✳</span><div><p className="section-kicker">THE YOZIGO EXPERIENCE</p><h2>Make a night of it.</h2></div><p className="strip-copy">Less scrolling, more story. Your cinema plans, all in one place.</p></section>
      <footer id="about"><a className="brand" href="#top"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a><span>Good stories bring us together.</span><span>© 2026 Yozigo · Internship project</span></footer>

      {bookingHistoryOpen && token && <BookingHistory token={token} onClose={() => setBookingHistoryOpen(false)} />}

      {selectedShowId && (
        <div className="auth-backdrop seat-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedShowId(null); }}>
          <section className="seat-dialog" role="dialog" aria-modal="true" aria-labelledby="seat-dialog-title">
            <button className="auth-close" type="button" aria-label="Close seat map" onClick={() => setSelectedShowId(null)}>×</button>
            <span className="section-kicker">CHOOSE YOUR VIEW</span><h2 id="seat-dialog-title">Seat availability.</h2>
            <p className="auth-intro">Choose an available seat to hold it for five minutes. You must be signed in.</p><div className="seat-screen">SCREEN</div>
            <div className="seat-legend"><span><i className="seat-key available" /> Available</span><span><i className="seat-key unavailable" /> Unavailable</span></div>
            {seatsLoading ? <p className="catalogue-state" role="status">Loading seat availability…</p> : seatsError ? <p className="form-error" role="alert">{seatsError}</p> : <div className="seat-grid" aria-label="Cinema seats">{showSeats.map((seat) => { const mine = activeHold?.seatId === seat.id; const unavailable = seat.status !== "AVAILABLE" && !mine; return <button key={seat.id} type="button" disabled={unavailable || holdBusy || (Boolean(activeHold) && !mine)} className={"seat-tile " + (mine ? "held" : unavailable ? "unavailable" : "available")} aria-label={"Row " + seat.row + ", seat " + seat.number + (mine ? ", held by you" : unavailable ? ", unavailable" : ", available")} onClick={async () => { setHoldError(null); if (!token || !user) { setHoldError("Please sign in before holding a seat."); openAuth("login"); return; } setHoldBusy(true); try { const result = await createSeatHold(selectedShowId, seat.id, token); setActiveHold(result.hold); setSeatReload((value) => value + 1); } catch (error) { setHoldError(error instanceof Error ? error.message : "Unable to hold this seat."); setSeatReload((value) => value + 1); } finally { setHoldBusy(false); } }}>{seat.row}{seat.number}</button>; })}</div>}
            <p className="seat-footnote">A seat hold lasts five minutes and expires automatically.</p>{activeHold && <><div className="hold-status" role="status"><span>Seat held · {Math.floor(holdSeconds / 60)}:{String(holdSeconds % 60).padStart(2, "0")} remaining</span><button type="button" disabled={holdBusy || checkoutBusy} onClick={async () => { if (!token) return; setHoldBusy(true); setHoldError(null); try { await releaseSeatHold(selectedShowId, activeHold.id, token); setActiveHold(null); setSeatReload((value) => value + 1); } catch (error) { setHoldError(error instanceof Error ? error.message : "Unable to release this hold."); } finally { setHoldBusy(false); } }}>Release seat</button></div><button className="mock-checkout" type="button" disabled={checkoutBusy || holdSeconds === 0 || !token} onClick={async () => { if (!token) return; setCheckoutBusy(true); setHoldError(null); setBookingMessage(null); try { const result = await confirmBooking(selectedShowId, activeHold.id, token); setBookingMessage(`Booking confirmed: ${result.booking.movieTitle}, seat ${result.booking.seats.map((seat) => `${seat.row}${seat.number}`).join(", ")}. Demo payment only — no real money was charged.`); setActiveHold(null); setSeatReload((value) => value + 1); } catch (error) { setHoldError(error instanceof Error ? error.message : "Unable to confirm this booking."); setSeatReload((value) => value + 1); } finally { setCheckoutBusy(false); } }}>{checkoutBusy ? "Confirming demo booking…" : "Pay with demo payment"}</button><p className="field-hint">Demo only. No card details or real payment are collected.</p></>}{bookingMessage && <p className="booking-success" role="status">{bookingMessage}</p>}{holdError && <p className="hold-error" role="alert">{holdError}</p>}
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
