import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getCurrentUser, login, register } from './auth-client';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('authentication API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers a customer and sends only the registration fields', async () => {
    const payload = {
      user: { id: 'user-1', name: 'Test Customer', email: 'customer@example.com', role: 'CUSTOMER' as const },
      token: 'signed-token',
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload, 201));

    await expect(register({
      name: 'Test Customer',
      email: 'customer@example.com',
      password: 'long-password',
    })).resolves.toEqual(payload);

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Test Customer',
          email: 'customer@example.com',
          password: 'long-password',
        }),
      }),
    );
  });

  it('surfaces a readable API error and status code', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' },
    }, 401));

    await expect(login({ email: 'customer@example.com', password: 'wrong-password' }))
      .rejects.toMatchObject({
        name: 'ApiError',
        message: 'Email or password is incorrect.',
        status: 401,
        code: 'INVALID_CREDENTIALS',
      } satisfies Partial<ApiError>);
  });

  it('sends the bearer token when restoring the current user', async () => {
    const payload = {
      user: { id: 'user-1', name: 'Test Customer', email: 'customer@example.com', role: 'CUSTOMER' as const },
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    await expect(getCurrentUser('signed-token')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:4000/api/auth/me',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-token' }),
      }),
    );
  });

  it('reports a clear error when the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(login({ email: 'customer@example.com', password: 'password' }))
      .rejects.toMatchObject({ message: 'Unable to reach Yozigo. Check that the API server is running.', status: 0 });
  });
});
