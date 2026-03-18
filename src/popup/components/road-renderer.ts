import { RoadGrid, DerivedRoadGrid, RoadCell, DerivedRoadCell } from '../../roads/types';
import { ROAD_CONFIG } from '../../shared/constants';

const { CELL_SIZE, CELL_GAP, MAX_ROWS } = ROAD_CONFIG;

const COLORS = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  gridLine: '#2a2b35',
  background: '#1a1b23',
  tieSlash: '#22c55e',
  pairDot: '#fbbf24',
};

/**
 * Render a road grid onto a canvas.
 */
export function renderRoad(
  canvas: HTMLCanvasElement,
  grid: RoadGrid | DerivedRoadGrid,
  options: {
    isDerived?: boolean;
    maxCols?: number;
  } = {},
): void {
  const { isDerived = false, maxCols = 30 } = options;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Show only the last N columns
  const displayGrid = grid.length > maxCols ? grid.slice(grid.length - maxCols) : grid;
  const numCols = Math.max(displayGrid.length, maxCols);
  const cellTotal = CELL_SIZE + CELL_GAP;

  canvas.width = numCols * cellTotal + CELL_GAP;
  canvas.height = MAX_ROWS * cellTotal + CELL_GAP;

  // Background
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid lines
  ctx.strokeStyle = COLORS.gridLine;
  ctx.lineWidth = 0.5;
  for (let col = 0; col <= numCols; col++) {
    const x = col * cellTotal + CELL_GAP / 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let row = 0; row <= MAX_ROWS; row++) {
    const y = row * cellTotal + CELL_GAP / 2;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw cells
  for (let colIdx = 0; colIdx < displayGrid.length; colIdx++) {
    const column = displayGrid[colIdx];
    if (!column) continue;

    for (let rowIdx = 0; rowIdx < column.length; rowIdx++) {
      const cell = column[rowIdx];
      if (!cell) continue;

      const x = colIdx * cellTotal + CELL_GAP;
      const y = rowIdx * cellTotal + CELL_GAP;
      const centerX = x + CELL_SIZE / 2;
      const centerY = y + CELL_SIZE / 2;
      const radius = (CELL_SIZE - 4) / 2;

      if (isDerived) {
        // Derived roads: smaller filled circles
        drawDerivedCell(ctx, centerX, centerY, radius * 0.6, cell as DerivedRoadCell);
      } else {
        // Main roads: full circles with optional markers
        drawMainCell(ctx, centerX, centerY, radius, cell as RoadCell);
      }
    }
  }
}

function drawMainCell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  cell: RoadCell,
): void {
  const color = COLORS[cell.color];

  // Filled circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.2;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Circle border
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Tie count indicator (green slash marks)
  if (cell.tieCount && cell.tieCount > 0) {
    ctx.strokeStyle = COLORS.tieSlash;
    ctx.lineWidth = 2;
    for (let i = 0; i < Math.min(cell.tieCount, 3); i++) {
      const offset = (i - 1) * 4;
      ctx.beginPath();
      ctx.moveTo(cx + offset - 3, cy + 5);
      ctx.lineTo(cx + offset + 3, cy - 5);
      ctx.stroke();
    }
    // If more than 3 ties, show number
    if (cell.tieCount > 3) {
      ctx.fillStyle = COLORS.tieSlash;
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(cell.tieCount), cx, cy + 3);
    }
  }

  // Pair indicators (small dots at corners)
  if (cell.bankerPair) {
    ctx.beginPath();
    ctx.arc(cx - radius + 2, cy - radius + 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.red;
    ctx.fill();
  }
  if (cell.playerPair) {
    ctx.beginPath();
    ctx.arc(cx + radius - 2, cy + radius - 2, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.blue;
    ctx.fill();
  }
}

function drawDerivedCell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  cell: DerivedRoadCell,
): void {
  const color = COLORS[cell.color];

  // Simple filled circle for derived roads
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}
