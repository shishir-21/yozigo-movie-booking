import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishSeatMapInvalidation, subscribeToShow } from './seat-events.js';

afterEach(() => vi.restoreAllMocks());

describe('show-scoped seat events', () => {
  it('notifies only subscribers for the affected show without exposing customer data', () => {
    const first = vi.fn();
    const otherShow = vi.fn();
    const unsubscribe = subscribeToShow('show-a', first);
    subscribeToShow('show-b', otherShow);

    publishSeatMapInvalidation('show-a');

    expect(first).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledWith(expect.objectContaining({ showId: 'show-a', type: 'seat-map-invalidated', occurredAt: expect.any(String) }));
    expect(otherShow).not.toHaveBeenCalled();
    unsubscribe();
    first.mockClear();
    publishSeatMapInvalidation('show-a');
    expect(first).not.toHaveBeenCalled();
  });

  it('supports multiple clients subscribing to one show', () => {
    const first = vi.fn();
    const second = vi.fn();
    subscribeToShow('show-c', first);
    subscribeToShow('show-c', second);

    publishSeatMapInvalidation('show-c');

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });
});
