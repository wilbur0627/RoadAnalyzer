/** Extension storage keys */
export const STORAGE_KEYS = {
  LOCALE: 'locale',
  TIER: 'tier',
  LICENSE_KEY: 'licenseKey',
  LICENSE_INSTANCE_ID: 'licenseInstanceId',
  LICENSE_CACHE: 'licenseCache',
  DISCLAIMER_ACCEPTED: 'disclaimerAccepted',
  ROAD_REGION: 'roadRegion',
  LAST_ANALYSIS: 'lastAnalysis',
  CAPTURE_TAB_ID: 'captureTabId',
  ROAD_HISTORY: 'roadHistory',
  CAPTURE_FAILURES: 'captureFailures',
} as const;

/** Captures that fail in a row before the popup and the overlay say capturing is paused */
export const CAPTURE_PAUSE_AFTER_FAILURES = 3;

/** Road region selection — pixel coordinates relative to viewport */
export interface RoadRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Server configuration. VITE_SERVER_URL targets another server, but only in a
 * non-production build mode (e.g. `vite build --mode e2e`), so a stray .env
 * value can never end up in the store build.
 * The production server turns away uploads whose Origin isn't the store build's
 * extension ID (server/vercel.json). That only filters casual traffic, since any
 * non-browser client can send that Origin. An unpacked build pointed at it sees a
 * failed request: the rejection carries no CORS headers, so the 403 isn't readable.
 */
const PRODUCTION_SERVER_URL = 'https://road-analyzer-henna.vercel.app';
export const SERVER_URL =
  (import.meta.env.MODE !== 'production' && import.meta.env.VITE_SERVER_URL) || PRODUCTION_SERVER_URL;

/**
 * A Big Road cell the server found. `order` is its place in the server's
 * reading of the frame; the tail of a streak that started off screen is not
 * read and has none.
 */
export interface FrameCell {
  col: number;
  row: number;
  result: 'B' | 'P' | 'T';
  has_tie: boolean;
  order: number | null;
}

/** Fields of the server's /analyze response that the extension uses */
export interface AnalysisResult {
  sequence?: string[];
  cells?: FrameCell[];
  debug_image?: string | null;
}

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
