type Listener = (event: SeatAvailabilityEvent) => void;

export interface SeatAvailabilityEvent {
  showId: string;
  type: 'seat-map-invalidated';
  occurredAt: string;
}

const listeners = new Map<string, Set<Listener>>();

export function subscribeToShow(showId: string, listener: Listener): () => void {
  const showListeners = listeners.get(showId) ?? new Set<Listener>();
  showListeners.add(listener);
  listeners.set(showId, showListeners);
  return () => {
    showListeners.delete(listener);
    if (showListeners.size === 0) listeners.delete(showId);
  };
}

export function publishSeatMapInvalidation(showId: string): void {
  const event: SeatAvailabilityEvent = { showId, type: 'seat-map-invalidated', occurredAt: new Date().toISOString() };
  for (const listener of listeners.get(showId) ?? []) listener(event);
}
