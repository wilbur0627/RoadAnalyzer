/**
 * Background Service Worker (MV3)
 * Captures the selected road region, sends it to the analysis server, adds
 * the hands it shows to the record kept across captures, and broadcasts the
 * record to the popup and the page overlay.
 */

import { checkLicense } from '../monetization/license';
import {
  STORAGE_KEYS, Tier, SERVER_URL, RoadRegion, AnalysisResult, CAPTURE_PAUSE_AFTER_FAILURES,
} from '../shared/constants';
import { clampRegion, cropToPng, fingerprint, canReuseLastResult } from '../shared/crop';
import { stitchFrame } from '../shared/history';
import {
  getSavedRegion, getLastAnalysis, saveLastAnalysis,
  getCaptureTabId, saveCaptureTabId, clearCaptureTabId,
  getRoadHistory, saveRoadHistory, getCaptureFailures, saveCaptureFailures,
} from '../shared/storage';
import { sequenceToResults, isImageDataUrl, toFrameCells } from '../shared/sanitize';
import { Message } from '../shared/messaging';

const CAPTURE_ALARM = 'screenshot-poll';
const LICENSE_ALARM = 'license-check';

/** The tab being captured; captureVisibleTab works per window */
interface CaptureTab {
  id: number;
  windowId: number;
}

/** Captures in progress; a periodic capture is skipped while any is running */
let capturesInFlight = 0;
/** Increases with every capture; a capture that finishes after a newer one started is discarded */
let captureSeq = 0;

/** Run tasks one after another, so the storage reads and writes of one never interleave with the next's */
function queue(): <T>(work: () => Promise<T>) => Promise<T> {
  let last: Promise<unknown> = Promise.resolve();
  return (work) => {
    const run = last.then(work);
    last = run.catch(() => {});
    return run;
  };
}
/** Each update reads, stitches and saves the record */
const recordUpdate = queue();
/** Starting and stopping captures both change the capture alarm and tab */
const targetChange = queue();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  // Server health check
  if (message.type === 'SERVER_HEALTH') {
    fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(10000) })
      .then((r) => {
        if (!r.ok) throw new Error(`Server ${r.status}`);
        return r.json();
      })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  // The region selector finished on a page: analyze it now, then keep it updated
  if (message.type === 'CAPTURE_AND_ANALYZE') {
    const tab = sender.tab;
    if (tab?.id === undefined) return false;
    trackCapture(() => startCapture({ id: tab.id!, windowId: tab.windowId }, message.region))
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }

  return false;
});

async function trackCapture<T>(work: () => Promise<T>): Promise<T> {
  capturesInFlight++;
  try {
    return await work();
  } finally {
    capturesInFlight--;
  }
}

/** Analyze a newly selected region and re-capture that tab every 10 seconds */
async function startCapture(tab: CaptureTab, region: RoadRegion | null): Promise<AnalysisResult | null> {
  await targetChange(async () => {
    await saveCaptureTabId(tab.id);
    await chrome.alarms.create(CAPTURE_ALARM, { periodInMinutes: 10 / 60 });
  });
  await ensureContentScript(tab.id).catch(() => { /* the popup still gets the results */ });
  return captureAndAnalyze(region, tab, { manual: true });
}

/** Periodic capture of the tab the region was selected on */
async function pollCapture(): Promise<void> {
  const [tabId, region] = await Promise.all([getCaptureTabId(), getSavedRegion()]);
  if (tabId === null || !region) {
    await stopCapture(tabId);
    return;
  }

  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    await stopCapture(tabId); // the tab was closed
    return;
  }

  // captureVisibleTab only sees a window's active tab, so wait until this tab is shown again
  if (!tab.active) return;
  await captureAndAnalyze(region, { id: tabId, windowId: tab.windowId }, { manual: false });
}

/** Stop capturing `tabId`; a region selected on another tab in the meantime keeps its capture */
async function stopCapture(tabId: number | null): Promise<void> {
  await targetChange(async () => {
    if ((await getCaptureTabId()) !== tabId) return;
    await chrome.alarms.clear(CAPTURE_ALARM);
    await clearCaptureTabId();
    await saveCaptureFailures(0);
  });
}

/** Tabs opened before the extension was installed or updated have no content script, so no overlay */
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'GET_STATE' });
    return;
  } catch {
    // Nothing is listening in this tab
  }
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
  if (files.length > 0) {
    await chrome.scripting.executeScript({ target: { tabId }, files });
  }
}

/**
 * Capture and analyze, counting the captures that fail in a row (a page on
 * another site without capture access, a server error, a region off the tab):
 * once there are a few, the popup and the overlay say capturing is paused,
 * since their results have stopped updating.
 */
async function captureAndAnalyze(
  region: RoadRegion | null,
  tab: CaptureTab,
  options: { manual: boolean },
): Promise<AnalysisResult | null> {
  let data: AnalysisResult | null;
  try {
    data = await analyzeCapture(region, tab, options);
  } catch (err) {
    await noteCaptureResult(false, tab.id).catch(() => {});
    throw err;
  }
  // null: a newer capture took over, so this one tells nothing
  if (data) await noteCaptureResult(true, tab.id).catch(() => {});
  return data;
}

