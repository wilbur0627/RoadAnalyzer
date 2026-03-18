import { STORAGE_KEYS, Tier } from './constants';
import { GameResult } from '../roads/types';

/** Get user's current tier */
export async function getTier(): Promise<Tier> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.TIER);
    return (data[STORAGE_KEYS.TIER] as Tier) ?? Tier.FREE;
  } catch {
    return Tier.FREE;
  }
}

/** Set user's tier */
export async function setTier(tier: Tier): Promise<void> {
  await chrome.storage.sync.set({ [STORAGE_KEYS.TIER]: tier });
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

/** Save game history for current session */
export async function saveGameHistory(results: GameResult[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.GAME_HISTORY]: results });
}

/** Load game history */
export async function loadGameHistory(): Promise<GameResult[]> {
  try {
    const data = await chrome.storage.local.get(STORAGE_KEYS.GAME_HISTORY);
    return data[STORAGE_KEYS.GAME_HISTORY] ?? [];
  } catch {
    return [];
  }
}
