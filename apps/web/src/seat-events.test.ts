import { describe, expect, it } from 'vitest';
import { seatEventConnectionLabel, type SeatEventConnectionState } from './seat-events';

describe('seat event connection status', () => {
  it.each([
    ['connecting', 'Connecting to live seat updates…'],
    ['connected', 'Live seat updates connected.'],
    ['reconnecting', 'Live seat updates disconnected. Reconnecting automatically.'],
    ['unavailable', 'Live seat updates are unavailable. Refresh seat availability manually.'],
  ] as Array<[SeatEventConnectionState, string]>)('describes %s state', (state, expected) => {
    expect(seatEventConnectionLabel(state)).toBe(expected);
  });
});
