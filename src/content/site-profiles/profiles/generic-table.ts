import { SiteProfile, registerProfile } from '../profile-registry';
import { GameResult } from '../../../roads/types';
import { classifyElement, COLOR_TO_OUTCOME, TEXT_TO_OUTCOME } from '../../detector/color-classifier';

/**
 * Generic table-based profile.
 * Targets common baccarat UI patterns found across many sites:
 * - Tables with 6 rows and colored cells
 * - Divs with class names containing "road", "bead", "score"
 * - SVG/canvas elements within road containers
 */
const genericTableProfile: SiteProfile = {
  domains: [], // Matches nothing by default — used as fallback
  name: 'Generic Table',
  roadContainerSelector: '[class*="road"], [class*="bead"], [class*="score"], [class*="baccarat"]',

  extract(): GameResult[] | null {
    // Strategy 1: Look for well-structured road tables
    const results = extractFromColoredGrid();
    if (results && results.length >= 3) return results;

    // Strategy 2: Look for text-based results (B/P/T or 莊/閒/和)
    const textResults = extractFromTextContent();
    if (textResults && textResults.length >= 3) return textResults;

    return null;
  },
};

function extractFromColoredGrid(): GameResult[] | null {
  // Find any container that looks like a baccarat road
  const containers = document.querySelectorAll(
    'table, [class*="road"], [class*="bead"], [class*="grid"], [class*="result"]'
  );

  for (const container of containers) {
    const cells = container.querySelectorAll('td, [class*="cell"], [class*="circle"], [class*="ball"]');
    if (cells.length < 6) continue;

    const results: GameResult[] = [];

    for (const cell of cells) {
      const color = classifyElement(cell);
      const outcome = COLOR_TO_OUTCOME[color];
      if (outcome) {
        results.push({ outcome });
      }
    }

    if (results.length >= 3) return results;
  }

  return null;
}

function extractFromTextContent(): GameResult[] | null {
  // Look for elements displaying result sequences
  const resultElements = document.querySelectorAll(
    '[class*="result"], [class*="history"], [class*="record"]'
  );

  for (const el of resultElements) {
    const text = el.textContent?.trim().toLowerCase();
    if (!text) continue;

    const parts = text.split(/[\s,|/\-]+/);
    const results: GameResult[] = [];

    for (const part of parts) {
      const outcome = TEXT_TO_OUTCOME[part];
      if (outcome) {
        results.push({ outcome });
      }
    }

    if (results.length >= 3) return results;
  }

  return null;
}

// Register as a fallback profile
registerProfile(genericTableProfile);

export default genericTableProfile;
