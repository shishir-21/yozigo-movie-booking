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

The project is delivered in complete implementation stages with end-to-end regression coverage. Required Flows 1–7 take priority over bonus Flows 8–10.

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
- [x] Phase 4: expanded PostgreSQL-backed E2E regression for account profile/password security and multi-seat checkout/cancellation

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

### Authorization regression coverage

The API test suite includes regression checks that:

- unauthenticated booking-history and seat-hold release requests are rejected;
- admin movie endpoints check the user's current database role and reject customer accounts;
- booking history queries are scoped to the authenticated customer;
- cancellation of another customer's booking is rejected without releasing its seat claims;
- hold release queries are scoped to the authenticated customer and do not modify another customer's hold.

These tests are automated regression coverage, not a substitute for a full endpoint-by-endpoint security review or production penetration testing. Run `npm test` and confirm the GitHub Actions CI checks pass for the related pull request.


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

## Booking lifecycle end-to-end regression

Run the full-stack Compose demo first so the API and PostgreSQL are running and seeded. Then execute the dependency-free lifecycle suite:

```powershell
npm run e2e:smoke
```

The suite uses Node.js 22+'s built-in `fetch` and creates uniquely named test customers. It exercises movie/show browsing, seat availability, hold ownership and conflicts, declined mock payment, successful checkout, idempotent checkout retry, booking history, cross-user cancellation protection, owner cancellation, and seat/hold release. It uses the real API and database; it does not use mocked Prisma calls. The test reports each successful checkpoint and exits non-zero on failure without printing credentials or access tokens.

To target another API instance, set `API_BASE_URL` before running the command. For example in PowerShell: `$env:API_BASE_URL = "http://localhost:4000"`. CI builds and starts `docker-compose.full.yml`, waits for the database readiness endpoint, runs this suite, and tears down the Compose stack even when a check fails. Checkout remains mock-only; no card data or real money is used.


## Extended account and multi-seat regression

The existing `npm run e2e:smoke` suite also exercises account settings and multi-seat booking against the real API and PostgreSQL database:

- Updates the signed-in customer's display name and verifies the current-user response.
- Rejects invalid profile names and incorrect current passwords.
- Changes a password, verifies the old password can no longer log in, and verifies the new password works.
- Holds two seats and confirms them in one booking with a server-calculated total.
- Retries the multi-seat checkout and verifies it returns the original booking instead of creating a duplicate.
- Cancels the multi-seat booking and verifies both seats become available again.

Run the suite using the isolated full-stack Docker Compose environment described above. It uses unique test accounts, introduces no additional npm dependencies, and retains mock-only checkout; no card data or real payment is used.

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


## Movie showtime selection

Each movie card shows the next upcoming screening and offers **Choose showtime**. The picker loads all upcoming screenings for that movie, showing the local date/time and ticket price. Choose a screening to open its seat map. The API excludes past shows and returns upcoming showtimes in chronological order. Loading, empty, and retryable error states are shown in the picker.


## Movie catalogue search and filters

The public catalogue supports case-insensitive title search, filtering by the languages present in the loaded catalogue, and sorting by featured order, title (A–Z), or next showtime. Search and language filters can be combined. If no films match, use **Clear filters** to return to the full catalogue. These controls work on the loaded catalogue and do not add API requests.


## Multi-seat booking

Customers can select up to six available seats for one show. Each selected seat is held for five minutes, and checkout confirms all selected seats in one serializable database transaction. The total is calculated server-side as the show's price in paise multiplied by the number of seats. The API accepts the legacy `holdId` field for a single seat and `holdIds` for a multi-seat checkout. If any hold is missing, expired, or no longer owns its unique seat claim, the entire checkout rolls back. Payment remains simulated; no card details are collected and no real money is charged.


## Booking confirmation and ticket handoff

After checkout, the confirmation panel shows the server-returned booking reference, movie, showtime, seats, and total. Customers can open **My bookings** to print their ticket or review/cancel an eligible booking, or return to browsing. Payment is simulated only; the confirmation explicitly states that no real money was charged.


## Customer account settings

Signed-in users can open **Account** from the navigation to update their display name or change their password. The authenticated API endpoints are `PATCH /api/auth/me` with `{ "name": "New Name" }` and `POST /api/auth/me/password` with `{ "currentPassword": "...", "newPassword": "..." }`. Names are trimmed and limited to 2–80 characters; new passwords must contain 8–72 characters and the current password must match. Email and role are read-only. Passwords are hashed with bcrypt and never returned by the API. Account settings do not change booking, ticket, or mock-payment behavior.


## Automated dependency and code security checks

