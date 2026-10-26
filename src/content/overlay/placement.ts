import { RoadRegion } from '../../shared/constants';

/** A rectangle in CSS pixels, relative to the viewport */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Size = { width: number; height: number };
type Position = { left: number; top: number };

const MARGIN = 20;

/**
 * Pick the viewport corner for the overlay panel that overlaps the road region
 * least, preferring the top-right corner. The panel has to stay off the region,
 * otherwise it shows up in the next capture.
 */
export function pickPanelPosition(
  region: Rect | null,
  panel: Size,
  viewport: Size,
): Position {
  const corners = cornersFor(panel, viewport);
  if (!region) return corners[0];

  let best = corners[0];
  let bestOverlap = Infinity;
  for (const corner of corners) {
    const overlap = overlapArea({ ...corner, ...panel }, region);
    if (overlap === 0) return corner;
    if (overlap < bestOverlap) {
      best = corner;
      bestOverlap = overlap;
    }
  }
  return best;
}

/**
 * For a panel the user dropped on the region: the corner clear of the region
 * nearest to where it is, or null if every corner overlaps the region.
 */
export function nearestClearCorner(region: Rect, panel: Size, viewport: Size, at: Position): Position | null {
  const clear = cornersFor(panel, viewport).filter((corner) => !overlaps({ ...corner, ...panel }, region));
  const distance = (p: Position) => Math.hypot(p.left - at.left, p.top - at.top);
  return clear.reduce<Position | null>((best, corner) => (!best || distance(corner) < distance(best) ? corner : best), null);
}

export function overlaps(a: Rect, b: Rect): boolean {
  return overlapArea(a, b) > 0;
}

/** Top-right, top-left, bottom-right, bottom-left, kept on screen */
function cornersFor(panel: Size, viewport: Size): Position[] {
  const right = Math.max(MARGIN, viewport.width - panel.width - MARGIN);
  const bottom = Math.max(MARGIN, viewport.height - panel.height - MARGIN);
  return [
    { left: right, top: MARGIN },
    { left: MARGIN, top: MARGIN },
    { left: right, top: bottom },
    { left: MARGIN, top: bottom },
  ];
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The saved region is in device pixels to match the screenshot; the page lays out in CSS pixels */
export function regionToCssRect(region: RoadRegion, devicePixelRatio: number): Rect {
  const dpr = devicePixelRatio || 1;
  return { left: region.x / dpr, top: region.y / dpr, width: region.w / dpr, height: region.h / dpr };
}
