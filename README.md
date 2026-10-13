# Yozigo Movie Booking

A movie ticket booking application for the Yozigo Full-Stack Developer Intern assessment.

## Stack

- Frontend: React, TypeScript, Vite
- API: Node.js, Express, TypeScript
- Database: PostgreSQL 16, Prisma
- Auth (next slice): bcrypt password hashing, JWT
- Tests: Vitest and Supertest
- Local services: Docker Compose

## Development status

The project is being delivered in small, verifiable slices. Required Flows 1–7 take priority over bonus Flows 8–10.

- [x] Initial monorepo, React page shell, API health endpoint
- [x] Initial Prisma data model and idempotent 80-seat seed
- [x] Initial API health and unknown-route tests
- [ ] Verify install, generated Prisma client, TypeScript builds and tests in CI/local environment
- [ ] Customer sign-up/login and API authorization
- [ ] Movie/show browsing backed by PostgreSQL
- [ ] Seat map, 5-minute seat holds and expiry
- [ ] Mock payment and concurrency-safe booking confirmation
- [ ] Customer booking history
- [ ] Admin movie/show management and overlap validation
- [ ] Bonus Flows 8–10

**Current limitation:** the landing page currently uses demonstration movie data, and booking controls are intentionally disabled until the API features are implemented. The complete booking flow is not done yet.

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
6. Apply the development migration: `npm run db:migrate`.
7. Seed the 80 seats: `npm run db:seed`.
8. Start API and frontend: `npm run dev`.

The API health check will be available at `http://localhost:4000/api/health`; the web app will be at `http://localhost:5173`.

## Database design

- `User`: unique email, display name, password hash, role (`CUSTOMER` or `ADMIN`). Public sign-up will always create customers.
- `Movie`: title, poster URL, language, duration and rating.
- `Show`: a movie's start time and ticket price in paise.
- `Seat`: the fixed 8 × 10 grid, rows A–H and seats 1–10.
- `SeatHold`: a user's temporary hold on one seat for one show, with expiry and status.
- `Booking`: owner, show, amount, status, and optional converted hold.
- `BookingSeat`: seat assignments attached to a booking.

### Booking concurrency design (to be completed with Flow 4/5)

Correctness must be enforced by PostgreSQL transactions and constraints, not only by the UI. A key schema detail still needed is a database-enforced single active claim per `(showId, seatId)` across both current holds and confirmed bookings. PostgreSQL cannot express a time-dependent partial uniqueness rule using `expiresAt > now()`; the implementation will therefore use an explicit claim/seat-allocation model or transactional row locking plus durable uniqueness. The double-booking test must exercise concurrent database transactions against PostgreSQL.

## Test accounts

Test customer and admin credentials will be added with the trusted seed script when authentication is implemented. They are not available in this foundation slice.

## Verification

- API smoke tests: `npm test`
- Type checks: `npm run lint`
- Production builds: `npm run build`

A GitHub Actions workflow is configured to run install, Prisma generation, type checks, tests, and builds on pushes and pull requests. Its status should be checked before treating a slice as verified.

## Security notes

- Never commit `.env` or real credentials.
- Passwords will be hashed with bcrypt; no plaintext passwords are stored.
- Admin privileges are assigned only by trusted seed/admin tooling.
- All protected operations will validate authorization in the API.
