import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const moviesRouter = Router();

const movieIdSchema = z.string().trim().min(1).max(64);

moviesRouter.get('/', async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const movies = await prisma.movie.findMany({
      orderBy: [{ title: 'asc' }, { createdAt: 'asc' }],
      include: {
        shows: {
          where: { startsAt: { gte: new Date() } },
          orderBy: { startsAt: 'asc' },
          take: 1,
          select: { id: true, startsAt: true, pricePaise: true },
        },
      },
    });

    response.status(200).json({
      movies: movies.map((movie) => ({
        id: movie.id,
        title: movie.title,
        posterUrl: movie.posterUrl,
        language: movie.language,
        durationMin: movie.durationMin,
        rating: movie.rating,
        description: movie.description,
        nextShow: movie.shows[0] ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

moviesRouter.get('/:movieId/shows', async (request: Request, response: Response, next: NextFunction) => {
  const parsedId = movieIdSchema.safeParse(request.params.movieId);
  if (!parsedId.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid movie ID is required.' } });
    return;
  }

  try {
    const movie = await prisma.movie.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });

    if (!movie) {
      response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'This movie could not be found.' } });
      return;
    }

    const shows = await prisma.show.findMany({
      where: { movieId: movie.id, startsAt: { gte: new Date() } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, pricePaise: true },
    });

    response.status(200).json({
      shows: shows.map((show) => ({
        id: show.id,
        startsAt: show.startsAt,
        pricePaise: show.pricePaise,
      })),
    });
  } catch (error) {
    next(error);
  }
});
