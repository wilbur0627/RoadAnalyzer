import { describe, it, expect } from 'vitest';
import { activeAlerts, toAlertSettings, DEFAULT_ALERT_SETTINGS, AlertSettings } from '../../src/roads/alerts';
import { buildBigRoad } from '../../src/roads/big-road';

/** Big Road columns of a shoe written as a string, e.g. 'BBPT' */
function columns(shoe: string) {
  return buildBigRoad(shoe.split('').map(o => ({ outcome: o as 'B' | 'P' | 'T' }))).columns;
}

const defaults = DEFAULT_ALERT_SETTINGS;

describe('activeAlerts', () => {
  it('should point out a dragon from its threshold on', () => {
    expect(activeAlerts(columns('PBBBBB'), defaults)).toEqual([]);
    expect(activeAlerts(columns('PBBBBBB'), defaults)).toEqual([
      { kind: 'dragon', outcome: 'B', count: 6, since: 1 },
    ]);
  });

  it('should keep the same key while a dragon grows', () => {
    const [six] = activeAlerts(columns('PBBBBBB'), defaults);
    const [eight] = activeAlerts(columns('PBBBBBBBB'), defaults);
    expect(eight).toEqual({ kind: 'dragon', outcome: 'B', count: 8, since: 1 });
    expect(eight.since).toBe(six.since);
  });

  it('should point out single jumps while every recent column has one hand', () => {
    expect(activeAlerts(columns('BPB'), defaults)).toEqual([]);
    expect(activeAlerts(columns('BPBP'), defaults)).toEqual([
      { kind: 'singleJump', outcome: 'P', count: 4, since: 0 },
    ]);
    expect(activeAlerts(columns('BBPBPB'), defaults)).toEqual([
      { kind: 'singleJump', outcome: 'B', count: 4, since: 1 },
    ]);
    // The last column grew to two hands
    expect(activeAlerts(columns('BPBPP'), defaults)).toEqual([]);
  });

  it('should point out double jumps, and keep them while the next column may still become a pair', () => {
    expect(activeAlerts(columns('BBPP'), defaults)).toEqual([]);
    expect(activeAlerts(columns('BBPPBB'), defaults)).toEqual([
      { kind: 'doubleJump', outcome: 'B', count: 3, since: 0 },
    ]);
    expect(activeAlerts(columns('BBPPBBP'), defaults)).toEqual([
      { kind: 'doubleJump', outcome: 'P', count: 3, since: 0 },
    ]);
    expect(activeAlerts(columns('BBPPBBPP'), defaults)).toEqual([
      { kind: 'doubleJump', outcome: 'P', count: 4, since: 0 },
    ]);
    // The last column went past two hands
    expect(activeAlerts(columns('BBPPBBPPP'), defaults)).toEqual([]);
  });

  it('should leave out disabled alerts and use the thresholds set', () => {
    const noDragon: AlertSettings = { ...defaults, dragon: { enabled: false, threshold: 6 } };
    expect(activeAlerts(columns('PBBBBBB'), noDragon)).toEqual([]);
    const noJumps: AlertSettings = {
      ...defaults,
      singleJump: { enabled: false, threshold: 4 },
      doubleJump: { enabled: false, threshold: 3 },
    };
    expect(activeAlerts(columns('BPBP'), noJumps)).toEqual([]);
    expect(activeAlerts(columns('BBPPBB'), noJumps)).toEqual([]);
    const shortDragon: AlertSettings = { ...defaults, dragon: { enabled: true, threshold: 4 } };
    expect(activeAlerts(columns('PBBBB'), shortDragon)).toEqual([
      { kind: 'dragon', outcome: 'B', count: 4, since: 1 },
    ]);
  });

  it('should ignore ties', () => {
    expect(activeAlerts(columns('PBTBBTBBB'), defaults)).toEqual(activeAlerts(columns('PBBBBBB'), defaults));
  });

  it('should return nothing for an empty road', () => {
    expect(activeAlerts([], defaults)).toEqual([]);
    expect(activeAlerts(columns('TT'), defaults)).toEqual([]);
  });
});

describe('toAlertSettings', () => {
  it('should use the defaults when nothing valid is stored', () => {
    expect(toAlertSettings(undefined)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(toAlertSettings(null)).toEqual(DEFAULT_ALERT_SETTINGS);
    expect(toAlertSettings('dragon')).toEqual(DEFAULT_ALERT_SETTINGS);
  });

  it('should keep valid stored settings', () => {
    const stored: AlertSettings = {
      dragon: { enabled: false, threshold: 12 },
      singleJump: { enabled: true, threshold: 3 },
      doubleJump: { enabled: false, threshold: 8 },
    };
    expect(toAlertSettings(stored)).toEqual(stored);
  });

  it('should replace each invalid field with its default', () => {
    expect(toAlertSettings({
      dragon: { enabled: 'yes', threshold: 13 },
      singleJump: { enabled: false, threshold: 2 },
      doubleJump: { enabled: true, threshold: 2.5 },
    })).toEqual({
      dragon: { enabled: true, threshold: 6 },
      singleJump: { enabled: false, threshold: 4 },
      doubleJump: { enabled: true, threshold: 3 },
    });
    expect(toAlertSettings({ dragon: { enabled: false, threshold: '8' } })).toEqual({
      ...DEFAULT_ALERT_SETTINGS,
      dragon: { enabled: false, threshold: 6 },
    });
  });
});
