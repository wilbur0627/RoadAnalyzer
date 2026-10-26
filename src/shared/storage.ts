import { STORAGE_KEYS, Tier, RoadRegion, AnalysisResult } from './constants';
import { RoadHistory, toRoadHistory } from './history';
import { AlertSettings, toAlertSettings } from '../roads/alerts';

/** Read a stored tier; anything but Premium (e.g. the retired 'ad_free') counts as Free */
export function toTier(value: unknown): Tier {
  return value === Tier.PREMIUM ? Tier.PREMIUM : Tier.FREE;
}

/** Get user's current tier */
export async function getTier(): Promise<Tier> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.TIER);
    return toTier(data[STORAGE_KEYS.TIER]);
  } catch {
    return Tier.FREE;
  }
}

/** Check if disclaimer has been accepted */
export async function isDisclaimerAccepted(): Promise<boolean> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.DISCLAIMER_ACCEPTED);
    return data[STORAGE_KEYS.DISCLAIMER_ACCEPTED] === true;
  } catch {
    return false;
  }
}

/** Accept disclaimer */
export async function acceptDisclaimer(): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.DISCLAIMER_ACCEPTED]: true });
}

/** Get saved road region */
export async function getSavedRegion(): Promise<RoadRegion | null> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.ROAD_REGION);
    const region = data[STORAGE_KEYS.ROAD_REGION];
    if (region && region.x != null && region.y != null && region.w > 0 && region.h > 0) {
      return region as RoadRegion;
    }
    return null;
  } catch {
    return null;
  }
}

/** Get the pattern alert settings; anything missing or invalid takes its default */
export async function getAlertSettings(): Promise<AlertSettings> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.ALERT_SETTINGS);
    return toAlertSettings(data[STORAGE_KEYS.ALERT_SETTINGS]);
  } catch {
    return toAlertSettings(undefined);
  }
}

/** Save the pattern alert settings (sync storage, so they follow the user's Chrome) */
export async function saveAlertSettings(settings: AlertSettings): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.ALERT_SETTINGS]: settings });
}

/** Last uploaded road image and the server's analysis of it */
export interface LastAnalysis {
  fingerprint: string;
  data: AnalysisResult;
}

/** Get the last analysis (kept in session storage, cleared when the browser closes) */
export async function getLastAnalysis(): Promise<LastAnalysis | null> {
  try {
    const data = await chrome.storage.session.get(STORAGE_KEYS.LAST_ANALYSIS);
    return (data[STORAGE_KEYS.LAST_ANALYSIS] as LastAnalysis | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Save the last analysis; on failure the next capture simply uploads again */
export async function saveLastAnalysis(analysis: LastAnalysis): Promise<void> {
  try {
    await chrome.storage.session.set({ [STORAGE_KEYS.LAST_ANALYSIS]: analysis });
  } catch { /* quota exceeded */ }
}

/** Get the tab whose region is being captured (session storage, so it ends with the browser) */
export async function getCaptureTabId(): Promise<number | null> {
  try {
    const data = await chrome.storage.session.get(STORAGE_KEYS.CAPTURE_TAB_ID);
    const tabId = data[STORAGE_KEYS.CAPTURE_TAB_ID];
    return typeof tabId === 'number' ? tabId : null;
  } catch {
    return null;
  }
}

/** Remember the tab the region was selected on; periodic captures only look at that tab */
export async function saveCaptureTabId(tabId: number): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.CAPTURE_TAB_ID]: tabId });
}

/** Stop associating captures with a tab */
export async function clearCaptureTabId(): Promise<void> {
  await chrome.storage.session.remove(STORAGE_KEYS.CAPTURE_TAB_ID);
}

/**
 * Get the hands recorded across captures (session storage, cleared when the
 * browser closes). A failed read throws instead of returning null, which the
 * next capture would take as no record and start over.
 */
export async function getRoadHistory(): Promise<RoadHistory | null> {
  const data = await chrome.storage.session.get(STORAGE_KEYS.ROAD_HISTORY);
  return toRoadHistory(data[STORAGE_KEYS.ROAD_HISTORY]);
}

/** Save the hands recorded across captures */
export async function saveRoadHistory(history: RoadHistory): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.ROAD_HISTORY]: history });
}

/** How many captures in a row have failed (session storage) */
export async function getCaptureFailures(): Promise<number> {
  try {
    const data = await chrome.storage.session.get(STORAGE_KEYS.CAPTURE_FAILURES);
    const failures = data[STORAGE_KEYS.CAPTURE_FAILURES];
    return Number.isInteger(failures) && failures > 0 ? failures : 0;
  } catch {
    return 0;
  }
}

export async function saveCaptureFailures(failures: number): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.CAPTURE_FAILURES]: failures });
}
