import { describe, it, expect } from 'vitest';
import { buildBeadPlate } from '../../src/roads/bead-plate';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

describe('Bead Plate (珠盤路)', () => {
  it('should return empty grid for no results', () => {
    expect(buildBeadPlate([])).toEqual([]);
  });

  it('should place results top-to-bottom, left-to-right', () => {
    const grid = buildBeadPlate(r('B', 'P', 'T', 'B', 'P', 'B'));
    // 6 results = 1 column of 6 rows
    expect(grid.length).toBe(1);
    expect(grid[0][0]?.color).toBe('red');    // B
    expect(grid[0][1]?.color).toBe('blue');   // P
    expect(grid[0][2]?.color).toBe('green');  // T
    expect(grid[0][3]?.color).toBe('red');    // B
    expect(grid[0][4]?.color).toBe('blue');   // P
    expect(grid[0][5]?.color).toBe('red');    // B
  });

  it('should wrap to next column after 6 rows', () => {
    const grid = buildBeadPlate(r('B', 'P', 'T', 'B', 'P', 'B', 'P'));
    expect(grid.length).toBe(2);
    expect(grid[1][0]?.color).toBe('blue'); // 7th result in col 2, row 0
  });

  it('should include ties as their own cells (green)', () => {
    const grid = buildBeadPlate(r('T'));
    expect(grid[0][0]?.color).toBe('green');
  });

  it('should handle 12 results in 2 full columns', () => {
    const results = r('B', 'B', 'B', 'B', 'B', 'B', 'P', 'P', 'P', 'P', 'P', 'P');
    const grid = buildBeadPlate(results);
    expect(grid.length).toBe(2);
    // First column: all red
    for (let i = 0; i < 6; i++) expect(grid[0][i]?.color).toBe('red');
    // Second column: all blue
    for (let i = 0; i < 6; i++) expect(grid[1][i]?.color).toBe('blue');
  });
});