async function noteCaptureResult(ok: boolean, tabId: number): Promise<void> {
  const before = await getCaptureFailures();
  const after = ok ? 0 : before + 1;
  if (after === before) return;
  await saveCaptureFailures(after);
  const paused = after >= CAPTURE_PAUSE_AFTER_FAILURES;
  if (paused !== before >= CAPTURE_PAUSE_AFTER_FAILURES) broadcast({ type: 'CAPTURE_STATUS', paused }, tabId);
}

/**
 * Capture the visible tab, send only the road region to the Python server for
 * analysis, add the hands it shows to the record, and broadcast the record.
 * A periodic capture whose cropped image is unchanged reuses the last result
 * instead of uploading it again; a manual one (a new selection) always uploads.
 */
async function analyzeCapture(
  region: RoadRegion | null,
  tab: CaptureTab,
  { manual }: { manual: boolean },
): Promise<AnalysisResult | null> {
  const seq = ++captureSeq;
  const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

  const resp = await fetch(dataUrl);
  const screenshot = await resp.blob();
  const upload = await cropScreenshot(screenshot, region);

  const frame = await fingerprint(await upload.arrayBuffer());
  const last = manual ? null : await getLastAnalysis();
  if (last && canReuseLastResult(frame, last, manual)) {
    if (seq !== captureSeq) return null;
    await recordAndBroadcast(last.data, tab.id, manual);
    return last.data;
  }

  const form = new FormData();
  form.append('image', upload, 'screenshot.png');

  const serverResp = await fetch(`${SERVER_URL}/analyze`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(10000),
  });

  if (!serverResp.ok) throw new Error(`Server ${serverResp.status}`);
  const data = parseAnalysis(await serverResp.json());

  // A newer capture started meanwhile (e.g. a new region was selected)
  if (seq !== captureSeq) return null;

  await saveLastAnalysis({ fingerprint: frame, data });
  await recordAndBroadcast(data, tab.id, manual);
  return data;
}

/** Add a frame's hands to the record kept across captures, then broadcast the whole record */
function recordAndBroadcast(data: AnalysisResult, tabId: number, manual: boolean): Promise<void> {
  const frame = { cells: data.cells ?? [], hands: (data.sequence ?? []).join('') };
  return recordUpdate(async () => {
    const history = stitchFrame(await getRoadHistory(), frame, { manual });
    await saveRoadHistory(history);
    // The preview still shows this frame
    broadcastResults(history.hands, data.debug_image ?? null, tabId);
  });
}

/**
 * Crop the screenshot to the road region. Nothing outside the region is ever
 * uploaded: a region that misses the visible tab entirely is an error.
 */
async function cropScreenshot(screenshot: Blob, region: RoadRegion | null): Promise<Blob> {
  // No color conversion, so the pixels stay exactly what the server would decode
  const bitmap = await createImageBitmap(screenshot, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  try {
    const crop = clampRegion(region, bitmap.width, bitmap.height);
    if (!crop) throw new Error('The road region is outside the visible tab');
    return await cropToPng(bitmap, crop);
  } finally {
    bitmap.close();
  }
}

/** Keep only the validated fields of the server's /analyze response */
function parseAnalysis(body: unknown): AnalysisResult {
  const { sequence = [], cells: rawCells, debug_image } = (body ?? {}) as {
    sequence?: unknown; cells?: unknown; debug_image?: unknown;
  };
  // Without the cells, frames can't be matched and the record would silently stop growing
  const cells = toFrameCells(rawCells);
  if (!sequenceToResults(sequence) || !cells) throw new Error('Invalid analysis from server');
  return {
    sequence: sequence as string[],
    cells,
    debug_image: isImageDataUrl(debug_image) ? debug_image : null,
  };
}

/** Send the recorded hands to the popup and to the captured tab's overlay */
function broadcastResults(hands: string, debugImage: string | null, tabId: number) {
  const results = sequenceToResults(hands.split(''));
  if (!results || results.length === 0) return;

  broadcast({ type: 'RESULTS_DETECTED', results, source: 'screenshot', debugImage }, tabId);
}

/** Send a message to the popup (if open) and to the content script on the captured tab (for overlay) */
function broadcast(msg: Message, tabId: number) {
  chrome.runtime.sendMessage(msg).catch(() => {});
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

// Handle extension install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set({
      [STORAGE_KEYS.TIER]: Tier.FREE,
      [STORAGE_KEYS.DISCLAIMER_ACCEPTED]: false,
    });
  }
});

/**
 * Alarms can be cleared by a browser restart or an extension update, which
 * would silently stop license checks, so recreate it whenever the worker starts.
 */
async function ensureLicenseAlarm(): Promise<void> {
  if (await chrome.alarms.get(LICENSE_ALARM)) return;
  chrome.alarms.create(LICENSE_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: 60 * 12, // Every 12 hours
  });
}
ensureLicenseAlarm();

// Handle periodic alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === LICENSE_ALARM) {
    await checkLicense();
  }

  if (alarm.name === CAPTURE_ALARM) {
    // Skip this tick while the previous capture is still uploading
    if (capturesInFlight > 0) return;
    try {
      await trackCapture(pollCapture);
    } catch {
      // The tab might not be capturable right now (e.g. chrome:// pages) — try again next tick
    }
  }
});
