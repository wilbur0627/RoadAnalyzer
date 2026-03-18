import { BigRoadColumn, DerivedRoadCell, DerivedRoadGrid } from './types';
import { ROAD_CONFIG } from '../shared/constants';

const { MAX_ROWS } = ROAD_CONFIG;

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
 * - The derived road starts when there are enough columns in the Big Road
 *   (offset + 1 columns needed for the first entry).
 * - For each new cell added to the Big Road:
 *   - If the cell starts a NEW column in the Big Road:
 *     Compare the length of the previous column with the column `offset` columns before it.
 *     If equal length → RED (consistent), otherwise → BLUE (chaotic).
 *   - If the cell CONTINUES an existing column:
 *     Check if the comparison column (current_col - offset) has a cell at the same depth.
 *     If yes → RED, if no → BLUE.
 */
export function buildDerivedRoad(columns: BigRoadColumn[], offset: number): DerivedRoadGrid {
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

        const compareCol = columns[compareColIdx];
        // Check if the comparison column has a cell at the same depth
        isRed = cellIdx < compareCol.cells.length;
      }

      entries.push({ color: isRed ? 'red' : 'blue' });
    }
  }

  // Lay out entries into a grid (same as bead plate: fill top-to-bottom, left-to-right)
  return entriesToGrid(entries);
}

function entriesToGrid(entries: DerivedRoadCell[]): DerivedRoadGrid {
  if (entries.length === 0) return [];

  const totalCols = Math.ceil(entries.length / MAX_ROWS);
  const grid: DerivedRoadGrid = [];

  for (let col = 0; col < totalCols; col++) {
    const column: (DerivedRoadCell | null)[] = new Array(MAX_ROWS).fill(null);

    for (let row = 0; row < MAX_ROWS; row++) {
      const idx = col * MAX_ROWS + row;
      if (idx >= entries.length) break;
      column[row] = entries[idx];
    }

    grid.push(column);
  }

  return grid;
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
