import { describe, it, expect } from 'vitest';
import { stitchFrame, continuation, toRoadHistory, RoadHistory, Frame } from '../../src/shared/history';
import { layoutStreaks } from '../../src/roads/layout';

interface Hand { result: 'B' | 'P'; has_tie: boolean; index: number }

/**
 * A frame of a shoe as the server reports it: the Big Road's cells, read in the
 * order the hands were played, once `scrolled` columns have left the screen.
 * Tails of streaks that started off screen are on screen but not read.
 */
function frame(shoe: string, scrolled = 0): Frame {
  const streaks: Hand[][] = [];
  let index = 0;
  for (const outcome of shoe) {
    const last = streaks.at(-1);
    if (outcome === 'T') {
      if (last) last[last.length - 1].has_tie = true;
      continue;
    }
    const hand: Hand = { result: outcome as 'B' | 'P', has_tie: false, index: index++ };
    if (last && last[0].result === outcome) last.push(hand);
    else streaks.push([hand]);
  }
  const placed = layoutStreaks(streaks).flatMap((column, col) =>
    column.flatMap((hand, row) => (hand ? [{ hand, col, row }] : [])));
  const startCol = new Map(streaks.map((s) => [s, placed.find((p) => p.hand === s[0])!.col]));
  const streakOf = new Map(streaks.flatMap((s) => s.map((h) => [h, s] as const)));

  const visible = placed.filter((p) => p.col >= scrolled);
  const read = visible.filter((p) => startCol.get(streakOf.get(p.hand)!)! >= scrolled)
    .sort((a, b) => a.hand.index - b.hand.index);
  return {
    cells: visible.map((p) => ({
      col: p.col - scrolled, row: p.row, result: p.hand.result, has_tie: p.hand.has_tie,
      order: read.includes(p) ? read.indexOf(p) : null,
    })),
    hands: read.map((p) => p.hand.result + (p.hand.has_tie ? 'T' : '')).join(''),
  };
}

// Streaks: BB | PPP | B+tie | P | BB | PP | B | PPP | BBB
const SHOE = 'BBPPPBTPBBPPBPPPBBB';
// Not a continuation of SHOE in any way
const MISREAD = 'PPBBPB';
const EMPTY: Frame = { cells: [], hands: '' };

const periodic = { manual: false };
const manual = { manual: true };

/** Stitch periodic frames in order, starting with no record */
function record(...frames: Frame[]): RoadHistory {
  let history: RoadHistory | null = null;
  for (const f of frames) history = stitchFrame(history, f, periodic);
  return history!;
}

describe('continuation', () => {
  it('should return the hand in a new cell', () => {
    expect(continuation(frame('BBP').cells, frame('BBPP').cells)).toBe('P');
  });

  it('should add a tie marked on the last cell', () => {
    expect(continuation(frame('BBP').cells, frame('BBPT').cells)).toBe('T');
  });

  it('should return no hands for an unchanged frame', () => {
    expect(continuation(frame(SHOE).cells, frame(SHOE).cells)).toBe('');
  });

  it('should continue after one or two columns scrolled away', () => {
    expect(continuation(frame(SHOE).cells, frame(SHOE + 'P', 1).cells)).toBe('P');
    expect(continuation(frame(SHOE).cells, frame(SHOE + 'PB', 2).cells)).toBe('PB');
  });

  it('should continue while a dragon tail is all that is left of its streak', () => {
    const shoe = 'P' + 'B'.repeat(9) + 'PPBTPBBPPPB';
    expect(continuation(frame(shoe, 1).cells, frame(shoe + 'P', 2).cells)).toBe('P');
  });

  it('should add a new cell that the server reads as part of an earlier dragon', () => {
    // 7 Banker, Player, 5 Banker; the 6th Banker in that column sits right after the
    // dragon's tail, so the road now also reads as 8 Banker, Player, 5 Banker
    const before = frame('B'.repeat(7) + 'P' + 'B'.repeat(5));
    const after = frame('B'.repeat(8) + 'P' + 'B'.repeat(5));
    expect(after.cells.length).toBe(before.cells.length + 1);
    expect(continuation(before.cells, after.cells)).toBe('B');
  });

  it('should add several new cells in the order they were read', () => {
    // The 7th Banker turns right on the bottom row, then a Player starts at the top of
    // that same column, so reading order is not column-and-row order
    expect(continuation(frame('BBBBBB').cells, frame('BBBBBBBTP').cells)).toBe('BTP');
  });

  it('should put a tie added to the last old cell before the new cells', () => {
    expect(continuation(frame('BBP').cells, frame('BBPTB').cells)).toBe('TB');
  });

  it('should read a short record as growing rather than scrolling', () => {
    expect(continuation(frame('B').cells, frame('BB').cells)).toBe('B');
  });

  it('should not take a new shoe that opens like the last columns as a continuation', () => {
    expect(continuation(frame(SHOE).cells, frame('BBBB').cells)).toBeNull();
    expect(continuation(frame(SHOE).cells, frame('B').cells)).toBeNull();
  });

  it('should not continue when a cell changed color or lost its tie mark', () => {
    // Same cells, colors swapped
    expect(continuation(frame('BPBP').cells, frame('PBPB').cells)).toBeNull();
    expect(continuation(frame('BBTPP').cells, frame('BBPP').cells)).toBeNull();
  });

  it('should not continue an unrelated frame or an empty one', () => {
    expect(continuation(frame(SHOE).cells, frame(MISREAD).cells)).toBeNull();
    expect(continuation(frame(SHOE).cells, [])).toBeNull();
  });

  it('should take every hand of a frame that follows an empty one', () => {
    expect(continuation([], frame('BBPT').cells)).toBe('BBPT');
  });
});

