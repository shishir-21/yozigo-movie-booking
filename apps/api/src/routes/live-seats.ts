import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { subscribeToShow } from '../lib/seat-events.js';

export const liveSeatsRouter = Router();
const showIdSchema = z.string().trim().min(1).max(64);

liveSeatsRouter.get('/:showId/seat-events', async (request: Request, response: Response, next: NextFunction) => {
  const parsedId = showIdSchema.safeParse(request.params.showId);
  if (!parsedId.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A valid show ID is required.' } });
    return;
  }
  try {
    const show = await prisma.show.findUnique({ where: { id: parsedId.data }, select: { id: true } });
    if (!show) {
      response.status(404).json({ error: { code: 'SHOW_NOT_FOUND', message: 'This show could not be found.' } });
      return;
    }

    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();
    response.write(': connected\n\n');

    const sendInvalidation = () => response.write('event: seat-map-invalidated\ndata: {}\n\n');
    const unsubscribe = subscribeToShow(show.id, sendInvalidation);
    // The UI also needs to notice holds expiring without a mutation request.
    const syncInterval = setInterval(sendInvalidation, 5000);
    const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15000);
    request.on('close', () => {
      clearInterval(syncInterval);
      clearInterval(heartbeat);
      unsubscribe();
    });
  } catch (error) {
    next(error);
  }
});

