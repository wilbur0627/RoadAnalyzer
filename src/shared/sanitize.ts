/**
 * Safe DOM construction helpers.
 * NEVER use innerHTML with data from external pages or APIs.
 */

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
