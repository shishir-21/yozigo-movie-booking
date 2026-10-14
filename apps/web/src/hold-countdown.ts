export type HoldCountdownUrgency = 'normal' | 'warning' | 'urgent' | 'expired';

/** Formats a remaining hold duration as m:ss, clamping invalid values to zero. */
export function formatHoldCountdown(seconds: number): string {
  const remaining = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
}

/** Returns a stable urgency bucket so live announcements do not change every second. */
export function getHoldCountdownUrgency(seconds: number): HoldCountdownUrgency {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'expired';
  if (seconds <= 30) return 'urgent';
  if (seconds <= 60) return 'warning';
  return 'normal';
}

/** Message changes only when urgency changes, avoiding a screen-reader announcement per tick. */
export function getHoldCountdownMessage(urgency: HoldCountdownUrgency): string {
  switch (urgency) {
    case 'warning': return 'Your seat hold expires in one minute.';
    case 'urgent': return 'Your seat hold expires in 30 seconds. Complete your demo booking or release the seats.';
    case 'expired': return 'Your seat hold has expired. Seat availability is being refreshed.';
    case 'normal': return 'Your seats are held. The countdown updates every second.';
  }
}
