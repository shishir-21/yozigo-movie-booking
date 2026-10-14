# Booking lifecycle end-to-end regression

## Run locally

Requirements: Node.js 22+, npm, and Docker Compose.

From the repository root, start the isolated full-stack demo:

```powershell
docker compose -f docker-compose.full.yml up --build -d
```

Wait until the API and database readiness endpoint responds successfully, then run:

```powershell
npm run e2e:smoke
```

The default API URL is `http://localhost:4000`. Override it with PowerShell when testing another local or staging API:

```powershell
$env:API_BASE_URL = "http://localhost:4000"
npm run e2e:smoke
```

When finished, stop the stack:

```powershell
docker compose -f docker-compose.full.yml down
```

Only add `-v` if you deliberately want to delete the disposable full-stack demo database volume.

## What the suite verifies

The script uses Node.js built-in `fetch` and talks to the real API backed by PostgreSQL. It creates unique test customers and verifies:

1. API/database readiness and seeded movie/showtime discovery.
2. Seat-map loading and a customer's successful seat hold.
3. A competing customer cannot hold the same seat.
4. A declined mock payment does not create a booking.
5. Successful checkout confirms the held seat and labels payment as `MOCK`.
6. Retrying checkout returns the same booking instead of duplicating it.
7. The confirmed booking appears in the customer's booking history.
8. A different customer cannot cancel the booking.
9. The owner can cancel a show that is more than two hours away and the seat becomes available.
10. Another customer can hold the released seat, cannot have their hold released by someone else, and can release their own hold.
11. Unauthenticated requests to admin analytics and show reports receive `401 UNAUTHORIZED`.
12. Authenticated customers receive `403 FORBIDDEN` when requesting admin analytics or a show report.
13. A real seat hold emits a `seat-map-invalidated` event on the show-scoped SSE stream. The event payload is checked to remain an empty object without customer, payment, or token data.
14. Customers can update their display name, invalid names are rejected, and the current-user endpoint returns the saved profile.
15. Password changes reject an incorrect current password; after a successful change, the old password fails and the new password succeeds.
16. A two-seat checkout creates one confirmed booking with the correct total, returns the same booking on retry, and cancellation releases both seats.
17. Invalid hold requests and duplicate hold IDs are rejected with `400 VALIDATION_ERROR`.
18. Repeating a hold request by its owner returns the same active hold rather than creating a second one.
19. A multi-seat checkout with one released hold fails with `409 HOLD_EXPIRED`; no partial booking is created, the remaining active hold stays owned by the customer, and cleanup releases the test seats.

The suite uses unique email addresses and does not print tokens or passwords. Test data remains in the full-stack demo database; use the isolated Compose stack rather than a production database.

## CI behavior

The CI workflow validates Compose, builds the full-stack images, starts the isolated services, waits for `/api/health/ready`, runs the lifecycle suite, and always tears down the containers and disposable database volume. A passing E2E run verifies this tested API/database lifecycle; it does not replace browser-level usability testing or prove that every possible booking scenario is defect-free.

Payment remains simulated. The suite does not contact a payment provider, collect card details, or charge real money.


## Booking edge-case and atomicity checks

The E2E suite also verifies that malformed hold requests and duplicate multi-seat hold IDs fail validation, repeated hold requests reuse the existing active hold, and a checkout cannot partially confirm seats when one of its holds has been released. The atomicity check inspects the authoritative seat map and the customer's booking history, then releases any remaining test hold so the isolated demo database is left in a predictable state. These checks run through the same `npm run e2e:smoke` command and do not require extra packages or test-only API endpoints.
