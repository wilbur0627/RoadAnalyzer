import { describe, it, expect } from 'vitest';
import { sequenceToResults, isImageDataUrl, toFrameCells } from '../../src/shared/sanitize';

describe('sequenceToResults', () => {
  it('should convert the server sequence to game results', () => {
    expect(sequenceToResults(['B', 'P', 'T']))
      .toEqual([{ outcome: 'B' }, { outcome: 'P' }, { outcome: 'T' }]);
  });

  it('should accept an empty sequence', () => {
    expect(sequenceToResults([])).toEqual([]);
  });

  it('should reject a sequence with an unknown outcome', () => {
    expect(sequenceToResults(['B', 'X'])).toBeNull();
    expect(sequenceToResults(['B', 1])).toBeNull();
    expect(sequenceToResults(['B', null])).toBeNull();
  });

  it('should reject anything that is not an array', () => {
    expect(sequenceToResults('BPT')).toBeNull();
    expect(sequenceToResults(null)).toBeNull();
    expect(sequenceToResults({ 0: 'B' })).toBeNull();
  });
});

describe('toFrameCells', () => {
  const server = { col: 2, row: 5, result: 'P', has_tie: true, order: 7, x: 60, y: 130, w: 23, h: 23 };

  it('should keep the fields the extension uses', () => {
    expect(toFrameCells([server])).toEqual([{ col: 2, row: 5, result: 'P', has_tie: true, order: 7 }]);
  });

  it('should treat a cell outside the reading, or from a server without orders, as not read', () => {
    expect(toFrameCells([{ ...server, order: null }])?.[0].order).toBeNull();
    const { order: _, ...withoutOrder } = server;
    expect(toFrameCells([withoutOrder])?.[0].order).toBeNull();
  });

  it('should reject anything malformed', () => {
    expect(toFrameCells(undefined)).toBeNull();
    expect(toFrameCells([{ ...server, col: -1 }])).toBeNull();
    expect(toFrameCells([{ ...server, row: 1.5 }])).toBeNull();
    expect(toFrameCells([{ ...server, result: 'X' }])).toBeNull();
    expect(toFrameCells([{ ...server, order: '7' }])).toBeNull();
    expect(toFrameCells([server, null])).toBeNull();
  });
});

describe('isImageDataUrl', () => {
  it('should accept inline PNG and JPEG images', () => {
    expect(isImageDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isImageDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
  });

  it('should reject other URLs and values', () => {
    expect(isImageDataUrl('https://example.com/a.png')).toBe(false);
    expect(isImageDataUrl('javascript:alert(1)')).toBe(false);
    expect(isImageDataUrl('data:text/html;base64,PGgxPg==')).toBe(false);
    expect(isImageDataUrl(null)).toBe(false);
    expect(isImageDataUrl(42)).toBe(false);
  });
});
