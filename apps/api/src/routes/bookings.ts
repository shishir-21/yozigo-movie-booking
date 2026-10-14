import { Router, type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { publishSeatMapInvalidation } from '../lib/seat-events.js';

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
  const parsedBody = z.object({
    holdId: idSchema.optional(),
    holdIds: z.array(idSchema).min(1).max(6).optional(),
    mockPaymentResult: z.enum(['SUCCESS', 'DECLINED']).default('SUCCESS'),
  }).refine((value) => Boolean(value.holdId) !== Boolean(value.holdIds), 'Provide either holdId or holdIds')
    .refine((value) => !value.holdIds || new Set(value.holdIds).size === value.holdIds.length, 'Hold IDs must be unique')
    .safeParse(request.body);
  if (!parsedShow.success || !parsedBody.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid show ID and between 1 and 6 unique seat hold IDs.' } });
    return;
  }
  if (parsedBody.data.mockPaymentResult === 'DECLINED') {
    response.status(402).json({ error: { code: 'MOCK_PAYMENT_DECLINED', message: 'The simulated payment was declined. No payment was processed and your holds remain active until they expire.' } });
    return;
  }

  const holdIds = parsedBody.data.holdIds ?? [parsedBody.data.holdId as string];
  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const holds = await tx.seatHold.findMany({
        where: { id: { in: holdIds }, showId: parsedShow.data, userId },
        include: {
          show: { select: { id: true, startsAt: true, pricePaise: true, movie: { select: { title: true } } } },
          booking: { include: { seats: { include: { seat: { select: { row: true, number: true } } } }, show: { include: { movie: { select: { title: true } } } } } },
        },
      });
      if (holds.length !== holdIds.length) throw Object.assign(new Error('HOLD_NOT_FOUND'), { code: 'HOLD_NOT_FOUND' });

      const previousBookings = holds.map((hold) => hold.booking).filter(Boolean);
      if (previousBookings.length === holds.length) {
        const previous = previousBookings[0]!;
        if (previousBookings.every((item) => item!.id === previous.id)) return { booking: previous, alreadyConfirmed: true };
      }
      if (previousBookings.length) throw Object.assign(new Error('HOLD_NOT_FOUND'), { code: 'HOLD_NOT_FOUND' });

      if (holds.some((hold) => hold.status !== 'ACTIVE' || hold.expiresAt <= now || hold.show.startsAt <= now)) {
        throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });
      }
      if (holds.some((hold) => hold.showId !== parsedShow.data)) {
        throw Object.assign(new Error('HOLD_NOT_FOUND'), { code: 'HOLD_NOT_FOUND' });
      }

      for (const hold of holds) {
        const claim = await tx.seatClaim.findUnique({
          where: { showId_seatId: { showId: hold.showId, seatId: hold.seatId } },
        });
        if (!claim || claim.userId !== userId || claim.kind !== 'HOLD' || !claim.expiresAt || claim.expiresAt <= now) {
          throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });
        }
      }

      const first = holds[0];
      const booking = await tx.booking.create({
        data: {
          userId,
          showId: first.showId,
          amountPaise: first.show.pricePaise * holds.length,
          status: 'CONFIRMED',
          seats: { create: holds.map((hold) => ({ seatId: hold.seatId, showId: hold.showId })) },
        },
        include: { seats: { include: { seat: { select: { row: true, number: true } } } }, show: { include: { movie: { select: { title: true } } } } },
      });

      await tx.seatHold.updateMany({
        where: { id: { in: holdIds }, userId, status: 'ACTIVE' },
        data: { status: 'CONVERTED', bookingId: booking.id },
      });
      for (const hold of holds) {
        const converted = await tx.seatClaim.updateMany({
          where: { showId: hold.showId, seatId: hold.seatId, userId, kind: 'HOLD', expiresAt: { gt: now } },
          data: { kind: 'BOOKED', expiresAt: null },
        });
        if (converted.count !== 1) throw Object.assign(new Error('HOLD_EXPIRED'), { code: 'HOLD_EXPIRED' });
      }
      return { booking, alreadyConfirmed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result.alreadyConfirmed) publishSeatMapInvalidation(result.booking.showId);
    response.status(result.alreadyConfirmed ? 200 : 201).json({
      booking: {
        id: result.booking.id,
        showId: result.booking.showId,
        movieTitle: result.booking.show.movie.title,
        amountPaise: result.booking.amountPaise,
        status: result.booking.status,
        createdAt: result.booking.createdAt,
        startsAt: result.booking.show.startsAt,
        seats: result.booking.seats.map((entry) => ({ id: entry.seatId, row: entry.seat.row, number: entry.seat.number })),
      },
      payment: { mode: 'MOCK', status: 'SUCCEEDED', message: 'Demo payment only. No real money was charged.' },
      alreadyConfirmed: result.alreadyConfirmed,
    });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'HOLD_NOT_FOUND') {
      response.status(404).json({ error: { code, message: 'No matching seat holds were found for this account.' } });
      return;
    }
    if (code === 'HOLD_EXPIRED') {
      response.status(409).json({ error: { code, message: 'One or more holds have expired or are no longer active. Refresh the seat map and try again.' } });
      return;
    }
    if (code === 'P2002' || code === 'P2034') {
      response.status(409).json({ error: { code: 'BOOKING_CONFLICT', message: 'One or more seats could not be confirmed. Refresh the seat map and try again.' } });
      return;
    }
    next(error);
  }
});

