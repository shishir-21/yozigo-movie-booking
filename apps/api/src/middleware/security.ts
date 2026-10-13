import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

type Bucket = { count: number; resetAt: number };
type RateLimitOptions = { limit: number; windowMs?: number; keyPrefix: string };

const rateLimitStores = new Set<Map<string, Bucket>>();

export function requestId(request: Request, response: Response, next: NextFunction) {
  const supplied = request.header('x-request-id');
  const id = supplied && /^[A-Za-z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  response.locals.requestId = id;
  response.setHeader('X-Request-Id', id);
  next();
}

export function createRateLimiter({ limit, windowMs = Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60_000, keyPrefix }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();
  rateLimitStores.add(buckets);

  return (request: Request, response: Response, next: NextFunction) => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
    const key = `${keyPrefix}:${request.ip || request.socket.remoteAddress || 'unknown'}`;
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (buckets.size > 10_000) {
      const oldest = buckets.keys().next().value as string | undefined;
      if (oldest) buckets.delete(oldest);
    }

    const remaining = Math.max(0, limit - bucket.count);
    response.setHeader('RateLimit-Limit', String(limit));
    response.setHeader('RateLimit-Remaining', String(remaining));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      response.setHeader('Retry-After', String(retryAfter));
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many attempts. Please wait before trying again.',
          requestId: response.locals.requestId,
        },
      });
      return;
    }

    bucket.count += 1;
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    next();
  };
}

export function resetRateLimitersForTests() {
  for (const store of rateLimitStores) store.clear();
}
