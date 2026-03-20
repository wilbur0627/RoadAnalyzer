import { GameResult } from '../roads/types';
import { DetectionStatus } from '../content/detector/detection-engine';

/** Message types for communication between extension components */
export type Message =
  | { type: 'RESULTS_DETECTED'; results: GameResult[]; source?: string }
  | { type: 'DETECTION_STATUS'; status: DetectionStatus }
  | { type: 'GET_STATE' }
  | { type: 'SERVER_HEALTH' }
  | { type: 'SELECT_REGION' }
  | { type: 'ANALYZE_SCREENSHOT'; dataUrl: string; region?: unknown };
