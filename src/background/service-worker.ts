/**
 * Background Service Worker (MV3)
 * Manages extension state, relays messages, and server proxy.
 */

import { checkLicense } from '../monetization/license';
import { STORAGE_KEYS, Tier, SERVER_URL } from '../shared/constants';

// Relay messages between content script and popup (with sender validation)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (message.type === 'RESULTS_DETECTED' || message.type === 'DETECTION_STATUS') {
    chrome.runtime.sendMessage(message).catch(() => {});
  }

  // Server health check
  if (message.type === 'SERVER_HEALTH') {
    fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => r.json())
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // Analyze screenshot via Python server (proxy for content script)
  if (message.type === 'ANALYZE_SCREENSHOT') {
    const { dataUrl, region } = message;
    fetch(dataUrl)
      .then((r) => r.blob())
      .then((blob) => {
        const form = new FormData();
        form.append('image', blob, 'screenshot.png');
        if (region) form.append('region', JSON.stringify(region));
        return fetch(`${SERVER_URL}/analyze`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(10000),
        });
      })
      .then((r) => {
        if (!r.ok) throw new Error(`Server ${r.status}`);
        return r.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
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

// Handle periodic alarms — re-validate license via LemonSqueezy
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'license-check') {
    await checkLicense();
  }
});
