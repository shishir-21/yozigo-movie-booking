import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

vi.mock('./lib/prisma.js', () => ({
  prisma: { user: { findUnique: vi.fn(), create: vi.fn() }, movie: { findMany: vi.fn(), findUnique: vi.fn() }, show: { findMany: vi.fn(), findUnique: vi.fn() }, seat: { findMany: vi.fn() }, seatHold: { findMany: vi.fn() }, bookingSeat: { findMany: vi.fn() } },
}));

import { prisma } from './lib/prisma.js';
import { app } from './app.js';

const testUser = {
  id: 'user_test_123',
  name: 'Test Customer',
  email: 'customer@example.com',
  passwordHash: 'unused-hash',
  role: 'CUSTOMER' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('API foundation and authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    process.env.JWT_EXPIRES_IN = '1d';
  });

  it('returns a healthy API response', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'yozigo-api' });
  });

  it('returns a consistent JSON response for unknown routes', async () => {
    const response = await request(app).get('/api/not-a-route');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('registers a customer with a hashed password and returns a safe user plus token', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({ ...testUser, email: 'customer@example.com' });

    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: ' Customer@Example.com ',
      password: 'strong-password',
    });

    expect(response.status).toBe(201);
    expect(response.body.user).toEqual({
      id: testUser.id,
      name: testUser.name,
      email: testUser.email,
      role: 'CUSTOMER',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.token).toEqual(expect.any(String));

    const createArgs = vi.mocked(prisma.user.create).mock.calls[0]?.[0];
    expect(createArgs?.data).toMatchObject({ email: 'customer@example.com', role: 'CUSTOMER' });
    expect(await bcrypt.compare('strong-password', createArgs?.data.passwordHash as string)).toBe(true);
  });

  it('rejects invalid registration data without querying the database', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'A',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects duplicate email addresses', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(testUser);

    const response = await request(app).post('/api/auth/register').send({
      name: 'Test Customer',
      email: testUser.email,
      password: 'strong-password',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('logs in with valid credentials and never returns the password hash', async () => {
    const passwordHash = await bcrypt.hash('strong-password', 4);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ ...testUser, passwordHash });

    const response = await request(app).post('/api/auth/login').send({
      email: 'CUSTOMER@example.com',
      password: 'strong-password',
    });

    expect(response.status).toBe(200);
    expect(response.body.user.email).toBe(testUser.email);
    expect(response.body.user).not.toHaveProperty('passwordHash');
    expect(response.body.token).toEqual(expect.any(String));
  });

  it('returns the same authentication error for an unknown email or wrong password', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

    const response = await request(app).post('/api/auth/login').send({
      email: 'unknown@example.com',
      password: 'strong-password',
    });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects requests to the current-user endpoint without a bearer token', async () => {
    const response = await request(app).get('/api/auth/me');
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid access tokens', async () => {
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_TOKEN');
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('validates a JWT and returns the authenticated user without a password hash', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(testUser);
    const token = jwt.sign({ role: 'CUSTOMER' }, process.env.JWT_SECRET as string, {
      subject: testUser.id,
      expiresIn: '1d',
    });

    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: testUser.id,
      name: testUser.name,
      email: testUser.email,
      role: 'CUSTOMER',
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });
});


