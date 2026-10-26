import { describe, it, expect } from 'vitest';
import { clampRegion, canReuseLastResult, fingerprint } from '../../src/shared/crop';
import { RoadRegion } from '../../src/shared/constants';

describe('clampRegion (mirrors server _crop_region)', () => {
  it('should keep a region that fits inside the image', () => {
    expect(clampRegion({ x: 10, y: 20, w: 100, h: 50 }, 1280, 800))
      .toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('should trim a region that runs past the right and bottom edges', () => {
    expect(clampRegion({ x: 1200, y: 700, w: 200, h: 200 }, 1280, 800))
      .toEqual({ x: 1200, y: 700, w: 80, h: 100 });
  });

  it('should move a negative origin to 0 without shrinking the size, like the server', () => {
    // server: x = max(0, min(x, iw)) → 0, then w = min(w, iw - x) keeps w
    expect(clampRegion({ x: -10, y: -5, w: 100, h: 50 }, 1280, 800))
      .toEqual({ x: 0, y: 0, w: 100, h: 50 });
  });

  it('should return null when the region starts outside the image', () => {
    expect(clampRegion({ x: 1280, y: 0, w: 100, h: 50 }, 1280, 800)).toBeNull();
    expect(clampRegion({ x: 0, y: 800, w: 100, h: 50 }, 1280, 800)).toBeNull();
  });

  it('should return null for zero or negative sizes', () => {
    expect(clampRegion({ x: 10, y: 10, w: 0, h: 50 }, 1280, 800)).toBeNull();
    expect(clampRegion({ x: 10, y: 10, w: 100, h: -1 }, 1280, 800)).toBeNull();
  });

  it('should return null when there is no region', () => {
    expect(clampRegion(null, 1280, 800)).toBeNull();
    expect(clampRegion(undefined, 1280, 800)).toBeNull();
  });

  it('should truncate fractional values toward zero like Python int()', () => {
    expect(clampRegion({ x: 10.9, y: 20.2, w: 100.7, h: 50.5 }, 1280, 800))
      .toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });

  it('should return null for non-numeric values', () => {
    expect(clampRegion({ x: NaN, y: 0, w: 100, h: 50 }, 1280, 800)).toBeNull();
  });

  it('should return null instead of coercing null or strings to numbers', () => {
    const stored = (value: unknown) => ({ x: value, y: 0, w: 100, h: 50 }) as unknown as RoadRegion;
    expect(clampRegion(stored(null), 1280, 800)).toBeNull();
    expect(clampRegion(stored(''), 1280, 800)).toBeNull();
    expect(clampRegion(stored('10'), 1280, 800)).toBeNull();
  });
});

describe('canReuseLastResult', () => {
  const last = { fingerprint: 'abc' };

  it('should reuse the last result when a periodic capture is unchanged', () => {
    expect(canReuseLastResult('abc', last, false)).toBe(true);
  });

  it('should upload when the image changed', () => {
    expect(canReuseLastResult('def', last, false)).toBe(false);
  });

  it('should always upload a manual capture', () => {
    expect(canReuseLastResult('abc', last, true)).toBe(false);
  });

  it('should upload when there is no previous result', () => {
    expect(canReuseLastResult('abc', null, false)).toBe(false);
  });
});

describe('fingerprint', () => {
  const bytes = (...values: number[]) => new Uint8Array(values).buffer;

  it('should return a 64-character hex SHA-256 digest', async () => {
    expect(await fingerprint(bytes(1, 2, 3))).toMatch(/^[0-9a-f]{64}$/);
  });

  it('should be identical for identical bytes', async () => {
    expect(await fingerprint(bytes(1, 2, 3))).toBe(await fingerprint(bytes(1, 2, 3)));
  });

  it('should differ when a single byte changes', async () => {
    expect(await fingerprint(bytes(1, 2, 3))).not.toBe(await fingerprint(bytes(1, 2, 4)));
  });

  it('should match the known SHA-256 of [1, 2, 3], including zero-padded bytes', async () => {
    // The digest contains bytes below 0x10 (e.g. "03", "0a"), which need padStart
    expect(await fingerprint(bytes(1, 2, 3)))
      .toBe('039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81');
  });
});
