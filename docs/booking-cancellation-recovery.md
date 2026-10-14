# Booking cancellation recovery

A cancellation request can time out or lose its connection after the API has already processed it. In that case the browser cannot safely conclude that cancellation failed.

When a cancellation returns the client-side `REQUEST_TIMEOUT` or `NETWORK_ERROR` code, My bookings shows an ambiguity warning and automatically refreshes the booking list. The refreshed booking status is authoritative. If the refresh also fails, the previously loaded list remains visible with a separate refresh error and retry action.

Do not tell the customer to immediately repeat a cancellation after a timeout. Refresh My bookings and check whether the booking is already marked cancelled. Definitive API errors, such as the two-hour cancellation cutoff, continue to show the server's message.

## Verify locally (PowerShell)

```powershell
npm install
npm run db:generate
npm test
npm run lint
npm run build
docker compose -f docker-compose.full.yml up --build -d
npm run e2e:smoke
npm run e2e:ops
docker compose -f docker-compose.full.yml down
```

Also manually simulate a timeout/network failure during cancellation. Confirm the warning appears, booking history refreshes, and a failed refresh does not erase the last loaded list. Verify that a definitive cancellation rejection still displays its API error.

Checkout and payment remain simulated only. No payment provider or card data is used.
