import { initI18n, t, getLocale, setLocale, Locale } from '../i18n/i18n';
import { RoadManager } from '../roads/road-manager';
import { predict, Prediction, calculateStats } from '../roads/prediction';
import { renderRoad } from './components/road-renderer';
import { RoadAnalysis, GameResult, Outcome } from '../roads/types';
import { Tier, STORAGE_KEYS } from '../shared/constants';
import { getTier, isDisclaimerAccepted, acceptDisclaimer } from '../shared/storage';
import { initAds, removeAds } from '../monetization/ads';
import { activateLicense, getPaymentLink } from '../monetization/license';
import { el, clearChildren, safeNumber } from '../shared/sanitize';

// State
const roadManager = new RoadManager();
let currentRoad: keyof RoadAnalysis = 'bigRoad';
let currentTier: Tier = Tier.FREE;
let analysis: RoadAnalysis | null = null;
let serverAvailable = false;
let activeTabId: number | null = null;

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function init() {
  await initI18n();
  updateAllTexts();

  const disclaimerOk = await isDisclaimerAccepted();
  if (!disclaimerOk) showDisclaimer();

  currentTier = await getTier();
  setupEventListeners();
  initAds($('#ad-container'));

  // Get active tab
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) activeTabId = tab.id;
  } catch { /* ignore */ }

  // Check server health
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'SERVER_HEALTH' });
    serverAvailable = resp?.ok ?? false;
  } catch { /* ignore */ }
  updateServerStatus();

  updateDisplay();
}

function showDisclaimer() {
  const overlay = $('#disclaimer-overlay');
  overlay.classList.remove('hidden');
  $('#disclaimer-btn').addEventListener('click', async () => {
    overlay.classList.add('hidden');
    try { await acceptDisclaimer(); } catch { /* dev mode */ }
  });
}

function showStatus(text: string, type: 'error' | 'info' | 'success') {
  const msgEl = $('#status-message');
  msgEl.textContent = text;
  msgEl.className = `status-message ${type}`;
}

// ── Event listeners ──

function setupEventListeners() {
  // Select Region — inject script directly into the active tab
  $('#btn-select-region').addEventListener('click', async () => {
    if (!activeTabId) {
      showStatus('No active tab found.', 'error');
      return;
    }

    try {
      // Inject region selector directly via scripting API
      await chrome.scripting.executeScript({
        target: { tabId: activeTabId },
        func: injectRegionSelector,
      });
    } catch (e) {
      showStatus(`Cannot inject on this page: ${e instanceof Error ? e.message : String(e)}`, 'error');
      return;
    }

    // Close popup so user can interact with page
    window.close();
  });

  // Road tabs
  document.querySelectorAll('.road-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.road-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentRoad = (tab as HTMLElement).dataset.road as keyof RoadAnalysis;
      renderCurrentRoad();
    });
  });

  // Settings
  $('#settings-btn').addEventListener('click', () => {
    $('#settings-panel').classList.remove('hidden');
    updateTierDisplay();
  });
  $('#settings-close').addEventListener('click', () => {
    $('#settings-panel').classList.add('hidden');
  });

  // Language
  const langSelect = $<HTMLSelectElement>('#language-select');
  langSelect.value = getLocale();
  langSelect.addEventListener('change', async () => {
    await setLocale(langSelect.value as Locale);
    updateAllTexts();
  });

  // License
  $('#license-activate-btn').addEventListener('click', async () => {
    const input = $<HTMLInputElement>('#license-input');
    const statusEl = $('#license-status');
    const key = input.value.trim();
    if (!key) { statusEl.textContent = t('license.enterKey'); statusEl.style.color = '#ef4444'; return; }
    statusEl.textContent = t('license.validating'); statusEl.style.color = '#71717a';
    try {
      const result = await activateLicense(key);
      if (result.success) {
        currentTier = result.tier;
        statusEl.textContent = result.message; statusEl.style.color = '#22c55e';
        updateTierDisplay(); removeAds(); updateDisplay();
      } else { statusEl.textContent = result.message; statusEl.style.color = '#ef4444'; }
    } catch { statusEl.textContent = t('license.networkError'); statusEl.style.color = '#ef4444'; }
  });

  // Pricing (initial render)
  updatePricingLinks();

  // Listen for results from content script
  try {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      if (sender.id !== chrome.runtime.id) return;
      if (msg.type === 'RESULTS_DETECTED' && Array.isArray(msg.results)) {
        roadManager.setResults(msg.results);
        updateDisplay();
        setDetectionStatus('found');
        updateDebugPreview(msg.debugImage ?? null);
      } else if (msg.type === 'DETECTION_STATUS' && typeof msg.status === 'string') {
        setDetectionStatus(msg.status);
      }
    });
  } catch { /* not in extension context */ }
}

