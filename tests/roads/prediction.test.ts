import { describe, it, expect } from 'vitest';
import { predict } from '../../src/roads/prediction';
import { buildBigRoad } from '../../src/roads/big-road';
import { buildBigEyeBoy, buildSmallRoad, buildCockroachPig } from '../../src/roads/derived-road';
import { GameResult } from '../../src/roads/types';

function r(...outcomes: string[]): GameResult[] {
  return outcomes.map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
}

function fullPredict(results: GameResult[], isPremium = false) {
  const { columns } = buildBigRoad(results);
  const bigEyeBoy = buildBigEyeBoy(columns);
  const smallRoad = buildSmallRoad(columns);
  const cockroachPig = buildCockroachPig(columns);
  return predict(results, columns, bigEyeBoy, smallRoad, cockroachPig, isPremium);
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
});
