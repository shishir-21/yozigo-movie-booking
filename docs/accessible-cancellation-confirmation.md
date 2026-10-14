# Accessible booking cancellation confirmation

The My bookings page uses an in-app confirmation dialog before sending a cancellation request.

## Behavior

- The dialog shows the booking reference, movie title, and showtime so the customer can verify the booking.
- **Keep booking** closes the dialog without making an API request. Escape also dismisses the dialog.
- **Confirm cancellation** sends the existing authenticated cancellation request once.
- Keyboard focus is contained in the active modal. When the cancellation confirmation closes, focus returns to the cancel button that opened it if that button still exists.
- The parent booking dialog is hidden from assistive technology while the nested confirmation is active.
- The API remains authoritative for the two-hour cancellation cutoff; the dialog explains the rule but does not try to enforce it client-side.
- Timeout and network failures retain the existing ambiguous-outcome recovery message and refresh booking history. Definitive API errors retain their server-provided message.

## Local verification

1. Open **My bookings** for an account with a confirmed booking.
2. Select **Cancel booking** and verify the dialog identifies the correct movie, reference, and showtime.
3. Use Tab and Shift+Tab repeatedly; focus must remain in the cancellation dialog and wrap at both ends.
4. Select **Keep booking** and verify focus returns to the **Cancel booking** button, the booking remains confirmed, and no cancellation request is sent.
5. Reopen the dialog and select **Confirm cancellation**; verify the refreshed booking status.
6. Press Escape to dismiss the confirmation without sending a request.
7. Verify a booking inside the two-hour cutoff is rejected by the API with its existing error message.
8. Run `npm test`, `npm run lint`, `npm run build`, `npm run e2e:smoke`, and `npm run e2e:ops`.

Checkout and payment remain simulated only.
