import type { Movie } from './movie-client';

export type MovieSort = 'featured' | 'title' | 'showtime';

export interface MovieFilters {
  query: string;
  language: string;
  sort: MovieSort;
}

/** Filters the loaded catalogue and returns a new array without mutating the API result. */
export function filterMovies(movies: Movie[], filters: MovieFilters): Movie[] {
  const query = filters.query.trim().toLocaleLowerCase();
  const filtered = movies.filter((movie) => {
    const matchesTitle = !query || movie.title.toLocaleLowerCase().includes(query);
    const matchesLanguage = filters.language === 'all' || movie.language === filters.language;
    return matchesTitle && matchesLanguage;
  });

  if (filters.sort === 'title') {
    return filtered.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  }
  if (filters.sort === 'showtime') {
    return filtered.sort((a, b) => {
      if (!a.nextShow && !b.nextShow) return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
      if (!a.nextShow) return 1;
      if (!b.nextShow) return -1;
      return new Date(a.nextShow.startsAt).getTime() - new Date(b.nextShow.startsAt).getTime();
    });
  }
  return filtered;
}
