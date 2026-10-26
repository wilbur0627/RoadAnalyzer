import { ROAD_CONFIG } from '../shared/constants';

const { MAX_ROWS } = ROAD_CONFIG;

/**
 * Lay out streaks the way the Big Road and the derived roads are drawn.
 *
 * Each streak starts at the top of the column right after the previous
 * streak's first column and goes down. When it reaches the bottom row, or the
 * cell below is taken by an earlier streak's dragon tail, it turns right and
 * continues along that row.
 *
 * Returns a grid indexed [column][row].
 */
export function layoutStreaks<T>(streaks: T[][]): (T | null)[][] {
  const occupied = new Set<string>();
  const at = (col: number, row: number) => `${col},${row}`;
  const placed: { col: number; row: number; cell: T }[] = [];

  let startCol = 0;
  for (const streak of streaks) {
    if (streak.length === 0) continue;
    // Only an earlier tail that turned on the top row can take a start cell
    while (occupied.has(at(startCol, 0))) startCol++;

    let col = startCol;
    let row = 0;
    let turned = false;
    streak.forEach((cell, i) => {
      if (i > 0) {
        if (!turned && row + 1 < MAX_ROWS && !occupied.has(at(col, row + 1))) {
          row++;
        } else {
          // Dragon tail: once turned, keep going right
          turned = true;
          col++;
          while (occupied.has(at(col, row))) col++;
        }
      }
      occupied.add(at(col, row));
      placed.push({ col, row, cell });
    });

    startCol++;
  }

  if (placed.length === 0) return [];

  const width = Math.max(...placed.map((p) => p.col)) + 1;
  const grid: (T | null)[][] = Array.from({ length: width }, () => new Array<T | null>(MAX_ROWS).fill(null));
  for (const { col, row, cell } of placed) grid[col][row] = cell;
  return grid;
}
