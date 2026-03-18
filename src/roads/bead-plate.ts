import { GameResult, RoadCell, RoadGrid } from './types';
import { ROAD_CONFIG } from '../shared/constants';

const { MAX_ROWS } = ROAD_CONFIG;

/**
 * Build the Bead Plate (珠盤路) from game results.
 * Simplest road: fill cells left-to-right, top-to-bottom.
 * Every result (including ties) gets its own cell.
 */
export function buildBeadPlate(results: GameResult[]): RoadGrid {
  if (results.length === 0) return [];

  const totalCols = Math.ceil(results.length / MAX_ROWS);
  const grid: RoadGrid = [];

  for (let col = 0; col < totalCols; col++) {
    const column: (RoadCell | null)[] = new Array(MAX_ROWS).fill(null);

    for (let row = 0; row < MAX_ROWS; row++) {
      const idx = col * MAX_ROWS + row;
      if (idx >= results.length) break;

      const result = results[idx];
      let color: 'red' | 'blue' | 'green';

      switch (result.outcome) {
        case 'B': color = 'red'; break;
        case 'P': color = 'blue'; break;
        case 'T': color = 'green'; break;
      }

      column[row] = {
        color,
        bankerPair: result.bankerPair,
        playerPair: result.playerPair,
      };
    }

    grid.push(column);
  }

  return grid;
}
