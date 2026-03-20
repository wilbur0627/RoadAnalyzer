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

  // Capture visible tab screenshot, then send to Python server for analysis
  if (message.type === 'CAPTURE_AND_ANALYZE') {
    const { region } = message;
    const windowId = sender.tab?.windowId;
    captureAndAnalyze(region, windowId ?? chrome.windows.WINDOW_ID_CURRENT)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));

    // Set up periodic re-capture every 3 seconds
    chrome.alarms.create('screenshot-poll', { periodInMinutes: 0.05 }); // ~3s
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

/** Capture the visible tab, send to Python server for analysis, and broadcast results */
async function captureAndAnalyze(
  region: { x: number; y: number; w: number; h: number } | null,
  windowId: number,
) {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });

  const resp = await fetch(dataUrl);
  const blob = await resp.blob();

  const form = new FormData();
  form.append('image', blob, 'screenshot.png');
  if (region) form.append('region', JSON.stringify(region));

  const serverResp = await fetch(`${SERVER_URL}/analyze`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10000),
  });

  if (!serverResp.ok) throw new Error(`Server ${serverResp.status}`);
  const data = await serverResp.json();

  // Broadcast results if any were detected
  if (data.results && data.results.length > 0) {
    chrome.runtime.sendMessage({
      type: 'RESULTS_DETECTED',
      results: data.results,
      source: 'screenshot',
    }).catch(() => {});
  }

  return data;
}

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

// Handle periodic alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'license-check') {
    await checkLicense();
  }

  if (alarm.name === 'screenshot-poll') {
    try {
      const data = await chrome.storage.sync.get('roadRegion');
      if (!data.roadRegion) {
        chrome.alarms.clear('screenshot-poll');
        return;
      }
      await captureAndAnalyze(data.roadRegion, chrome.windows.WINDOW_ID_CURRENT);
    } catch {
      // Tab might not be capturable (e.g. chrome:// pages) — ignore
    }
  }
});
