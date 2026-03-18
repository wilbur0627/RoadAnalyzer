import { Tier, STORAGE_KEYS } from '../shared/constants';

/**
 * LemonSqueezy configuration.
 * Replace with your actual store/product URLs and API key.
 */
const LEMON_CONFIG = {
  /** LemonSqueezy API base URL */
  apiUrl: 'https://api.lemonsqueezy.com/v1',
  /** Your store slug */
  storeSlug: 'YOUR_STORE_SLUG', // TODO: Replace
  /** Checkout URLs for each tier (from LemonSqueezy product page) */
  checkoutUrls: {
    [Tier.AD_FREE]: 'https://YOUR_STORE.lemonsqueezy.com/checkout/buy/AD_FREE_VARIANT_ID',
    [Tier.PREMIUM]: 'https://YOUR_STORE.lemonsqueezy.com/checkout/buy/PREMIUM_VARIANT_ID',
  },
  /** LemonSqueezy customer portal URL */
  portalUrl: 'https://YOUR_STORE.lemonsqueezy.com/billing',
  /** Cache TTL in milliseconds (24 hours) */
  cacheTTL: 24 * 60 * 60 * 1000,
};

interface LicenseCache {
  tier: Tier;
  validatedAt: number;
  expiresAt: number;
}

/**
 * Validate a license key using LemonSqueezy's API.
 * Calls /v1/licenses/validate endpoint directly.
 */
export async function validateLicense(licenseKey: string): Promise<Tier> {
  try {
    // Enforce HTTPS for API calls
    const apiUrl = `${LEMON_CONFIG.apiUrl}/licenses/validate`;
    if (!apiUrl.startsWith('https://')) throw new Error('API URL must use HTTPS');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ license_key: licenseKey }),
    });

    if (!response.ok) return Tier.FREE;

    const data = await response.json();

    // LemonSqueezy returns: { valid: true, license_key: {...}, meta: {...} }
    if (!data.valid) return Tier.FREE;

    // Determine tier from the product/variant
    const variantName = data.meta?.variant_name?.toLowerCase() ?? '';
    const productName = data.meta?.product_name?.toLowerCase() ?? '';

    let tier: Tier = Tier.FREE;
    if (variantName.includes('premium') || productName.includes('premium')) {
      tier = Tier.PREMIUM;
    } else if (variantName.includes('ad') || productName.includes('ad-free') || productName.includes('ad_free')) {
      tier = Tier.AD_FREE;
    } else {
      // Any valid license at minimum removes ads
      tier = Tier.AD_FREE;
    }

    // Check subscription status
    const status = data.license_key?.status;
    if (status === 'expired' || status === 'disabled') {
      return Tier.FREE;
    }

    // Cache the result
    const cache: LicenseCache = {
      tier,
      validatedAt: Date.now(),
      expiresAt: Date.now() + LEMON_CONFIG.cacheTTL,
    };
    await chrome.storage.sync.set({
      [STORAGE_KEYS.TIER]: tier,
      licenseCache: cache,
    });

    return tier;
  } catch {
    return Tier.FREE;
  }
}

/**
 * Check the cached license. If expired, re-validate.
 */
export async function checkLicense(): Promise<Tier> {
  try {
    const data = await chrome.storage.sync.get(['licenseCache', STORAGE_KEYS.LICENSE_KEY]);
    const cache = data.licenseCache as LicenseCache | undefined;
    const licenseKey = data[STORAGE_KEYS.LICENSE_KEY] as string | undefined;

    if (!licenseKey) return Tier.FREE;

    if (cache && cache.expiresAt > Date.now()) {
      return cache.tier;
    }

    return await validateLicense(licenseKey);
  } catch {
    return Tier.FREE;
  }
}

/**
 * Activate a license key (after user purchases from LemonSqueezy).
 */
export async function activateLicense(licenseKey: string): Promise<{
  success: boolean;
  tier: Tier;
  message: string;
}> {
  // First, activate the license instance via LemonSqueezy API
  try {
    const activateResponse = await fetch(`${LEMON_CONFIG.apiUrl}/licenses/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        license_key: licenseKey,
        instance_name: 'RoadAnalyzer Chrome Extension',
      }),
    });

    if (!activateResponse.ok) {
      const err = await activateResponse.json().catch(() => ({}));
      return {
        success: false,
        tier: Tier.FREE,
        message: err.error ?? 'Failed to activate license',
      };
    }
  } catch {
    return {
      success: false,
      tier: Tier.FREE,
      message: 'Network error. Please try again.',
    };
  }

  // Save the key
  await chrome.storage.sync.set({ [STORAGE_KEYS.LICENSE_KEY]: licenseKey });

  // Validate to determine tier
  const tier = await validateLicense(licenseKey);

  if (tier === Tier.FREE) {
    await chrome.storage.sync.remove(STORAGE_KEYS.LICENSE_KEY);
    return {
      success: false,
      tier: Tier.FREE,
      message: 'Invalid or expired license key',
    };
  }

  return {
    success: true,
    tier,
    message: `Activated! Your plan: ${tier === Tier.PREMIUM ? 'Premium' : 'Ad-Free'}`,
  };
}

/**
 * Deactivate the current license.
 */
export async function deactivateLicense(): Promise<void> {
  try {
    const data = await chrome.storage.sync.get(STORAGE_KEYS.LICENSE_KEY);
    const licenseKey = data[STORAGE_KEYS.LICENSE_KEY];

    if (licenseKey) {
      // Deactivate on LemonSqueezy
      await fetch(`${LEMON_CONFIG.apiUrl}/licenses/deactivate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          license_key: licenseKey,
          instance_name: 'RoadAnalyzer Chrome Extension',
        }),
      }).catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }

  await chrome.storage.sync.remove([
    STORAGE_KEYS.LICENSE_KEY,
    STORAGE_KEYS.TIER,
    'licenseCache',
  ]);
  await chrome.storage.sync.set({ [STORAGE_KEYS.TIER]: Tier.FREE });
}

/** Get the LemonSqueezy checkout URL for a tier */
export function getPaymentLink(tier: Tier.AD_FREE | Tier.PREMIUM): string {
  return LEMON_CONFIG.checkoutUrls[tier];
}

/** Get the LemonSqueezy customer portal URL */
export function getPortalUrl(): string {
  return LEMON_CONFIG.portalUrl;
}
