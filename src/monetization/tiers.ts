import { Tier } from '../shared/constants';

export interface TierInfo {
  tier: Tier;
  showAds: boolean;
  hasPremiumPrediction: boolean;
  hasExport: boolean;
  hasHistory: boolean;
}

const TIER_CONFIG: Record<Tier, TierInfo> = {
  [Tier.FREE]: {
    tier: Tier.FREE,
    showAds: true,
    hasPremiumPrediction: false,
    hasExport: false,
    hasHistory: false,
  },
  [Tier.AD_FREE]: {
    tier: Tier.AD_FREE,
    showAds: false,
    hasPremiumPrediction: false,
    hasExport: false,
    hasHistory: true,
  },
  [Tier.PREMIUM]: {
    tier: Tier.PREMIUM,
    showAds: false,
    hasPremiumPrediction: true,
    hasExport: true,
    hasHistory: true,
  },
};

export function getTierInfo(tier: Tier): TierInfo {
  return TIER_CONFIG[tier];
}

export function isPremium(tier: Tier): boolean {
  return tier === Tier.PREMIUM;
}
