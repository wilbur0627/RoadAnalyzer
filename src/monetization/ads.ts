import { Tier } from '../shared/constants';
import { getTier } from '../shared/storage';
import { getPaymentLink } from './license';
import { t } from '../i18n/i18n';

const AD_CONTAINER_ID = 'road-analyzer-ad';

/** Initialize upgrade CTA for free-tier users */
export async function initAds(container: HTMLElement): Promise<void> {
  const tier = await getTier();
  if (tier !== Tier.FREE) {
    removeAds();
    return;
  }

  // Don't duplicate
  if (document.getElementById(AD_CONTAINER_ID)) return;

  const adContainer = document.createElement('div');
  adContainer.id = AD_CONTAINER_ID;
  adContainer.style.cssText = `
    width: 100%;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #13141b;
    border-top: 1px solid #2a2b35;
    padding: 8px;
  `;

  adContainer.innerHTML = `
    <div style="text-align:center;width:100%;padding:8px;">
      <div style="
        background: linear-gradient(135deg, #1e1f2a, #2a2b35);
        border: 1px dashed #3f3f46;
        border-radius: 8px;
        padding: 12px;
      ">
        <div style="font-size:11px;color:#71717a;margin-bottom:6px;">
          ${t('ads.enjoying')}
        </div>
        <button id="ra-upgrade-btn" style="
          background: linear-gradient(135deg, #6366f1, #8b5cf6);
          color: white;
          border: none;
          border-radius: 6px;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        ">
          ${t('ads.upgradeToPremium')}
        </button>
      </div>
    </div>
  `;

  const btn = adContainer.querySelector('#ra-upgrade-btn');
  btn?.addEventListener('click', (e) => {
    e.preventDefault();
    window.open(getPaymentLink(Tier.PREMIUM), '_blank');
  });

  container.appendChild(adContainer);
}

/** Remove ads */
export function removeAds(): void {
  const el = document.getElementById(AD_CONTAINER_ID);
  el?.remove();
}
