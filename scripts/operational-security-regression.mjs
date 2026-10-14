#!/usr/bin/env node

const baseUrl = (process.env.API_BASE_URL || 'http://localhost:4000').replace(/\/+$/, '');
const allowedOrigin = process.env.WEB_ORIGIN || 'http://localhost:8080';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(name, path, options = {}) {
  let response;
  try {
    response = await fetch(baseUrl + path, { ...options, signal: AbortSignal.timeout(10000) });
  } catch {
    throw new Error(name + ': could not connect to ' + baseUrl + '; make sure full-stack Compose is healthy.');
  }
  console.log('PASS ' + name + ' (HTTP ' + response.status + ')');
  return response;
}

async function main() {
  const health = await request('health endpoint', '/api/health');
  assert(health.status === 200, 'Health endpoint should return HTTP 200.');
  assert(health.headers.get('x-request-id'), 'Health response must include X-Request-Id.');
  assert(!health.headers.has('x-powered-by'), 'API must not expose X-Powered-By.');
  assert(health.headers.get('x-content-type-options') === 'nosniff', 'Helmet should set X-Content-Type-Options: nosniff.');
  assert((await health.json())?.status === 'ok', 'Health response body has an unexpected shape.');

  const safeId = 'ops-regression.safe-id_123';
  const preserved = await request('safe request ID is preserved', '/api/health', { headers: { 'X-Request-Id': safeId } });
  assert(preserved.headers.get('x-request-id') === safeId, 'API did not preserve a safe caller-supplied request ID.');

  const unsafe = await request('unsafe request ID is replaced', '/api/health', { headers: { 'X-Request-Id': 'bad request id' } });
  const generatedId = unsafe.headers.get('x-request-id') || '';
  assert(generatedId.length > 0 && !generatedId.includes(' '), 'API did not replace an unsafe request ID.');

  const notFoundId = 'ops-regression.not-found';
  const notFound = await request('404 uses stable JSON error shape', '/api/does-not-exist', {
    headers: { 'X-Request-Id': notFoundId, accept: 'application/json' },
  });
  assert(notFound.status === 404, 'Unknown API route should return HTTP 404.');
  assert(notFound.headers.get('x-request-id') === notFoundId, '404 response header should retain request ID.');
  const notFoundBody = await notFound.json();
  assert(notFoundBody?.error?.code === 'NOT_FOUND' && notFoundBody.error.requestId === notFoundId, '404 body must include NOT_FOUND and correlated request ID.');

  const preflight = await request('allowed-origin CORS preflight', '/api/auth/login', {
    method: 'OPTIONS',
    headers: {
      Origin: allowedOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
  assert(preflight.status >= 200 && preflight.status < 300, 'Allowed CORS preflight should succeed.');
  assert(preflight.headers.get('access-control-allow-origin') === allowedOrigin, 'Allowed origin was not returned by CORS.');

  const blockedOrigin = 'https://untrusted.example.invalid';
  const blocked = await request('untrusted origin is not allowed by CORS', '/api/health', { headers: { Origin: blockedOrigin } });
  assert(blocked.status === 200, 'CORS should not block server-to-server response processing.');
  assert(blocked.headers.get('access-control-allow-origin') !== blockedOrigin, 'CORS must not grant an untrusted origin access.');

  const ready = await request('database readiness endpoint', '/api/health/ready');
  assert(ready.status === 200, 'Database readiness should return HTTP 200 when Compose is healthy.');
  const readyBody = await ready.json();
  assert(readyBody?.status === 'ready' && readyBody?.database === 'ok', 'Readiness response has an unexpected shape.');

  // Keep last: this intentionally exhausts the process-local registration limiter.
  let limitedResponse;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    limitedResponse = await request('registration rate-limit probe', '/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ name: 'x', email: 'invalid', password: 'x' }),
    });
    if (limitedResponse.status === 429) break;
  }
  assert(limitedResponse?.status === 429, 'Registration endpoint did not enforce its configured rate limit.');
  assert(Number(limitedResponse.headers.get('retry-after')) > 0, 'Rate-limited response must include a positive Retry-After header.');
  const limitedBody = await limitedResponse.json();
  assert(limitedBody?.error?.code === 'RATE_LIMITED', 'Rate-limited response must use RATE_LIMITED.');
  assert(typeof limitedBody?.error?.requestId === 'string' && limitedBody.error.requestId === limitedResponse.headers.get('x-request-id'), 'Rate-limited response must correlate request ID.');
  assert(!/password|authorization|secret/i.test(JSON.stringify(limitedBody)), 'Rate-limited response must not expose credentials or secrets.');
  console.log('PASS operational security regression suite');
}

main().catch((error) => {
  console.error('FAIL operational security regression: ' + (error instanceof Error ? error.message : 'unknown error'));
  process.exitCode = 1;
});
