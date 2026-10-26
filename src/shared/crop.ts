import { RoadRegion } from './constants';

/**
 * Clamp a road region to the screenshot bounds, the way _crop_region() in
 * server/road_detector.py does, so the crop holds exactly the pixels the server
 * would have cropped itself.
 * Returns null when nothing is left to crop; the caller then uploads nothing.
 */
export function clampRegion(
  region: RoadRegion | null | undefined,
  imageWidth: number,
  imageHeight: number,
): RoadRegion | null {
  if (!region) return null;

  // Stored regions are untrusted; Math.trunc would turn null or '' into 0
  const values = [region.x, region.y, region.w, region.h];
  if (!values.every((v) => typeof v === 'number' && Number.isFinite(v))) return null;

  // The server parses each value with int(), which truncates toward zero
  let [x, y, w, h] = values.map(Math.trunc);

  x = Math.max(0, Math.min(x, imageWidth));
  y = Math.max(0, Math.min(y, imageHeight));
  w = Math.min(w, imageWidth - x);
  h = Math.min(h, imageHeight - y);
  if (w <= 0 || h <= 0) return null;

  return { x, y, w, h };
}

/** Crop a decoded screenshot and re-encode it as a lossless PNG */
export async function cropToPng(image: ImageBitmap, rect: RoadRegion): Promise<Blob> {
  const canvas = new OffscreenCanvas(rect.w, rect.h);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  return canvas.convertToBlob({ type: 'image/png' });
}

/** SHA-256 hex digest of an upload, used to detect unchanged frames */
export async function fingerprint(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A periodic capture whose image matches the last upload can reuse that result.
 * A new region already yields a different image; forcing the upload means that
 * selecting the same unchanged area again still gets a fresh analysis.
 */
export function canReuseLastResult(
  frameFingerprint: string,
  last: { fingerprint: string } | null,
  forceUpload: boolean,
): boolean {
  return !forceUpload && last?.fingerprint === frameFingerprint;
}
