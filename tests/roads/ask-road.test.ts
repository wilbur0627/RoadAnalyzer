import { describe, it, expect } from 'vitest';
import { askRoad, AskRoadColors } from '../../src/roads/ask-road';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

/** Big Eye Boy, Small Road, Cockroach Pig as letters: R red, B blue, - not started */
function letters(colors: AskRoadColors): string {
  return [colors.bigEyeBoy, colors.smallRoad, colors.cockroachPig]
    .map(c => (c === 'red' ? 'R' : c === 'blue' ? 'B' : '-'))
    .join('');
}

function ask(results: GameResult[]) {
  const asked = askRoad(results);
  return { B: letters(asked.B), P: letters(asked.P) };
}

describe('askRoad', () => {
  it('should show nothing before Big Eye Boy can start', () => {
    expect(ask(r())).toEqual({ B: '---', P: '---' });
    expect(ask(r('B'))).toEqual({ B: '---', P: '---' });
    expect(ask(r('B', 'B', 'B'))).toEqual({ B: '---', P: '---' });
  });

  it('should show only the roads that have started', () => {
    // B P: a Banker hand starts column 2 (1 = 1 → red); a Player hand reaches row 1 of
    // column 1, and column 0 ended one row above (blue). Small Road and Cockroach Pig need more columns.
    expect(ask(r('B', 'P'))).toEqual({ B: 'R--', P: 'B--' });
  });

  it('should give the entries the derived roads add once the hand is played', () => {
    // BB P BBB PP + B draws Big Eye Boy BBRBRB, Small Road RBBBB and Cockroach Pig RR
    // (see derived-roads.test.ts), so asking with Banker gives their last entries
    expect(ask(r('B', 'B', 'P', 'B', 'B', 'B', 'P', 'P')).B).toBe('BBR');
  });

  it('should follow the rules for a hand that continues the column and one that starts a new one', () => {
    // BB P BBB PP B, columns of length 2, 1, 3, 2, 1
    // Banker continues column 4 to row 1: column 3 has row 1 → red; column 2 has it → red;
    //   column 1 ended one row above → blue
    // Player starts column 5: column 4 (1) vs column 3 (2) → blue; vs column 2 (3) → blue;
    //   vs column 1 (1) → red
    expect(ask(r('B', 'B', 'P', 'B', 'B', 'B', 'P', 'P', 'B'))).toEqual({ B: 'RRB', P: 'BBR' });
  });

  it('should ignore ties', () => {
    expect(ask(r('B', 'T', 'B', 'P', 'T', 'B', 'B', 'T'))).toEqual(ask(r('B', 'B', 'P', 'B', 'B')));
  });

  it('should give opposite colors for Banker and Player on every road that has started', () => {
    // Deterministic pseudo-random numbers (mulberry32)
    let seed = 20261026;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let n = 0; n < 50; n++) {
      const shoe: GameResult[] = [];
      for (let hand = 0; hand < 60; hand++) {
        const { B, P } = ask(shoe);
        for (let road = 0; road < 3; road++) {
          if (B[road] === '-' || P[road] === '-') expect(B[road] + P[road]).toBe('--');
          else expect(B[road]).not.toBe(P[road]);
        }
        const x = random();
        shoe.push({ outcome: x < 0.1 ? 'T' : x < 0.55 ? 'B' : 'P' });
      }
    }
  });
});
