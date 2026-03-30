import { Tier } from '../shared/constants';

export interface TierInfo {
  tier: Tier;
  hasPremiumPrediction: boolean;
  hasExport: boolean;
  hasHistory: boolean;
}

const TIER_CONFIG: Record<Tier, TierInfo> = {
  [Tier.FREE]: {
    tier: Tier.FREE,
    hasPremiumPrediction: false,
    hasExport: false,
    hasHistory: false,
  },
  [Tier.PREMIUM]: {
    tier: Tier.PREMIUM,
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
