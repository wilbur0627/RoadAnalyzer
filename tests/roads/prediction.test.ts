import { describe, it, expect } from 'vitest';
import { predict, signalLabel } from '../../src/roads/prediction';
import { buildBigRoad } from '../../src/roads/big-road';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

function fullPredict(results: GameResult[], isPremium = false) {
  const { columns } = buildBigRoad(results);
  return predict(results, columns, isPremium);
}

describe('Prediction Engine', () => {
  it('should return null with too few results', () => {
    const pred = fullPredict(r('B', 'P', 'B'));
    expect(pred).toBeNull();
  });

  it('should return a prediction with enough results', () => {
    const results = r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'B', 'B');
    const pred = fullPredict(results);
    expect(pred).not.toBeNull();
    expect(pred!.outcome).toMatch(/^[BP]$/);
    expect(pred!.confidence).toBeGreaterThan(0);
    expect(pred!.confidence).toBeLessThanOrEqual(75);
  });

  it('should cap confidence at 75%', () => {
    // Even with strong signals, confidence should never exceed 75
    const results = r('B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'B');
    const pred = fullPredict(results);
    if (pred) {
      expect(pred.confidence).toBeLessThanOrEqual(75);
    }
  });

  it('should include signals in the prediction', () => {
    const results = r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'B', 'B');
    const pred = fullPredict(results);
    expect(pred!.signals.length).toBeGreaterThan(0);
    pred!.signals.forEach(s => {
      expect(s.name).toBeTruthy();
      expect(s.outcome).toMatch(/^[BP]$/);
      expect(s.weight).toBeGreaterThan(0);
    });
  });

  it('should provide more signals for premium users', () => {
    const results = r('B', 'B', 'P', 'B', 'P', 'B', 'P', 'B', 'P', 'B', 'P', 'B');
    const freePred = fullPredict(results, false);
    const premiumPred = fullPredict(results, true);
    // Premium should have at least as many signals
    expect(premiumPred!.signals.length).toBeGreaterThanOrEqual(freePred!.signals.length);
  });

  it('should handle all-ties gracefully', () => {
    const results = r('T', 'T', 'T', 'T', 'T', 'T', 'T');
    const pred = fullPredict(results);
    expect(pred).toBeNull();
  });

  it('should handle heavy banker streak', () => {
    const results = r('B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'P', 'B', 'B', 'B', 'B', 'B');
    const pred = fullPredict(results);
    expect(pred).not.toBeNull();
  });

  it('should need 10 hands before predicting, counting ties', () => {
    // 8 Banker/Player hands give a streak signal; the 2 ties make it 10 hands
    expect(fullPredict(r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'T', 'T'))).not.toBeNull();
    expect(fullPredict(r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'T'))).toBeNull();
  });

  it('should scale confidence by the amount of data up to 30 hands', () => {
    // A Banker-only shoe gives one unanimous signal, so confidence = 75 × min(1, hands / 30)
    const bankerOnly = (hands: number) => fullPredict(r(...new Array(hands).fill('B')))!.confidence;
    expect(bankerOnly(10)).toBe(25);
    expect(bankerOnly(20)).toBe(50);
    expect(bankerOnly(30)).toBe(75);
    expect(bankerOnly(45)).toBe(75);
  });
});

describe('signalLabel', () => {
  it('should translate every signal name', () => {
    expect(signalLabel('streak')).toBe('Streak Analysis');
    expect(signalLabel('frequency')).toBe('Frequency');
    expect(signalLabel('pattern_pingpong')).toBe('Pattern Match');
    expect(signalLabel('pattern_zigzag')).toBe('Pattern Match');
    expect(signalLabel('derived_consensus')).toBe('Derived Road Consensus');
    expect(signalLabel('rhythm')).toBe('Rhythm');
  });

  it('should never show an internal id for a signal the engine produces', () => {
    const shoes = [
      r('B', 'P', 'B', 'P', 'B', 'P', 'B', 'P', 'B', 'P', 'B', 'P'),
      r('B', 'B', 'P', 'P', 'B', 'B', 'P', 'P', 'B', 'B', 'P', 'P'),
      r('B', 'B', 'B', 'P', 'P', 'P', 'B', 'B', 'B', 'P', 'P', 'P'),
      r('B', 'B', 'B', 'B', 'B', 'B', 'B', 'B', 'P', 'B', 'B', 'B', 'B', 'B'),
      r('B', 'P', 'P', 'B', 'B', 'B', 'P', 'B', 'B', 'P', 'P', 'P', 'P', 'B'),
    ];
    const names = new Set(shoes.flatMap(shoe => fullPredict(shoe, true)?.signals.map(s => s.name) ?? []));
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) expect(signalLabel(name)).not.toBe(name);
  });
});
