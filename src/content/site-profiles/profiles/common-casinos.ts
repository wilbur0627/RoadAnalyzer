import { registerProfile, SiteProfile } from '../profile-registry';
import { GameResult } from '../../../roads/types';
import { classifyElement, COLOR_TO_OUTCOME, TEXT_TO_OUTCOME } from '../../detector/color-classifier';

/**
 * Common patterns found across many online casino platforms.
 * These profiles target specific DOM structures commonly used by
 * casino software providers (e.g., Evolution, SA Gaming, AG, etc.)
 */

// Pattern A: Canvas-based road with result list sidebar
const canvasWithListProfile: SiteProfile = {
  domains: [], // Will match via heuristic detection
  name: 'Canvas + Result List',
  roadContainerSelector: 'canvas[class*="road"], canvas[class*="bead"]',

  extract(): GameResult[] | null {
    // Many casino UIs have a result history list alongside the canvas road
    // Look for ordered result indicators
    const resultItems = document.querySelectorAll(
      '.result-item, .history-item, .game-result, [data-result], [data-winner]'
    );

    if (resultItems.length < 3) return null;

    const results: GameResult[] = [];

    for (const item of resultItems) {
      // Check data attributes first
      const dataResult = item.getAttribute('data-result') ??
                         item.getAttribute('data-winner') ??
                         item.getAttribute('data-outcome');

      if (dataResult) {
        const outcome = TEXT_TO_OUTCOME[dataResult.toLowerCase()];
        if (outcome) { results.push({ outcome }); continue; }
      }

      // Fall back to color detection
      const color = classifyElement(item);
      const outcome = COLOR_TO_OUTCOME[color];
      if (outcome) {
        results.push({ outcome });
      }
    }

    return results.length >= 3 ? results : null;
  },
};

// Pattern B: Grid of small circles (common in Asian casino UIs)
const circleGridProfile: SiteProfile = {
  domains: [],
  name: 'Circle Grid',
  roadContainerSelector: '[class*="road-map"], [class*="roadmap"], [class*="road_map"]',

  extract(): GameResult[] | null {
    const circles = document.querySelectorAll(
      '[class*="circle"], [class*="dot"], [class*="ball"], [class*="marker"]'
    );

    if (circles.length < 6) return null;

    const results: GameResult[] = [];

    // Sort elements by their visual position (top-to-bottom, left-to-right)
    const sorted = Array.from(circles).sort((a, b) => {
      const rectA = a.getBoundingClientRect();
      const rectB = b.getBoundingClientRect();
      // Group by column (x position) first, then by row
      const colA = Math.round(rectA.left / 20);
      const colB = Math.round(rectB.left / 20);
      if (colA !== colB) return colA - colB;
      return rectA.top - rectB.top;
    });

    for (const circle of sorted) {
      const color = classifyElement(circle);
      const outcome = COLOR_TO_OUTCOME[color];
      if (outcome) {
        results.push({ outcome });
      }
    }

    return results.length >= 3 ? results : null;
  },
};

registerProfile(canvasWithListProfile);
registerProfile(circleGridProfile);
