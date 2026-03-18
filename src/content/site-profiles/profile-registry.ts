import { GameResult } from '../../roads/types';

/**
 * Site profile — provides site-specific detection hints.
 * Each profile knows how to extract game results from a specific online casino.
 */
export interface SiteProfile {
  /** Domain patterns this profile matches */
  domains: string[];
  /** Human-readable name */
  name: string;
  /** Try to extract results from the current page */
  extract(): GameResult[] | null;
  /** CSS selector for the road container (for MutationObserver targeting) */
  roadContainerSelector?: string;
}

const profiles: SiteProfile[] = [];

/** Register a site profile */
export function registerProfile(profile: SiteProfile): void {
  profiles.push(profile);
}

/** Find a matching profile for the current domain */
export function findProfile(hostname: string): SiteProfile | null {
  for (const profile of profiles) {
    for (const domain of profile.domains) {
      if (hostname.includes(domain)) {
        return profile;
      }
    }
  }
  return null;
}

/** Get all registered profiles */
export function getAllProfiles(): SiteProfile[] {
  return [...profiles];
}
