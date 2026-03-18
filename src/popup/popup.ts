import { initI18n, t, getLocale, setLocale, Locale } from '../i18n/i18n';
import { RoadManager } from '../roads/road-manager';
import { predict, Prediction, calculateStats } from '../roads/prediction';
import { renderRoad } from './components/road-renderer';
import { RoadAnalysis, GameResult } from '../roads/types';
import { Tier, STORAGE_KEYS } from '../shared/constants';
import { getTier, isDisclaimerAccepted, acceptDisclaimer } from '../shared/storage';
import { initAds, removeAds } from '../monetization/ads';
import { activateLicense, getPaymentLink } from '../monetization/license';
import { el, clearChildren, safeNumber, validateGameResults } from '../shared/sanitize';

// State
const roadManager = new RoadManager();
let currentRoad: keyof RoadAnalysis = 'bigRoad';
let currentTier: Tier = Tier.FREE;
let analysis: RoadAnalysis | null = null;

// DOM elements
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function init() {
  await initI18n();
  updateAllTexts();

  // Check disclaimer
  const disclaimerOk = await isDisclaimerAccepted();
  if (!disclaimerOk) {
    showDisclaimer();
  }

  // Load tier
  currentTier = await getTier();

  setupEventListeners();
  initAds($('#ad-container'));

  // Try to get results from content script
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_STATE' });
      if (response?.results) {
        roadManager.setResults(response.results);
      }
    }
  } catch {
    // Content script not available
  }

  updateDisplay();
}

function showDisclaimer() {
  const overlay = $('#disclaimer-overlay');
  overlay.classList.remove('hidden');
  $('#disclaimer-btn').addEventListener('click', async () => {
    overlay.classList.add('hidden');
    try {
      await acceptDisclaimer();
    } catch { /* dev mode */ }
  });
}

