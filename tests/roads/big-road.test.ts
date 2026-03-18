import { describe, it, expect } from 'vitest';
import { buildBigRoad } from '../../src/roads/big-road';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

describe('Big Road (大路)', () => {
  it('should return empty grid for no results', () => {
    const { grid, columns } = buildBigRoad([]);
    expect(grid).toEqual([]);
    expect(columns).toEqual([]);
  });

  it('should place single banker result', () => {
    const { grid, columns } = buildBigRoad(r('B'));
    expect(columns.length).toBe(1);
    expect(columns[0].outcome).toBe('B');
    expect(columns[0].cells.length).toBe(1);
    expect(grid[0][0]?.color).toBe('red');
  });

  it('should place single player result', () => {
    const { grid } = buildBigRoad(r('P'));
    expect(grid[0][0]?.color).toBe('blue');
  });

  it('should create new column on outcome change', () => {
    const { columns } = buildBigRoad(r('B', 'P'));
    expect(columns.length).toBe(2);
    expect(columns[0].outcome).toBe('B');
    expect(columns[1].outcome).toBe('P');
  });

  it('should stack same outcomes in one column', () => {
    const { columns } = buildBigRoad(r('B', 'B', 'B'));
    expect(columns.length).toBe(1);
    expect(columns[0].cells.length).toBe(3);
  });

  it('should handle ties — attach to last cell', () => {
    const { columns } = buildBigRoad(r('B', 'T'));
    expect(columns.length).toBe(1);
    expect(columns[0].tiesAtEnd).toBe(1);
    expect(columns[0].cells[0].tieCount).toBe(1);
  });

  it('should handle multiple ties on same cell', () => {
    const { columns } = buildBigRoad(r('B', 'T', 'T', 'T'));
    expect(columns[0].tiesAtEnd).toBe(3);
    expect(columns[0].cells[0].tieCount).toBe(3);
  });

  it('should handle tie at the beginning (no column yet)', () => {
    // Ties before any B/P should be ignored (no column to attach to)
    const { columns } = buildBigRoad(r('T', 'T', 'B'));
    expect(columns.length).toBe(1);
    expect(columns[0].outcome).toBe('B');
  });

  it('should handle alternating pattern B-P-B-P', () => {
    const { columns } = buildBigRoad(r('B', 'P', 'B', 'P'));
    expect(columns.length).toBe(4);
    expect(columns.map(c => c.outcome)).toEqual(['B', 'P', 'B', 'P']);
    columns.forEach(c => expect(c.cells.length).toBe(1));
  });

  it('should handle long streak BBB-PPP-BB', () => {
    const { columns } = buildBigRoad(r('B', 'B', 'B', 'P', 'P', 'P', 'B', 'B'));
    expect(columns.length).toBe(3);
    expect(columns[0].cells.length).toBe(3);
    expect(columns[1].cells.length).toBe(3);
    expect(columns[2].cells.length).toBe(2);
  });

  it('should handle ties between different outcomes', () => {
    const { columns } = buildBigRoad(r('B', 'B', 'T', 'P', 'P'));
    expect(columns.length).toBe(2);
    expect(columns[0].cells.length).toBe(2);
    expect(columns[0].tiesAtEnd).toBe(1);
    expect(columns[1].cells.length).toBe(2);
  });

  it('should generate correct grid layout', () => {
    // BB-PP should produce 2 columns, each with 2 rows
    const { grid } = buildBigRoad(r('B', 'B', 'P', 'P'));
    expect(grid.length).toBe(2);
    expect(grid[0][0]?.color).toBe('red');
    expect(grid[0][1]?.color).toBe('red');
    expect(grid[1][0]?.color).toBe('blue');
    expect(grid[1][1]?.color).toBe('blue');
  });

  it('should preserve pair information', () => {
    const results: GameResult[] = [
      { outcome: 'B', bankerPair: true, playerPair: false },
    ];
    const { columns } = buildBigRoad(results);
    expect(columns[0].cells[0].bankerPair).toBe(true);
  });

  it('should handle a realistic shoe sequence', () => {
    // A typical baccarat shoe fragment
    const { columns } = buildBigRoad(
      r('P', 'P', 'B', 'B', 'B', 'P', 'B', 'P', 'P', 'P', 'B', 'B', 'T', 'P')
    );
    expect(columns.length).toBe(7);
    expect(columns[0].outcome).toBe('P');
    expect(columns[0].cells.length).toBe(2);
    expect(columns[1].outcome).toBe('B');
    expect(columns[1].cells.length).toBe(3);
    // Tie should attach to column 5 (BB)
    expect(columns[5].tiesAtEnd).toBe(1);
  });
});
