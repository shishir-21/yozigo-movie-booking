# Yozigo Movie Booking

A movie ticket booking application for the Yozigo Full-Stack Developer Intern assessment.

## Stack

- Frontend: React, TypeScript, Vite
- API: Node.js, Express, TypeScript
- Database: PostgreSQL 16, Prisma
- Authentication: bcrypt password hashing, JWT
- Validation: Zod
- Tests: Vitest and Supertest
- Local services: Docker Compose

## Development status

The project is being delivered in small, verifiable slices. Required Flows 1–7 take priority over bonus Flows 8–10.

- [x] Initial monorepo, React page shell, API health endpoint
- [x] Initial Prisma data model and idempotent 80-seat seed
- [x] Customer registration/login, bcrypt password hashing, JWT issuance and validation
- [x] Automated auth validation, duplicate-email, and credential tests
- [x] Frontend sign-up/login and session restoration through the protected current-user API
- [x] Frontend auth client tests for registration, API errors, token verification, and network failures
- [x] Public movie catalogue and upcoming showtime APIs backed by PostgreSQL, with frontend loading/error states
- [x] Show-specific seat map and availability API/UI
- [x] Five-minute seat holds, release, expiry, and conflict-safe claim creation
- [x] Mock payment and concurrency-safe booking confirmation API and frontend checkout
- [x] Customer booking history API
- [x] Customer-facing booking history page with loading, empty, and error states
- [x] Admin movie/show management API and overlap validation
- [x] Admin movie/show management frontend
- [x] Bonus Flow 8: customer cancellation of confirmed bookings more than two hours before showtime; seats released atomically
- [x] Bonus Flow 9: admin show reports, occupancy, collection totals, booking list, and seat map
- [x] Bonus Flow 10: show-scoped live seat updates over Server-Sent Events
- [x] Phase 2: admin analytics dashboard with date filters, confirmed-booking metrics, per-show occupancy, and CSV export
- [x] Phase 3: production readiness hardening (rate limits, request tracing, CORS, operational documentation)

**Current limitation:** the catalogue uses fictional demo movies and upcoming shows. Checkout uses a clearly labeled mock payment only; it does not collect card data or charge real money. Real payment-provider integration and refunds are not implemented yet.

## Requirements

- Node.js 22+
- npm
- Docker Desktop or Docker Engine with Compose

## Local setup

1. Clone the repository and enter the folder.
2. Copy the environment template: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`).
3. Start PostgreSQL: `docker compose up -d db`.
4. Install dependencies: `npm install`.
5. Generate Prisma Client: `npm run db:generate`.
6. Apply the development migration: `npm run db:migrate` (enter `init` when prompted for the first migration name).
7. Seed the 80 seats: `npm run db:seed`.
8. Start API and frontend: `npm run dev`.

The API health check is at `http://localhost:4000/api/health`; the web app is at `http://localhost:5173`. The web app defaults to `http://localhost:4000` for API calls. To change it, copy `apps/web/.env.example` to `apps/web/.env.local`, update `VITE_API_BASE_URL`, and restart Vite.

## Movie and show browsing API

- `GET /api/movies` returns the public movie catalogue and each movie's next upcoming show, if one exists.
- `GET /api/movies/:movieId/shows` returns upcoming shows for one movie, ordered by start time. Prices are expressed in paise and start times are ISO timestamps.
- Both endpoints are public. Past shows are excluded.
- `npm run db:seed` preserves the 80-seat seed and creates/updates fictional demo movies with upcoming shows. It is safe to rerun without duplicating seats, catalogue entries, or shows for the same seeded dates.

## Seat availability API

- `GET /api/shows/:showId/seats` returns the fixed cinema seat layout and each seat's availability for the requested show.
- Seats are unavailable when they have an active, unexpired hold for that show or belong to a confirmed booking for that show. Expired holds are ignored.
- Unknown shows return `404 SHOW_NOT_FOUND`; malformed IDs return `400 VALIDATION_ERROR`.
- Seat availability is read from PostgreSQL and reflects active, unexpired holds plus confirmed bookings. Customers can create and release five-minute holds; unique seat claims and serializable transactions prevent competing requests from claiming the same seat.

## Authentication API

All request and response bodies use JSON.

### Register a customer

`POST /api/auth/register`

```json
{
  "name": "Test Customer",
  "email": "customer@example.com",
  "password": "choose-a-password"
}
```

