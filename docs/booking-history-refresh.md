# Booking history refresh and recovery

The **My bookings** view includes a manual refresh action so customers can check the latest booking status after an uncertain checkout outcome.

- Refreshing keeps the last successfully loaded booking list visible.
- A refresh in progress is announced with a status message and the refresh control is disabled to avoid overlapping requests.
- If a refresh fails, the existing list remains visible and the page explains that it could not confirm the latest state. Customers can retry.
- If the first request fails before any bookings load, the initial error state offers a retry action.
- A successful empty response is the only case that displays the “No bookings yet” state.

A client timeout or network error still does not prove that checkout failed. Check booking history and refresh it before attempting checkout again. Payment remains mock-only.
