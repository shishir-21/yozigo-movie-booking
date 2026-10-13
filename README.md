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
- [ ] Movie/show browsing backed by PostgreSQL
- [ ] Seat map, 5-minute seat holds and expiry
- [ ] Mock payment and concurrency-safe booking confirmation
- [ ] Customer booking history
- [ ] Admin movie/show management and overlap validation
- [ ] Bonus Flows 8–10

**Current limitation:** the landing page currently uses demonstration movie data, and booking controls are intentionally disabled until the movie/show and booking APIs are implemented. Authentication is available through the Sign in and Create account controls; the complete booking flow is not done yet.

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

### Booking concurrency design (to be completed with Flow 4/5)

Correctness must be enforced by PostgreSQL transactions and constraints, not only by the UI. A key schema detail still needed is a database-enforced single active claim per `(showId, seatId)` across both current holds and confirmed bookings. PostgreSQL cannot express a time-dependent partial uniqueness rule using `expiresAt > now()`; the implementation will therefore use an explicit claim/seat-allocation model or transactional row locking plus durable uniqueness. The double-booking test must exercise concurrent database transactions against PostgreSQL.

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
