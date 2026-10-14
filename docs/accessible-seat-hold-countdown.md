# Accessible seat-hold countdown

## Behavior

- The selected-seat summary displays the remaining hold duration as `m:ss`.
- The timer text is not a live region; this avoids asking screen readers to announce every one-second update.
- A separate polite status message changes when urgency moves into the final minute, final 30 seconds, or expired state.
- When a hold expires, the expired hold is removed from the active selection and seat availability is refreshed. The user receives a clear notice that seats may need to be selected again.
- The server remains authoritative. A local countdown does not extend a hold or guarantee that checkout will succeed.

## Local verification

1. Start the app and sign in.
2. Open a show, select a seat, and confirm the countdown starts at about five minutes.
3. Verify the visible timer changes every second but the live announcement remains stable within the same urgency state.
4. Test the final-minute and final-30-second messages by using a short-lived hold in a controlled test environment or by testing the countdown helper's boundary values.
5. Allow a hold to expire and verify the seat is removed from the selected list, seat availability refreshes, and a status notice explains recovery.
6. Run `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`.

Payment remains mock-only; do not enter real card details.
