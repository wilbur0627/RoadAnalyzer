/**
 * Safe DOM construction helpers.
 * NEVER use innerHTML with data from external pages or APIs.
 */

import { GameResult } from '../roads/types';
import { FrameCell } from './constants';

/** Create an element with optional attributes and text content */
export function el(
  tag: string,
  attrs?: Record<string, string>,
  text?: string,
): HTMLElement {
  const element = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'style') {
        element.style.cssText = value;
      } else {
        element.setAttribute(key, value);
      }
    }
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

/** Safely set text content, returning the element for chaining */
export function setText(element: HTMLElement, text: string): HTMLElement {
  element.textContent = text;
  return element;
}

/** Clear all children of an element */
export function clearChildren(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/** Validate that a value is a safe number (not NaN/Infinity) */
export function safeNumber(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n;
}

/** Validate a URL is HTTPS */
export function isSecureUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const VALID_OUTCOMES = new Set(['B', 'P', 'T']);

/** Validate GameResult structure from untrusted sources */
export function validateGameResults(data: unknown): boolean {
  if (!Array.isArray(data)) return false;
  return data.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      'outcome' in item &&
      VALID_OUTCOMES.has(item.outcome),
  );
}

/** Convert the server's sequence (["B","P","T",...]) to GameResults; null if any entry is invalid */
export function sequenceToResults(sequence: unknown): GameResult[] | null {
  if (!Array.isArray(sequence)) return null;
  const results = sequence.map((outcome) => ({ outcome }));
  return validateGameResults(results) ? (results as GameResult[]) : null;
}

const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

/**
 * Keep the fields the extension uses of the server's cells; null if any cell
 * is malformed. A cell without an order (from an older server) counts as not read.
 */
export function toFrameCells(value: unknown): FrameCell[] | null {
  if (!Array.isArray(value)) return null;
  const cells: FrameCell[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const { col, row, result, has_tie, order } = item as Record<string, unknown>;
    if (!isIndex(col) || !isIndex(row) || (result !== 'B' && result !== 'P' && result !== 'T')) return null;
    if (order != null && !isIndex(order)) return null;
    cells.push({ col, row, result, has_tie: has_tie === true, order: isIndex(order) ? order : null });
  }
  return cells;
}

/** Accept only inline PNG/JPEG data URLs as debug images from the server */
export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && /^data:image\/(png|jpeg);base64,/.test(value);
}