/**
 * This function is injected directly into the active tab via chrome.scripting.executeScript.
 * It must be self-contained — no imports, no closures over popup scope.
 */
function injectRegionSelector() {
  // Prevent duplicate injection
  if (document.getElementById('__ra_region_overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = '__ra_region_overlay';
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', zIndex: '2147483647',
    cursor: 'crosshair', background: 'rgba(0,0,0,0.3)',
  });

  const banner = document.createElement('div');
  Object.assign(banner.style, {
    position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '10px 20px',
    borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif',
    zIndex: '2147483647', pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  banner.textContent = '拖曳選取路子區域 — ESC 取消';
  overlay.appendChild(banner);

  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', border: '2px dashed #6366f1',
    background: 'rgba(99,102,241,0.15)', borderRadius: '4px',
    display: 'none', pointerEvents: 'none',
  });
  overlay.appendChild(box);

  let startX = 0, startY = 0, dragging = false;

  function cleanup() {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') cleanup();
  }

  overlay.addEventListener('mousedown', (e) => {
    startX = e.clientX; startY = e.clientY; dragging = true;
    box.style.display = 'block';
    box.style.left = `${startX}px`; box.style.top = `${startY}px`;
    box.style.width = '0'; box.style.height = '0';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    box.style.left = `${x}px`; box.style.top = `${y}px`;
    box.style.width = `${w}px`; box.style.height = `${h}px`;
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
    const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
    cleanup();

    if (w < 20 || h < 20) return;

    const dpr = window.devicePixelRatio || 1;
    const region = {
      x: Math.round(x * dpr), y: Math.round(y * dpr),
      w: Math.round(w * dpr), h: Math.round(h * dpr),
    };

    // Save to chrome.storage.sync
    chrome.storage.sync.set({ roadRegion: region });

    // Trigger screenshot capture + analysis
    chrome.runtime.sendMessage({ type: 'CAPTURE_AND_ANALYZE', region });

    // Show confirmation
    const toast = document.createElement('div');
    Object.assign(toast.style, {
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      background: '#22c55e', color: '#fff', padding: '10px 20px',
      borderRadius: '8px', fontSize: '14px', fontFamily: 'system-ui, sans-serif',
      zIndex: '2147483647',
    });
    toast.textContent = `Region saved: ${w}×${h}px`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  });

  document.addEventListener('keydown', onKeyDown);
  document.body.appendChild(overlay);
}

// ── Display updates ──

function updateDisplay() {
  analysis = roadManager.analyze();
  updateStats();
  updatePrediction();
  renderCurrentRoad();
}

function updateStats() {
  if (!analysis) return;
  const stats = calculateStats(roadManager.getResults(), analysis.columns);
  $('#stat-total').textContent = String(stats.total);
  $('#stat-banker').textContent = String(stats.banker);
  $('#stat-player').textContent = String(stats.player);
  $('#stat-tie').textContent = String(stats.tie);
  $('#stat-banker-pct').textContent = stats.bankerPct > 0 ? `${stats.bankerPct.toFixed(1)}%` : '';
  $('#stat-player-pct').textContent = stats.playerPct > 0 ? `${stats.playerPct.toFixed(1)}%` : '';
}

function updatePrediction() {
  if (!analysis) return;
  const pred = predict(roadManager.getResults(), analysis.columns, analysis.bigEyeBoy, analysis.smallRoad, analysis.cockroachPig, currentTier === Tier.PREMIUM);
  const panel = $('#prediction-panel');
  if (!pred) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');

  const outcomeEl = $('#prediction-outcome');
  outcomeEl.className = `prediction-outcome ${pred.outcome === 'B' ? 'banker' : 'player'}`;
  outcomeEl.textContent = pred.outcome === 'B' ? t('outcome.bankerShort') : t('outcome.playerShort');

  const confEl = $('#prediction-confidence');
  clearChildren(confEl);
  confEl.append(
    el('div', { style: 'font-size:13px;font-weight:600;color:#e4e4e7;' }, t('prediction.confidence', safeNumber(pred.confidence))),
    (() => { const bar = el('div', { class: 'confidence-bar' }); bar.appendChild(el('div', { class: `confidence-fill ${pred.outcome === 'B' ? 'banker' : 'player'}`, style: `width:${safeNumber(pred.confidence)}%` })); return bar; })(),
  );

  const signalsEl = $('#prediction-signals');
  clearChildren(signalsEl);
  for (const s of pred.signals) {
    const row = el('div', { class: 'signal' });
    row.appendChild(el('span', { class: 'signal-name' }, String(s.name)));
    row.appendChild(el('span', {}, String(s.description)));
    signalsEl.appendChild(row);
  }
}