Successful registration returns HTTP `201` with a safe user object and a signed JWT. Passwords are hashed with bcrypt before storage. Public registration always assigns the `CUSTOMER` role.

### Log in

`POST /api/auth/login`

```json
{
  "email": "customer@example.com",
  "password": "choose-a-password"
}
```

Successful login returns HTTP `200` with a safe user object and JWT. Incorrect email/password combinations return the same `401 INVALID_CREDENTIALS` response. Invalid request bodies return `400 VALIDATION_ERROR`; duplicate email addresses return `409 EMAIL_ALREADY_EXISTS`.

### Get the current user

`GET /api/auth/me` requires an `Authorization: Bearer <token>` header. The API verifies the JWT signature and expiry, reloads the user from the database, and returns only public user fields. Missing tokens return `401 UNAUTHORIZED`; invalid or expired tokens return `401 INVALID_TOKEN`.

Configure `JWT_SECRET` as a strong secret of at least 32 characters and set `JWT_EXPIRES_IN` in `.env`. Never commit `.env` or real credentials.

## Database design

- `User`: unique email, display name, password hash, role (`CUSTOMER` or `ADMIN`). Public sign-up always creates customers.
- `Movie`: title, poster URL, language, duration and rating.
- `Show`: a movie's start time and ticket price in paise.
- `Seat`: the fixed 8 × 10 grid, rows A–H and seats 1–10.
- `SeatHold`: a user's temporary hold on one seat for one show, with expiry and status.
- `Booking`: owner, show, amount, status, and optional converted hold.
- `BookingSeat`: seat assignments attached to a booking.

### Booking concurrency design

Correctness is enforced by PostgreSQL constraints and serializable transactions, not only by the UI. A durable `SeatClaim` enforces a single claim per `(showId, seatId)` across active holds and confirmed bookings. Expired claims are cleaned up during hold creation, and booking confirmation converts the existing claim inside the same transaction. The unique constraint remains the final guard against double booking.

## Verification

- API and frontend auth client tests: `npm test`
- Type checks: `npm run lint`
- Production builds: `npm run build`

GitHub Actions runs install, Prisma generation, type checks, tests, and builds on pull requests to `main`. A feature is considered verified only after its PR CI passes and the local app has been tested.

## Security notes

- Never commit `.env` or real credentials.
- Passwords are hashed with bcrypt; no plaintext passwords are stored.
- Admin privileges must be assigned only by trusted seed/admin tooling.
- Protected operations must validate authorization in the API.


## Five-minute seat holds

