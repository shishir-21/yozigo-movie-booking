# Yozigo Movie Booking

A movie ticket booking application built for the Yozigo Full-Stack Developer Intern assessment.

## Planned stack

- **Frontend:** React, TypeScript, Vite
- **API:** Node.js, Express, TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** email/password, bcrypt password hashing, JWT
- **Testing:** Vitest and Supertest for API tests; concurrency tests for double booking
- **Local development:** Docker Compose

## Development status

This project is being implemented in staged, testable slices. Required flows 1–7 take priority over optional flows 8–10.

- [x] Project foundation, database model, local services, API health check
- [ ] Customer authentication and authorization
- [ ] Movie and show browsing
- [ ] Seat map, seat holds, and expiration
- [ ] Mock payments and concurrency-safe booking confirmation
- [ ] Customer booking history
- [ ] Admin movie/show management and overlap validation
- [ ] Optional flows 8–10

The checklist will be updated as each slice is implemented and verified.

## Prerequisites

- Node.js 22 or later
- npm
- Docker Desktop with Docker Compose

## Setup

1. Copy `.env.example` to `.env`.
2. Start PostgreSQL with `docker compose up -d db`.
3. Install workspace dependencies with `npm install`.
4. Generate Prisma Client and apply migrations: `npm run db:generate`, then `npm run db:migrate`.
5. Start the API and web app with `npm run dev`.

See the package scripts in the root and workspace package manifests for the exact commands. Do not commit real secrets or your local `.env` file.

## Database design

- `User`: customer/admin identity, unique email, hashed password, role.
- `Movie`: movie metadata and rating.
- `Show`: movie, start time, ticket price. The application validates the single-screen schedule for overlaps.
- `Seat`: fixed seat identities (rows A–H, numbers 1–10).
- `SeatHold`: temporary ownership of a seat for a show, with expiry.
- `Booking`: booking owner, show, total amount and status.
- `BookingSeat`: seats attached to a booking.

Booking safety relies on a PostgreSQL transaction and database uniqueness for `(showId, seatId)` among active holds/bookings. Expired holds must be treated as available and cleaned/ignored transactionally; application checks alone are not sufficient. The implementation will document the specific constraints and test coverage as booking endpoints are added.

## Test accounts

Seeded test customer and admin credentials will be documented here when the seed script is added. Never use production credentials in this section.

## Tests

Run `npm test` from the repository root. The critical booking tests will include concurrent attempts to acquire the same seat and assert that at most one request succeeds.

## Security notes

- Passwords are stored as hashes, never plaintext.
- Admin role is assigned only by trusted seed/admin tooling, not public sign-up.
- Protected routes are checked by the API, not only hidden in the frontend.
- Configure strong local secrets in `.env`; do not commit them.