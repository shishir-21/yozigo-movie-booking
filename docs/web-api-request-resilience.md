# Web API request resilience

The browser clients for authentication/account settings, movie browsing, seat availability, seat holds, and booking operations apply a 15-second request deadline.

- A deadline expiry becomes a client-side `ApiError` with code `REQUEST_TIMEOUT` and status `0`.
- Connection failures continue to use `NETWORK_ERROR`.
- HTTP failures preserve the server's status and error code.
- Authentication requests can receive an explicit `AbortSignal`; otherwise the request deadline is applied.
- Do not interpret a checkout timeout as proof that the server did not commit the booking. The checkout API is idempotent; refresh **My bookings** before retrying an ambiguous request.
- Aborted requests are not rewritten as network failures.

## Verify locally

```powershell
npm install
npm run db:generate
npm run lint
npm test
npm run build

docker compose -f docker-compose.full.yml up --build -d
npm run e2e:smoke
npm run e2e:ops
docker compose -f docker-compose.full.yml down
```

The full-stack tests still use PostgreSQL and the actual API. Payment remains simulated only; no card data or real payment provider is involved.
