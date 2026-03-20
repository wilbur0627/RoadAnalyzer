import { DetectionEngine } from './detector/detection-engine';
import { Overlay } from './overlay/overlay';
import { GameResult } from '../roads/types';
import { selectRegion } from './region-selector';

/**
 * Content Script — injected automatically on all pages.
 * Handles DOM/Canvas detection and region selection overlay.
 */

let overlay: Overlay | null = null;
let engine: DetectionEngine | null = null;
let currentResults: GameResult[] = [];

function getOverlay(): Overlay {
  if (!overlay) overlay = new Overlay();
  return overlay;
}

function init() {
  engine = new DetectionEngine(
    (status) => {
      if (overlay) overlay.updateStatus(status);
      try {
        chrome.runtime.sendMessage({ type: 'DETECTION_STATUS', status });
      } catch { /* popup not open */ }
    },
    (result) => {
      currentResults = result.results;
      getOverlay().updateResults(result.results);
      try {
        chrome.runtime.sendMessage({
          type: 'RESULTS_DETECTED',
          results: result.results,
          source: result.source,
        });
      } catch { /* popup not open */ }
    },
  );

  engine.start();
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'GET_STATE') {
    sendResponse({
      results: currentResults,
      status: engine ? 'watching' : 'idle',
    });
    return true;
  }

  if (msg.type === 'SELECT_REGION') {
    selectRegion().then((region) => {
      sendResponse({ region: region ?? null });
    });
    return true;
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
