import { GameResult, RoadCell, RoadGrid, BigRoadColumn } from './types';
import { ROAD_CONFIG } from '../shared/constants';

const { MAX_ROWS } = ROAD_CONFIG;

/**
 * Build the Big Road (大路) from game results.
 * Returns both the visual grid and the column structure (needed for derived roads).
 */
export function buildBigRoad(results: GameResult[]): {
  grid: RoadGrid;
  columns: BigRoadColumn[];
} {
  const columns: BigRoadColumn[] = [];

  for (const result of results) {
    if (result.outcome === 'T') {
      // Ties don't create new columns — they attach to the last non-tie cell
      if (columns.length > 0) {
        const lastCol = columns[columns.length - 1];
        lastCol.tiesAtEnd++;
        const lastCell = lastCol.cells[lastCol.cells.length - 1];
        if (lastCell) {
          lastCell.tieCount = (lastCell.tieCount ?? 0) + 1;
        }
      }
      continue;
    }

    const outcome = result.outcome; // 'B' or 'P'
    const color = outcome === 'B' ? 'red' : 'blue' as const;

    if (columns.length === 0 || columns[columns.length - 1].outcome !== outcome) {
      // New column — different outcome from previous
      columns.push({
        outcome,
        cells: [{
          color,
          bankerPair: result.bankerPair,
          playerPair: result.playerPair,
        }],
        tiesAtEnd: 0,
      });
    } else {
      // Continue in same column — same outcome
      columns[columns.length - 1].cells.push({
        color,
        bankerPair: result.bankerPair,
        playerPair: result.playerPair,
      });
    }
  }

  // Convert columns to a visual grid
  const grid = columnsToGrid(columns);

  return { grid, columns };
}

/**
 * Convert BigRoad columns to a visual grid.
 * Handles "dragon tail" — when a column exceeds MAX_ROWS,
 * it extends rightward on the bottom row.
 */
function columnsToGrid(columns: BigRoadColumn[]): RoadGrid {
  if (columns.length === 0) return [];

  // Track occupied cells: Map<`col,row`> -> true
  const occupied = new Map<string, boolean>();
  const gridCells: { col: number; row: number; cell: RoadCell }[] = [];

  let gridCol = 0;

  for (const column of columns) {
    let currentCol = gridCol;
    let currentRow = 0;

    for (let i = 0; i < column.cells.length; i++) {
      if (i < MAX_ROWS) {
        // Normal placement — go downward
        // Check if the cell below is occupied (from a previous dragon tail)
        while (occupied.has(`${currentCol},${currentRow}`)) {
          currentCol++;
        }
        if (i > 0) {
          currentCol = gridCol; // Reset to column start for non-first cells
          currentRow = i;
          // If this cell is occupied, we need to dragon tail
          if (occupied.has(`${currentCol},${currentRow}`)) {
            // Find free spot to the right on the previous row
            currentRow = i - 1;
            currentCol = gridCol + 1;
            while (occupied.has(`${currentCol},${currentRow}`)) {
              currentCol++;
            }
          }
        }
      } else {
        // Dragon tail — extend right on the last row
        currentRow = MAX_ROWS - 1;
        currentCol = gridCol + (i - MAX_ROWS + 1);
        while (occupied.has(`${currentCol},${currentRow}`)) {
          currentCol++;
        }
      }

      const key = `${currentCol},${currentRow}`;
      occupied.set(key, true);
      gridCells.push({ col: currentCol, row: currentRow, cell: column.cells[i] });
    }

    // Next column starts after the rightmost cell used
    gridCol = Math.max(gridCol + 1, ...gridCells
      .filter((_, idx) => idx >= gridCells.length - column.cells.length)
      .map(c => c.col + 1));
  }

  // Build the 2D grid
  if (gridCells.length === 0) return [];

  const maxCol = Math.max(...gridCells.map(c => c.col));
  const grid: RoadGrid = [];

  for (let col = 0; col <= maxCol; col++) {
    const column: (RoadCell | null)[] = new Array(MAX_ROWS).fill(null);
    for (const entry of gridCells) {
      if (entry.col === col) {
        column[entry.row] = entry.cell;
      }
    }
    grid.push(column);
  }

  return grid;
}
