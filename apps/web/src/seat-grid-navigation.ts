export interface NavigableSeat {
  id: string;
  row: string;
  number: number;
}

export type SeatGridNavigationKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

const ROW_ORDER = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Return the next seat to focus for a grid navigation key.
 * Only IDs in focusableSeatIds are considered; null means keep native behavior.
 */
export function getSeatGridNavigationTarget(
  seats: NavigableSeat[],
  currentSeatId: string,
  key: string,
  focusableSeatIds: readonly string[] = seats.map((seat) => seat.id),
): string | null {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return null;
  const focusable = new Set(focusableSeatIds);
  const ordered = seats
    .filter((seat) => focusable.has(seat.id))
    .slice()
    .sort((a, b) => ROW_ORDER.compare(a.row, b.row) || a.number - b.number);
  const current = ordered.find((seat) => seat.id === currentSeatId);
  if (!current) return null;

  const rowSeats = ordered.filter((seat) => seat.row === current.row);
  const rowIndex = rowSeats.findIndex((seat) => seat.id === current.id);
  if (key === 'Home') return rowSeats[0]?.id ?? null;
  if (key === 'End') return rowSeats[rowSeats.length - 1]?.id ?? null;
  if (key === 'ArrowLeft') return rowSeats[rowIndex - 1]?.id ?? null;
  if (key === 'ArrowRight') return rowSeats[rowIndex + 1]?.id ?? null;

  const rows = [...new Set(ordered.map((seat) => seat.row))];
  const currentRowIndex = rows.findIndex((row) => row === current.row);
  const targetRow = rows[currentRowIndex + (key === 'ArrowUp' ? -1 : 1)];
  if (targetRow === undefined) return null;

  const targetSeats = ordered.filter((seat) => seat.row === targetRow);
  return targetSeats
    .slice()
    .sort((a, b) => Math.abs(a.number - current.number) - Math.abs(b.number - current.number) || a.number - b.number)[0]?.id ?? null;
}
