# Movie catalogue refresh and recovery

The movie catalogue supports an explicit **Refresh films** action.

## Behavior

- Refreshing keeps the currently loaded movie cards and filters visible.
- A successful refresh replaces the catalogue with the latest API response and clears a previous refresh warning.
- If a refresh fails, the previously loaded films remain visible and a warning explains that the displayed results may be stale. **Try again** retries the request.
- An initial-load failure remains distinct from a refresh failure and offers a retry action.
- Refresh progress and errors are announced with status/alert semantics. Refresh is disabled while a refresh is already running.
- Search, language filter, and sort state are preserved during refresh.

## Local verification

1. Start the full-stack app with PostgreSQL and the API available.
2. Open the movie catalogue and wait for the film cards to load.
3. Select **Refresh films** and confirm the existing cards remain visible while the request is pending.
4. Confirm a successful refresh updates the list without clearing search, language, or sort selections.
5. Simulate an API/network failure during refresh; verify the prior cards remain visible and a retry warning appears.
6. Select **Try again** and verify the warning clears after a successful response.
7. Test initial load while the API is unavailable; verify the initial error state includes a retry action.
8. Run `npm test`, `npm run lint`, and `npm run build`, then run `npm run e2e:smoke` and `npm run e2e:ops` against the full-stack Compose demo.

Payment remains simulated only; no payment provider or card data is involved.
