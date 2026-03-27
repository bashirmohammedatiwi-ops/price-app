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
      <p>اختبر 5 مكتبات مسح مختلفة واختر الأفضل خصوصًا للـ iPhone</p>
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
  const isFast = state.fastMode;

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
  const selected = preset[tier] || preset.primary;

  if (deviceId) {
    return { video: { width: { ideal: selected.w }, height: { ideal: selected.h }, deviceId: { exact: deviceId } } };
  }
  return { video: { width: { ideal: selected.w }, height: { ideal: selected.h }, facingMode: { ideal: 'environment' } } };
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

  const scanBox = isIOS ? IOS_SCAN_BOX : DEFAULT_SCAN_BOX;
  $('scannerShell').style.setProperty('--scan-box-w', `${scanBox.width}px`);
  $('scannerShell').style.setProperty('--scan-box-h', `${scanBox.height}px`);

  const config = {
    fps: state.fastMode ? 20 : isIOS ? 12 : 16,
    qrbox: scanBox,
    disableFlip: true,
    aspectRatio: isIOS ? 1.3333333 : 1.7777778,
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

async function startSelectedEngine(deviceId) {
  const engine = state.selectedEngineId;
  if (engine === 'zxingBrowser') return startWithZxingBrowser(deviceId);
  if (engine === 'html5Qrcode') return startWithHtml5Qrcode(deviceId);
  if (engine === 'quagga2') return startWithQuagga2(deviceId);
  if (engine === 'barcodeDetector') return startWithBarcodeDetector(deviceId);
  if (engine === 'zxingLibrary') return startWithZxingLibrary(deviceId);
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
    const prefer = ['fixed', 'single-shot', 'manual'];
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
  $('scannerShell').classList.remove('hidden');
  setScanButtonsState(true, state.fastMode);

  try {
    assertCameraAllowedContext();
    const deviceId = await resolveSelectedDeviceId(cameraIdOverride);

    const box = isIOS ? IOS_SCAN_BOX : DEFAULT_SCAN_BOX;
    $('scannerShell').style.setProperty('--scan-box-w', `${box.width}px`);
    $('scannerShell').style.setProperty('--scan-box-h', `${box.height}px`);

    await startSelectedEngine(deviceId);
    state.scannerRunning = true;
    setTorchUi();
    await applyIosFocusStabilityHints();
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

updateEngineUi();
resetScanRegionToVideo();
renderRecent();
