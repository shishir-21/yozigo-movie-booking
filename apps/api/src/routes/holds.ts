import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

export const holdsRouter = Router();
const idSchema = z.string().trim().min(1).max(64);
const createHoldSchema = z.object({ seatId: idSchema });

function authenticatedUserId(request: Request): string | null {
  const header = request.get('authorization');
  const secret = process.env.JWT_SECRET;
  if (!header?.startsWith('Bearer ') || !secret || secret.length < 32) return null;
  try {
    const payload = jwt.verify(header.slice(7), secret);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

holdsRouter.post('/:showId/holds', async (request: Request, response: Response, next: NextFunction) => {
  const userId = authenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in with a valid account to hold seats.' } });
    return;
  }
  const parsedShow = idSchema.safeParse(request.params.showId);
  const parsedBody = createHoldSchema.safeParse(request.body);
  if (!parsedShow.success || !parsedBody.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid show ID and seat ID.' } });
    return;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  try {
    const hold = await prisma.$transaction(async (tx) => {
      const show = await tx.show.findUnique({ where: { id: parsedShow.data }, select: { id: true, startsAt: true } });
      if (!show) throw Object.assign(new Error('SHOW_NOT_FOUND'), { code: 'SHOW_NOT_FOUND' });
      if (show.startsAt <= now) throw Object.assign(new Error('SHOW_ALREADY_STARTED'), { code: 'SHOW_ALREADY_STARTED' });

      const seat = await tx.seat.findUnique({ where: { id: parsedBody.data.seatId }, select: { id: true } });
      if (!seat) throw Object.assign(new Error('SEAT_NOT_FOUND'), { code: 'SEAT_NOT_FOUND' });

      // Release expired database claims before attempting the unique (showId, seatId) claim.
      const expiredClaims = await tx.seatClaim.findMany({
        where: { showId: show.id, kind: 'HOLD', expiresAt: { lte: now } },
        select: { id: true, seatId: true },
      });
      if (expiredClaims.length) {
        await tx.seatClaim.deleteMany({ where: { id: { in: expiredClaims.map((claim) => claim.id) } } });
        await tx.seatHold.updateMany({
          where: { showId: show.id, seatId: { in: expiredClaims.map((claim) => claim.seatId) }, status: 'ACTIVE', expiresAt: { lte: now } },
          data: { status: 'EXPIRED' },
        });
      }

      const booking = await tx.bookingSeat.findFirst({
        where: { showId: show.id, seatId: seat.id, booking: { status: 'CONFIRMED' } },
        select: { id: true },
      });
      if (booking) throw Object.assign(new Error('SEAT_UNAVAILABLE'), { code: 'SEAT_UNAVAILABLE' });

      const existingClaim = await tx.seatClaim.findUnique({
        where: { showId_seatId: { showId: show.id, seatId: seat.id } },
        select: { id: true, userId: true, kind: true, expiresAt: true },
      });
      if (existingClaim) {
        if (existingClaim.userId === userId && existingClaim.kind === 'HOLD' && existingClaim.expiresAt && existingClaim.expiresAt > now) {
          const existingHold = await tx.seatHold.findFirst({
            where: { showId: show.id, seatId: seat.id, userId, status: 'ACTIVE', expiresAt: { gt: now } },
            orderBy: { createdAt: 'desc' },
            select: { id: true, showId: true, seatId: true, expiresAt: true, status: true },
          });
          if (existingHold) return existingHold;
        }
        throw Object.assign(new Error('SEAT_UNAVAILABLE'), { code: 'SEAT_UNAVAILABLE' });
      }

      const createdHold = await tx.seatHold.create({
        data: { showId: show.id, seatId: seat.id, userId, expiresAt, status: 'ACTIVE' },
        select: { id: true, showId: true, seatId: true, expiresAt: true, status: true },
      });
      await tx.seatClaim.create({
        data: { showId: show.id, seatId: seat.id, userId, kind: 'HOLD', expiresAt },
      });
      return createdHold;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    response.status(201).json({ hold, expiresAt: hold.expiresAt });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'SHOW_NOT_FOUND') {
      response.status(404).json({ error: { code, message: 'This show could not be found.' } });
      return;
    }
    if (code === 'SEAT_NOT_FOUND') {
      response.status(404).json({ error: { code, message: 'This seat could not be found.' } });
      return;
    }
    if (code === 'SHOW_ALREADY_STARTED') {
      response.status(409).json({ error: { code, message: 'This show has already started.' } });
      return;
    }
    if (code === 'SEAT_UNAVAILABLE' || isUniqueConflict(error) || code === 'P2034') {
      response.status(409).json({ error: { code: 'SEAT_UNAVAILABLE', message: 'This seat is no longer available. Refresh the seat map and choose another seat.' } });
      return;
    }
    next(error);
  }
});

holdsRouter.delete('/:showId/holds/:holdId', async (request: Request, response: Response, next: NextFunction) => {
  const userId = authenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in with a valid account to release a hold.' } });
    return;
  }
  const parsedShow = idSchema.safeParse(request.params.showId);
  const parsedHold = idSchema.safeParse(request.params.holdId);
  if (!parsedShow.success || !parsedHold.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide valid show and hold IDs.' } });
    return;
  }

  try {
    const released = await prisma.$transaction(async (tx) => {
      const hold = await tx.seatHold.findFirst({
        where: { id: parsedHold.data, showId: parsedShow.data, userId, status: 'ACTIVE' },
        select: { id: true, seatId: true, expiresAt: true },
      });
      if (!hold) return false;
      await tx.seatHold.update({ where: { id: hold.id }, data: { status: hold.expiresAt <= new Date() ? 'EXPIRED' : 'RELEASED' } });
      await tx.seatClaim.deleteMany({ where: { showId: parsedShow.data, seatId: hold.seatId, userId, kind: 'HOLD' } });
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!released) {
      response.status(404).json({ error: { code: 'HOLD_NOT_FOUND', message: 'No active hold was found for this account.' } });
      return;
    }
    response.status(200).json({ released: true });
  } catch (error) {
    next(error);
  }
});
