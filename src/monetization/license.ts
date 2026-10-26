import { Tier, STORAGE_KEYS } from '../shared/constants';
import { getTier } from '../shared/storage';
import { t } from '../i18n/i18n';

/**
 * LemonSqueezy configuration.
 * The License API needs no API key; it is called with the customer's license key only.
 */
const LEMON_CONFIG = {
  /** LemonSqueezy API base URL */
  apiUrl: 'https://api.lemonsqueezy.com/v1',
  /** Your store slug */
  storeSlug: 'wbglot',
  /** Checkout URL for Premium tier (from LemonSqueezy product page) */
  checkoutUrl: 'https://wbglot.lemonsqueezy.com/checkout/buy/a648ed50-a12d-4c95-9322-106756d3ba19',
  /** LemonSqueezy customer portal URL */
  portalUrl: 'https://wbglot.lemonsqueezy.com/billing',
  /** Cache TTL in milliseconds (24 hours) */
  cacheTTL: 24 * 60 * 60 * 1000,
  /** Name shown for this browser in the customer's list of activations */
  instanceName: 'RoadAnalyzer Chrome Extension',
};

/**
 * The product a license key must belong to. The store also sells other
 * products, and their keys are valid too, so a valid key alone is not enough.
 */
const PREMIUM_PRODUCT = {
  storeId: 298654,
  productId: 903450,
  /** Monthly subscription */
  variantIds: [1421135],
};

interface LicenseCache {
  tier: Tier;
  validatedAt: number;
  expiresAt: number;
}

/** Fields of a LemonSqueezy License API response that the extension uses */
export interface LicenseResponse {
  valid?: boolean;
  activated?: boolean;
  error?: string | null;
  license_key?: { status?: string };
  instance?: { id?: string } | null;
  meta?: { store_id?: number; product_id?: number; variant_id?: number };
}

/** 'unknown' means the answer says nothing about the key, so nothing changes */
export type LicenseVerdict = 'premium' | 'invalid' | 'unknown';

/** Judge a key LemonSqueezy accepted: is it live, and is it for the Premium product? */
export function judgeAcceptedKey(body: LicenseResponse): LicenseVerdict {
  const status = body.license_key?.status;
  if (status === 'expired' || status === 'disabled') return 'invalid';

  // Without meta there is no telling which product the key is for
  const meta = body.meta;
  if (!meta) return 'unknown';

  // The API documents these IDs as numbers; Number() also accepts numeric strings
  const isPremiumProduct = Number(meta.store_id) === PREMIUM_PRODUCT.storeId
    && Number(meta.product_id) === PREMIUM_PRODUCT.productId
    && PREMIUM_PRODUCT.variantIds.includes(Number(meta.variant_id));
  return isPremiumProduct ? 'premium' : 'invalid';
}

/**
 * Judge a /licenses/validate response. Only an explicit answer from
 * LemonSqueezy downgrades a customer; rate limits, outages and unreadable
 * responses never do.
 */
export function judgeValidation(httpStatus: number, body: LicenseResponse | null): LicenseVerdict {
  if (httpStatus === 429 || httpStatus >= 500) return 'unknown';
  if (!body || typeof body.valid !== 'boolean') return 'unknown';
  if (!body.valid) return 'invalid';
  return judgeAcceptedKey(body);
}

async function callLicenseApi(
  endpoint: 'activate' | 'validate' | 'deactivate',
  params: Record<string, string>,
): Promise<{ status: number; body: LicenseResponse | null }> {
  // Enforce HTTPS for API calls
  const apiUrl = `${LEMON_CONFIG.apiUrl}/licenses/${endpoint}`;
  if (!apiUrl.startsWith('https://')) throw new Error('API URL must use HTTPS');

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(params),
  });
  const body = (await response.json().catch(() => null)) as LicenseResponse | null;
  return { status: response.status, body };
}

async function saveVerdict(tier: Tier): Promise<void> {
  const cache: LicenseCache = {
    tier,
    validatedAt: Date.now(),
    expiresAt: Date.now() + LEMON_CONFIG.cacheTTL,
  };
  await chrome.storage.sync.set({
    [STORAGE_KEYS.TIER]: tier,
    [STORAGE_KEYS.LICENSE_CACHE]: cache,
  });
}

/**
 * Validate a license key using LemonSqueezy's API and store the outcome.
 * An explicitly invalid key drops the customer to Free right away, but the key
 * is kept so a renewed subscription restores Premium at a later check.
 */
export async function validateLicense(licenseKey: string, instanceId?: string): Promise<Tier> {
  let verdict: LicenseVerdict;
  try {
    const params: Record<string, string> = { license_key: licenseKey };
    if (instanceId) params.instance_id = instanceId;
    const { status, body } = await callLicenseApi('validate', params);
    verdict = judgeValidation(status, body);
  } catch {
    verdict = 'unknown';
  }

  if (verdict === 'unknown') return getTier();

  const tier = verdict === 'premium' ? Tier.PREMIUM : Tier.FREE;
  await saveVerdict(tier);
  return tier;
}

