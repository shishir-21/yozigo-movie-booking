import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, getCurrentUser, login, register, type AuthUser } from './auth-client';

const TOKEN_KEY = 'yozigo_access_token';

const movies = [
  { title: 'The Last Horizon', genre: 'Sci-Fi · Adventure', language: 'English', duration: '2h 08m', rating: 'UA', image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=85', tag: 'NOW SHOWING' },
  { title: 'Midnight in Kyoto', genre: 'Drama · Romance', language: 'Japanese', duration: '1h 54m', rating: 'U/A', image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=85', tag: 'CRITICS’ PICK' },
  { title: 'The Deep Signal', genre: 'Mystery · Thriller', language: 'English', duration: '2h 01m', rating: 'A', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85', tag: 'NEW RELEASE' },
];

type AuthMode = 'login' | 'register';

function initials(name: string): string {
  return name.trim().split(/\\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
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
        <div className="section-heading"><div><span className="section-kicker">HANDPICKED FOR YOU</span><h2>Now showing<span>.</span></h2></div><button className="view-all" type="button" disabled>View all films <span>→</span></button></div>
        <div className="movie-grid">{movies.map((movie, index) => <article className="movie-card" key={movie.title}>
          <div className="poster-wrap"><img src={movie.image} alt={`${movie.title} poster`} /><span className="movie-tag">{movie.tag}</span><span className="poster-index">0{index + 1}</span></div>
          <div className="movie-info"><div className="movie-title-row"><h3>{movie.title}</h3><span className="rating">{movie.rating}</span></div><p className="genre">{movie.genre}</p><div className="movie-details"><span>{movie.language}</span><span className="detail-dot" /><span>{movie.duration}</span></div><button type="button" className="book-button" disabled>Choose a show <span>↗</span></button></div>
        </article>)}</div>
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
