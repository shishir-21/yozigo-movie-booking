import { describe, expect, it } from 'vitest';
import { getSeatGridNavigationTarget, type NavigableSeat } from './seat-grid-navigation';

const seats: NavigableSeat[] = [
  { id: 'a1', row: 'A', number: 1 },
  { id: 'a2', row: 'A', number: 2 },
  { id: 'a4', row: 'A', number: 4 },
  { id: 'b1', row: 'B', number: 1 },
  { id: 'b3', row: 'B', number: 3 },
  { id: 'c2', row: 'C', number: 2 },
];

describe('seat grid keyboard navigation', () => {
  it('moves left and right within the current row without wrapping', () => {
    expect(getSeatGridNavigationTarget(seats, 'a2', 'ArrowLeft')).toBe('a1');
    expect(getSeatGridNavigationTarget(seats, 'a2', 'ArrowRight')).toBe('a4');
    expect(getSeatGridNavigationTarget(seats, 'a1', 'ArrowLeft')).toBeNull();
    expect(getSeatGridNavigationTarget(seats, 'a4', 'ArrowRight')).toBeNull();
  });

  it('moves up or down to the closest numbered seat in an adjacent row', () => {
    expect(getSeatGridNavigationTarget(seats, 'a4', 'ArrowDown')).toBe('b3');
    expect(getSeatGridNavigationTarget(seats, 'b3', 'ArrowUp')).toBe('a4');
    expect(getSeatGridNavigationTarget(seats, 'b3', 'ArrowDown')).toBe('c2');
  });

  it('uses the lower seat number to break equal-distance ties', () => {
    expect(getSeatGridNavigationTarget(seats, 'b1', 'ArrowDown')).toBe('c2');
  });

  it('supports Home and End within the current row', () => {
    expect(getSeatGridNavigationTarget(seats, 'a2', 'Home')).toBe('a1');
    expect(getSeatGridNavigationTarget(seats, 'a2', 'End')).toBe('a4');
  });

  it('skips unavailable or temporarily disabled seats', () => {
    expect(getSeatGridNavigationTarget(seats, 'a1', 'ArrowRight', ['a1', 'a4'])).toBe('a4');
    expect(getSeatGridNavigationTarget(seats, 'a2', 'ArrowRight', ['a1', 'a4'])).toBeNull();
  });

  it('returns null for unsupported keys or a non-focusable current seat', () => {
    expect(getSeatGridNavigationTarget(seats, 'a1', 'Enter')).toBeNull();
    expect(getSeatGridNavigationTarget(seats, 'b1', 'ArrowLeft', ['a1', 'a2'])).toBeNull();
  });
});
