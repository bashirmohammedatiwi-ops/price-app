import './style.css';
import { BrowserCodeReader, BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import {
  DecodeHintType,
  MultiFormatReader,
  RGBLuminanceSource,
  HybridBinarizer,
  BinaryBitmap,
  NotFoundException,
  ChecksumException,
  FormatException,
} from '@zxing/library';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import Quagga from '@ericblade/quagga2';
import { BarcodeDetectorPolyfill } from '@undecaf/barcode-detector-polyfill';

const DEFAULT_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000');

const RECENT_KEY = 'price_client_recent_barcodes';
const SCAN_REGION_ID = 'scanRegion';
const SCAN_VIDEO_ID = 'scanVideo';
const HTML5_REGION_ID = 'html5ScanRegion';

const IOS_SCAN_BOX = { width: 300, height: 170 };
const DEFAULT_SCAN_BOX = { width: 340, height: 180 };

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const ENGINE_OPTIONS = [
  {
    id: 'zxingBrowser',
    label: 'ZXing Browser',
    hint: 'مكتبة ZXing Browser (متوازن)',
  },
  {
    id: 'html5Qrcode',
    label: 'html5-qrcode',
    hint: 'مكتبة html5-qrcode (دعم واسع للأجهزة)',
  },
  {
    id: 'quagga2',
    label: 'Quagga2',
    hint: 'مكتبة Quagga2 (1D barcode مخصص)',
  },
  {
    id: 'barcodeDetector',
    label: 'BarcodeDetector',
    hint: 'Web BarcodeDetector (أداء عالي إذا كان مدعوم)',
  },
  {
    id: 'zxingLibrary',
    label: 'ZXing Library',
    hint: 'ZXing Library مباشرة (canvas decoding)',
  },
  {
    id: 'flutterWeb',
    label: 'Flutter Web',
    hint: 'مكتبة Flutter Scanner (mobile_scanner) داخل ويب',
  },
];

const app = document.querySelector('#app');
const engineButtonsHtml = ENGINE_OPTIONS.map(
  (engine, idx) =>
    `<button type="button" class="engine-btn ${idx === 0 ? 'active' : ''}" data-engine-id="${engine.id}">${engine.label}</button>`,
).join('');

app.innerHTML = `
  <main class="container">
    <header class="header">
      <div class="app-chip">Price Mobile</div>
      <h1>سعر</h1>
      <p>اختبر 6 مكتبات مسح مختلفة واختر الأفضل خصوصًا للـ iPhone</p>
    </header>

    <section class="card scanner-card">
      <div class="scan-two-btns">
        <button id="toggleScannerBtn" class="scan-btn scan-btn-normal" type="button">عادي</button>
        <button type="button" id="fastScannerBtn" class="scan-btn scan-btn-fast">سريع</button>
      </div>

      <div class="engine-switcher">
        ${engineButtonsHtml}
      </div>
      <div id="engineHint" class="engine-hint">${ENGINE_OPTIONS[0].hint}</div>

      <div class="camera-settings">
        <div class="camera-settings-title">إعدادات الكاميرا (خاصة بكل مكتبة)</div>
        <div class="camera-settings-grid">
          <label class="field-inline" for="qualityTierSelect">
            <span>الدقة</span>
            <select id="qualityTierSelect">
              <option value="primary">عالية</option>
              <option value="fallback">متوسطة</option>
              <option value="minimal">منخفضة</option>
            </select>
          </label>
          <label class="field-inline" for="focusModeSelect">
            <span>نمط الفوكس</span>
            <select id="focusModeSelect">
              <option value="continuous">مستمر</option>
              <option value="single-shot">لقطة واحدة</option>
              <option value="fixed">ثابت</option>
              <option value="manual">يدوي</option>
            </select>
          </label>
          <label class="field-inline">
            <span>FPS: <b id="fpsValue">24</b></span>
            <input id="fpsRange" type="range" min="8" max="30" step="1" value="24" />
          </label>
          <label class="field-inline">
            <span>Zoom: <b id="zoomValue">1.0x</b></span>
            <input id="zoomRange" type="range" min="1" max="5" step="0.1" value="1" />
          </label>
        </div>
        <label class="tap-focus-option">
          <input id="tapFocusToggle" type="checkbox" checked />
          <span>تفعيل فوكس بالضغط على الشاشة</span>
        </label>
      </div>

      <div class="quick-actions quick-actions-extra">
        <button id="switchCameraBtn" class="secondary-btn hidden" type="button">تبديل الكاميرا</button>
        <button id="toggleTorchBtn" class="secondary-btn hidden" type="button">تشغيل الإضاءة</button>
        <div id="cameraLabel" class="camera-label hidden">—</div>
      </div>
      <div class="row">
        <label for="barcodeInput">اكتب الباركود</label>
        <input id="barcodeInput" type="text" placeholder="مثال: 1234567890" />
        <button id="searchBtn" class="primary">عرض المنتج</button>
      </div>
      <div class="scanner-shell hidden" id="scannerShell">
        <div id="${SCAN_REGION_ID}" class="scan-region"></div>
        <div id="focusReticle" class="focus-reticle hidden"></div>
        <div class="scan-overlay">
          <div class="scan-frame">
            <span class="corner tl"></span>
            <span class="corner tr"></span>
            <span class="corner bl"></span>
            <span class="corner br"></span>
            <span class="scan-line"></span>
          </div>
          <div class="scan-hint">وجّه الكاميرا على الباركود داخل الإطار</div>
        </div>
      </div>
      <div id="status" class="status">جاهز.</div>
    </section>

    <section class="card">
      <h2>آخر عمليات البحث</h2>
      <div id="recentWrap" class="recent-wrap"></div>
    </section>

    <section class="card">
      <h2>تفاصيل المنتج</h2>
      <div id="resultWrap" class="result-wrap">لا توجد نتيجة بعد.</div>
    </section>
  </main>
`;

const $ = (id) => document.getElementById(id);

const state = {
  codeReader: null,
  scannerRunning: false,
  scannerBusy: false,
  switchingCamera: false,
  fastMode: false,
  selectedEngineId: 'zxingBrowser',
  activeEngineId: null,
  lastScan: '',
  lastScanAt: 0,
  selectedCameraId: null,
  cameras: [],
  torchOn: false,

  // runtime engine handles
  scanControls: null,
  html5Scanner: null,
  quaggaDetectedHandler: null,
  detectorRaf: null,
  mediaStream: null,
  manualReader: null,
  manualCanvas: null,
  manualCtx: null,
  setTorchFn: null,
  focusReticleTimer: null,
  engineCameraSettings: JSON.parse(JSON.stringify(ENGINE_CAMERA_DEFAULTS)),
};

const POSSIBLE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

const HTML5_SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
];

