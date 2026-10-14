# Seat availability refresh and recovery

The seat picker keeps the most recent successful seat map visible while a refresh is running. Use **Refresh seats** at any time; live seat events continue to trigger background refreshes as well.

## Recovery behavior

- On the first request, the picker shows a loading state. If it fails, it shows a retryable initial error rather than an empty map.
- After a successful load, refreshes do not hide the seat grid.
- If a refresh fails, an accessible warning explains that the visible map may be stale and offers **Try again**.
- Opening another show's seat picker starts a clean loading state; the previous show's map is not shown as current.
- Seat holds and checkout are always validated by the API/database. A visible seat marked available is not a guarantee that a hold will succeed.

## Local verification

1. Start the full-stack app and open a movie's showtime picker, then choose a show.
2. Wait for the seat map to load. Use **Refresh seats** and verify the existing map remains visible.
3. Simulate an API/network failure during refresh. Confirm the previous map remains visible and the stale-availability warning and retry action appear.
4. Restore the API and select **Try again**. Confirm the warning clears after a successful response.
5. Open a different show's seat picker and verify that no seats from the previous show appear while the new request is loading.
6. Verify a seat hold still relies on the API response and that a conflict does not create a local hold.
7. Run `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`.

Payment remains simulated only; do not enter real card details.
