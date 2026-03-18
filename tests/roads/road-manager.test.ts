import { describe, it, expect } from 'vitest';
import { RoadManager } from '../../src/roads/road-manager';

describe('RoadManager', () => {
  it('should start with empty results', () => {
    const rm = new RoadManager();
    expect(rm.count).toBe(0);
    expect(rm.getResults()).toEqual([]);
  });

  it('should add results', () => {
    const rm = new RoadManager();
    rm.addResult({ outcome: 'B' });
    rm.addResult({ outcome: 'P' });
    expect(rm.count).toBe(2);
  });

  it('should set results', () => {
    const rm = new RoadManager();
    rm.setResults([{ outcome: 'B' }, { outcome: 'P' }]);
    expect(rm.count).toBe(2);
  });

  it('should clear results', () => {
    const rm = new RoadManager();
    rm.addResult({ outcome: 'B' });
    rm.clear();
    expect(rm.count).toBe(0);
  });

  it('should analyze and return all 5 road types', () => {
    const rm = new RoadManager();
    const results = 'BBPPPBBPBPPBBPP'.split('').map(o => ({ outcome: o as 'B' | 'P' | 'T' }));
    rm.setResults(results);

    const analysis = rm.analyze();
    expect(analysis.bigRoad).toBeDefined();
    expect(analysis.beadPlate).toBeDefined();
    expect(analysis.bigEyeBoy).toBeDefined();
    expect(analysis.smallRoad).toBeDefined();
    expect(analysis.cockroachPig).toBeDefined();
    expect(analysis.columns).toBeDefined();
    expect(analysis.columns.length).toBeGreaterThan(0);
  });

  it('should return independent copies of results', () => {
    const rm = new RoadManager();
    rm.addResult({ outcome: 'B' });
    const results = rm.getResults();
    results.push({ outcome: 'P' });
    expect(rm.count).toBe(1); // Original should be unchanged
  });
});
