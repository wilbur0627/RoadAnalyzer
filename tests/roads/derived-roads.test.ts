import { describe, it, expect } from 'vitest';
import { buildBigRoad } from '../../src/roads/big-road';
import { buildBigEyeBoy, buildSmallRoad, buildCockroachPig, derivedRoadEntries } from '../../src/roads/derived-road';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

/** First letter of each entry's color, e.g. "BBRBRB" */
function colors(results: GameResult[], offset: number): string {
  const { columns } = buildBigRoad(results);
  return derivedRoadEntries(columns, offset).map(e => (e.color === 'red' ? 'R' : 'B')).join('');
}

// BB P BBB PP B — columns of length 2, 1, 3, 2, 1
const shoe = r('B', 'B', 'P', 'B', 'B', 'B', 'P', 'P', 'B');

describe('Derived road rules', () => {
  it('should follow the standard rules for Big Eye Boy', () => {
    // Starts at column 2 row 1 (column 1 is a single cell):
    // col 2: new column, len(1)=1 vs len(0)=2 → B; row 1: col 1 ended one row above → B;
    //        row 2: col 1 ended two rows above (直落) → R
    // col 3: len(2)=3 vs len(1)=1 → B; row 1: col 2 has row 1 → R
    // col 4: len(3)=2 vs len(2)=3 → B
    expect(colors(shoe, 1)).toBe('BBRBRB');
  });

  it('should follow the standard rules for Small Road', () => {
    // Starts at column 2 row 1: col 0 has row 1 → R; row 2: col 0 ended one row above → B
    // col 3: len(2)=3 vs len(0)=2 → B; row 1: col 1 ended one row above → B
    // col 4: len(3)=2 vs len(1)=1 → B
    expect(colors(shoe, 2)).toBe('RBBBB');
  });

  it('should follow the standard rules for Cockroach Pig', () => {
    // Starts at column 3 row 1: col 0 has row 1 → R; col 4: len(3)=2 vs len(0)=2 → R
    expect(colors(shoe, 3)).toBe('RR');
  });

  it('should lay out entries like the Big Road, one column per color run', () => {
    const { columns } = buildBigRoad(shoe);
    const grid = buildBigEyeBoy(columns);
    // BBRBRB → columns: [B,B] [R] [B] [R] [B]
    expect(grid.map(col => col.filter(Boolean).map(c => c!.color))).toEqual([
      ['blue', 'blue'], ['red'], ['blue'], ['red'], ['blue'],
    ]);
  });
});

describe('Derived Roads', () => {
  describe('Big Eye Boy (大眼仔路) — offset 1', () => {
    it('should return empty for less than 2 columns', () => {
      const { columns } = buildBigRoad(r('B', 'B'));
      const grid = buildBigEyeBoy(columns);
      expect(grid).toEqual([]);
    });

    it('should return empty for exactly 1 column transition', () => {
      // Need at least offset+1 = 2 columns before first entry
      const { columns } = buildBigRoad(r('B', 'P'));
      const grid = buildBigEyeBoy(columns);
      expect(grid).toEqual([]);
    });

    it('should generate entries when enough columns exist', () => {
      // BBB-PP-B creates 3 columns: [3], [2], [1]
      const { columns } = buildBigRoad(r('B', 'B', 'B', 'P', 'P', 'B'));
      const grid = buildBigEyeBoy(columns);
      // Should have at least some entries
      expect(grid.length).toBeGreaterThan(0);
    });

    it('should mark red when previous column length matches comparison', () => {
      // Create equal-length columns: BB-PP-BB
      // Col 0: [B,B] len=2, Col 1: [P,P] len=2, Col 2: [B,B] len=2
      // For col 2 first cell: compare col 1 len(2) vs col 0 len(2) → equal → red
      const { columns } = buildBigRoad(r('B', 'B', 'P', 'P', 'B', 'B'));
      const grid = buildBigEyeBoy(columns);
      expect(grid.length).toBeGreaterThan(0);
      // First derived entry should be red (consistent)
      const firstCell = grid[0][0];
      expect(firstCell?.color).toBe('red');
    });

    it('should mark blue when previous column length differs', () => {
      // Create unequal-length columns: BBB-P-B
      // Col 0: len=3, Col 1: len=1, Col 2: len=1
      // Col 1 has no continuing cells, so first derived entry is from col 2:
      // compare col 1 len(1) vs col 0 len(3) → different → blue
      const { columns } = buildBigRoad(r('B', 'B', 'B', 'P', 'B'));
      const grid = buildBigEyeBoy(columns);
      expect(grid.length).toBeGreaterThan(0);
      const firstCell = grid[0][0];
      expect(firstCell?.color).toBe('blue');
    });
  });

  describe('Small Road (小路) — offset 2', () => {
    it('should return empty for less than 3 columns', () => {
      const { columns } = buildBigRoad(r('B', 'P'));
      const grid = buildSmallRoad(columns);
      expect(grid).toEqual([]);
    });

    it('should generate entries when enough columns exist', () => {
      // Need at least 3 columns (offset=2, need offset+1)
      const { columns } = buildBigRoad(r('B', 'B', 'P', 'P', 'B', 'B', 'P'));
      const grid = buildSmallRoad(columns);
      expect(grid.length).toBeGreaterThan(0);
    });
  });

  describe('Cockroach Pig (曱甴路) — offset 3', () => {
    it('should return empty for less than 4 columns', () => {
      const { columns } = buildBigRoad(r('B', 'P', 'B'));
      const grid = buildCockroachPig(columns);
      expect(grid).toEqual([]);
    });

    it('should generate entries when enough columns exist', () => {
      // Need at least 4 columns
      const { columns } = buildBigRoad(r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'B'));
      const grid = buildCockroachPig(columns);
      expect(grid.length).toBeGreaterThan(0);
    });
  });
});
