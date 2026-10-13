import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from './app.js';

describe('API foundation', () => {
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
});