bookingsRouter.post('/bookings/:bookingId/cancel', async (request: Request, response: Response, next: NextFunction) => {
  const userId = authenticatedUserId(request);
  if (!userId) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to cancel a booking.' } });
    return;
  }
  const parsedId = idSchema.safeParse(request.params.bookingId);
  if (!parsedId.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid booking ID.' } });
    return;
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  try {
    const booking = await prisma.$transaction(async (tx) => {
      const current = await tx.booking.findUnique({
        where: { id: parsedId.data },
        include: {
          seats: { select: { seatId: true } },
          show: { select: { startsAt: true } },
        },
      });
      if (!current || current.userId !== userId) {
        throw Object.assign(new Error('BOOKING_NOT_FOUND'), { code: 'BOOKING_NOT_FOUND' });
      }
      if (current.status !== 'CONFIRMED') {
        throw Object.assign(new Error('BOOKING_NOT_CANCELLABLE'), { code: 'BOOKING_NOT_CANCELLABLE' });
      }
      if (current.show.startsAt <= cutoff) {
        throw Object.assign(new Error('CANCELLATION_WINDOW_CLOSED'), { code: 'CANCELLATION_WINDOW_CLOSED' });
      }

      const updated = await tx.booking.update({
        where: { id: current.id },
        data: { status: 'CANCELLED' },
      });
      await tx.seatClaim.deleteMany({
        where: {
          showId: current.showId,
          seatId: { in: current.seats.map((seat) => seat.seatId) },
          userId,
          kind: 'BOOKED',
        },
      });
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    publishSeatMapInvalidation(booking.showId);
    response.status(200).json({ booking: { id: booking.id, status: booking.status }, message: 'Booking cancelled. Your seats are available again.' });
  } catch (error) {
    const code = errorCode(error);
    if (code === 'BOOKING_NOT_FOUND') {
      response.status(404).json({ error: { code, message: 'Booking not found for this account.' } });
      return;
    }
    if (code === 'BOOKING_NOT_CANCELLABLE') {
      response.status(409).json({ error: { code, message: 'Only confirmed bookings can be cancelled.' } });
      return;
    }
    if (code === 'CANCELLATION_WINDOW_CLOSED') {
      response.status(409).json({ error: { code, message: 'Bookings can only be cancelled more than two hours before the show starts.' } });
      return;
    }
    if (code === 'P2034') {
      response.status(409).json({ error: { code: 'BOOKING_CONFLICT', message: 'This booking changed while you were cancelling it. Refresh and try again.' } });
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
      startsAt: booking.show.startsAt,
      seats: booking.seats.map((entry) => ({ id: entry.seatId, row: entry.seat.row, number: entry.seat.number })),
    })) });
  } catch (error) {
    next(error);
  }
});
