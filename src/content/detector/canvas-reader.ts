import { GameResult } from '../../roads/types';
import { classifyColor, DetectedColor, cellsToResults } from './color-classifier';

/**
 * Canvas Reader — detects baccarat roads from <canvas> elements.
 * Reads pixel data and identifies colored circles in a grid pattern.
 */

interface CanvasGrid {
  canvas: HTMLCanvasElement;
  cells: { row: number; col: number; color: DetectedColor }[];
  rows: number;
  cols: number;
  score: number;
}

/** Scan all canvas elements on the page for baccarat roads */
export function scanCanvases(): GameResult[] | null {
  const canvases = document.querySelectorAll('canvas');
  const candidates: CanvasGrid[] = [];

  for (const canvas of canvases) {
    const candidate = analyzeCanvas(canvas);
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (best.score < 3) return null;

  return canvasGridToResults(best);
}

/** Analyze a single canvas element */
function analyzeCanvas(canvas: HTMLCanvasElement): CanvasGrid | null {
  const width = canvas.width;
  const height = canvas.height;

  // Skip tiny or huge canvases
  if (width < 100 || height < 50 || width > 5000 || height > 3000) return null;

  let ctx: CanvasRenderingContext2D | null;
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
  } catch {
    return null; // Cross-origin canvas
  }

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch {
    return null; // Security error (cross-origin)
  }

  // Estimate cell size by looking for the dominant grid spacing
  const cellSize = estimateCellSize(imageData, width, height);
  if (!cellSize || cellSize < 8 || cellSize > 100) return null;

  const cols = Math.floor(width / cellSize);
  const rows = Math.floor(height / cellSize);

  if (rows < 2 || rows > 10 || cols < 3) return null;

  // Sample the center of each cell
  const cells: CanvasGrid['cells'] = [];
  let coloredCount = 0;

  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const cx = Math.floor(col * cellSize + cellSize / 2);
      const cy = Math.floor(row * cellSize + cellSize / 2);

      const color = sampleArea(imageData, width, cx, cy, Math.floor(cellSize / 4));
      if (color !== 'unknown') {
        coloredCount++;
        cells.push({ row, col, color });
      }
    }
  }

  if (coloredCount < 3) return null;

  let score = (coloredCount / (rows * cols)) * 5;
  if (rows === 6) score += 3;
  if (cols >= 10) score += 1;

  return { canvas, cells, rows, cols, score };
}

/** Estimate the cell size by looking for periodic color patterns */
function estimateCellSize(
  imageData: ImageData,
  width: number,
  height: number,
): number | null {
  // Sample the middle row and look for color transitions
  const middleY = Math.floor(height / 2);
  const transitions: number[] = [];
  let prevColor: DetectedColor = 'unknown';

  for (let x = 0; x < width; x += 2) {
    const idx = (middleY * width + x) * 4;
    const r = imageData.data[idx];
    const g = imageData.data[idx + 1];
    const b = imageData.data[idx + 2];
    const a = imageData.data[idx + 3];

    if (a < 128) continue;

    const color = classifyColor(r, g, b);
    if (color !== prevColor && color !== 'unknown') {
      transitions.push(x);
      prevColor = color;
    }
  }

  if (transitions.length < 3) return null;

  // Calculate average spacing between transitions
  const spacings: number[] = [];
  for (let i = 1; i < transitions.length; i++) {
    spacings.push(transitions[i] - transitions[i - 1]);
  }

  // Find the most common spacing (likely cell size)
  spacings.sort((a, b) => a - b);
  const median = spacings[Math.floor(spacings.length / 2)];

  return median;
}

/**
 * Sample a square area around (cx, cy) and return the dominant color.
 * This helps handle anti-aliasing and sub-pixel rendering.
 */
function sampleArea(
  imageData: ImageData,
  width: number,
  cx: number,
  cy: number,
  radius: number,
): DetectedColor {
  const colorCounts: Record<DetectedColor, number> = {
    red: 0,
    blue: 0,
    green: 0,
    unknown: 0,
  };

  const step = Math.max(1, Math.floor(radius / 3));

  for (let dx = -radius; dx <= radius; dx += step) {
    for (let dy = -radius; dy <= radius; dy += step) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= width || y < 0 || y >= imageData.height) continue;

      const idx = (y * width + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];
      const a = imageData.data[idx + 3];

      if (a < 128) continue;

      const color = classifyColor(r, g, b);
      colorCounts[color]++;
    }
  }

  // Return the most common non-unknown color
  let bestColor: DetectedColor = 'unknown';
  let bestCount = 0;

  for (const [color, count] of Object.entries(colorCounts)) {
    if (color !== 'unknown' && count > bestCount) {
      bestColor = color as DetectedColor;
      bestCount = count;
    }
  }

  // Need at least 20% of samples to be the dominant color
  const total = Object.values(colorCounts).reduce((a, b) => a + b, 0);
  if (bestCount < total * 0.2) return 'unknown';

  return bestColor;
}

/** Convert canvas grid to game results */
function canvasGridToResults(grid: CanvasGrid): GameResult[] {
  return cellsToResults(grid.cells);
}
