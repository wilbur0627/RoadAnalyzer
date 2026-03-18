/** Extension storage keys */
export const STORAGE_KEYS = {
  LOCALE: 'locale',
  TIER: 'tier',
  LICENSE_KEY: 'licenseKey',
  GAME_HISTORY: 'gameHistory',
  DISCLAIMER_ACCEPTED: 'disclaimerAccepted',
} as const;

/** User tier levels */
export enum Tier {
  FREE = 'free',
  AD_FREE = 'ad_free',
  PREMIUM = 'premium',
}

/** Road display dimensions */
export const ROAD_CONFIG = {
  MAX_ROWS: 6,
  CELL_SIZE: 24,
  CELL_GAP: 2,
  MAX_DISPLAY_COLS: 30,
} as const;
