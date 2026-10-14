# Keyboard navigation for seat selection

The seat picker supports standard button activation with Enter/Space and adds optional arrow-key navigation for keyboard users.

## Keyboard controls

- **Left / Right:** move to the previous or next focusable seat in the same row.
- **Up / Down:** move to the nearest-numbered focusable seat in the adjacent row.
- **Home / End:** move to the first or last focusable seat in the current row.
- **Enter / Space:** keep native button activation to select or release a seat.

Navigation skips unavailable seats and buttons disabled while a hold or refresh operation is in progress. Reaching a row boundary does not wrap focus. Arrow keys only move focus; they never create or release a hold.

## Local verification

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Open a show and use Tab to focus an available seat.
3. Use Left/Right within a row, Up/Down between rows, and Home/End within a row.
4. Confirm unavailable seats and temporarily disabled seats are skipped.
5. Confirm Enter/Space still selects or releases a seat and arrow navigation alone does not change the selection.
6. Run `npm run e2e:smoke` and `npm run e2e:ops` against the full-stack Compose environment.

The API/database remain authoritative for holds and checkout. Payment stays simulated; no real card data is collected.
