import { Router, type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  password: z.string().min(1).max(72),
});

type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
};

function publicUser(user: PublicUser) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

function createToken(user: PublicUser): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }

  return jwt.sign(
    { role: user.role },
    secret,
    {
      subject: user.id,
      expiresIn: (process.env.JWT_EXPIRES_IN ?? '1d') as jwt.SignOptions['expiresIn'],
    },
  );
}

function sendRouteError(error: unknown, next: NextFunction): void {
  next(error);
}

authRouter.post('/register', async (request: Request, response: Response, next: NextFunction) => {
  const parsed = registerSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Provide a valid name, email, and password of at least 8 characters.' },
    });
    return;
  }

  try {
    const { name, email, password } = parsed.data;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      response.status(409).json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'An account with this email already exists.' } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, role: 'CUSTOMER' },
      select: { id: true, name: true, email: true, role: true },
    });
    const token = createToken(user);
    response.status(201).json({ user: publicUser(user), token });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      response.status(409).json({ error: { code: 'EMAIL_ALREADY_EXISTS', message: 'An account with this email already exists.' } });
      return;
    }
    sendRouteError(error, next);
  }
});

authRouter.post('/login', async (request: Request, response: Response, next: NextFunction) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide a valid email and password.' } });
    return;
  }

  try {
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
      return;
    }

    const safeUser = publicUser(user);
    response.status(200).json({ user: safeUser, token: createToken(safeUser) });
  } catch (error) {
    sendRouteError(error, next);
  }
});
