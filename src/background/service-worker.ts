/**
 * Background Service Worker (MV3)
 * Manages extension state, relays messages, and handles periodic tasks.
 */

import { checkLicense } from '../monetization/license';
import { STORAGE_KEYS, Tier } from '../shared/constants';

// Relay messages between content script and popup (with sender validation)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only accept messages from our own extension's content scripts
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'RESULTS_DETECTED' || message.type === 'DETECTION_STATUS') {
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup not open — ignore
    });
  }
  return false;
});

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      [STORAGE_KEYS.TIER]: Tier.FREE,
      [STORAGE_KEYS.DISCLAIMER_ACCEPTED]: false,
    });

    // Set up periodic license check alarm
    chrome.alarms.create('license-check', {
      periodInMinutes: 60 * 12, // Every 12 hours
    });
  }
});

// Inject content script when user clicks the extension icon
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id || !tab.url) return;
  // Only inject on http/https pages
  if (!tab.url.startsWith('http://') && !tab.url.startsWith('https://')) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content/index.ts'],
    });
  } catch {
    // Script already injected or page doesn't allow injection
  }
});

// Handle periodic alarms — re-validate license via LemonSqueezy
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'license-check') {
    await checkLicense();
  }
});