- `POST /api/shows/:showId/holds` requires a valid bearer JWT and JSON body `{ "seatId": "..." }. A successful response creates a five-minute hold.
- `DELETE /api/shows/:showId/holds/:holdId` releases an active hold owned by the authenticated customer. A customer cannot release another customer's hold.
- Expired `SeatClaim` records are removed during hold creation; the associated `SeatHold` is marked `EXPIRED`. A unique database constraint on `(showId, seatId)` plus a serializable transaction protects claim creation from competing requests. Conflicts return `409 SEAT_UNAVAILABLE`.
- Checkout converts an active hold into a confirmed booking through the serializable booking transaction described below.


## Seat holds, mock checkout, and bookings

- `POST /api/shows/:showId/holds` creates a five-minute hold for an authenticated customer.
- `DELETE /api/shows/:showId/holds/:holdId` releases the customer's active hold.
- `POST /api/shows/:showId/bookings` accepts `{ "holdId": "...", "mockPaymentResult": "SUCCESS" }` and confirms the booking only when the hold is active, unexpired, owned by the signed-in customer, and backed by the unique seat claim. Use `"mockPaymentResult": "DECLINED"` to exercise the declined demo path.
- Booking confirmation, hold conversion, and claim conversion run in a serializable transaction. The unique `(showId, seatId)` claim is retained as the final concurrency guard. Retrying a successful request returns the original booking instead of creating a duplicate.
- `GET /api/bookings/me` returns the authenticated customer's booking history.
- The response explicitly identifies payment as `MOCK`; no payment provider is contacted, no card data is collected, and no real money is charged.


## Admin movie and show management

Admin management endpoints require a bearer JWT belonging to a database user whose role is `ADMIN`. Public registration always creates `CUSTOMER` accounts; do not promote users through public APIs.

- `GET /api/admin/movies` — list movies and show counts.
- `POST /api/admin/movies` — create a movie. Required fields: `title`, `language`, `durationMin`, `rating` (`U`, `UA`, or `A`); `posterUrl` and `description` are optional.
- `PATCH /api/admin/movies/:movieId` — update validated movie fields.
- `DELETE /api/admin/movies/:movieId` — delete a movie only when it has no shows.
- `GET /api/admin/shows` — list scheduled shows with movie metadata.
- `POST /api/admin/shows` — create a show with `movieId`, ISO-8601 `startsAt`, and positive `pricePaise`.
- `PATCH /api/admin/shows/:showId` — update a show.
- `DELETE /api/admin/shows/:showId` — delete a show only when it has no confirmed bookings or seat claims.

The single-screen schedule uses each movie's duration plus a 15-minute turnaround buffer. The API rejects overlapping screenings, including overlaps caused by updates. Show time/movie changes are rejected when confirmed bookings or seat claims already exist. The API returns `403 FORBIDDEN` to authenticated non-admin users and `409 RESOURCE_CONFLICT` for schedule or resource conflicts.

Admin accounts must be provisioned through trusted database/seed tooling; never expose an endpoint that allows a customer to grant themselves the ADMIN role.


## Admin management frontend

Signed-in users whose database-backed role is `ADMIN` see the Admin entry in the navigation. The management dialog uses the protected `/api/admin/movies` and `/api/admin/shows` endpoints to list, create, edit, and delete catalogue entries. The UI displays API validation and schedule conflict messages; authorization and the 15-minute schedule turnaround rules remain enforced by the backend. Provision admin accounts only through trusted database/seed tooling.


## Bonus Flow 8: booking cancellation

- `POST /api/bookings/:bookingId/cancel` requires a valid bearer JWT and only cancels a confirmed booking owned by the signed-in customer.
- Cancellation is rejected when the show starts in two hours or less, including past shows.
- Booking status changes to `CANCELLED` and its booked seat claims are released in the same serializable database transaction, making those seats available again.
- The endpoint returns `404 BOOKING_NOT_FOUND` for missing bookings and bookings owned by another customer; cancellation cutoff and non-confirmed booking attempts return `409`.
- The My Bookings page includes a cancel action for confirmed bookings. The backend is authoritative for the two-hour cutoff.


## Bonus Flow 9: admin show report

- `GET /api/admin/shows/:showId/report` requires an administrator bearer token.
- The report includes show metadata, seat capacity, confirmed seats booked, percentage full, money collected in paise, the seat map, and booking/customer details.
- Only confirmed bookings count toward occupancy and collected-money metrics. Cancelled bookings remain visible in the booking list but their released seats display as available and their amounts are excluded from collection totals.
- The admin management Shows tab provides a Report action with loading, retry/error, refresh, occupancy metrics, seat map, and booking list.


## Bonus Flow 10: live seat availability

- `GET /api/shows/:showId/seat-events` opens a public Server-Sent Events (SSE) stream scoped to one show. Events contain only a seat-map invalidation signal, never customer, authentication, or payment data.
- The frontend opens an `EventSource` while a show’s seat dialog is open. On each invalidation, it reloads the authoritative `GET /api/shows/:showId/seats` response and closes the stream when the dialog closes or the show changes. Browser EventSource reconnects automatically after a network interruption.
- Hold creation/release, booking confirmation, and cancellation publish an immediate show-scoped invalidation. A five-second SSE sync signal also makes seat holds appear available shortly after expiry even if no other mutation occurs.
- SSE is used because this feature sends updates from server to browser only; it does not require a bidirectional WebSocket. PostgreSQL transactions and unique seat claims remain the source of truth for booking concurrency; SSE only prompts clients to refresh availability.


## Admin analytics

- `GET /api/admin/analytics` requires an administrator bearer token and returns summary metrics plus show-by-show performance.
- Optional `from=YYYY-MM-DD` and `to=YYYY-MM-DD` filters apply to show start dates; the end date is inclusive. Invalid dates or a reversed range return `400 VALIDATION_ERROR`.
- Confirmed bookings alone count toward booking totals, seats sold, occupancy, and collection. Cancelled bookings are excluded. All currency values in the API remain in paise.
- The Admin management Analytics tab shows the number of shows, confirmed bookings, seats sold versus capacity, mock-payment collection, and per-show occupancy. CSV export includes report rows and a summary; cells are escaped and spreadsheet-formula prefixes are neutralized.
- Collection values are derived from the assignment's simulated checkout records. This feature does not connect to Razorpay, Stripe, or any real payment provider.


## Production readiness

- Registration and login have separate in-memory rate limits. Defaults are 5 registration attempts and 10 login attempts per client IP per 15-minute window. Configure `AUTH_REGISTER_RATE_LIMIT_MAX`, `AUTH_LOGIN_RATE_LIMIT_MAX`, and `AUTH_RATE_LIMIT_WINDOW_MS` to adjust them.
- Rate limiting is process-local and resets when the API restarts. For a multi-instance deployment, use a shared store or an upstream gateway rate limiter; this in-memory implementation is a baseline, not a distributed abuse-prevention system.
- Every response includes an `X-Request-Id`. A safe incoming ID containing only letters, digits, dot, underscore, or hyphen is preserved; otherwise a UUID is generated. Server error logs include request ID, method, path, and error type, but not request bodies, authorization headers, or raw error messages.
- `WEB_ORIGIN` accepts a comma-separated allowlist of exact browser origins. Keep it limited to the deployed frontend origin(s); do not use wildcard origins for authenticated deployments. Requests without an Origin header remain supported for server-to-server and CLI clients.
- Production deployments must use HTTPS, a strong unique `JWT_SECRET` (at least 32 characters), a production database with restricted credentials, and secrets supplied through the deployment environment rather than committed files. Configure a real shared rate limiter at the edge before exposing multiple API instances.
- `GET /api/health` is a liveness check for the API process. `GET /api/health/ready` runs a lightweight database query and returns `200` only when PostgreSQL is reachable; database failures return a safe `503 DATABASE_UNAVAILABLE` response with a request ID. Checkout remains simulated and does not collect card details or charge real money.


## API smoke checks

With the API running and PostgreSQL available, run the liveness and database-readiness checks:

```bash
npm run smoke
```

The script checks `GET /api/health` and `GET /api/health/ready`, validates their JSON response shapes, and exits with a non-zero code if either check fails. It uses Node.js 22+'s built-in `fetch` and requires no additional package.

To check a deployed API or a different local port, set `API_BASE_URL`:

```bash
API_BASE_URL=https://your-api.example.com npm run smoke
```

PowerShell:

```powershell
$env:API_BASE_URL = "http://localhost:4000"
npm run smoke
```

The readiness check intentionally fails when PostgreSQL is unavailable. Start the database first; for deployed environments, verify the configured database connection and deployment logs if readiness returns `503 DATABASE_UNAVAILABLE`. The smoke script does not create data or exercise authenticated booking flows.


## Full-stack Docker demo

The existing `docker-compose.yml` remains the database-only setup used by the standard local development workflow. To run the complete demo in isolated containers instead, use the separate Compose file:

```powershell
docker compose -f docker-compose.full.yml up --build
```

Then open `http://localhost:8080`. The web container serves the Vite build through Nginx and proxies `/api/*` requests to the API container, so the browser uses a same-origin API URL. The API is also exposed at `http://localhost:4000` for debugging. The full-stack database uses host port `5438` and a separate named volume, so it does not reuse the database-only stack's port or data volume.

The full-stack demo waits for PostgreSQL health, runs Prisma `db push` and the idempotent demo seed, then starts the API and web containers. This automatic schema setup is intended for a disposable assignment/demo environment; use reviewed Prisma migrations and a deliberate deployment process for production data.

To stop the demo:

```powershell
docker compose -f docker-compose.full.yml down
```

Add `-v` only if you intentionally want to delete the full-stack demo database volume. To configure local demo values, set `POSTGRES_PASSWORD`, `JWT_SECRET`, and `WEB_ORIGIN` in your shell before starting Compose. The defaults in this file are for local use only. Never deploy with the example JWT secret or demo database password; use unique secrets, HTTPS, a managed database, and a production migration workflow. Checkout continues to use mock payment only.


## Movie catalogue search and filters

The public catalogue supports case-insensitive title search, filtering by the languages present in the loaded catalogue, and sorting by featured order, title (A–Z), or next showtime. Search and language filters can be combined. If no films match, use **Clear filters** to return to the full catalogue. These controls work on the loaded catalogue and do not add API requests.
