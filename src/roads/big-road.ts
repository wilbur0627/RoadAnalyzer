import { GameResult, RoadGrid, BigRoadColumn } from './types';
import { layoutStreaks } from './layout';

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

  // Convert columns to a visual grid (dragon tails turn right)
  const grid: RoadGrid = layoutStreaks(columns.map((c) => c.cells));

  return { grid, columns };
}