function renderCurrentRoad() {
  if (!analysis) return;
  const canvas = $<HTMLCanvasElement>('#road-canvas');
  const isDerived = ['bigEyeBoy', 'smallRoad', 'cockroachPig'].includes(currentRoad);
  const grid = analysis[currentRoad];
  if (Array.isArray(grid)) renderRoad(canvas, grid as any, { isDerived });
}

function updateDebugPreview(debugImage: string | null) {
  const container = $('#debug-preview');
  const img = $<HTMLImageElement>('#debug-preview-img');
  if (!debugImage) {
    container.classList.add('hidden');
    return;
  }
  img.src = debugImage;
  container.classList.remove('hidden');
}

function setDetectionStatus(status: string) {
  const badge = $('#detection-status');
  const map: Record<string, string> = {
    scanning: t('detection.scanning'), found: t('detection.found'),
    not_found: t('detection.notFound'), watching: t('detection.watching'),
  };
  badge.textContent = map[status] ?? '';
  badge.className = `status-badge ${status === 'found' ? 'active' : ''}`;
}

function updateServerStatus() {
  const dot = $('#server-dot');
  const label = $('#server-label');
  dot.className = `server-dot ${serverAvailable ? 'online' : 'offline'}`;
  label.textContent = serverAvailable ? t('server.ready') : t('server.offline');
}

function updateTierDisplay() {
  const tierEl = $('#tier-display');
  const names: Record<Tier, string> = { [Tier.FREE]: t('tier.free'), [Tier.AD_FREE]: t('tier.adFree'), [Tier.PREMIUM]: t('tier.premium') };
  clearChildren(tierEl);
  tierEl.appendChild(el('span', { class: `tier-badge ${currentTier}` }, names[currentTier]));
  if (currentTier === Tier.FREE) {
    tierEl.appendChild(document.createElement('br'));
    const upgradeLink = el('a', { href: '#', style: 'color:#6366f1;font-size:12px;margin-top:8px;display:inline-block;' }, t('tier.upgrade'));
    upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      window.open(getPaymentLink(Tier.PREMIUM), '_blank');
    });
    tierEl.appendChild(upgradeLink);
  }
}

function updatePricingLinks() {
  const pricingEl = $('#pricing-links');
  clearChildren(pricingEl);
  const mkLink = (tier: Tier.AD_FREE | Tier.PREMIUM, label: string, desc: string, price: string, color: string, bg: string) => {
    const a = el('a', { target: '_blank', style: `display:flex;justify-content:space-between;align-items:center;padding:8px;background:${bg};border-radius:6px;text-decoration:none;color:#e4e4e7;border:1px solid #2a2b35;` });
    (a as HTMLAnchorElement).href = getPaymentLink(tier);
    const left = el('div', { style: 'display:flex;flex-direction:column;gap:2px;' });
    left.appendChild(el('span', { style: 'font-size:12px;font-weight:600;' }, label));
    left.appendChild(el('span', { style: 'font-size:10px;color:#71717a;' }, desc));
    a.appendChild(left);
    a.appendChild(el('span', { style: `font-size:12px;color:${color};font-weight:600;white-space:nowrap;margin-left:8px;` }, price));
    return a;
  };
  pricingEl.appendChild(mkLink(Tier.AD_FREE, t('tier.adFree'), t('tier.adFreeDesc'), '$4.99/mo', '#6366f1', '#1a1b23'));
  pricingEl.appendChild(mkLink(Tier.PREMIUM, t('tier.premium'), t('tier.premiumDesc'), '$9.99/mo', '#eab308', 'rgba(234,179,8,0.05)'));
}

function updateAllTexts() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n')!);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    (el as HTMLInputElement).placeholder = t(el.getAttribute('data-i18n-placeholder')!);
  });
  $('#app-title').textContent = t('app.title');
  $('#disclaimer-text').textContent = t('disclaimer.text');
  $('#disclaimer-btn').textContent = t('disclaimer.understand');
  updateTierDisplay();
  updatePricingLinks();
  updateServerStatus();
}

init();