describe('stitchFrame', () => {
  it('should start the record with the first frame', () => {
    expect(record(frame(SHOE))).toEqual({ hands: SHOE, visible: frame(SHOE).cells, pending: null });
  });

  it('should keep hands that scrolled out of view', () => {
    const history = record(frame(SHOE), frame(SHOE + 'P', 1), frame(SHOE + 'PB', 3));
    expect(history.hands).toBe(SHOE + 'PB');
    expect(history.visible).toEqual(frame(SHOE + 'PB', 3).cells);
  });

  it('should keep the record unchanged for an unchanged frame', () => {
    expect(record(frame(SHOE), frame(SHOE)).hands).toBe(SHOE);
  });

  it('should grow a one-hand record instead of taking it for a new shoe', () => {
    expect(record(frame('B'), frame('BB')).hands).toBe('BB');
  });

  it('should keep a frame that does not continue the record pending', () => {
    expect(record(frame(SHOE), frame(MISREAD))).toMatchObject({ hands: SHOE, pending: frame(MISREAD).cells });
  });

  it('should recover when the frame after a misread continues the record', () => {
    expect(record(frame(SHOE), frame(MISREAD), frame(SHOE + 'P')))
      .toEqual({ hands: SHOE + 'P', visible: frame(SHOE + 'P').cells, pending: null });
  });

  it('should restart from a new shoe once the next frame adds hands to it', () => {
    expect(record(frame(SHOE), frame('P')).hands).toBe(SHOE);
    expect(record(frame(SHOE), frame('P'), frame('PB'))).toEqual({ hands: 'PB', visible: frame('PB').cells, pending: null });
  });

  it('should not restart when the same misread is read again', () => {
    expect(record(frame(SHOE), frame(MISREAD), frame(MISREAD))).toMatchObject({ hands: SHOE, pending: frame(MISREAD).cells });
  });

  it('should treat a cleared road as not continuing the record', () => {
    expect(record(frame(SHOE), EMPTY)).toMatchObject({ hands: SHOE, pending: [] });
    // The road stays cleared: still nothing to confirm
    expect(record(frame(SHOE), EMPTY, EMPTY).hands).toBe(SHOE);
    // It was only hidden for a moment
    expect(record(frame(SHOE), EMPTY, frame(SHOE))).toMatchObject({ hands: SHOE, pending: null });
    // A new shoe starts on the cleared road
    expect(record(frame(SHOE), EMPTY, frame('B'))).toMatchObject({ hands: 'B', pending: null });
  });

  it('should keep adding hands when a new selection continues the record', () => {
    expect(stitchFrame(record(frame(SHOE)), frame(SHOE + 'P'), manual).hands).toBe(SHOE + 'P');
  });

  it('should restart right away when a new selection does not continue the record', () => {
    expect(stitchFrame(record(frame(SHOE)), frame(MISREAD), manual))
      .toEqual({ hands: MISREAD, visible: frame(MISREAD).cells, pending: null });
  });

  it('should keep the record when a new selection holds no road', () => {
    // e.g. the box was dragged over the wrong part of the page
    expect(stitchFrame(record(frame(SHOE)), EMPTY, manual)).toMatchObject({ hands: SHOE, pending: [] });
  });

  it('should record every hand of random shoes on a road that scrolls', () => {
    // Deterministic pseudo-random numbers (mulberry32)
    let seed = 20261026;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // The screen shows the newest 18 columns
    const onScreen = (hands: string) => {
      const lastCol = Math.max(...frame(hands).cells.map((c) => c.col));
      return frame(hands, Math.max(0, lastCol - 17));
    };
    for (let n = 0; n < 200; n++) {
      // No two ties in a row: a cell shows only one tie mark
      let shoe = '';
      while (shoe.replace(/T/g, '').length < 72) {
        shoe += random() < 0.5 ? 'B' : 'P';
        if (random() < 0.1) shoe += 'T';
      }
      // Captured every 1 to 3 hands, then once the shoe is done
      let history: RoadHistory | null = null;
      for (let end = 1; end < shoe.length; end += 1 + Math.floor(random() * 3)) {
        history = stitchFrame(history, onScreen(shoe.slice(0, end)), periodic);
      }
      history = stitchFrame(history, onScreen(shoe), periodic);
      expect(history.hands, shoe).toBe(shoe);
      expect(history.pending, shoe).toBeNull();
    }
  });
});

describe('toRoadHistory', () => {
  const cell = { col: 0, row: 0, result: 'B', has_tie: false, order: 0 };

  it('should accept a stored record', () => {
    expect(toRoadHistory({ hands: 'BPT', visible: [cell], pending: null }))
      .toEqual({ hands: 'BPT', visible: [cell], pending: null });
    expect(toRoadHistory({ hands: '', visible: [], pending: [cell] }))
      .toEqual({ hands: '', visible: [], pending: [cell] });
  });

  it('should reject a missing or malformed record', () => {
    expect(toRoadHistory(undefined)).toBeNull();
    expect(toRoadHistory('BPT')).toBeNull();
    expect(toRoadHistory({ hands: 'BXP', visible: [], pending: null })).toBeNull();
    expect(toRoadHistory({ hands: 'B', visible: 'B', pending: null })).toBeNull();
    expect(toRoadHistory({ hands: 'B', visible: [{ ...cell, col: -1 }], pending: null })).toBeNull();
    expect(toRoadHistory({ hands: 'B', visible: [cell] })).toBeNull();
    expect(toRoadHistory({ hands: 'B', visible: [cell], pending: 'B' })).toBeNull();
  });
});