/**
 * Check the cached license. If expired, re-validate.
 */
export async function checkLicense(): Promise<Tier> {
  try {
    const data = await chrome.storage.sync.get([
      STORAGE_KEYS.LICENSE_CACHE,
      STORAGE_KEYS.LICENSE_KEY,
      STORAGE_KEYS.LICENSE_INSTANCE_ID,
    ]);
    const cache = data[STORAGE_KEYS.LICENSE_CACHE] as LicenseCache | undefined;
    const licenseKey = data[STORAGE_KEYS.LICENSE_KEY] as string | undefined;
    const instanceId = data[STORAGE_KEYS.LICENSE_INSTANCE_ID] as string | undefined;

    if (!licenseKey) return Tier.FREE;

    if (cache && cache.expiresAt > Date.now()) {
      return cache.tier;
    }

    return await validateLicense(licenseKey, instanceId);
  } catch {
    return getTier();
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
  const failure = async (message: string) => ({ success: false, tier: await getTier(), message });
  const success = { success: true, tier: Tier.PREMIUM, message: t('license.activateSuccess', t('tier.premium')) };

  // Already activated in this browser: re-check it instead of using up another activation
  const stored = await chrome.storage.sync.get([STORAGE_KEYS.LICENSE_KEY, STORAGE_KEYS.LICENSE_INSTANCE_ID]);
  const storedInstanceId = stored[STORAGE_KEYS.LICENSE_INSTANCE_ID] as string | undefined;
  if (stored[STORAGE_KEYS.LICENSE_KEY] === licenseKey && storedInstanceId) {
    try {
      const { status, body } = await callLicenseApi('validate', {
        license_key: licenseKey,
        instance_id: storedInstanceId,
      });
      const verdict = judgeValidation(status, body);
      if (verdict === 'unknown') return failure(t('license.networkError'));
      if (verdict === 'premium') {
        await saveVerdict(Tier.PREMIUM);
        return success;
      }
      // This browser's activation may be gone (e.g. deactivated from the store), while the
      // key itself is fine: activate it again below, which fails for a key that is not
      await saveVerdict(Tier.FREE);
    } catch {
      return failure(t('license.networkError'));
    }
  }

  let response: { status: number; body: LicenseResponse | null };
  try {
    response = await callLicenseApi('activate', {
      license_key: licenseKey,
      instance_name: LEMON_CONFIG.instanceName,
    });
  } catch {
    return failure(t('license.networkError'));
  }

  const { status, body } = response;
  if (status < 200 || status >= 300 || !body?.activated) {
    return failure(body?.error ?? t('license.activateFailed'));
  }

  const instanceId = body.instance?.id;
  const verdict = judgeAcceptedKey(body);
  if (verdict !== 'premium') {
    // Activated, but not (provably) a Premium key: give the activation back
    if (instanceId) {
      callLicenseApi('deactivate', { license_key: licenseKey, instance_id: instanceId }).catch(() => {});
    }
    return failure(verdict === 'invalid' ? t('license.invalidKey') : t('license.activateFailed'));
  }

  await chrome.storage.sync.set({
    [STORAGE_KEYS.LICENSE_KEY]: licenseKey,
    [STORAGE_KEYS.LICENSE_INSTANCE_ID]: instanceId ?? null,
  });
  await saveVerdict(Tier.PREMIUM);
  return success;
}

/**
 * Deactivate the current license.
 */
export async function deactivateLicense(): Promise<void> {
  try {
    const data = await chrome.storage.sync.get([STORAGE_KEYS.LICENSE_KEY, STORAGE_KEYS.LICENSE_INSTANCE_ID]);
    const licenseKey = data[STORAGE_KEYS.LICENSE_KEY] as string | undefined;
    const instanceId = data[STORAGE_KEYS.LICENSE_INSTANCE_ID] as string | undefined;

    // LemonSqueezy identifies the activation by its instance ID
    if (licenseKey && instanceId) {
      await callLicenseApi('deactivate', { license_key: licenseKey, instance_id: instanceId })
        .catch(() => { /* ignore */ });
    }
  } catch { /* ignore */ }

  await chrome.storage.sync.remove([
    STORAGE_KEYS.LICENSE_KEY,
    STORAGE_KEYS.LICENSE_INSTANCE_ID,
    STORAGE_KEYS.TIER,
    STORAGE_KEYS.LICENSE_CACHE,
  ]);
  await chrome.storage.sync.set({ [STORAGE_KEYS.TIER]: Tier.FREE });
}

/** Get the LemonSqueezy checkout URL for Premium */
export function getPaymentLink(): string {
  return LEMON_CONFIG.checkoutUrl;
}

/** Get the LemonSqueezy customer portal URL */
export function getPortalUrl(): string {
  return LEMON_CONFIG.portalUrl;
}
