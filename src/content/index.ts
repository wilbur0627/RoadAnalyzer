import { DetectionEngine } from './detector/detection-engine';
import { Overlay } from './overlay/overlay';
import { GameResult } from '../roads/types';

/**
 * Content Script — injected on demand when user clicks extension icon.
 * Creates overlay lazily — only after results are actually found.
 */

let overlay: Overlay | null = null;
let engine: DetectionEngine | null = null;
let currentResults: GameResult[] = [];

/** Create overlay lazily on first detection */
function getOverlay(): Overlay {
  if (!overlay) overlay = new Overlay();
  return overlay;
}

function init() {
  engine = new DetectionEngine(
    // Status callback
    (status) => {
      // Only show overlay if we have results or are actively watching
      if (overlay) overlay.updateStatus(status);
      try {
        chrome.runtime.sendMessage({ type: 'DETECTION_STATUS', status });
      } catch { /* popup not open */ }
    },
    // Results callback — creates overlay on first detection
    (result) => {
      currentResults = result.results;
      getOverlay().updateResults(result.results);
      try {
        chrome.runtime.sendMessage({ type: 'RESULTS_DETECTED', results: result.results });
      } catch { /* popup not open */ }
    },
  );

  engine.start();
}

// Listen for messages from popup (validate sender)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'GET_STATE') {
    sendResponse({
      results: currentResults,
      status: engine ? 'watching' : 'idle',
    });
    return true;
  }
});

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
