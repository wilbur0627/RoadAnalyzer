import { Overlay } from './overlay/overlay';
import { GameResult } from '../roads/types';
import { validateGameResults } from '../shared/sanitize';
import { initI18n } from '../i18n/i18n';

/**
 * Content Script — injected automatically on all pages.
 * Shows the overlay once the service worker sends results for a region
 * the user selected from the popup.
 */

let overlay: Overlay | null = null;
let currentResults: GameResult[] = [];

// The overlay uses the language chosen in the popup, not always English
const i18nReady = initI18n();

function getOverlay(): Overlay {
  if (!overlay) overlay = new Overlay();
  return overlay;
}

// Listen for messages from popup / service worker
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return;

  // Also tells the service worker that this tab already has a content script
  if (msg.type === 'GET_STATE') {
    sendResponse({ results: currentResults });
    return;
  }

  // Handle screenshot analysis results from service worker
  if (msg.type === 'RESULTS_DETECTED' && validateGameResults(msg.results)) {
    currentResults = msg.results;
    const debugImage = msg.debugImage ?? null;
    i18nReady.then(() => getOverlay().updateResults(currentResults, debugImage));
  }

  // Captures keep failing (or work again); also shown on a page the tab moved on to
  if (msg.type === 'CAPTURE_STATUS' && typeof msg.paused === 'boolean') {
    const paused: boolean = msg.paused;
    i18nReady.then(() => {
      if (overlay || paused) getOverlay().setCapturePaused(paused);
    });
  }
});
