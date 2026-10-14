export type SeatEventConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'unavailable';

export function seatEventConnectionLabel(state: SeatEventConnectionState): string {
  switch (state) {
    case 'connected':
      return 'Live seat updates connected.';
    case 'reconnecting':
      return 'Live seat updates disconnected. Reconnecting automatically.';
    case 'unavailable':
      return 'Live seat updates are unavailable. Refresh seat availability manually.';
    case 'connecting':
      return 'Connecting to live seat updates…';
  }
}
