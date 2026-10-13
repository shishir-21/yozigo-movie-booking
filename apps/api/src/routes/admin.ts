import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const adminRouter = Router();

const idSchema = z.string().trim().min(1).max(64);
const movieSchema = z.object({
  title: z.string().trim().min(1).max(160),
  posterUrl: z.union([z.string().url().max(2048), z.literal(''), z.null()]).optional(),
  language: z.string().trim().min(1).max(60),
  durationMin: z.number().int().min(1).max(600),
  rating: z.enum(['U', 'UA', 'A']),
  description: z.string().trim().max(2000).default(''),
});
const showSchema = z.object({
  movieId: idSchema,
  startsAt: z.string().datetime({ offset: true }),
  pricePaise: z.number().int().min(1).max(100_000_000),
});
const updateMovieSchema = movieSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');
const updateShowSchema = showSchema.partial().refine((value) => Object.keys(value).length > 0, 'At least one field is required.');

async function requireAdmin(request: Request, response: Response): Promise<string | null> {
  const authorization = request.get('authorization');
  const secret = process.env.JWT_SECRET;
  if (!authorization?.startsWith('Bearer ') || !secret || secret.length < 32) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in with an administrator account.' } });
    return null;
  }
  let userId: string;
  try {
    const payload = jwt.verify(authorization.slice(7), secret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string') throw new Error('Invalid token subject');
    userId = payload.sub;
  } catch {
    response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) {
    response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
    return null;
  }
  if (user.role !== 'ADMIN') {
    response.status(403).json({ error: { code: 'FORBIDDEN', message: 'Administrator access is required.' } });
    return null;
  }
  return user.id;
}

function sendValidationError(response: Response, message: string) {
  response.status(400).json({ error: { code: 'VALIDATION_ERROR', message } });
}

function prismaCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

function conflict(response: Response, message: string) {
  response.status(409).json({ error: { code: 'RESOURCE_CONFLICT', message } });
}

async function hasScheduleOverlap(startsAt: Date, durationMin: number, excludeShowId?: string): Promise<boolean> {
  const candidateEnd = new Date(startsAt.getTime() + (durationMin + 15) * 60_000);
  // All screenings share one screen. Include nearby shows and apply a 15-minute turnaround buffer.
  const nearby = await prisma.show.findMany({
    where: {
      startsAt: {
        gte: new Date(startsAt.getTime() - 12 * 60 * 60_000),
        lte: new Date(candidateEnd.getTime() + 12 * 60 * 60_000),
      },
      ...(excludeShowId ? { id: { not: excludeShowId } } : {}),
    },
    include: { movie: { select: { durationMin: true } } },
  });
  return nearby.some((show) => {
    const existingStart = show.startsAt.getTime();
    const existingEnd = existingStart + (show.movie.durationMin + 15) * 60_000;
    return startsAt.getTime() < existingEnd && candidateEnd.getTime() > existingStart;
  });
}

adminRouter.get('/movies', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const movies = await prisma.movie.findMany({ orderBy: { title: 'asc' }, include: { _count: { select: { shows: true } } } });
    response.status(200).json({ movies });
  } catch (error) { next(error); }
});

adminRouter.post('/movies', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsed = movieSchema.safeParse(request.body);
    if (!parsed.success) { sendValidationError(response, 'Provide a valid title, language, duration, rating, poster URL, and description.'); return; }
    const movie = await prisma.movie.create({ data: { ...parsed.data, posterUrl: parsed.data.posterUrl || null } });
    response.status(201).json({ movie });
  } catch (error) { next(error); }
});

adminRouter.patch('/movies/:movieId', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsedId = idSchema.safeParse(request.params.movieId);
    const parsed = updateMovieSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) { sendValidationError(response, 'Provide a valid movie ID and at least one valid movie field.'); return; }
    const existing = await prisma.movie.findUnique({ where: { id: parsedId.data }, select: { id: true } });
    if (!existing) { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; }
    if (parsed.data.durationMin !== undefined) {
      const shows = await prisma.show.findMany({ where: { movieId: existing.id }, select: { id: true, startsAt: true } });
      for (const show of shows) {
        if (await hasScheduleOverlap(show.startsAt, parsed.data.durationMin, show.id)) {
          conflict(response, 'Changing this movie duration would cause overlapping screenings. Adjust the affected show schedule first.');
          return;
        }
      }
    }
    const movie = await prisma.movie.update({ where: { id: existing.id }, data: { ...parsed.data, ...(parsed.data.posterUrl !== undefined ? { posterUrl: parsed.data.posterUrl || null } : {}) } });
    response.status(200).json({ movie });
  } catch (error) { if (prismaCode(error) === 'P2025') { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; } next(error); }
});

