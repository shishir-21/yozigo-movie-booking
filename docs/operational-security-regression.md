# Operational security regression

This dependency-free check validates operational controls on the running full-stack API.

## Run locally

Start the full-stack demo and wait for readiness:

```powershell
docker compose -f docker-compose.full.yml up --build -d
```

Run the booking lifecycle suite first, then the operational suite:

```powershell
npm run e2e:smoke
npm run e2e:ops
```

The operational suite intentionally exhausts the API process's registration rate limiter at the end. To rerun immediately, restart the API container to reset its process-local limiter:

```powershell
docker compose -f docker-compose.full.yml restart api
```

Stop the stack when finished:

```powershell
docker compose -f docker-compose.full.yml down
```

## Coverage

- API liveness and database readiness response shapes.
- `X-Request-Id` generation, safe-ID preservation, and unsafe-ID replacement.
- Helmet security headers and absence of `X-Powered-By`.
- Correlated JSON 404 errors.
- CORS preflight for the configured web origin and absence of CORS permission for an untrusted origin.
- Registration rate limiting, including HTTP 429, `Retry-After`, stable `RATE_LIMITED` code, and request-ID correlation.

The rate-limit test uses invalid demo payloads and creates no account. It is deliberately last because it exhausts the process-local registration bucket. CI runs this script after the booking lifecycle suite. No extra packages, schema changes, or test-only API endpoints are introduced. Payment remains simulated only.
