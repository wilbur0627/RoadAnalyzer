/** Extension storage keys */
export const STORAGE_KEYS = {
  LOCALE: 'locale',
  TIER: 'tier',
  LICENSE_KEY: 'licenseKey',
  GAME_HISTORY: 'gameHistory',
  DISCLAIMER_ACCEPTED: 'disclaimerAccepted',
  ROAD_REGION: 'roadRegion',
} as const;

/** Road region selection — pixel coordinates relative to viewport */
export interface RoadRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Server configuration */
export const SERVER_URL = 'https://road-analyzer-henna.vercel.app';

/** User tier levels */
export enum Tier {
  FREE = 'free',
  PREMIUM = 'premium',
}

/** Road display dimensions */
export const ROAD_CONFIG = {
  MAX_ROWS: 6,
  CELL_SIZE: 24,
  CELL_GAP: 2,
  MAX_DISPLAY_COLS: 30,
} as const;