adminRouter.delete('/movies/:movieId', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsedId = idSchema.safeParse(request.params.movieId);
    if (!parsedId.success) { sendValidationError(response, 'Provide a valid movie ID.'); return; }
    const existing = await prisma.movie.findUnique({ where: { id: parsedId.data }, include: { _count: { select: { shows: true } } } });
    if (!existing) { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; }
    if (existing._count.shows > 0) { conflict(response, 'A movie with scheduled shows cannot be deleted. Remove its shows first.'); return; }
    await prisma.movie.delete({ where: { id: existing.id } });
    response.status(204).end();
  } catch (error) { if (prismaCode(error) === 'P2025') { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; } next(error); }
});

adminRouter.get('/shows', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const shows = await prisma.show.findMany({ orderBy: { startsAt: 'asc' }, include: { movie: { select: { title: true, durationMin: true } } } });
    response.status(200).json({ shows });
  } catch (error) { next(error); }
});

adminRouter.post('/shows', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsed = showSchema.safeParse(request.body);
    if (!parsed.success) { sendValidationError(response, 'Provide a valid movie, future showtime, and positive ticket price.'); return; }
    const startsAt = new Date(parsed.data.startsAt);
    if (startsAt <= new Date()) { sendValidationError(response, 'Showtime must be in the future.'); return; }
    const movie = await prisma.movie.findUnique({ where: { id: parsed.data.movieId }, select: { id: true, durationMin: true } });
    if (!movie) { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; }
    if (await hasScheduleOverlap(startsAt, movie.durationMin)) { conflict(response, 'This show overlaps another screening or its 15-minute turnaround buffer.'); return; }
    const show = await prisma.show.create({ data: { ...parsed.data, startsAt } });
    response.status(201).json({ show });
  } catch (error) { next(error); }
});

adminRouter.patch('/shows/:showId', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsedId = idSchema.safeParse(request.params.showId);
    const parsed = updateShowSchema.safeParse(request.body);
    if (!parsedId.success || !parsed.success) { sendValidationError(response, 'Provide a valid show ID and at least one valid show field.'); return; }
    const existing = await prisma.show.findUnique({ where: { id: parsedId.data }, include: { movie: { select: { durationMin: true } } } });
    if (!existing) { response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'Show not found.' } }); return; }
    const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : existing.startsAt;
    const movieId = parsed.data.movieId ?? existing.movieId;
    if (startsAt <= new Date()) { sendValidationError(response, 'Showtime must be in the future.'); return; }
    const movie = movieId === existing.movieId ? existing.movie : await prisma.movie.findUnique({ where: { id: movieId }, select: { durationMin: true } });
    if (!movie) { response.status(404).json({ error: { code: 'MOVIE_NOT_FOUND', message: 'Movie not found.' } }); return; }
    if (await hasScheduleOverlap(startsAt, movie.durationMin, existing.id)) { conflict(response, 'This change overlaps another screening or its 15-minute turnaround buffer.'); return; }
    const related = await prisma.booking.findFirst({ where: { showId: existing.id, status: 'CONFIRMED' }, select: { id: true } });
    const activeClaim = await prisma.seatClaim.findFirst({ where: { showId: existing.id }, select: { id: true } });
    if ((related || activeClaim) && (startsAt.getTime() !== existing.startsAt.getTime() || movieId !== existing.movieId)) {
      conflict(response, 'A show with bookings or seat claims cannot be moved to another time or movie.');
      return;
    }
    const show = await prisma.show.update({ where: { id: existing.id }, data: { ...parsed.data, ...(parsed.data.startsAt ? { startsAt } : {}) } });
    response.status(200).json({ show });
  } catch (error) { if (prismaCode(error) === 'P2025') { response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'Show not found.' } }); return; } next(error); }
});

adminRouter.delete('/shows/:showId', async (request: Request, response: Response, next: NextFunction) => {
  try {
    if (!await requireAdmin(request, response)) return;
    const parsedId = idSchema.safeParse(request.params.showId);
    if (!parsedId.success) { sendValidationError(response, 'Provide a valid show ID.'); return; }
    const show = await prisma.show.findUnique({ where: { id: parsedId.data }, select: { id: true } });
    if (!show) { response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'Show not found.' } }); return; }
    const booking = await prisma.booking.findFirst({ where: { showId: show.id, status: 'CONFIRMED' }, select: { id: true } });
    const claim = await prisma.seatClaim.findFirst({ where: { showId: show.id }, select: { id: true } });
    if (booking || claim) { conflict(response, 'A show with bookings or seat claims cannot be deleted.'); return; }
    await prisma.show.delete({ where: { id: show.id } });
    response.status(204).end();
  } catch (error) { if (prismaCode(error) === 'P2025') { response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'Show not found.' } }); return; } next(error); }
});
