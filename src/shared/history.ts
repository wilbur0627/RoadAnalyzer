/**
 * Hands recorded across captures.
 *
 * Once the Big Road fills its panel it scrolls: every new column pushes the
 * oldest one out on the left, so a single frame stops showing the whole shoe.
 * Each frame's cells are matched against the previous frame's, and only the
 * hands in what is new are added to the record.
 *
 * Cells are compared rather than the hands read from them. Two shoes can draw
 * the same Big Road, so a new cell can change how the server reads earlier
 * ones (a later column's newest hand read as an earlier dragon's tail), and
 * the newest hand need not come last in its reading. The cells themselves only
 * ever gain new ones.
 *
 * Hands are strings of 'B', 'P' and 'T'; a tie follows the cell it marks.
 */

import { FrameCell } from './constants';
import { toFrameCells } from './sanitize';

export interface RoadHistory {
  /** Every hand recorded since capturing began, or since the last restart */
  hands: string;
  /** The cells of the last frame that continued the record */
  visible: FrameCell[];
  /** A frame that didn't continue the record, kept until a later frame confirms or dismisses it */
  pending: FrameCell[] | null;
}

/** A captured frame: the cells the server found, and the hands it read from them */
export interface Frame {
  cells: FrameCell[];
  hands: string;
}

/** With fewer cells in common, a new shoe's first hands could pass for the old shoe's last ones */
const MIN_OVERLAP = 8;

/**
 * Add a frame to the record.
 *
 * A frame that doesn't continue the record (a new shoe, another table, or a
 * misread) replaces it right away when the region was just selected. A
 * periodic capture keeps it pending instead, and the record restarts from it
 * only once a later frame adds hands to that pending frame. An empty frame (a
 * cleared road, or a selection with no road in it) is only ever kept pending.
 */
export function stitchFrame(
  history: RoadHistory | null,
  frame: Frame,
  { manual }: { manual: boolean },
): RoadHistory {
  const restart: RoadHistory = { hands: frame.hands, visible: frame.cells, pending: null };
  if (!history) return restart;

  const added = continuation(history.visible, frame.cells);
  if (added !== null) return { hands: history.hands + added, visible: frame.cells, pending: null };

  // The same frame read again (e.g. the same misread) adds nothing, so it confirms nothing
  const confirmed = history.pending !== null && Boolean(continuation(history.pending, frame.cells));
  if (confirmed || (manual && frame.cells.length > 0)) return restart;
  return { ...history, pending: frame.cells };
}

/**
 * The hands `next` adds after `prev`, or null if `next` doesn't continue it.
 *
 * As the road scrolls, whole columns leave on the left: `prev`, moved left by
 * the fewest columns, must all still be in `next`, in the same colors and with
 * no tie mark gone. The rest of `next` is new: a tie mark on a cell that had
 * none, and new cells, in the order the server read them.
 */
export function continuation(prev: FrameCell[], next: FrameCell[]): string | null {
  const nextAt = new Map(next.map((c) => [`${c.col},${c.row}`, c]));
  const lastCol = Math.max(0, ...prev.map((c) => c.col));
  for (let shift = 0; shift <= lastCol; shift++) {
    const kept = prev.filter((c) => c.col >= shift);
    if (kept.length < Math.min(prev.length, MIN_OVERLAP)) break;

    const matched = new Set<FrameCell>();
    let newTies = 0;
    const fits = kept.every((c) => {
      const now = nextAt.get(`${c.col - shift},${c.row}`);
      if (!now || now.result !== c.result || (c.has_tie && !now.has_tie)) return false;
      matched.add(now);
      if (now.has_tie && !c.has_tie) newTies++;
      return true;
    });
    if (!fits) continue;

    const added = next.filter((c) => !matched.has(c)).sort(byReading);
    // A tie mark can only be added to the last cell before the new ones
    return 'T'.repeat(newTies) + added.map((c) => c.result + (c.has_tie ? 'T' : '')).join('');
  }
  return null;
}

/** Reading order; a cell outside the reading belongs to a streak that started off screen, so it came first */
function byReading(a: FrameCell, b: FrameCell): number {
  return (a.order ?? -1) - (b.order ?? -1) || a.col - b.col || a.row - b.row;
}

const HANDS = /^[BPT]*$/;
const isHands = (value: unknown): value is string => typeof value === 'string' && HANDS.test(value);

/** A stored record, or null if it is missing or malformed */
export function toRoadHistory(value: unknown): RoadHistory | null {
  if (!value || typeof value !== 'object') return null;
  const { hands, visible, pending } = value as Record<string, unknown>;
  const visibleCells = toFrameCells(visible);
  if (!isHands(hands) || !visibleCells) return null;
  if (pending === null) return { hands, visible: visibleCells, pending: null };
  const pendingCells = toFrameCells(pending);
  return pendingCells ? { hands, visible: visibleCells, pending: pendingCells } : null;
}
