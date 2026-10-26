import { describe, it, expect } from 'vitest';
import { pickPanelPosition, nearestClearCorner, overlaps, regionToCssRect } from '../../src/content/overlay/placement';

const viewport = { width: 1280, height: 800 };
const panel = { width: 280, height: 300 };
// Corners for this panel and viewport: right edge at 980, bottom edge at 480
const topRight = { left: 980, top: 20 };

describe('pickPanelPosition', () => {
  it('should use the top-right corner when there is no region', () => {
    expect(pickPanelPosition(null, panel, viewport)).toEqual(topRight);
  });

  it('should stay top-right when the region is elsewhere', () => {
    const roadStrip = { left: 0, top: 500, width: 900, height: 200 };
    expect(pickPanelPosition(roadStrip, panel, viewport)).toEqual(topRight);
  });

  it('should move to the top-left when the region covers the top-right corner', () => {
    const region = { left: 900, top: 0, width: 380, height: 300 };
    expect(pickPanelPosition(region, panel, viewport)).toEqual({ left: 20, top: 20 });
  });

  it('should move to the bottom when the region spans the whole top', () => {
    const region = { left: 0, top: 0, width: 1280, height: 400 };
    expect(pickPanelPosition(region, panel, viewport)).toEqual({ left: 980, top: 480 });
  });

  it('should pick the corner with the least overlap when every corner overlaps', () => {
    // Overlaps: top-right 36000, top-left 84000, bottom-right 26400, bottom-left 61600
    const region = { left: 0, top: 0, width: 1100, height: 700 };
    expect(pickPanelPosition(region, panel, viewport)).toEqual({ left: 980, top: 480 });
  });

  it('should keep the panel on screen in a viewport smaller than the panel', () => {
    expect(pickPanelPosition(null, panel, { width: 200, height: 200 })).toEqual({ left: 20, top: 20 });
  });
});

describe('nearestClearCorner', () => {
  // A road strip across the middle; it reaches into the top-right corner only
  const road = { left: 300, top: 250, width: 700, height: 100 };

  it('should move a panel dropped on the region to the clear corner nearest to it', () => {
    expect(nearestClearCorner(road, panel, viewport, { left: 100, top: 200 })).toEqual({ left: 20, top: 20 });
    expect(nearestClearCorner(road, panel, viewport, { left: 900, top: 300 })).toEqual({ left: 980, top: 480 });
  });

  it('should skip corners that overlap the region', () => {
    const topRoad = { left: 0, top: 0, width: 1280, height: 400 };
    expect(nearestClearCorner(topRoad, panel, viewport, { left: 100, top: 50 })).toEqual({ left: 20, top: 480 });
  });

  it('should return null when every corner overlaps the region', () => {
    const wholePage = { left: 0, top: 0, width: 1280, height: 800 };
    expect(nearestClearCorner(wholePage, panel, viewport, { left: 100, top: 50 })).toBeNull();
  });
});

describe('overlaps', () => {
  it('should tell rectangles that share area from ones that only touch', () => {
    expect(overlaps({ left: 0, top: 0, width: 10, height: 10 }, { left: 5, top: 5, width: 10, height: 10 })).toBe(true);
    expect(overlaps({ left: 0, top: 0, width: 10, height: 10 }, { left: 10, top: 0, width: 10, height: 10 })).toBe(false);
  });
});

describe('regionToCssRect', () => {
  it('should convert device pixels to CSS pixels', () => {
    expect(regionToCssRect({ x: 200, y: 100, w: 400, h: 300 }, 2))
      .toEqual({ left: 100, top: 50, width: 200, height: 150 });
  });

  it('should treat a missing device pixel ratio as 1', () => {
    expect(regionToCssRect({ x: 10, y: 20, w: 30, h: 40 }, 0))
      .toEqual({ left: 10, top: 20, width: 30, height: 40 });
  });
});
