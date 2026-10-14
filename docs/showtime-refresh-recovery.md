# Showtime refresh and recovery

The showtime picker keeps previously loaded showtimes visible while a refresh request is pending. If the refresh fails, it presents an accessible warning and retry action while preserving the last successful options. A failed initial request instead presents the initial error state; a no-showtimes message is only shown after a successful response with an empty result.

## Local verification

1. Start the full app using the repository setup instructions.
2. Open a movie with upcoming showtimes and wait for options to load.
3. Select **Refresh showtimes** and verify the options remain visible during the request.
4. Simulate a failed request after the first successful load; verify the old options remain visible and the warning provides **Try again**.
5. Open a different movie and confirm the previous movie's showtimes are not displayed.
6. Test a movie with no upcoming shows and confirm the empty state appears only after the successful response.

Run `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`. Payment remains simulated only; do not enter real card details.
