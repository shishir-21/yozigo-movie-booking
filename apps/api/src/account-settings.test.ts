import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('./lib/prisma.js', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    movie: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    show: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    seat: { findMany: vi.fn() },
    seatHold: { findMany: vi.fn(), updateMany: vi.fn() },
    booking: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    bookingSeat: { findMany: vi.fn() },
    seatClaim: { findMany: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { app } from './app.js';
import { prisma } from './lib/prisma.js';

const secret = 'account-settings-test-secret-that-is-long-enough';
const token = () => jwt.sign({ role: 'CUSTOMER' }, secret, { subject: 'customer-1', expiresIn: '1h' });

describe('customer account settings API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = secret;
  });

  it('requires authentication to update a profile', async () => {
    const response = await request(app).patch('/api/auth/me').send({ name: 'Updated Name' });
    expect(response.status).toBe(401);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('trims and saves the authenticated user profile name', async () => {
    vi.mocked(prisma.user.update).mockResolvedValueOnce({
      id: 'customer-1', name: 'Updated Name', email: 'customer@example.com', role: 'CUSTOMER',
    } as never);

    const response = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: '  Updated Name  ' });

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: 'customer-1', name: 'Updated Name', email: 'customer@example.com', role: 'CUSTOMER',
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'customer-1' }, data: { name: 'Updated Name' },
    }));
  });

  it('rejects invalid profile names', async () => {
    const response = await request(app)
      .patch('/api/auth/me')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: ' ' });
    expect(response.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a password change when the current password is wrong', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'customer-1', passwordHash: await bcrypt.hash('correct-password', 4),
    } as never);

    const response = await request(app)
      .post('/api/auth/me/password')
      .set('Authorization', `Bearer ${token()}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('CURRENT_PASSWORD_INCORRECT');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('hashes the new password and never returns it', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
      id: 'customer-1', passwordHash: await bcrypt.hash('current-password', 4),
    } as never);
    vi.mocked(prisma.user.update).mockResolvedValueOnce({ id: 'customer-1' } as never);

    const response = await request(app)
      .post('/api/auth/me/password')
      .set('Authorization', `Bearer ${token()}`)
      .send({ currentPassword: 'current-password', newPassword: 'new-password-123' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Password updated successfully.' });
    const updateCall = vi.mocked(prisma.user.update).mock.calls[0]?.[0] as { data: { passwordHash: string } };
    expect(updateCall.data.passwordHash).not.toBe('new-password-123');
    expect(await bcrypt.compare('new-password-123', updateCall.data.passwordHash)).toBe(true);
    expect(JSON.stringify(response.body)).not.toContain('password');
  });
});
