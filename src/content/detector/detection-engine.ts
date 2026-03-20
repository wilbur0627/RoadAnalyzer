import { GameResult } from '../../roads/types';
import { scanDOM } from './dom-scanner';
import { scanCanvases } from './canvas-reader';
import { findProfile, SiteProfile } from '../site-profiles/profile-registry';
// Load all site profiles
import '../site-profiles/profiles/generic-table';
import '../site-profiles/profiles/common-casinos';

export type DetectionStatus = 'idle' | 'scanning' | 'found' | 'not_found' | 'watching';

/** Convert results to a comparable string key */
function resultsToSequence(results: GameResult[]): string {
  return results.map((r) => r.outcome).join('');
}

export interface DetectionResult {
  results: GameResult[];
  source: 'dom' | 'canvas' | 'profile';
  element: Element | null;
}

type StatusCallback = (status: DetectionStatus) => void;
type ResultCallback = (result: DetectionResult) => void;

/**
 * Detection Engine — orchestrates DOM/Canvas detection strategies
 * and watches for live updates via MutationObserver.
 *
 * Screenshot-based analysis is handled separately in the popup
 * via manual user upload.
 */
export class DetectionEngine {
  private observer: MutationObserver | null = null;
  private status: DetectionStatus = 'idle';
  private lastSequence = '';
  private detectedElement: Element | null = null;
  private onStatusChange: StatusCallback;
  private onResults: ResultCallback;
  private pollInterval: number | null = null;
  private siteProfile: SiteProfile | null = null;
  private debounceTimer: number | null = null;

  constructor(onStatusChange: StatusCallback, onResults: ResultCallback) {
    this.onStatusChange = onStatusChange;
    this.onResults = onResults;
    this.siteProfile = findProfile(window.location.hostname);
  }

  /** Start detection */
  start(): void {
    this.setStatus('scanning');
    this.detect();

    this.pollInterval = window.setInterval(() => {
      if (this.status !== 'watching') {
        this.detect();
      }
    }, 3000);
  }

  /** Stop detection and cleanup */
  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.setStatus('idle');
  }

  /** Run detection once */
  private detect(): void {
    // Strategy 1: Site-specific profile
    if (this.siteProfile) {
      const profileResults = this.siteProfile.extract();
      if (profileResults && profileResults.length > 0) {
        this.handleDetection(profileResults, 'profile');
        return;
      }
    }

    // Strategy 2: DOM scanning
    const domResults = scanDOM();
    if (domResults && domResults.length > 0) {
      this.handleDetection(domResults, 'dom');
      return;
    }

    // Strategy 3: Canvas scanning
    const canvasResults = scanCanvases();
    if (canvasResults && canvasResults.length > 0) {
      this.handleDetection(canvasResults, 'canvas');
      return;
    }

    if (this.status === 'scanning') {
      this.setStatus('not_found');
    }
  }

  /** Handle successful detection */
  private handleDetection(
    results: GameResult[],
    source: 'dom' | 'canvas' | 'profile',
  ): void {
    const seq = resultsToSequence(results);
    if (seq === this.lastSequence) return; // No change

    this.lastSequence = seq;
    this.setStatus('found');
    this.onResults({ results, source, element: this.detectedElement });
    this.startWatching();
  }

  /** Watch for live updates using MutationObserver */
  private startWatching(): void {
    if (this.observer) return;

    this.setStatus('watching');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    this.observer = new MutationObserver(() => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => {
        this.debouncedRescan();
      }, 500);
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-result'],
    });
  }

  /** Re-scan after debounced mutation */
  private debouncedRescan(): void {
    const domResults = scanDOM();
    if (domResults && domResults.length > 0) {
      const seq = resultsToSequence(domResults);
      if (seq !== this.lastSequence) {
        this.handleDetection(domResults, 'dom');
        return;
      }
    }

    const canvasResults = scanCanvases();
    if (canvasResults && canvasResults.length > 0) {
      const seq = resultsToSequence(canvasResults);
      if (seq !== this.lastSequence) {
        this.handleDetection(canvasResults, 'canvas');
      }
    }
  }

  private setStatus(status: DetectionStatus): void {
    this.status = status;
    this.onStatusChange(status);
  }
}
