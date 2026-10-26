import { describe, it, expect } from 'vitest';
import { calculateStats } from '../../src/roads/prediction';
import { buildBigRoad } from '../../src/roads/big-road';

function stats(shoe: string) {
  const results = shoe.split('').map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
  return calculateStats(results, buildBigRoad(results).columns);
}

describe('calculateStats', () => {
  it('should count hands and streaks', () => {
    // Columns BB, P, BBB, PP, B (with a tie): lengths 2, 1, 3, 2, 1
    const s = stats('BBPBBBPPBT');
    expect([s.total, s.banker, s.player, s.tie]).toEqual([10, 6, 3, 1]);
    // Percentages leave ties out
    expect(s.bankerPct).toBeCloseTo(66.67, 1);
    expect(s.playerPct).toBeCloseTo(33.33, 1);
    expect(s.longestBankerStreak).toBe(3);
    expect(s.longestPlayerStreak).toBe(2);
    expect(s.avgStreak).toBe(1.8);
    expect(s.currentStreak).toEqual({ outcome: 'B', length: 1 });
    expect([s.columnsCount, s.singlesCount, s.doublesCount, s.longStreaksCount]).toEqual([5, 2, 2, 0]);
  });

  it('should count columns of four hands or more as long streaks', () => {
    const s = stats('BBBBPPPPPB');
    expect(s.longStreaksCount).toBe(2);
    expect(s.longestPlayerStreak).toBe(5);
    expect(s.currentStreak).toEqual({ outcome: 'B', length: 1 });
  });

  it('should handle an empty shoe and one of only ties', () => {
    for (const shoe of ['', 'TT']) {
      const s = stats(shoe);
      expect(s.currentStreak).toBeNull();
      expect([s.columnsCount, s.avgStreak, s.bankerPct, s.playerPct]).toEqual([0, 0, 0, 0]);
    }
  });
});