const QUAGGA_READERS = [
  'ean_reader',
  'ean_8_reader',
  'upc_reader',
  'upc_e_reader',
  'code_128_reader',
  'code_39_reader',
];

const BARCODE_DETECTOR_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];

const ENGINE_CAMERA_DEFAULTS = {
  zxingBrowser: {
    tier: 'primary',
    fps: isIOS ? 20 : 24,
    zoom: 1,
    focusMode: isIOS ? 'single-shot' : 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
  html5Qrcode: {
    tier: 'primary',
    fps: isIOS ? 14 : 18,
    zoom: 1,
    focusMode: isIOS ? 'single-shot' : 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
  quagga2: {
    tier: 'primary',
    fps: isIOS ? 18 : 22,
    zoom: 1,
    focusMode: isIOS ? 'single-shot' : 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
  barcodeDetector: {
    tier: 'primary',
    fps: isIOS ? 22 : 28,
    zoom: 1,
    focusMode: isIOS ? 'single-shot' : 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
  zxingLibrary: {
    tier: 'primary',
    fps: isIOS ? 20 : 24,
    zoom: 1,
    focusMode: isIOS ? 'single-shot' : 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
  flutterWeb: {
    tier: 'primary',
    fps: 24,
    zoom: 1,
    focusMode: 'continuous',
    tapFocus: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
  },
};

if (typeof window !== 'undefined' && typeof window.BarcodeDetector === 'undefined') {
  window.BarcodeDetector = BarcodeDetectorPolyfill;
}

function pickBestBackCamera(cameras) {
  if (!Array.isArray(cameras) || !cameras.length) return null;
  const normalized = cameras.map((c) => ({ ...c, l: String(c.label || '').toLowerCase() }));

  const score = (cam) => {
    let s = 0;
    if (cam.l.includes('back') || cam.l.includes('rear') || cam.l.includes('environment')) s += 40;
    if (isIOS) {
      if (cam.l.includes('tele') || cam.l.includes('photo') || cam.l.includes('2x') || cam.l.includes('3x')) s -= 60;
      if (cam.l.includes('ultra') || cam.l.includes('0.5') || cam.l.includes('macro')) s += 35;
      if (cam.l.includes('wide') || cam.l.includes('1x') || cam.l.includes('back camera')) s += 20;
    } else {
      if (cam.l.includes('tele') || cam.l.includes('photo')) s += 10;
      if (cam.l.includes('wide') && !cam.l.includes('ultra')) s += 8;
      if (cam.l.includes('ultra') || cam.l.includes('0.5')) s -= 20;
    }
    if (cam.l.includes('front') || cam.l.includes('user')) s -= 50;
    return s;
  };

  normalized.sort((a, b) => score(b) - score(a));
  return normalized[0]?.id || null;
}

function updateCameraLabel(cameraId) {
  const labelEl = $('cameraLabel');
  if (!labelEl) return;
  const cam = state.cameras.find((c) => c.id === cameraId);
  const label = cam?.label || 'الكاميرا الخلفية';
  labelEl.textContent = `الكاميرا: ${label}`;
  labelEl.classList.remove('hidden');
}

function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`.trim();
}

function getEngineById(engineId) {
  return ENGINE_OPTIONS.find((e) => e.id === engineId) || ENGINE_OPTIONS[0];
}

function updateEngineUi() {
  const hintEl = $('engineHint');
  const current = getEngineById(state.selectedEngineId);
  if (hintEl) hintEl.textContent = current.hint;

  document.querySelectorAll('.engine-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.engineId === state.selectedEngineId);
  });
}

function getEngineCameraSettings(engineId = state.selectedEngineId) {
  return state.engineCameraSettings[engineId] || ENGINE_CAMERA_DEFAULTS[engineId] || ENGINE_CAMERA_DEFAULTS.zxingBrowser;
}

function setEngineCameraSettings(patch, engineId = state.selectedEngineId) {
  const previous = getEngineCameraSettings(engineId);
  state.engineCameraSettings[engineId] = { ...previous, ...patch };
}

function updateCameraSettingsUi() {
  const settings = getEngineCameraSettings();
  const isFlutterEngine = state.selectedEngineId === 'flutterWeb';

  const tierEl = $('qualityTierSelect');
  const fpsEl = $('fpsRange');
  const fpsValueEl = $('fpsValue');
  const zoomEl = $('zoomRange');
  const zoomValueEl = $('zoomValue');
  const focusModeEl = $('focusModeSelect');
  const tapFocusEl = $('tapFocusToggle');

  if (tierEl) tierEl.value = settings.tier;
  if (fpsEl) fpsEl.value = String(settings.fps);
  if (fpsValueEl) fpsValueEl.textContent = String(settings.fps);
  if (zoomEl) zoomEl.value = Number(settings.zoom || 1).toFixed(1);
  if (zoomValueEl) zoomValueEl.textContent = `${Number(settings.zoom || 1).toFixed(1)}x`;
  if (focusModeEl) focusModeEl.value = settings.focusMode || 'continuous';
  if (tapFocusEl) tapFocusEl.checked = Boolean(settings.tapFocus);

  [tierEl, fpsEl, zoomEl, focusModeEl, tapFocusEl].forEach((el) => {
    if (!el) return;
    el.disabled = isFlutterEngine;
  });
}

function getScanVideoElement() {
  return $(SCAN_VIDEO_ID) || document.querySelector(`#${SCAN_REGION_ID} video`);
}

function syncMediaStreamFromDom() {
  const videoEl = getScanVideoElement();
  const stream = videoEl?.srcObject;
  if (stream instanceof MediaStream) {
    state.mediaStream = stream;
    return stream;
  }
  return null;
}

function getActiveVideoTrack() {
  const trackFromState = state.mediaStream?.getVideoTracks?.()?.[0] || null;
  if (trackFromState) return trackFromState;
  const stream = syncMediaStreamFromDom();
  return stream?.getVideoTracks?.()?.[0] || null;
}

function clamp(num, min, max) {
  return Math.max(min, Math.min(max, num));
}

function mapFocusModeToSupported(requestedMode, supportedModes = []) {
  if (!supportedModes.length) return null;
  if (supportedModes.includes(requestedMode)) return requestedMode;

  if (requestedMode === 'continuous' && supportedModes.includes('auto')) return 'auto';
  if (requestedMode === 'auto' && supportedModes.includes('continuous')) return 'continuous';
  if (requestedMode === 'single-shot' && supportedModes.includes('manual')) return 'manual';

  const priority = ['continuous', 'auto', 'single-shot', 'fixed', 'manual'];
  for (const mode of priority) {
    if (supportedModes.includes(mode)) return mode;
  }
  return supportedModes[0] || null;
}

function showFocusReticle(normX, normY) {
  const shell = $('scannerShell');
  const marker = $('focusReticle');
  const region = $(SCAN_REGION_ID);
  if (!shell || !marker || !region) return;

  const rect = region.getBoundingClientRect();
  const x = clamp(normX, 0, 1) * rect.width;
  const y = clamp(normY, 0, 1) * rect.height;
  marker.style.left = `${Math.round(rect.left - shell.getBoundingClientRect().left + x)}px`;
  marker.style.top = `${Math.round(rect.top - shell.getBoundingClientRect().top + y)}px`;
  marker.classList.remove('hidden');
  marker.classList.add('active');
  window.clearTimeout(state.focusReticleTimer);
  state.focusReticleTimer = window.setTimeout(() => {
    marker.classList.remove('active');
    marker.classList.add('hidden');
  }, 700);
}

async function applyLiveCameraTuning({ tapPoint = null } = {}) {
  if (!state.scannerRunning || state.activeEngineId === 'flutterWeb') return;

  let track = getActiveVideoTrack();
  if (!track || typeof track.applyConstraints !== 'function') {
    await new Promise((r) => setTimeout(r, 120));
    track = getActiveVideoTrack();
  }
  if (!track || typeof track.applyConstraints !== 'function') {
    if (state.activeEngineId === 'html5Qrcode' && state.html5Scanner && typeof state.html5Scanner.applyVideoConstraints === 'function') {
      const settings = getEngineCameraSettings();
      const advanced = {};
      if (Number.isFinite(Number(settings.zoom))) advanced.zoom = Number(settings.zoom);
      if (settings.focusMode) advanced.focusMode = settings.focusMode;
      if (tapPoint && settings.tapFocus) {
        advanced.pointsOfInterest = [{ x: clamp(tapPoint.x, 0, 1), y: clamp(tapPoint.y, 0, 1) }];
      }
      if (Object.keys(advanced).length) {
        try {
          await state.html5Scanner.applyVideoConstraints({ advanced: [advanced] });
        } catch (_) {}
      }
    }
    return;
  }

  const settings = getEngineCameraSettings();
  const caps = track.getCapabilities?.() || {};
  const advanced = {};

  if (caps.zoom && Number.isFinite(Number(settings.zoom))) {
    const min = Number(caps.zoom.min ?? 1);
    const max = Number(caps.zoom.max ?? settings.zoom);
    advanced.zoom = clamp(Number(settings.zoom), min, max);
  }

  const supportedFocusModes = Array.isArray(caps.focusMode) ? caps.focusMode : [];
  const focusMode = mapFocusModeToSupported(settings.focusMode, supportedFocusModes);
  if (focusMode) {
    advanced.focusMode = focusMode;
  }

  if (tapPoint && settings.tapFocus) {
    if (caps.pointsOfInterest) {
      advanced.pointsOfInterest = [{ x: clamp(tapPoint.x, 0, 1), y: clamp(tapPoint.y, 0, 1) }];
      if (supportedFocusModes.includes('single-shot')) {
        advanced.focusMode = 'single-shot';
      }
    } else if (!advanced.focusMode && supportedFocusModes.includes('single-shot')) {
      advanced.focusMode = 'single-shot';
    }
  }

  if (!Object.keys(advanced).length) return;
  try {
    await track.applyConstraints({ advanced: [advanced] });
  } catch (_) {
    // Ignore unsupported camera constraints for this browser/device.
  }
}

async function handleTapToFocus(clientX, clientY) {
  if (!state.scannerRunning || state.activeEngineId === 'flutterWeb') return;
  const settings = getEngineCameraSettings();
  if (!settings.tapFocus) return;

  const region = $(SCAN_REGION_ID);
  if (!region) return;
  const rect = region.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const x = clamp((clientX - rect.left) / rect.width, 0, 1);
  const y = clamp((clientY - rect.top) / rect.height, 0, 1);
  showFocusReticle(x, y);
  await applyLiveCameraTuning({ tapPoint: { x, y } });
  setStatus('تم إرسال طلب فوكس على النقطة المحددة.', 'ok');
}

function setScanButtonsState(running, fastMode = false) {
  const normalBtn = $('toggleScannerBtn');
  const fastBtn = $('fastScannerBtn');
  if (!normalBtn || !fastBtn) return;

  if (!running) {
    normalBtn.textContent = 'عادي';
    normalBtn.classList.remove('active');
    fastBtn.textContent = 'سريع';
    fastBtn.classList.remove('active');
    return;
  }

  if (fastMode) {
    fastBtn.textContent = 'إيقاف سريع';
    fastBtn.classList.add('active');
    normalBtn.textContent = 'عادي';
    normalBtn.classList.remove('active');
  } else {
    normalBtn.textContent = 'إيقاف';
    normalBtn.classList.add('active');
    fastBtn.textContent = 'سريع';
    fastBtn.classList.remove('active');
  }
}

function setTorchUi() {
  const hidden = typeof state.setTorchFn !== 'function';
  $('toggleTorchBtn').classList.toggle('hidden', hidden);
  if (hidden) state.torchOn = false;
}

async function setTorch(on) {
  if (!state.scannerRunning || typeof state.setTorchFn !== 'function') return;
  try {
    await state.setTorchFn(on);
    state.torchOn = on;
    $('toggleTorchBtn').textContent = on ? 'إطفاء الإضاءة' : 'تشغيل الإضاءة';
  } catch (_) {
    // no-op on unsupported browser/device
  }
}

function getBackendUrl() {
  return DEFAULT_URL.endsWith('/') ? DEFAULT_URL.slice(0, -1) : DEFAULT_URL;
}

function getFlutterWebUrl(mode = 'normal') {
  const base = '/price/flutter/';
  const url = new URL(base, window.location.origin);
  url.searchParams.set('mode', 'scanner');
  url.searchParams.set('speed', mode === 'fast' ? 'fast' : 'normal');
  return url.toString();
}

function openFlutterOverlay(mode = 'normal') {
  const overlay = $('flutterOverlay');
  const frame = $('flutterFrame');
  if (!overlay || !frame) throw new Error('واجهة Flutter غير متاحة.');
  frame.src = getFlutterWebUrl(mode);
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
}

function closeFlutterOverlay() {
  const overlay = $('flutterOverlay');
  const frame = $('flutterFrame');
  if (!overlay || !frame) return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  frame.src = 'about:blank';
  document.body.classList.remove('no-scroll');
}

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(code) {
  const current = loadRecent().filter((x) => x !== code);
  current.unshift(code);
  localStorage.setItem(RECENT_KEY, JSON.stringify(current.slice(0, 15)));
}

function renderRecent() {
  const wrap = $('recentWrap');
  const items = loadRecent();
  if (!items.length) {
    wrap.innerHTML = '<span class="muted">لا يوجد سجل بعد.</span>';
    return;
  }
  wrap.innerHTML = '';
  items.forEach((item) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = item;
    b.addEventListener('click', () => searchProduct(item));
    wrap.appendChild(b);
  });
}

function renderProduct(data) {
  const sources = Array.isArray(data.sources) ? [...data.sources].sort((a, b) => Number(a.price || 0) - Number(b.price || 0)) : [];
  if (!sources.length) {
    $('resultWrap').innerHTML = `<div class="muted">لا توجد أسعار لهذا الباركود: ${data.barcode || '-'}</div>`;
    return;
  }
  const cheapest = sources[0];
  const html = `
    <div class="product-head">
      <div><b>${data.name || 'بدون اسم'}</b><div class="muted">الباركود: ${data.barcode || '-'}</div></div>
      <div class="price-badge">الأرخص: ${Number(cheapest.price || 0).toFixed(2)}</div>
    </div>
    ${sources
      .map((s) => {
        const fields = s.fields || {};
        const details = Object.keys(fields).length
          ? Object.entries(fields).map(([k, v]) => `<span class="field-pill">${k}: ${String(v)}</span>`).join('')
          : '<span class="muted">لا توجد تفاصيل إضافية</span>';
        return `<div class="source-card">
          <div class="source-row"><b>${s.source || '-'}</b><span>${Number(s.price || 0).toFixed(2)}</span></div>
          <div class="field-row">${details}</div>
        </div>`;
      })
      .join('')}
  `;
  $('resultWrap').innerHTML = html;
}

async function searchProduct(barcodeRaw) {
  const barcode = String(barcodeRaw || '').trim();
  if (!barcode) return;
  setStatus('جارٍ جلب بيانات المنتج...');
  try {
    const res = await fetch(`${getBackendUrl()}/product/${encodeURIComponent(barcode)}`);
    if (res.status === 404) {
      $('resultWrap').innerHTML = `<div class="error">لا يوجد منتج مسجّل لهذا الباركود: ${barcode}</div>`;
      setStatus('المنتج غير موجود.', 'warn');
      return;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const body = await res.json();
    saveRecent(barcode);
    renderRecent();
    renderProduct(body);
    setStatus('تم تحميل المنتج بنجاح.', 'ok');
  } catch (e) {
    $('resultWrap').innerHTML = `<div class="error">تعذر الاتصال بالسيرفر.<br/>${e.message}</div>`;
    setStatus('فشل الاتصال بالسيرفر.', 'error');
  }
}

function resetScanRegionToVideo() {
  const region = $(SCAN_REGION_ID);
  region.innerHTML = `<video id="${SCAN_VIDEO_ID}" playsinline webkit-playsinline muted></video>`;
  return $(SCAN_VIDEO_ID);
}

function resetScanRegionToHtml5() {
  const region = $(SCAN_REGION_ID);
  region.innerHTML = `<div id="${HTML5_REGION_ID}" class="html5-region"></div>`;
  return $(HTML5_REGION_ID);
}

function clearEngineRuntimeHandles() {
  state.scanControls = null;
  state.html5Scanner = null;
  state.quaggaDetectedHandler = null;
  state.detectorRaf = null;
  state.mediaStream = null;
  state.manualReader = null;
  state.manualCanvas = null;
  state.manualCtx = null;
  state.setTorchFn = null;
}

function stopMediaStream() {
  if (!state.mediaStream) return;
  try {
    state.mediaStream.getTracks().forEach((t) => t.stop());
  } catch (_) {}
  state.mediaStream = null;
}

async function stopActiveEngine() {
  try {
    if (state.activeEngineId === 'zxingBrowser') {
      try {
        state.scanControls?.stop?.();
      } catch (_) {}
      stopMediaStream();
    } else if (state.activeEngineId === 'html5Qrcode') {
      if (state.html5Scanner) {
        try {
          await state.html5Scanner.stop();
        } catch (_) {}
        try {
          await state.html5Scanner.clear();
        } catch (_) {}
      }
    } else if (state.activeEngineId === 'quagga2') {
      try {
        if (state.quaggaDetectedHandler) Quagga.offDetected(state.quaggaDetectedHandler);
      } catch (_) {}
      try {
        Quagga.stop();
      } catch (_) {}
      stopMediaStream();
    } else if (state.activeEngineId === 'barcodeDetector' || state.activeEngineId === 'zxingLibrary') {
      if (state.detectorRaf) cancelAnimationFrame(state.detectorRaf);
      state.detectorRaf = null;
      stopMediaStream();
    } else if (state.activeEngineId === 'flutterWeb') {
      closeFlutterOverlay();
    }
  } finally {
    clearEngineRuntimeHandles();
    state.activeEngineId = null;
  }
}

function assertCameraAllowedContext() {
  if (typeof window === 'undefined' || window.isSecureContext) return;
  const h = String(window.location?.hostname || '');
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return;
  throw new Error('افتح الصفحة عبر HTTPS (أو localhost) حتى تعمل الكاميرا على iPhone.');
}

async function refreshCameraList() {
  const devices = await BrowserMultiFormatReader.listVideoInputDevices();
  state.cameras = devices.map((d) => ({ id: d.deviceId, label: d.label || '' }));
  $('switchCameraBtn').classList.toggle('hidden', state.cameras.length <= 1);
}

async function resolveSelectedDeviceId(cameraIdOverride = null) {
  try {
    await refreshCameraList();
  } catch (_) {
    state.cameras = [];
  }

  if (cameraIdOverride && state.cameras.some((c) => c.id === cameraIdOverride)) {
    state.selectedCameraId = cameraIdOverride;
    updateCameraLabel(cameraIdOverride);
    return cameraIdOverride;
  }

  if (state.selectedCameraId && state.cameras.some((c) => c.id === state.selectedCameraId)) {
    updateCameraLabel(state.selectedCameraId);
    return state.selectedCameraId;
  }

  const best = pickBestBackCamera(state.cameras);
  if (best) {
    state.selectedCameraId = best;
    updateCameraLabel(best);
    return best;
  }

  return null;
}

function getEngineConstraints(deviceId, tier = 'primary') {
  const engine = state.selectedEngineId;
  const cameraSettings = getEngineCameraSettings(engine);
  const selectedTier = cameraSettings.tier || tier;

  // Make each library use visibly different settings.
  const presets = {
    zxingBrowser: {
      primary: isIOS ? { w: 1280, h: 720 } : { w: 1920, h: 1080 },
      fallback: isIOS ? { w: 960, h: 540 } : { w: 1280, h: 720 },
      minimal: { w: 640, h: 480 },
    },
    html5Qrcode: {
      primary: isIOS ? { w: 960, h: 540 } : { w: 1280, h: 720 },
      fallback: { w: 640, h: 480 },
      minimal: { w: 480, h: 360 },
    },
    quagga2: {
      primary: isIOS ? { w: 1280, h: 720 } : { w: 1600, h: 900 },
      fallback: { w: 960, h: 540 },
      minimal: { w: 640, h: 480 },
    },
    barcodeDetector: {
      primary: isIOS ? { w: 1280, h: 720 } : { w: 1920, h: 1080 },
      fallback: { w: 960, h: 540 },
      minimal: { w: 640, h: 480 },
    },
    zxingLibrary: {
      primary: isIOS ? { w: 960, h: 540 } : { w: 1280, h: 720 },
      fallback: { w: 800, h: 600 },
      minimal: { w: 640, h: 480 },
    },
  };

  const preset = presets[engine] || presets.zxingBrowser;
  const selected = preset[selectedTier] || preset[tier] || preset.primary;
  const frameRate = Number(cameraSettings.fps || 0);

  if (deviceId) {
    const video = {
      width: { ideal: selected.w },
      height: { ideal: selected.h },
      deviceId: { exact: deviceId },
    };
    if (frameRate > 0) video.frameRate = { ideal: frameRate };
    if (cameraSettings.aspectRatio) video.aspectRatio = cameraSettings.aspectRatio;
    return {
      video,
    };
  }
  const video = {
    width: { ideal: selected.w },
    height: { ideal: selected.h },
    facingMode: { ideal: 'environment' },
  };
  if (frameRate > 0) video.frameRate = { ideal: frameRate };
  if (cameraSettings.aspectRatio) video.aspectRatio = cameraSettings.aspectRatio;
  return {
    video,
  };
}

function ensureReader() {
  if (state.codeReader) return state.codeReader;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, POSSIBLE_FORMATS);
  if (isIOS) hints.set(DecodeHintType.TRY_HARDER, true);

  state.codeReader = new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: state.fastMode ? 40 : isIOS ? 90 : 60,
    delayBetweenScanSuccess: state.fastMode ? 70 : 120,
    tryPlayVideoTimeout: 8000,
  });
  return state.codeReader;
}

async function handleDecodedText(decodedText) {
  const text = String(decodedText || '').trim();
  if (!text) return;

  const now = Date.now();
  if (text === state.lastScan && now - state.lastScanAt < 1200) return;

  state.lastScan = text;
  state.lastScanAt = now;

  await stopScanner();
  $('barcodeInput').value = text;
  await searchProduct(text);
}

async function startWithZxingBrowser(deviceId) {
  const reader = ensureReader();
  const videoEl = resetScanRegionToVideo();
  const callback = (result) => {
    if (!result) return;
    void handleDecodedText(result.getText?.() || result.text || '');
  };

  const tiers = ['primary', 'fallback', 'minimal'];
  let lastErr;
  for (const tier of tiers) {
    try {
      state.scanControls = await reader.decodeFromConstraints(getEngineConstraints(deviceId, tier), videoEl, callback);
      syncMediaStreamFromDom();
      state.setTorchFn = typeof state.scanControls?.switchTorch === 'function'
        ? async (on) => state.scanControls.switchTorch(on)
        : null;
      state.activeEngineId = 'zxingBrowser';
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error('فشل تشغيل ZXing Browser');
}

async function startWithHtml5Qrcode(deviceId) {
  resetScanRegionToHtml5();
  const scanner = new Html5Qrcode(HTML5_REGION_ID, {
    formatsToSupport: HTML5_SCAN_FORMATS,
    verbose: false,
  });

  const cameraSettings = getEngineCameraSettings('html5Qrcode');
  const scanBox = isIOS ? IOS_SCAN_BOX : DEFAULT_SCAN_BOX;
  $('scannerShell').style.setProperty('--scan-box-w', `${scanBox.width}px`);
  $('scannerShell').style.setProperty('--scan-box-h', `${scanBox.height}px`);

  const config = {
    fps: Math.max(8, Math.min(30, Number(cameraSettings.fps || (state.fastMode ? 20 : isIOS ? 12 : 16)))),
    qrbox: scanBox,
    disableFlip: true,
    aspectRatio: cameraSettings.aspectRatio || (isIOS ? 1.3333333 : 1.7777778),
    videoConstraints: getEngineConstraints(deviceId, 'primary').video,
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };

  const cameraTarget = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' };

  await scanner.start(
    cameraTarget,
    config,
    (decodedText) => {
      void handleDecodedText(decodedText);
    },
    () => {},
  );

  state.html5Scanner = scanner;
  syncMediaStreamFromDom();
  state.setTorchFn = async (on) => {
    try {
      await scanner.applyVideoConstraints({ advanced: [{ torch: on }] });
    } catch (_) {}
  };
  state.activeEngineId = 'html5Qrcode';
}

async function startWithQuagga2(deviceId) {
  const region = $(SCAN_REGION_ID);
  region.innerHTML = '';

  const constraints = getEngineConstraints(deviceId, 'primary').video;
  await new Promise((resolve, reject) => {
    Quagga.init(
      {
        inputStream: {
          type: 'LiveStream',
          target: region,
          constraints,
          area: { top: '15%', right: '5%', left: '5%', bottom: '15%' },
        },
        locator: {
          patchSize: state.fastMode ? 'small' : 'medium',
          halfSample: !state.fastMode,
        },
        numOfWorkers: navigator.hardwareConcurrency || 4,
        decoder: {
          readers: QUAGGA_READERS,
        },
      },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      },
    );
  });

  const onDetected = (data) => {
    const code = data?.codeResult?.code;
    if (!code) return;
    void handleDecodedText(code);
  };
  state.quaggaDetectedHandler = onDetected;
  Quagga.onDetected(onDetected);
  Quagga.start();
  syncMediaStreamFromDom();

  state.setTorchFn = null;
  state.activeEngineId = 'quagga2';
}

async function startWithBarcodeDetector(deviceId) {
  if (typeof window.BarcodeDetector === 'undefined') {
    throw new Error('BarcodeDetector غير متوفر في هذا المتصفح.');
  }

  const videoEl = resetScanRegionToVideo();
  const stream = await navigator.mediaDevices.getUserMedia(getEngineConstraints(deviceId, 'primary'));
  state.mediaStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();

  const detector = new window.BarcodeDetector({ formats: BARCODE_DETECTOR_FORMATS });

  const track = stream.getVideoTracks?.()[0] || null;
  state.setTorchFn = track
    ? async (on) => {
        const caps = track.getCapabilities?.() || {};
        if (!caps.torch) return;
        await track.applyConstraints({ advanced: [{ torch: on }] });
      }
    : null;

  const loop = async () => {
    if (!state.scannerRunning || state.activeEngineId !== 'barcodeDetector') return;
    try {
      const detected = await detector.detect(videoEl);
      if (detected?.length) {
        const value = detected[0]?.rawValue || detected[0]?.rawData || '';
        if (value) {
          void handleDecodedText(String(value));
          return;
        }
      }
    } catch (_) {
      // Ignore intermittent detection errors.
    }
    state.detectorRaf = requestAnimationFrame(loop);
  };

  state.activeEngineId = 'barcodeDetector';
  state.detectorRaf = requestAnimationFrame(loop);
}

async function startWithZxingLibrary(deviceId) {
  const videoEl = resetScanRegionToVideo();
  const stream = await navigator.mediaDevices.getUserMedia(getEngineConstraints(deviceId, 'primary'));
  state.mediaStream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();

  const track = stream.getVideoTracks?.()[0] || null;
  state.setTorchFn = track
    ? async (on) => {
        const caps = track.getCapabilities?.() || {};
        if (!caps.torch) return;
        await track.applyConstraints({ advanced: [{ torch: on }] });
      }
    : null;

  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, POSSIBLE_FORMATS);
  if (isIOS) hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  state.manualReader = reader;
  state.manualCanvas = canvas;
  state.manualCtx = ctx;

  const loop = () => {
    if (!state.scannerRunning || state.activeEngineId !== 'zxingLibrary') return;
    try {
      const w = videoEl.videoWidth || 0;
      const h = videoEl.videoHeight || 0;
      if (w > 0 && h > 0 && ctx) {
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(videoEl, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const luminance = new RGBLuminanceSource(imageData.data, w, h);
        const binary = new BinaryBitmap(new HybridBinarizer(luminance));
        const result = reader.decode(binary);
        if (result?.getText?.()) {
          void handleDecodedText(result.getText());
          return;
        }
      }
    } catch (e) {
      if (!(e instanceof NotFoundException) && !(e instanceof ChecksumException) && !(e instanceof FormatException)) {
        // keep looping even on unexpected decode error
      }
    }
    state.detectorRaf = requestAnimationFrame(loop);
  };

  state.activeEngineId = 'zxingLibrary';
  state.detectorRaf = requestAnimationFrame(loop);
}

async function startWithFlutterWeb() {
  openFlutterOverlay(state.fastMode ? 'fast' : 'normal');
  state.activeEngineId = 'flutterWeb';
}

async function startSelectedEngine(deviceId) {
  const engine = state.selectedEngineId;
  if (engine === 'zxingBrowser') return startWithZxingBrowser(deviceId);
  if (engine === 'html5Qrcode') return startWithHtml5Qrcode(deviceId);
  if (engine === 'quagga2') return startWithQuagga2(deviceId);
  if (engine === 'barcodeDetector') return startWithBarcodeDetector(deviceId);
  if (engine === 'zxingLibrary') return startWithZxingLibrary(deviceId);
  if (engine === 'flutterWeb') return startWithFlutterWeb();
  throw new Error('محرك غير معروف');
}

async function applyIosFocusStabilityHints() {
  if (!isIOS || !state.scanControls?.streamVideoConstraintsApply) return;

  const apply = async (constraints) => {
    try {
      await state.scanControls.streamVideoConstraintsApply(constraints);
      return true;
    } catch {
      return false;
    }
  };

  await new Promise((r) => setTimeout(r, 120));

  let caps = null;
  try {
    caps = state.scanControls.streamVideoCapabilitiesGet?.((t) => t.kind === 'video');
  } catch {
    caps = null;
  }

  const modes = caps && Array.isArray(caps.focusMode) ? caps.focusMode : null;
  if (modes && modes.length) {
    const requested = getEngineCameraSettings().focusMode;
    const mappedRequested = mapFocusModeToSupported(requested, modes);
    const prefer = [mappedRequested, 'fixed', 'single-shot', 'manual', 'continuous'].filter(Boolean);
    for (const mode of prefer) {
      if (modes.includes(mode) && (await apply({ advanced: [{ focusMode: mode }] }))) return;
    }
    return;
  }

  await apply({ advanced: [{ focusMode: 'fixed' }] });
  await apply({ advanced: [{ focusMode: 'single-shot' }] });
}

async function stopScanner() {
  if (!state.scannerRunning && !state.scannerBusy) return;
  if (state.scannerBusy) return;

  state.scannerBusy = true;
  try {
    await stopActiveEngine();
    state.scannerRunning = false;
    state.torchOn = false;
    window.clearTimeout(state.focusReticleTimer);
    $('focusReticle')?.classList.add('hidden');
    $('scannerShell').classList.add('hidden');
    setScanButtonsState(false, false);
    $('toggleTorchBtn').classList.add('hidden');
    $('switchCameraBtn').classList.toggle('hidden', state.cameras.length <= 1);
  } finally {
    state.scannerBusy = false;
  }
}

async function startScanner(mode = 'normal', cameraIdOverride = null) {
  if (state.scannerBusy) return;

  // If scanner is already running, switch mode by restart.
  if (state.scannerRunning) {
    await stopScanner();
  }

  state.fastMode = mode === 'fast';
  state.scannerBusy = true;
  const isFlutterEngine = state.selectedEngineId === 'flutterWeb';
  $('scannerShell').classList.toggle('hidden', isFlutterEngine);
  setScanButtonsState(true, state.fastMode);

  try {
    let deviceId = null;
    if (!isFlutterEngine) {
      assertCameraAllowedContext();
      deviceId = await resolveSelectedDeviceId(cameraIdOverride);

      const box = isIOS ? IOS_SCAN_BOX : DEFAULT_SCAN_BOX;
      $('scannerShell').style.setProperty('--scan-box-w', `${box.width}px`);
      $('scannerShell').style.setProperty('--scan-box-h', `${box.height}px`);
    }

    await startSelectedEngine(deviceId);
    state.scannerRunning = true;
    setTorchUi();
    if (!isFlutterEngine) {
      await applyLiveCameraTuning();
      await applyIosFocusStabilityHints();
    }
    setStatus(`الماسح يعمل عبر ${getEngineById(state.selectedEngineId).label}.`, 'ok');
  } catch (e) {
    await stopActiveEngine();
    state.scannerRunning = false;
    $('scannerShell').classList.add('hidden');
    setScanButtonsState(false, false);
    setStatus(`تعذر تشغيل ${getEngineById(state.selectedEngineId).label}: ${e?.message || 'Unknown error'}`, 'error');
  } finally {
    state.scannerBusy = false;
  }
}

async function switchCamera() {
  if (state.switchingCamera || state.scannerBusy) return;
  state.switchingCamera = true;

  try {
    if (!state.cameras.length) {
      await refreshCameraList();
    }
    if (state.cameras.length <= 1) return;

    const currentIndex = state.cameras.findIndex((c) => c.id === state.selectedCameraId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.cameras.length : 0;
    const nextCameraId = state.cameras[nextIndex].id;
    state.selectedCameraId = nextCameraId;
    updateCameraLabel(nextCameraId);

    if (state.scannerRunning) {
      await startScanner(state.fastMode ? 'fast' : 'normal', nextCameraId);
      setStatus('تم التبديل إلى الكاميرا التالية.', 'ok');
    } else {
      setStatus('تم اختيار كاميرا جديدة. شغّل الماسح للبدء.', 'ok');
    }
  } catch (e) {
    setStatus(`تعذر التبديل: ${e?.message || 'Unknown error'}`, 'error');
  } finally {
    state.switchingCamera = false;
  }
}

async function setEngine(engineId) {
  if (!ENGINE_OPTIONS.some((e) => e.id === engineId)) return;
  if (state.selectedEngineId === engineId) return;

  state.selectedEngineId = engineId;
  updateEngineUi();
  updateCameraSettingsUi();

  if (state.scannerRunning) {
    await startScanner(state.fastMode ? 'fast' : 'normal');
  }
}

$('searchBtn').addEventListener('click', () => searchProduct($('barcodeInput').value));
$('barcodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchProduct($('barcodeInput').value);
});

$('toggleScannerBtn').addEventListener('click', async () => {
  if (state.scannerRunning && !state.fastMode) {
    await stopScanner();
    return;
  }
  await startScanner('normal');
});

$('fastScannerBtn').addEventListener('click', async () => {
  if (state.scannerRunning && state.fastMode) {
    await stopScanner();
    return;
  }
  await startScanner('fast');
});

$('toggleTorchBtn').addEventListener('click', async () => {
  await setTorch(!state.torchOn);
});

$('switchCameraBtn').addEventListener('click', async () => {
  await switchCamera();
});

const onCameraSettingsChanged = async ({ restart = false } = {}) => {
  if (!state.scannerRunning) return;
  if (restart) {
    await startScanner(state.fastMode ? 'fast' : 'normal');
    return;
  }
  await applyLiveCameraTuning();
};

$('qualityTierSelect')?.addEventListener('change', async (e) => {
  setEngineCameraSettings({ tier: e.target.value });
  await onCameraSettingsChanged({ restart: true });
});

$('focusModeSelect')?.addEventListener('change', async (e) => {
  setEngineCameraSettings({ focusMode: e.target.value });
  await onCameraSettingsChanged({ restart: false });
});

$('fpsRange')?.addEventListener('input', (e) => {
  const fps = Number(e.target.value || 24);
  $('fpsValue').textContent = String(fps);
  setEngineCameraSettings({ fps });
});

$('fpsRange')?.addEventListener('change', async () => {
  await onCameraSettingsChanged({ restart: true });
});

$('zoomRange')?.addEventListener('input', async (e) => {
  const zoom = Number(e.target.value || 1);
  $('zoomValue').textContent = `${zoom.toFixed(1)}x`;
  setEngineCameraSettings({ zoom });
  await onCameraSettingsChanged({ restart: false });
});

$('tapFocusToggle')?.addEventListener('change', (e) => {
  setEngineCameraSettings({ tapFocus: e.target.checked });
});

$('scannerShell')?.addEventListener('pointerup', async (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  await handleTapToFocus(e.clientX, e.clientY);
});

document.querySelectorAll('.engine-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    await setEngine(btn.dataset.engineId);
  });
});

document.addEventListener('visibilitychange', async () => {
  if (document.hidden && state.scannerRunning) {
    await stopScanner();
  }
});

$('closeFlutterOverlayBtn')?.addEventListener('click', async () => {
  if (state.scannerRunning && state.activeEngineId === 'flutterWeb') {
    await stopScanner();
  } else {
    closeFlutterOverlay();
  }
});

$('flutterOverlay')?.addEventListener('click', async (e) => {
  if (e.target !== e.currentTarget) return;
  if (state.scannerRunning && state.activeEngineId === 'flutterWeb') {
    await stopScanner();
  } else {
    closeFlutterOverlay();
  }
});

updateEngineUi();
updateCameraSettingsUi();
resetScanRegionToVideo();
renderRecent();
