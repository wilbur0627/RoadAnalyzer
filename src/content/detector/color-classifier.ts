/**
 * Color classification for baccarat road detection.
 * Maps RGB values to game outcomes.
 */

import { Outcome, GameResult } from '../../roads/types';

export type DetectedColor = 'red' | 'blue' | 'green' | 'unknown';

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Known color ranges for baccarat roads */
const COLOR_PROFILES = {
  red: [
    { r: [180, 255], g: [0, 80], b: [0, 80] },     // Pure red
    { r: [200, 255], g: [40, 100], b: [40, 100] },  // Lighter red
    { r: [150, 220], g: [0, 60], b: [0, 60] },      // Dark red
  ],
  blue: [
    { r: [0, 80], g: [0, 120], b: [180, 255] },     // Pure blue
    { r: [40, 100], g: [80, 160], b: [200, 255] },   // Light blue
    { r: [0, 60], g: [0, 80], b: [150, 220] },       // Dark blue
  ],
  green: [
    { r: [0, 80], g: [150, 255], b: [0, 80] },      // Pure green
    { r: [0, 100], g: [120, 200], b: [0, 100] },     // Dark green
  ],
};

/** Classify an RGB color as red, blue, green, or unknown */
export function classifyColor(r: number, g: number, b: number): DetectedColor {
  for (const [name, profiles] of Object.entries(COLOR_PROFILES)) {
    for (const profile of profiles) {
      if (
        r >= profile.r[0] && r <= profile.r[1] &&
        g >= profile.g[0] && g <= profile.g[1] &&
        b >= profile.b[0] && b <= profile.b[1]
      ) {
        return name as DetectedColor;
      }
    }
  }
  return 'unknown';
}

/** Parse a CSS color string to RGB */
export function parseCSSColor(cssColor: string): RGB | null {
  // Handle rgb/rgba
  const rgbMatch = cssColor.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1]),
      g: parseInt(rgbMatch[2]),
      b: parseInt(rgbMatch[3]),
    };
  }

  // Handle hex
  const hexMatch = cssColor.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i);
  if (hexMatch) {
    return {
      r: parseInt(hexMatch[1], 16),
      g: parseInt(hexMatch[2], 16),
      b: parseInt(hexMatch[3], 16),
    };
  }

  // Handle short hex
  const shortHexMatch = cssColor.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (shortHexMatch) {
    return {
      r: parseInt(shortHexMatch[1] + shortHexMatch[1], 16),
      g: parseInt(shortHexMatch[2] + shortHexMatch[2], 16),
      b: parseInt(shortHexMatch[3] + shortHexMatch[3], 16),
    };
  }

  // Named colors commonly used in baccarat UIs
  const namedColors: Record<string, RGB> = {
    red: { r: 255, g: 0, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    green: { r: 0, g: 128, b: 0 },
  };

  return namedColors[cssColor.toLowerCase()] ?? null;
}

/** Classify a CSS color string */
export function classifyCSSColor(cssColor: string): DetectedColor {
  const rgb = parseCSSColor(cssColor);
  if (!rgb) return 'unknown';
  return classifyColor(rgb.r, rgb.g, rgb.b);
}

/** Check if an element's computed style suggests a baccarat color */
export function classifyElement(el: Element): DetectedColor {
  const style = getComputedStyle(el);

  // Check background color
  const bgColor = classifyCSSColor(style.backgroundColor);
  if (bgColor !== 'unknown') return bgColor;

  // Check text color (some UIs use colored text in white cells)
  const textColor = classifyCSSColor(style.color);
  if (textColor !== 'unknown') return textColor;

  // Check border color
  const borderColor = classifyCSSColor(style.borderColor);
  if (borderColor !== 'unknown') return borderColor;

  // Check CSS class names for hints (guard against SVGAnimatedString)
  const className = typeof el.className === 'string' ? el.className.toLowerCase() : '';
  if (className.includes('banker') || className.includes('bank')) return 'red';
  if (className.includes('player')) return 'blue';
  if (className.includes('tie')) return 'green';

  // Check data attributes (with length limit to avoid processing huge strings)
  const rawDataResult = el.getAttribute('data-result');
  const dataResult = rawDataResult && rawDataResult.length <= 20 ? rawDataResult.toLowerCase() : null;
  if (dataResult === 'b' || dataResult === 'banker') return 'red';
  if (dataResult === 'p' || dataResult === 'player') return 'blue';
  if (dataResult === 't' || dataResult === 'tie') return 'green';

  return 'unknown';
}

/** Shared mapping from detected color to game outcome */
export const COLOR_TO_OUTCOME: Record<DetectedColor, Outcome | null> = {
  red: 'B',
  blue: 'P',
  green: 'T',
  unknown: null,
};

/** Convert sorted color cells to game results (shared by DOM/Canvas scanners) */
export function cellsToResults(
  cells: { row: number; col: number; color: DetectedColor }[],
): GameResult[] {
  const sorted = [...cells].sort((a, b) => {
    if (a.col !== b.col) return a.col - b.col;
    return a.row - b.row;
  });

  const results: GameResult[] = [];
  for (const cell of sorted) {
    const outcome = COLOR_TO_OUTCOME[cell.color];
    if (outcome) {
      results.push({ outcome });
    }
  }

  return results.length >= 3 ? results : [];
}

/** Shared text-to-outcome mapping for known baccarat terms */
export const TEXT_TO_OUTCOME: Record<string, Outcome> = {
  'b': 'B', 'banker': 'B', 'bank': 'B', '莊': 'B', '庄': 'B',
  'p': 'P', 'player': 'P', '閒': 'P', '闲': 'P',
  't': 'T', 'tie': 'T', '和': 'T',
};
