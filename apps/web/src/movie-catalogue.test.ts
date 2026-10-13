import { describe, expect, it } from 'vitest';
import { filterMovies } from './movie-catalogue';
import type { Movie } from './movie-client';

const movies: Movie[] = [
  { id: 'b', title: 'Zebra Nights', posterUrl: null, language: 'Hindi', durationMin: 120, rating: 'UA', description: '', nextShow: { id: 's2', startsAt: '2026-11-02T18:00:00.000Z', pricePaise: 20000 } },
  { id: 'a', title: 'Aurora', posterUrl: null, language: 'English', durationMin: 110, rating: 'U', description: '', nextShow: { id: 's1', startsAt: '2026-11-01T18:00:00.000Z', pricePaise: 25000 } },
  { id: 'c', title: 'Quiet River', posterUrl: null, language: 'English', durationMin: 95, rating: 'A', description: '', nextShow: null },
];

const defaults = { query: '', language: 'all', sort: 'featured' as const };

describe('movie catalogue filters', () => {
  it('searches titles without case sensitivity and ignores surrounding whitespace', () => {
    expect(filterMovies(movies, { ...defaults, query: '  aUrOrA  ' }).map((movie) => movie.id)).toEqual(['a']);
  });

  it('combines title search and language filters', () => {
    expect(filterMovies(movies, { ...defaults, query: 'r', language: 'English' }).map((movie) => movie.id)).toEqual(['a', 'c']);
    expect(filterMovies(movies, { ...defaults, query: 'zebra', language: 'English' })).toEqual([]);
  });

  it('sorts titles alphabetically without mutating the source array', () => {
    expect(filterMovies(movies, { ...defaults, sort: 'title' }).map((movie) => movie.title)).toEqual(['Aurora', 'Quiet River', 'Zebra Nights']);
    expect(movies.map((movie) => movie.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by next showtime and places movies without shows last', () => {
    expect(filterMovies(movies, { ...defaults, sort: 'showtime' }).map((movie) => movie.id)).toEqual(['a', 'b', 'c']);
  });

  it('preserves featured order by default', () => {
    expect(filterMovies(movies, defaults).map((movie) => movie.id)).toEqual(['b', 'a', 'c']);
  });
});
