import { GameResult } from '../../roads/types';
import { predict, Prediction, calculateStats } from '../../roads/prediction';
import { RoadManager } from '../../roads/road-manager';
import { getTier } from '../../shared/storage';
import { Tier } from '../../shared/constants';
import { DetectionStatus } from '../detector/detection-engine';
import { el, clearChildren, safeNumber } from '../../shared/sanitize';
import { t } from '../../i18n/i18n';

/**
 * Floating overlay panel injected into the page.
 * Uses safe DOM construction — no innerHTML with external data.
 */
export class Overlay {
  private container: HTMLDivElement;
  private roadManager = new RoadManager();
  private isDragging = false;
  private dragOffset = { x: 0, y: 0 };
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;
  private cachedTier: Tier = Tier.FREE;

  // Persistent DOM references for efficient updates
  private statusEl!: HTMLElement;
  private predictionEl!: HTMLElement;
  private statsEl!: HTMLElement;
  private debugEl!: HTMLElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'road-analyzer-overlay';
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp = this.onMouseUp.bind(this);
    this.applyStyles();
    this.buildDOM();
    this.setupDrag();
    document.body.appendChild(this.container);

    // Cache tier once, update on storage change
    getTier().then(tier => { this.cachedTier = tier; });
    try {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.tier) this.cachedTier = (changes.tier.newValue as Tier) ?? Tier.FREE;
      });
    } catch { /* not in extension context */ }
  }

  private applyStyles(): void {
    this.container.style.cssText = `
      position: fixed; top: 20px; right: 20px; width: 280px;
      background: rgba(15,17,23,0.95); border: 1px solid #2a2b35;
      border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #e4e4e7; font-size: 12px; overflow: hidden; cursor: move; user-select: none;
    `;
  }

  /** Build the overlay DOM tree using safe element construction */
  private buildDOM(): void {
    // Header
    const header = el('div', { style: 'padding:10px 12px;background:#1a1b23;border-bottom:1px solid #2a2b35;display:flex;justify-content:space-between;align-items:center;' });
    const title = el('span', { style: 'font-weight:700;font-size:13px;background:linear-gradient(135deg,#6366f1,#ec4899);-webkit-background-clip:text;-webkit-text-fill-color:transparent;' }, 'RoadAnalyzer');
    const btnGroup = el('div', { style: 'display:flex;gap:6px;' });
    const minimizeBtn = el('button', { style: 'background:none;border:none;color:#71717a;cursor:pointer;font-size:14px;padding:2px 4px;' }, '\u2212');
    const closeBtn = el('button', { style: 'background:none;border:none;color:#71717a;cursor:pointer;font-size:14px;padding:2px 4px;' }, '\u2715');

    minimizeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleMinimize(); });
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.hide(); });

    btnGroup.append(minimizeBtn, closeBtn);
    header.append(title, btnGroup);

    // Body
    const body = el('div', { id: 'ra-body', style: 'padding:10px 12px;' });
    this.statusEl = el('div', { style: 'color:#71717a;text-align:center;padding:8px;' }, t('detection.scanning'));
    this.predictionEl = el('div', { style: 'display:none;' });
    this.statsEl = el('div', { style: 'display:none;' });
    this.debugEl = el('div', { style: 'display:none;margin-top:8px;' });

    body.append(this.statusEl, this.predictionEl, this.statsEl, this.debugEl);
    this.container.append(header, body);
  }

  private setupDrag(): void {
    this.container.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      this.isDragging = true;
      this.dragOffset = {
        x: e.clientX - this.container.offsetLeft,
        y: e.clientY - this.container.offsetTop,
      };
    });
    document.addEventListener('mousemove', this.boundMouseMove);
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.isDragging) return;
    this.container.style.left = `${e.clientX - this.dragOffset.x}px`;
    this.container.style.top = `${e.clientY - this.dragOffset.y}px`;
    this.container.style.right = 'auto';
  }

  private onMouseUp(): void { this.isDragging = false; }

  /** Update overlay with new detection results */
  updateResults(results: GameResult[], debugImage?: string | null): void {
    this.roadManager.setResults(results);
    const analysis = this.roadManager.analyze();
    const isPremium = this.cachedTier === Tier.PREMIUM;
    const pred = predict(results, analysis.columns, analysis.bigEyeBoy, analysis.smallRoad, analysis.cockroachPig, isPremium);
    const stats = calculateStats(results, analysis.columns);

    this.updateStatus('found');
    this.updatePredictionDisplay(pred);
    this.updateStatsDisplay(stats);
    this.updateDebugDisplay(debugImage ?? null);
  }

  /** Show the debug detection grid image */
  private updateDebugDisplay(debugImage: string | null): void {
    clearChildren(this.debugEl);
    if (!debugImage) {
      this.debugEl.style.display = 'none';
      return;
    }

    this.debugEl.style.display = 'block';
    this.debugEl.appendChild(el('div', { style: 'font-size:10px;color:#71717a;margin-bottom:4px;' }, t('detection.preview')));
    const img = document.createElement('img');
    img.src = debugImage;
    img.style.cssText = 'width:100%;border-radius:4px;border:1px solid #2a2b35;';
    this.debugEl.appendChild(img);
  }

  updateStatus(status: DetectionStatus | string): void {
    const statusTexts: Record<string, string> = {
      scanning: t('detection.scanning'),
      found: t('detection.found'),
      not_found: t('detection.notFound'),
      watching: t('detection.watching'),
    };
    this.statusEl.textContent = statusTexts[status] ?? '';
    this.statusEl.style.display = status === 'found' || status === 'watching' ? 'none' : 'block';
  }

  /** Safe DOM construction for prediction display */
  private updatePredictionDisplay(pred: Prediction | null): void {
    if (!pred) {
      this.predictionEl.style.display = 'none';
      return;
    }

    this.predictionEl.style.display = 'block';
    clearChildren(this.predictionEl);

    const isBanker = pred.outcome === 'B';
    const color = isBanker ? '#ef4444' : '#3b82f6';
    const bgColor = isBanker ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)';
    const confidence = safeNumber(pred.confidence);

    const row = el('div', { style: `display:flex;align-items:center;gap:10px;padding:8px;background:${bgColor};border-radius:8px;border:1px solid ${color}30;` });
    const circle = el('div', { style: `width:40px;height:40px;border-radius:50%;border:2px solid ${color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:${color};` }, isBanker ? 'B' : 'P');
    const info = el('div', { style: 'flex:1;' });
    info.appendChild(el('div', { style: 'font-size:11px;color:#a1a1aa;' }, t('prediction.nextOutcome')));
    info.appendChild(el('div', { style: `font-weight:700;color:${color};` }, t('prediction.confidence', confidence)));
    const bar = el('div', { style: 'height:4px;background:#2a2b35;border-radius:2px;margin-top:4px;overflow:hidden;' });
    bar.appendChild(el('div', { style: `height:100%;width:${confidence}%;background:${color};border-radius:2px;` }));
    info.appendChild(bar);
    row.append(circle, info);
    this.predictionEl.appendChild(row);
  }

  /** Safe DOM construction for stats display */
  private updateStatsDisplay(stats: { total: number; banker: number; player: number; tie: number }): void {
    this.statsEl.style.display = 'block';
    clearChildren(this.statsEl);

    const row = el('div', { style: 'display:flex;gap:6px;margin-top:8px;' });
    const items: [string, string, number, boolean][] = [
      ['#71717a', t('stats.total'), stats.total, false],
      ['#ef4444', t('outcome.bankerShort'), stats.banker, true],
      ['#3b82f6', t('outcome.playerShort'), stats.player, true],
      ['#22c55e', t('outcome.tieShort'), stats.tie, true],
    ];
    for (const [color, label, value, tinted] of items) {
      const cell = el('div', { style: 'flex:1;text-align:center;padding:4px;background:#1e1f2a;border-radius:6px;' });
      cell.appendChild(el('div', { style: `font-size:10px;color:${color};` }, label));
      cell.appendChild(el('div', { style: `font-weight:700;${tinted ? `color:${color};` : ''}` }, String(safeNumber(value))));
      row.appendChild(cell);
    }
    this.statsEl.appendChild(row);
  }

  private toggleMinimize(): void {
    const body = this.container.querySelector('#ra-body') as HTMLElement;
    if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }

  show(): void { this.container.style.display = 'block'; }
  hide(): void { this.container.style.display = 'none'; }

  destroy(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    this.container.remove();
  }
}