- Dependabot checks npm workspace dependencies and GitHub Actions references weekly and opens update pull requests when updates are available.
- The CodeQL workflow analyzes JavaScript/TypeScript on pull requests to `main`, pushes to `main`, and weekly on a schedule.
- CodeQL uses GitHub's security-events permission to publish analysis results. The workflow declares minimal read permissions for repository contents and Actions.
- Review Dependabot update PRs through the same CI process as application changes; do not merge dependency updates until required checks pass.
- CodeQL results are available in the repository's **Security → Code scanning** area when code scanning is available/enabled for the repository. Repository settings and plan availability can affect whether findings appear there.
- These automated checks complement, but do not replace, dependency review, manual security review, secret management, and production hardening.


## Booking edge-case regression

The full-stack `npm run e2e:smoke` suite additionally verifies hold-request validation, idempotent repeated holds, duplicate hold-ID rejection, and multi-seat checkout atomicity. If one hold is released before checkout, the API must reject the entire checkout, create no partial booking, preserve the remaining active hold, and leave the seat map consistent. The test then cleans up its holds. These checks use the real PostgreSQL-backed API and retain simulated-only checkout.


## Keyboard accessibility and motion preferences

The web app provides a visible keyboard focus indicator, a skip link to the movie catalogue, and reduced-motion support. Check the manual keyboard and motion checklist in [docs/accessibility-smoke-checklist.md](docs/accessibility-smoke-checklist.md).

Before release, verify keyboard-only navigation through sign-in, showtime selection, seat selection, mock checkout, booking history, account settings, and admin dialogs. This checklist complements automated lint, unit tests, build, and end-to-end checks; it is not a claim of formal WCAG certification.


## Web API request timeout behavior

The browser API clients use a 15-second request timeout so a stalled connection cannot leave a request pending indefinitely. Timed-out requests surface the stable client error code `REQUEST_TIMEOUT` and a retry-friendly message; connection failures retain `NETWORK_ERROR`, while HTTP status codes and server error codes are preserved. The auth client accepts an explicit caller-provided `AbortSignal` when needed. This is a client-side wait limit only: for booking checkout, a timeout does not prove that the server failed to complete the request. The checkout endpoint remains idempotent, so refresh booking history before retrying an ambiguous checkout. Payment remains simulated only.


## Accessible cancellation confirmation

The My bookings page confirms cancellations in an in-app accessible dialog showing the booking reference, movie, and showtime. Customers can keep the booking or explicitly confirm cancellation; Escape dismisses the dialog without sending a request. The API remains authoritative for the two-hour cutoff. See [the cancellation confirmation guide](docs/accessible-cancellation-confirmation.md) for the local verification checklist. Payment remains mock-only.


## Movie catalogue refresh and recovery

The catalogue has a **Refresh films** action. While it reloads, the last loaded film cards remain visible and current search/filter/sort selections are preserved. If refresh fails, the page shows an accessible warning and retry action without replacing the existing list with an error-only or empty state. Initial-load errors remain separate. See [the catalogue refresh guide](docs/movie-catalogue-refresh.md) for the manual recovery checklist.


## Showtime refresh and recovery

The showtime picker includes a **Refresh showtimes** action. While a refresh is in progress, previously loaded options remain visible and selectable. If refresh fails, the picker announces the failure and offers a retry without replacing the existing options. Initial-load failures remain distinct and offer their own retry action; the empty state is shown only after a successful response with no upcoming shows. Opening a different movie resets the picker so options from the previous movie are never shown for the new selection.

Verify this behavior with `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`. Also open two different movie showtime pickers, refresh after a successful load, and simulate an API/network failure to confirm the previous options remain visible. Payment stays simulated; do not enter real card details.


## Seat availability refresh and recovery

The seat picker provides a **Refresh seats** action even when live seat events are connected. While refreshing, it keeps the last successful seat map visible. If a refresh fails, it warns that the displayed availability may be stale and offers a retry instead of replacing the map with an error-only screen. Initial-load errors remain distinct, and switching shows never presents the previous show's map as current. Seat holds and checkout are still validated by the API and database; the client-side map is not authoritative. See [the seat refresh recovery guide](docs/seat-refresh-recovery.md) for local verification steps. Payment remains mock-only.


## Accessible seat-hold countdown

The seat picker shows the remaining hold time as minutes and seconds. The countdown summary is not itself a live region, so assistive technology is not asked to announce every second. A separate polite status message changes at meaningful urgency thresholds (one minute remaining, 30 seconds remaining, and expiry). When one or more holds expire, the app removes them from the local selection, refreshes seat availability, and explains that the seats must be selected again if needed. The API/database remain authoritative for holds and checkout.

Verify with `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`. In the seat picker, select a seat and check the countdown, urgency styling, announcements at 60/30 seconds, and expired-hold recovery. Payment remains simulated only.
