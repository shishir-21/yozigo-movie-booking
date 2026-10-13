import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, getCurrentUser, login, register, type AuthUser } from './auth-client';
import { formatPrice, formatShowDate, getMovies, type Movie } from './movie-client';

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
              {movie.nextShow && <div className="next-show"><span>{formatShowDate(movie.nextShow.startsAt)}</span><strong>{formatPrice(movie.nextShow.pricePaise)}</strong></div>}
              <button type="button" className="book-button" disabled aria-label={movie.nextShow ? `Booking for ${movie.title} will be available soon` : `${movie.title} has no upcoming shows`}>{movie.nextShow ? 'Booking opens soon' : 'No upcoming shows'} <span>↗</span></button></div>
          </article>)}</div>
        )}
      </section>
      <section className="experience-strip" id="experiences"><span className="strip-icon">✳</span><div><p className="section-kicker">THE YOZIGO EXPERIENCE</p><h2>Make a night of it.</h2></div><p className="strip-copy">Less scrolling, more story. Your cinema plans, all in one place.</p></section>
      <footer id="about"><a className="brand" href="#top"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a><span>Good stories bring us together.</span><span>© 2026 Yozigo · Internship project</span></footer>

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
