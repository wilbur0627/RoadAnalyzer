import { BigRoadColumn } from './types';

/** Road patterns the overlay can point out (Premium) */
export type AlertKind = 'dragon' | 'singleJump' | 'doubleJump';

export const ALERT_KINDS: AlertKind[] = ['dragon', 'singleJump', 'doubleJump'];

/**
 * When each alert fires, and the range the settings accept:
 * - dragon: hands in the current column
 * - singleJump: columns of one hand in a row (B-P-B-P)
 * - doubleJump: columns of two hands in a row (BB-PP-BB)
 */
export const ALERT_THRESHOLDS: Record<AlertKind, { default: number; min: number; max: number }> = {
  dragon: { default: 6, min: 4, max: 12 },
  singleJump: { default: 4, min: 3, max: 10 },
  doubleJump: { default: 3, min: 2, max: 8 },
};

export type AlertSettings = Record<AlertKind, { enabled: boolean; threshold: number }>;

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  dragon: { enabled: true, threshold: ALERT_THRESHOLDS.dragon.default },
  singleJump: { enabled: true, threshold: ALERT_THRESHOLDS.singleJump.default },
  doubleJump: { enabled: true, threshold: ALERT_THRESHOLDS.doubleJump.default },
};

/** A pattern on the road right now */
export interface RoadAlert {
  kind: AlertKind;
  /** Outcome of the current column */
  outcome: 'B' | 'P';
  /** Hands in the dragon, or columns in the run of jumps */
  count: number;
  /** Index of the pattern's first column; the same pattern keeps it as it grows */
  since: number;
}

/** Stored settings are untrusted: any field that is missing or invalid takes its default */
export function toAlertSettings(value: unknown): AlertSettings {
  const stored = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const settings = {} as AlertSettings;
  for (const kind of ALERT_KINDS) {
    const item = (stored[kind] && typeof stored[kind] === 'object' ? stored[kind] : {}) as Record<string, unknown>;
    const { min, max } = ALERT_THRESHOLDS[kind];
    const threshold = item.threshold;
    settings[kind] = {
      enabled: typeof item.enabled === 'boolean' ? item.enabled : DEFAULT_ALERT_SETTINGS[kind].enabled,
      threshold: Number.isInteger(threshold) && (threshold as number) >= min && (threshold as number) <= max
        ? (threshold as number)
        : DEFAULT_ALERT_SETTINGS[kind].threshold,
    };
  }
  return settings;
}

/** Columns at the end of the road that hold exactly `length` hands */
function trailingColumns(columns: BigRoadColumn[], length: number): number {
  let count = 0;
  for (let i = columns.length - 1; i >= 0 && columns[i].cells.length === length; i--) count++;
  return count;
}

/** The enabled patterns that the road shows right now */
export function activeAlerts(columns: BigRoadColumn[], settings: AlertSettings): RoadAlert[] {
  const last = columns[columns.length - 1];
  if (!last) return [];
  const alerts: RoadAlert[] = [];

  if (settings.dragon.enabled && last.cells.length >= settings.dragon.threshold) {
    alerts.push({ kind: 'dragon', outcome: last.outcome, count: last.cells.length, since: columns.length - 1 });
  }

  const singles = trailingColumns(columns, 1);
  if (settings.singleJump.enabled && singles >= settings.singleJump.threshold) {
    alerts.push({ kind: 'singleJump', outcome: last.outcome, count: singles, since: columns.length - singles });
  }

  // A current column of one hand may still become the next pair, so it doesn't end the run
  const done = last.cells.length === 1 ? columns.slice(0, -1) : columns;
  const doubles = trailingColumns(done, 2);
  if (settings.doubleJump.enabled && doubles >= settings.doubleJump.threshold) {
    alerts.push({ kind: 'doubleJump', outcome: last.outcome, count: doubles, since: done.length - doubles });
  }

  return alerts;
}
