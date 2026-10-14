# Live seat-update recovery

The seat dialog subscribes to the show-scoped Server-Sent Events endpoint. When a seat-map invalidation arrives, the client reloads authoritative seat availability from the API. EventSource reconnects automatically after a transient connection error.

The dialog exposes connection status to assistive technology. While the stream is connecting, reconnecting, or unavailable, customers can use **Refresh seats** to fetch current availability manually. The manual refresh does not create or release a hold; seat selection and hold ownership continue to be validated by the API.

Closing the seat dialog or choosing another show closes the previous EventSource connection. Live events are a freshness hint only; the API and database remain authoritative for seat availability.

## Verification

```powershell
npm test
npm run lint
npm run build
docker compose -f docker-compose.full.yml up --build -d
```

Run the booking lifecycle and operational regression checks described in `docs/booking-lifecycle-e2e.md` and `docs/operational-security-regression.md`. Open a show, temporarily interrupt the API or network, confirm the reconnecting status appears, use **Refresh seats**, and restore connectivity to confirm live updates reconnect. Close the dialog and confirm no further requests are triggered by the old stream.

Payment remains simulated. Do not enter real card details.
