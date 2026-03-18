import { GameResult } from '../../roads/types';
import { classifyElement, DetectedColor, cellsToResults } from './color-classifier';

/**
 * DOM Scanner — detects baccarat roads by scanning HTML elements.
 * Looks for grid-like structures with red/blue colored cells.
 */

interface GridCandidate {
  element: Element;
  cells: { row: number; col: number; color: DetectedColor }[];
  rows: number;
  cols: number;
  score: number;
}

/** Scan the page for baccarat road grids */
export function scanDOM(): GameResult[] | null {
  const candidates: GridCandidate[] = [];

  // Strategy 1: Look for table elements
  const tables = document.querySelectorAll('table');
  for (const table of tables) {
    const candidate = analyzeTable(table);
    if (candidate) candidates.push(candidate);
  }

  // Strategy 2: Look for grid/flex containers with colored children
  const gridContainers = findGridContainers();
  for (const container of gridContainers) {
    const candidate = analyzeGridContainer(container);
    if (candidate) candidates.push(candidate);
  }

  // Strategy 3: Look for elements with baccarat-related class names
  const baccaratElements = findBaccaratElements();
  for (const el of baccaratElements) {
    const candidate = analyzeGridContainer(el);
    if (candidate) candidates.push(candidate);
  }

  if (candidates.length === 0) return null;

  // Pick the best candidate (highest score)
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (best.score < 3) return null; // Minimum confidence threshold

  return gridToResults(best);
}

/** Analyze an HTML table for baccarat road patterns */
function analyzeTable(table: Element): GridCandidate | null {
  const rows = table.querySelectorAll('tr');
  if (rows.length < 2 || rows.length > 10) return null;

  const cells: GridCandidate['cells'] = [];
  let maxCols = 0;
  let coloredCells = 0;

  rows.forEach((row, rowIdx) => {
    const tds = row.querySelectorAll('td, th');
    maxCols = Math.max(maxCols, tds.length);

    tds.forEach((td, colIdx) => {
      const color = classifyElement(td);
      if (color !== 'unknown') {
        coloredCells++;
        cells.push({ row: rowIdx, col: colIdx, color });
      }
    });
  });

  if (coloredCells < 3) return null;

  // Score: colored cells ratio + structure bonus for 6-row tables
  const totalCells = rows.length * maxCols;
  let score = (coloredCells / totalCells) * 5;
  if (rows.length === 6) score += 3; // Big Road has 6 rows
  if (maxCols >= 10) score += 1;

  return {
    element: table,
    cells,
    rows: rows.length,
    cols: maxCols,
    score,
  };
}

/** Find elements that form CSS grid or flexbox grids (targeted selectors instead of '*') */
function findGridContainers(): Element[] {
  const candidates = document.querySelectorAll(
    'div[style*="grid"], div[style*="flex"], [class*="grid"], [class*="flex"], [class*="container"], [class*="wrapper"]'
  );
  const containers: Element[] = [];

  for (const el of candidates) {
    if (el.children.length < 6) continue;

    let coloredCount = 0;
    for (const child of el.children) {
      if (classifyElement(child) !== 'unknown') coloredCount++;
      if (coloredCount >= 3) break; // Early exit
    }
    if (coloredCount >= 3) {
      containers.push(el);
    }
  }

  return containers;
}

/** Find elements with baccarat-related class names or IDs (single combined query) */
function findBaccaratElements(): Element[] {
  const combinedSelector = [
    '[class*="road"]', '[class*="baccarat"]', '[class*="bead"]',
    '[class*="big-road"]', '[class*="bigroad"]', '[class*="score"]',
    '[id*="road"]', '[id*="baccarat"]', '[data-road]', '[data-game="baccarat"]',
  ].join(',');

  try {
    return Array.from(new Set(document.querySelectorAll(combinedSelector)));
  } catch {
    return [];
  }
}

/** Analyze a generic container for grid patterns */
function analyzeGridContainer(container: Element): GridCandidate | null {
  const children = Array.from(container.children);
  if (children.length < 6) return null;

  const cells: GridCandidate['cells'] = [];
  let coloredCells = 0;

  // Try to determine grid dimensions
  const firstChild = children[0];
  const firstRect = firstChild.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (firstRect.width === 0 || firstRect.height === 0) return null;

  // Estimate grid dimensions from child size and container size
  const estCols = Math.round(containerRect.width / firstRect.width);
  const estRows = Math.round(containerRect.height / firstRect.height);

  if (estRows < 2 || estCols < 2) return null;

  children.forEach((child, idx) => {
    const color = classifyElement(child);
    if (color !== 'unknown') {
      coloredCells++;
      const col = Math.floor(idx / estRows);
      const row = idx % estRows;
      cells.push({ row, col, color });
    }
  });

  if (coloredCells < 3) return null;

  let score = (coloredCells / children.length) * 5;
  if (estRows === 6) score += 3;

  return {
    element: container,
    cells,
    rows: estRows,
    cols: estCols,
    score,
  };
}

/** Convert a grid candidate to game results */
function gridToResults(grid: GridCandidate): GameResult[] {
  return cellsToResults(grid.cells);
}
