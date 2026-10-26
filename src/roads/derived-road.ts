import { BigRoadColumn, DerivedRoadCell, DerivedRoadGrid } from './types';
import { layoutStreaks } from './layout';

/**
 * Build a derived road from Big Road columns.
 *
 * All three derived roads (Big Eye Boy, Small Road, Cockroach Pig) use the
 * same algorithm with different column offsets:
 * - Big Eye Boy: offset = 1 (compare with n-1)
 * - Small Road: offset = 2 (compare with n-2)
 * - Cockroach Pig: offset = 3 (compare with n-3)
 *
 * Rules:
 * - The derived road starts at the Big Road cell in column `offset`, row 1
 *   (or column `offset + 1`, row 0 if that column has a single cell).
 * - For each Big Road cell from there on:
 *   - If the cell starts a NEW column in the Big Road:
 *     Compare the length of the previous column with the column `offset` columns before it.
 *     If equal length → RED (consistent), otherwise → BLUE (chaotic).
 *   - If the cell CONTINUES an existing column:
 *     Look at the comparison column (current_col - offset) at the same depth.
 *     It has a cell there → RED; it ended exactly one row above → BLUE;
 *     it ended two or more rows above → RED.
 */
export function derivedRoadEntries(columns: BigRoadColumn[], offset: number): DerivedRoadCell[] {
  const entries: DerivedRoadCell[] = [];

  if (columns.length <= offset) return [];

  for (let colIdx = 0; colIdx < columns.length; colIdx++) {
    const col = columns[colIdx];

    for (let cellIdx = 0; cellIdx < col.cells.length; cellIdx++) {
      let isRed: boolean;

      if (cellIdx === 0) {
        // First cell of a new column
        // Need at least offset+1 columns to start comparing
        if (colIdx <= offset) continue;

        // Compare previous column length with the column `offset` back
        const prevColLen = columns[colIdx - 1].cells.length;
        const compareColLen = columns[colIdx - 1 - offset].cells.length;
        isRed = prevColLen === compareColLen;
      } else {
        // Continuing cell in an existing column
        const compareColIdx = colIdx - offset;
        if (compareColIdx < 0) continue;

        // Blue only when the comparison column's last cell is one row above this one
        isRed = cellIdx !== columns[compareColIdx].cells.length;
      }

      entries.push({ color: isRed ? 'red' : 'blue' });
    }
  }

  return entries;
}

/** Lay out a derived road like the Big Road: same colors stack down, a new color starts a new column */
export function buildDerivedRoad(columns: BigRoadColumn[], offset: number): DerivedRoadGrid {
  const streaks: DerivedRoadCell[][] = [];
  for (const entry of derivedRoadEntries(columns, offset)) {
    const last = streaks[streaks.length - 1];
    if (last && last[0].color === entry.color) last.push(entry);
    else streaks.push([entry]);
  }
  return layoutStreaks(streaks);
}

/** Big Eye Boy Road (大眼仔路) — offset 1 */
export function buildBigEyeBoy(columns: BigRoadColumn[]): DerivedRoadGrid {
  return buildDerivedRoad(columns, 1);
}

/** Small Road (小路) — offset 2 */
export function buildSmallRoad(columns: BigRoadColumn[]): DerivedRoadGrid {
  return buildDerivedRoad(columns, 2);
}

/** Cockroach Pig Road (曱甴路) — offset 3 */
export function buildCockroachPig(columns: BigRoadColumn[]): DerivedRoadGrid {
  return buildDerivedRoad(columns, 3);
}
