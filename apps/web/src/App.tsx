const movies = [
  { title: 'The Last Horizon', genre: 'Sci-Fi · Adventure', language: 'English', duration: '2h 08m', rating: 'UA', image: 'https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=900&q=85', tag: 'NOW SHOWING' },
  { title: 'Midnight in Kyoto', genre: 'Drama · Romance', language: 'Japanese', duration: '1h 54m', rating: 'U/A', image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=900&q=85', tag: 'CRITICS’ PICK' },
  { title: 'The Deep Signal', genre: 'Mystery · Thriller', language: 'English', duration: '2h 01m', rating: 'A', image: 'https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=85', tag: 'NEW RELEASE' },
];

export default function App() {
  return (
    <main className="app-shell">
      <nav className="navbar">
        <a className="brand" href="#top" aria-label="Yozigo home"><span className="brand-mark">y</span> yozigo<span className="brand-dot">.</span></a>
        <div className="nav-links"><a className="active" href="#movies">Movies</a><a href="#experiences">Experiences</a><a href="#about">About</a></div>
        <div className="nav-actions"><button className="signin" type="button" disabled>Sign in · Coming soon</button><button className="avatar" aria-label="Profile" type="button" disabled>SM</button></div>
      </nav>
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
    </main>
  );
}
