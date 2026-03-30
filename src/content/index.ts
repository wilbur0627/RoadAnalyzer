import { DetectionEngine } from './detector/detection-engine';
import { Overlay } from './overlay/overlay';
import { GameResult } from '../roads/types';
import { selectRegion } from './region-selector';

/**
 * Content Script — injected automatically on all pages.
 * Detection and overlay only start after user triggers "Select Region" from popup.
 */

let overlay: Overlay | null = null;
let engine: DetectionEngine | null = null;
let currentResults: GameResult[] = [];

function getOverlay(): Overlay {
  if (!overlay) overlay = new Overlay();
  return overlay;
}

function startDetection() {
  if (engine) return; // already running

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

// Listen for messages from popup / service worker
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

  // Start detection when user has selected a region or triggered capture
  if (msg.type === 'START_DETECTION') {
    startDetection();
    return;
  }

  // Handle screenshot analysis results from service worker
  if (msg.type === 'RESULTS_DETECTED' && Array.isArray(msg.results)) {
    currentResults = msg.results;
    getOverlay().updateResults(msg.results, msg.debugImage ?? null);
  }
});

// Check if a region was previously saved — if so, start detection automatically
chrome.storage.sync.get('roadRegion').then((data) => {
  if (data.roadRegion) {
    startDetection();
  }
});
