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
    next(error);
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
    next(error);
  }
});

authRouter.get('/me', async (request: Request, response: Response, next: NextFunction) => {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required.' } });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    next(new Error('JWT_SECRET must be configured with at least 32 characters'));
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(authorization.slice('Bearer '.length), secret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token subject is missing');
    }
    userId = payload.sub;
  } catch {
    response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
      return;
    }
    response.status(200).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});


const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

async function authenticatedUserId(request: Request, response: Response, next: NextFunction): Promise<string | null> {
  const authorization = request.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'A valid bearer token is required.' } });
    return null;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    next(new Error('JWT_SECRET must be configured with at least 32 characters'));
    return null;
  }

  try {
    const payload = jwt.verify(authorization.slice('Bearer '.length), secret);
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('Token subject is missing');
    }
    return payload.sub;
  } catch {
    response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
    return null;
  }
}

authRouter.patch('/me', async (request: Request, response: Response, next: NextFunction) => {
  const userId = await authenticatedUserId(request, response, next);
  if (!userId) return;

  const parsed = updateProfileSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Name must contain 2 to 80 characters.' } });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { name: parsed.data.name },
      select: { id: true, name: true, email: true, role: true },
    });
    response.status(200).json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/me/password', async (request: Request, response: Response, next: NextFunction) => {
  const userId = await authenticatedUserId(request, response, next);
  if (!userId) return;

  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide your current password and a new password of 8 to 72 characters.' } });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) {
      response.status(401).json({ error: { code: 'INVALID_TOKEN', message: 'The access token is invalid or expired.' } });
      return;
    }
    if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      response.status(400).json({ error: { code: 'CURRENT_PASSWORD_INCORRECT', message: 'Your current password is incorrect.' } });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash }, select: { id: true } });
    response.status(200).json({ message: 'Password updated successfully.' });
  } catch (error) {
    next(error);
  }
});
