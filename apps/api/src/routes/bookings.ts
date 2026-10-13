import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const bookingsRouter = Router();
const idSchema = z.string().trim().min(1).max(64);
const checkoutSchema = z.object({
  holdId: idSchema,
  mockPaymentResult: z.enum(['SUCCESS', 'DECLINED']).default('SUCCESS'),
});

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

function errorCode(error: unknown): string {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
}

bookingsRouter.post('/shows/:showId/bookings', async (request: Request, response: Response, next: NextFunction) => {
  const userId = authenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in before confirming a booking.' } });
    return;
  }
  const parsedShow = idSchema.safeParse(request.params.showId);
  const parsedBody = checkoutSchema.safeParse(request.body);
  if (!parsedShow.success || !parsedBody.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid show ID, hold ID, and mock payment result.' } });
    return;
  }
  if (parsedBody.data.mockPaymentResult === 'DECLINED') {
    response.status(402).json({ error: { code: 'MOCK_PAYMENT_DECLINED', message: 'The simulated payment was declined. No payment was processed and your hold remains active until it expires.' } });
    return;
  }

  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Idempotency: a retry for a hold already converted returns its original booking.
      const previous = await tx.booking.findUnique({
        where: { holdId: parsedBody.data.holdId },
        include: { seats: { include: { seat: { select: { row: true, number: true } } } }, show: { include: { movie: { select: { title: true } } } } },
      });
      if (previous) {
        if (previous.userId !== userId || previous.showId !== parsedShow.data) {
          throw Object.assign(new Error('HOLD_NOT_FOUND'), { code: 'HOLD_NOT_FOUND' });
        }
        return { booking: previous, alreadyConfirmed: true };
      }

      const hold = await tx.seatHold.findFirst({
        where: { id: parsedBody.data.holdId, showId: parsedShow.data, userId },
        include: { show: { select: { id: true, startsAt: true, pricePaise: true } } },
      });
      if (!hold) throw Object.assign(new Error('HOLD_NOT_FOUND'), { code: 'HOLD_NOT_FOUND' });
      if (hold.status !== 'ACTIVE' || hold.expiresAt <= now || hold.show.startsAt <= now) {
        throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });
      }

      const claim = await tx.seatClaim.findUnique({
        where: { showId_seatId: { showId: hold.showId, seatId: hold.seatId } },
      });
      if (!claim || claim.userId !== userId || claim.kind !== 'HOLD' || !claim.expiresAt || claim.expiresAt <= now) {
        throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });
      }

      const booking = await tx.booking.create({
        data: {
          userId,
          showId: hold.showId,
          holdId: hold.id,
          amountPaise: hold.show.pricePaise,
          status: 'CONFIRMED',
          seats: { create: { seatId: hold.seatId, showId: hold.showId } },
        },
        include: { seats: { include: { seat: { select: { row: true, number: true } } } }, show: { include: { movie: { select: { title: true } } } } },
      });

      await tx.seatHold.update({ where: { id: hold.id }, data: { status: 'CONVERTED' } });
      const converted = await tx.seatClaim.updateMany({
        where: { showId: hold.showId, seatId: hold.seatId, userId, kind: 'HOLD', expiresAt: { gt: now } },
        data: { kind: 'BOOKED', expiresAt: null },
      });
      if (converted.count !== 1) throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });

      return { booking, alreadyConfirmed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    response.status(result.alreadyConfirmed ? 200 : 201).json({
      booking: {
        id: result.booking.id,
        showId: result.booking.showId,
        movieTitle: result.booking.show.movie.title,
        amountPaise: result.booking.amountPaise,
        status: result.booking.status,
        createdAt: result.booking.createdAt,
        seats: result.booking.seats.map((entry) => ({ id: entry.seatId, row: entry.seat.row, number: entry.seat.number })),
      },
      payment: { mode: 'MOCK', status: 'SUCCEEDED', message: 'Demo payment only. No real money was charged.' },
      alreadyConfirmed: result.alreadyConfirmed,
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'HOLD_NOT_FOUND') {
      response.status(404).json({ error: { code, message: 'No matching seat hold was found for this account.' } });
      return;
    }
    if (code === 'HOLD_EXPIRED') {
      response.status(409).json({ error: { code, message: 'This hold has expired or is no longer active. Refresh the seat map and try again.' } });
      return;
    }
    if (code === 'P2002' || code === 'P2034') {
      response.status(409).json({ error: { code: 'BOOKING_CONFLICT', message: 'This seat could not be confirmed. Refresh the seat map and try again.' } });
      return;
    }
    next(error);
  }
});

bookingsRouter.get('/bookings/me', async (request: Request, response: Response, next: NextFunction) => {
  const userId = authenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to view your bookings.' } });
    return;
  }
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        seats: { include: { seat: { select: { row: true, number: true } } } },
        show: { include: { movie: { select: { title: true } } } },
      },
    });
    response.status(200).json({ bookings: bookings.map((booking) => ({
      id: booking.id,
      showId: booking.showId,
      movieTitle: booking.show.movie.title,
      amountPaise: booking.amountPaise,
      status: booking.status,
      createdAt: booking.createdAt,
      seats: booking.seats.map((entry) => ({ id: entry.seatId, row: entry.seat.row, number: entry.seat.number })),
    })) });
  } catch (error) {
    next(error);
  }
});