function setupEventListeners() {
  // Manual input buttons
  $('#btn-banker').addEventListener('click', () => addResult('B'));
  $('#btn-player').addEventListener('click', () => addResult('P'));
  $('#btn-tie').addEventListener('click', () => addResult('T'));
  $('#btn-undo').addEventListener('click', () => {
    const results = roadManager.getResults();
    results.pop();
    roadManager.setResults(results);
    updateDisplay();
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

  // Language selector
  const langSelect = $<HTMLSelectElement>('#language-select');
  langSelect.value = getLocale();
  langSelect.addEventListener('change', async () => {
    await setLocale(langSelect.value as Locale);
    updateAllTexts();
  });

  // License activation
  $('#license-activate-btn').addEventListener('click', async () => {
    const input = $<HTMLInputElement>('#license-input');
    const statusEl = $('#license-status');
    const key = input.value.trim();
    if (!key) {
      statusEl.textContent = 'Please enter a license key';
      statusEl.style.color = '#ef4444';
      return;
    }
    statusEl.textContent = 'Validating...';
    statusEl.style.color = '#71717a';
    try {
      const result = await activateLicense(key);
      if (result.success) {
        currentTier = result.tier;
        statusEl.textContent = result.message;
        statusEl.style.color = '#22c55e';
        updateTierDisplay();
        removeAds();
        updateDisplay();
      } else {
        statusEl.textContent = result.message;
        statusEl.style.color = '#ef4444';
      }
    } catch {
      statusEl.textContent = 'Network error. Please try again.';
      statusEl.style.color = '#ef4444';
    }
  });

  // Pricing links — use safe DOM construction
  const pricingEl = $('#pricing-links');
  clearChildren(pricingEl);

  const createPricingLink = (tier: Tier.AD_FREE | Tier.PREMIUM, label: string, price: string, color: string, bg: string) => {
    const a = el('a', {
      target: '_blank',
      style: `display:flex;justify-content:space-between;align-items:center;padding:8px;background:${bg};border-radius:6px;text-decoration:none;color:#e4e4e7;border:1px solid #2a2b35;`,
    });
    (a as HTMLAnchorElement).href = getPaymentLink(tier);
    a.appendChild(el('span', { style: 'font-size:12px;' }, label));
    a.appendChild(el('span', { style: `font-size:12px;color:${color};font-weight:600;` }, price));
    return a;
  };

  pricingEl.appendChild(createPricingLink(Tier.AD_FREE, t('tier.adFree'), '$4.99/mo', '#6366f1', '#1a1b23'));
  pricingEl.appendChild(createPricingLink(Tier.PREMIUM, t('tier.premium'), '$9.99/mo', '#eab308', 'rgba(234,179,8,0.05)'));

  // Listen for messages from content script (with validation)
  try {
    chrome.runtime.onMessage.addListener((msg, sender) => {
      // Only accept messages from our own extension
      if (sender.id !== chrome.runtime.id) return;

      if (msg.type === 'RESULTS_DETECTED' && validateGameResults(msg.results)) {
        roadManager.setResults(msg.results);
        updateDisplay();
        setDetectionStatus('found');
      } else if (msg.type === 'DETECTION_STATUS' && typeof msg.status === 'string') {
        setDetectionStatus(msg.status);
      }
    });
  } catch {
    // Not in extension context
  }
}

function addResult(outcome: 'B' | 'P' | 'T') {
  roadManager.addResult({ outcome });
  updateDisplay();
}

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

  const pred = predict(
    roadManager.getResults(),
    analysis.columns,
    analysis.bigEyeBoy,
    analysis.smallRoad,
    analysis.cockroachPig,
    currentTier === Tier.PREMIUM,
  );

  const panel = $('#prediction-panel');

  if (!pred) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');

  const outcomeEl = $('#prediction-outcome');
  outcomeEl.className = `prediction-outcome ${pred.outcome === 'B' ? 'banker' : 'player'}`;
  outcomeEl.textContent = pred.outcome === 'B' ? t('outcome.bankerShort') : t('outcome.playerShort');

  const confEl = $('#prediction-confidence');
  clearChildren(confEl);
  const confText = el('div', { style: 'font-size:13px;font-weight:600;color:#e4e4e7;' }, t('prediction.confidence', safeNumber(pred.confidence)));
  const confBar = el('div', { class: 'confidence-bar' });
  const confFill = el('div', {
    class: `confidence-fill ${pred.outcome === 'B' ? 'banker' : 'player'}`,
    style: `width:${safeNumber(pred.confidence)}%`,
  });
  confBar.appendChild(confFill);
  confEl.append(confText, confBar);

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

  if (Array.isArray(grid)) {
    renderRoad(canvas, grid as any, { isDerived });
  }
}

function setDetectionStatus(status: string) {
  const badge = $('#detection-status');
  const statusMap: Record<string, string> = {
    scanning: t('detection.scanning'),
    found: t('detection.found'),
    not_found: t('detection.notFound'),
    watching: t('detection.watching'),
  };
  badge.textContent = statusMap[status] ?? '';
  badge.className = `status-badge ${status === 'found' || status === 'watching' ? 'active' : ''}`;
}

function updateTierDisplay() {
  const tierEl = $('#tier-display');
  const tierNames: Record<Tier, string> = {
    [Tier.FREE]: t('tier.free'),
    [Tier.AD_FREE]: t('tier.adFree'),
    [Tier.PREMIUM]: t('tier.premium'),
  };
  clearChildren(tierEl);
  const badge = el('span', { class: `tier-badge ${currentTier}` }, tierNames[currentTier]);
  tierEl.appendChild(badge);
  if (currentTier === Tier.FREE) {
    tierEl.appendChild(document.createElement('br'));
    const upgradeLink = el('a', { href: '#', style: 'color:#6366f1;font-size:12px;margin-top:8px;display:inline-block;' }, t('tier.upgrade'));
    tierEl.appendChild(upgradeLink);
  }
}

function updateAllTexts() {
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')!;
    el.textContent = t(key);
  });

  // Update specific elements
  $('#app-title').textContent = t('app.title');
  $('#disclaimer-text').textContent = t('disclaimer.text');
  $('#disclaimer-btn').textContent = t('disclaimer.understand');

  // Update manual input buttons with localized labels
  $('#btn-banker').textContent = t('outcome.bankerShort');
  $('#btn-player').textContent = t('outcome.playerShort');
  $('#btn-tie').textContent = t('outcome.tieShort');
}

// Start
init();
