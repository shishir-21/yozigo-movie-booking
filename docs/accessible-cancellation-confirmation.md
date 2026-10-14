# Accessible booking cancellation confirmation

The My bookings page uses an in-app confirmation dialog before sending a cancellation request.

## Behavior

- The dialog shows the booking reference, movie title, and showtime so the customer can verify the booking.
- **Keep booking** closes the dialog without making an API request. Escape also dismisses the dialog.
- **Confirm cancellation** sends the existing authenticated cancellation request once.
- The API remains authoritative for the two-hour cancellation cutoff; the dialog explains the rule but does not try to enforce it client-side.
- Timeout and network failures retain the existing ambiguous-outcome recovery message and refresh booking history. Definitive API errors retain their server-provided message.

## Local verification

1. Open **My bookings** for an account with a confirmed booking.
2. Select **Cancel booking** and verify the dialog identifies the correct movie, reference, and showtime.
3. Select **Keep booking** and verify the booking remains confirmed and no cancellation request is sent.
4. Reopen the dialog and select **Confirm cancellation**; verify the refreshed booking status.
5. Try keyboard navigation and Escape dismissal.
6. Verify a booking inside the two-hour cutoff is rejected by the API with its existing error message.
7. Run `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`.

Checkout and payment remain simulated only.
