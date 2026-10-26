import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { judgeValidation, judgeAcceptedKey, activateLicense, LicenseResponse } from '../../src/monetization/license';

const premiumMeta = { store_id: 298654, product_id: 903450, variant_id: 1421135 };

function validResponse(overrides: Partial<LicenseResponse> = {}): LicenseResponse {
  return { valid: true, license_key: { status: 'active' }, meta: premiumMeta, ...overrides };
}

describe('judgeValidation', () => {
  it('should grant Premium for an active Premium key', () => {
    expect(judgeValidation(200, validResponse())).toBe('premium');
  });

  it('should treat a key LemonSqueezy does not know as invalid', () => {
    // LemonSqueezy's actual answer for an unknown key
    expect(judgeValidation(404, { valid: false, error: 'license_key not found.' })).toBe('invalid');
  });

  it('should treat an expired or disabled key as invalid', () => {
    expect(judgeValidation(200, validResponse({ license_key: { status: 'expired' } }))).toBe('invalid');
    expect(judgeValidation(200, validResponse({ license_key: { status: 'disabled' } }))).toBe('invalid');
  });

  it('should treat a valid key for another product or store as invalid', () => {
    const adFree = { ...premiumMeta, product_id: 903448 };
    expect(judgeValidation(200, validResponse({ meta: adFree }))).toBe('invalid');
    expect(judgeValidation(200, validResponse({ meta: { ...premiumMeta, variant_id: 1 } }))).toBe('invalid');
    expect(judgeValidation(200, validResponse({ meta: { ...premiumMeta, store_id: 1 } }))).toBe('invalid');
  });

  it('should change nothing on rate limits, outages or unreadable responses', () => {
    expect(judgeValidation(429, { valid: false })).toBe('unknown');
    expect(judgeValidation(500, null)).toBe('unknown');
    expect(judgeValidation(503, { valid: false })).toBe('unknown');
    expect(judgeValidation(200, null)).toBe('unknown');
    expect(judgeValidation(200, {})).toBe('unknown');
  });

  it('should change nothing when a valid response has no product information', () => {
    expect(judgeValidation(200, validResponse({ meta: undefined }))).toBe('unknown');
  });

  it('should accept product IDs sent as numeric strings', () => {
    const meta = { store_id: '298654', product_id: '903450', variant_id: '1421135' } as unknown as LicenseResponse['meta'];
    expect(judgeValidation(200, validResponse({ meta }))).toBe('premium');
  });
});

describe('judgeAcceptedKey', () => {
  it('should grant Premium for a freshly activated Premium key', () => {
    expect(judgeAcceptedKey({ activated: true, license_key: { status: 'active' }, meta: premiumMeta }))
      .toBe('premium');
  });

  it('should reject an activated key for another product', () => {
    const meta = { ...premiumMeta, product_id: 903448 };
    expect(judgeAcceptedKey({ activated: true, license_key: { status: 'active' }, meta })).toBe('invalid');
  });
});

describe('activateLicense', () => {
  let store: Record<string, unknown>;
  let endpoints: string[];

  beforeEach(() => {
    store = {};
    endpoints = [];
    vi.stubGlobal('chrome', {
      storage: {
        sync: {
          get: async (keys: string | string[]) =>
            Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, store[k]])),
          set: async (items: Record<string, unknown>) => { Object.assign(store, items); },
        },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  /** LemonSqueezy's answer for each endpoint: [HTTP status, body] */
  function lemonSqueezy(answers: Record<string, [number, unknown]>) {
    vi.stubGlobal('fetch', async (url: string) => {
      const endpoint = url.split('/').pop()!;
      endpoints.push(endpoint);
      const [status, body] = answers[endpoint];
      return { status, json: async () => body };
    });
  }
  const activated = { activated: true, license_key: { status: 'active' }, instance: { id: 'new-instance' }, meta: premiumMeta };

  it('should re-check a key already activated in this browser instead of activating it again', async () => {
    store = { licenseKey: 'KEY', licenseInstanceId: 'this-browser' };
    lemonSqueezy({ validate: [200, validResponse()] });
    expect((await activateLicense('KEY')).success).toBe(true);
    expect(endpoints).toEqual(['validate']);
    expect(store.tier).toBe('premium');
  });

  it("should activate the key again when this browser's activation is gone", async () => {
    store = { licenseKey: 'KEY', licenseInstanceId: 'deactivated' };
    // What LemonSqueezy says about a removed activation isn't documented; any explicit "not valid" counts
    lemonSqueezy({ validate: [404, { valid: false, error: 'instance not found' }], activate: [200, activated] });
    expect((await activateLicense('KEY')).success).toBe(true);
    expect(endpoints).toEqual(['validate', 'activate']);
    expect(store).toMatchObject({ tier: 'premium', licenseInstanceId: 'new-instance' });
  });

  it('should stay Free when the key itself is no longer valid', async () => {
    store = { licenseKey: 'KEY', licenseInstanceId: 'this-browser', tier: 'premium' };
    lemonSqueezy({
      validate: [200, validResponse({ valid: false, license_key: { status: 'expired' } })],
      activate: [400, { activated: false, error: 'This license key is expired.' }],
    });
    const result = await activateLicense('KEY');
    expect(result).toMatchObject({ success: false, tier: 'free', message: 'This license key is expired.' });
    expect(store.tier).toBe('free');
  });
});
