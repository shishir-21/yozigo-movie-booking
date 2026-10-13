import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const seatsRouter = Router();

const showIdSchema = z.string().trim().min(1).max(64);

seatsRouter.get('/:showId/seats', async (request: Request, response: Response, next: NextFunction) => {
  const parsedId = showIdSchema.safeParse(request.params.showId);
  if (!parsedId.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid show ID is required.' } });
    return;
  }

  try {
    const show = await prisma.show.findUnique({
      where: { id: parsedId.data },
      select: { id: true },
    });
    if (!show) {
      response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'This show could not be found.' } });
      return;
    }

    const now = new Date();
    const [seats, activeHolds, bookedSeats] = await Promise.all([
      prisma.seat.findMany({ orderBy: [{ row: 'asc' }, { number: 'asc' }], select: { id: true, row: true, number: true } }),
      prisma.seatHold.findMany({
        where: { showId: show.id, status: 'ACTIVE', expiresAt: { gt: now } },
        select: { seatId: true },
      }),
      prisma.bookingSeat.findMany({
        where: { showId: show.id, booking: { status: 'CONFIRMED' } },
        select: { seatId: true },
      }),
    ]);

    const unavailable = new Set([
      ...activeHolds.map((hold) => hold.seatId),
      ...bookedSeats.map((bookingSeat) => bookingSeat.seatId),
    ]);

    response.status(200).json({
      showId: show.id,
      seats: seats.map((seat) => ({
        ...seat,
        status: unavailable.has(seat.id) ? 'UNAVAILABLE' : 'AVAILABLE',
      })),
    });
  } catch (error) {
    next(error);
  }
});