describe('public movie and show browsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns movie metadata and the next upcoming show from the database', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    vi.mocked(prisma.movie.findMany).mockResolvedValue([{
      id: 'movie-1',
      title: 'The Last Horizon',
      posterUrl: 'https://example.com/poster.jpg',
      language: 'English',
      durationMin: 128,
      rating: 'UA',
      description: 'A space adventure',
      createdAt: new Date(),
      updatedAt: new Date(),
      shows: [{ id: 'show-1', startsAt, pricePaise: 25000 }],
    }] as never);

    const response = await request(app).get('/api/movies');

    expect(response.status).toBe(200);
    expect(response.body.movies).toHaveLength(1);
    expect(response.body.movies[0]).toMatchObject({
      id: 'movie-1',
      title: 'The Last Horizon',
      language: 'English',
      durationMin: 128,
      rating: 'UA',
      nextShow: { id: 'show-1', pricePaise: 25000 },
    });
    expect(response.body.movies[0].nextShow.startsAt).toBe(startsAt.toISOString());
    expect(prisma.movie.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include: { shows: expect.objectContaining({
        where: { startsAt: { gte: expect.any(Date) } },
        orderBy: { startsAt: 'asc' },
        take: 1,
      }) },
    }));
  });

  it('returns an empty movie list when the catalogue is empty', async () => {
    vi.mocked(prisma.movie.findMany).mockResolvedValue([]);

    const response = await request(app).get('/api/movies');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ movies: [] });
  });

  it('returns ordered upcoming shows for an existing movie', async () => {
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    vi.mocked(prisma.movie.findUnique).mockResolvedValue({ id: 'movie-1' } as never);
    vi.mocked(prisma.show.findMany).mockResolvedValue([
      { id: 'show-1', startsAt, pricePaise: 25000 },
    ] as never);

    const response = await request(app).get('/api/movies/movie-1/shows');

    expect(response.status).toBe(200);
    expect(response.body.shows).toHaveLength(1);
    expect(response.body.shows[0]).toMatchObject({ id: 'show-1', pricePaise: 25000 });
    expect(response.body.shows[0].startsAt).toBe(startsAt.toISOString());
    expect(prisma.show.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { movieId: 'movie-1', startsAt: { gte: expect.any(Date) } },
      orderBy: { startsAt: 'asc' },
    }));
  });

  it('returns 404 when requesting shows for a movie that does not exist', async () => {
    vi.mocked(prisma.movie.findUnique).mockResolvedValue(null);

    const response = await request(app).get('/api/movies/missing-movie/shows');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('MOVIE_NOT_FOUND');
    expect(prisma.show.findMany).not.toHaveBeenCalled();
  });
});


describe('show seat availability', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns available and unavailable seats based on active holds and confirmed bookings', async () => {
    vi.mocked(prisma.show.findUnique).mockResolvedValue({ id: 'show-1' } as never);
    vi.mocked(prisma.seat.findMany).mockResolvedValue([
      { id: 'seat-a1', row: 'A', number: 1 },
      { id: 'seat-a2', row: 'A', number: 2 },
      { id: 'seat-a3', row: 'A', number: 3 },
    ] as never);
    vi.mocked(prisma.seatHold.findMany).mockResolvedValue([{ seatId: 'seat-a2' }] as never);
    vi.mocked(prisma.bookingSeat.findMany).mockResolvedValue([{ seatId: 'seat-a3' }] as never);

    const response = await request(app).get('/api/shows/show-1/seats');

    expect(response.status).toBe(200);
    expect(response.body.seats).toEqual([
      { id: 'seat-a1', row: 'A', number: 1, status: 'AVAILABLE' },
      { id: 'seat-a2', row: 'A', number: 2, status: 'UNAVAILABLE' },
      { id: 'seat-a3', row: 'A', number: 3, status: 'UNAVAILABLE' },
    ]);
    expect(prisma.seatHold.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { showId: 'show-1', status: 'ACTIVE', expiresAt: { gt: expect.any(Date) } },
    }));
    expect(prisma.bookingSeat.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { showId: 'show-1', booking: { status: 'CONFIRMED' } },
    }));
  });

  it('returns 404 for an unknown show and does not query seat records', async () => {
    vi.mocked(prisma.show.findUnique).mockResolvedValue(null);
    const response = await request(app).get('/api/shows/missing/seats');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SHOW_NOT_FOUND');
    expect(prisma.seat.findMany).not.toHaveBeenCalled();
  });

  it('rejects malformed show IDs', async () => {
    const response = await request(app).get('/api/shows/%20/seats');
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
