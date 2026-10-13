import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const { findShow } = vi.hoisted(() => ({ findShow: vi.fn() }));

vi.mock('../lib/prisma.js', () => ({
  prisma: { show: { findUnique: findShow } },
}));

import { liveSeatsRouter } from './live-seats.js';

const app = express();
app.use('/api/shows', liveSeatsRouter);

describe('live seat events endpoint', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed show IDs before querying the database', async () => {
    const response = await request(app).get(`/api/shows/${'x'.repeat(65)}/seat-events`);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(findShow).not.toHaveBeenCalled();
  });

  it('returns 404 when the show does not exist', async () => {
    findShow.mockResolvedValue(null);

    const response = await request(app).get('/api/shows/missing-show/seat-events');

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('SHOW_NOT_FOUND');
    expect(findShow).toHaveBeenCalledWith({
      where: { id: 'missing-show' },
      select: { id: true },
    });
  });
});
