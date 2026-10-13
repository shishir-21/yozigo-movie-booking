#!/usr/bin/env node

const baseUrl = (process.env.API_BASE_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

const checks = [
  {
    name: 'API liveness',
    path: '/api/health',
    expectedStatus: 200,
    validate(body) {
      return body?.status === 'ok' && body?.service === 'yozigo-api';
    },
  },
  {
    name: 'Database readiness',
    path: '/api/health/ready',
    expectedStatus: 200,
    validate(body) {
      return body?.status === 'ready' && body?.service === 'yozigo-api' && body?.database === 'ok';
    },
  },
];

let failed = 0;

for (const check of checks) {
  try {
    const response = await fetch(`${baseUrl}${check.path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const body = contentType.includes('application/json') ? await response.json() : null;

    if (response.status !== check.expectedStatus || !check.validate(body)) {
      failed += 1;
      console.error(`FAIL ${check.name}: expected HTTP ${check.expectedStatus} and a healthy JSON response; received HTTP ${response.status}.`);
      if (body?.error?.code) console.error(`  API error code: ${body.error.code}`);
      continue;
    }

    console.log(`PASS ${check.name} (${response.status})`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'request timed out after 5 seconds'
      : 'could not connect or read a valid response';
    console.error(`FAIL ${check.name}: ${message} at ${baseUrl}${check.path}`);
  }
}

if (failed > 0) {
  console.error(`Smoke checks failed: ${failed} of ${checks.length} check(s).`);
  process.exitCode = 1;
} else {
  console.log(`All API smoke checks passed against ${baseUrl}.`);
}
