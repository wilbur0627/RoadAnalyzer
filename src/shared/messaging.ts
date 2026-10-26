import { GameResult } from '../roads/types';
import { RoadRegion } from './constants';

/** Message types for communication between extension components */
export type Message =
  | { type: 'RESULTS_DETECTED'; results: GameResult[]; source?: string; debugImage?: string | null }
  | { type: 'CAPTURE_AND_ANALYZE'; region: RoadRegion }
  | { type: 'CAPTURE_STATUS'; paused: boolean }
  | { type: 'GET_STATE' }
  | { type: 'SERVER_HEALTH' };
