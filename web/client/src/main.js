import './style.css';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
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

const SCAN_REGION_ID = 'scanRegion';
const SCAN_VIDEO_ID = 'scanVideo';
const HTML5_REGION_ID = 'html5ScanRegion';

function scanBoxForViewport() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 400;
  const h = typeof window !== 'undefined' ? window.innerHeight : 700;
  if (isIOS) {
    return {
      width: Math.round(Math.min(w * 0.92, 720)),
      height: Math.round(Math.min(h * 0.42, 420)),
    };
  }
  return {
    width: Math.round(Math.min(w * 0.9, 800)),
    height: Math.round(Math.min(h * 0.4, 440)),
  };
}

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const ENGINE_OPTIONS = [
  { id: 'zxingBrowser', label: 'ZXing Browser' },
  { id: 'html5Qrcode', label: 'html5-qrcode' },
  { id: 'quagga2', label: 'Quagga2' },
  { id: 'barcodeDetector', label: 'BarcodeDetector' },
  { id: 'zxingLibrary', label: 'ZXing Library' },
];

const app = document.querySelector('#app');
const engineSelectOptionsHtml = ENGINE_OPTIONS.map(
  (engine) =>
    `<option value="${engine.id}"${engine.id === 'zxingBrowser' ? ' selected' : ''}>${engine.label}</option>`,
).join('');

app.innerHTML = `
  <div class="client-shell">
    <header class="client-company-header">
      <h1 class="client-company-name">شركه ديما الحياه</h1>
    </header>

    <main class="container">
    <section class="card scanner-card">
      <div class="scan-two-btns">
        <button id="toggleScannerBtn" class="scan-btn scan-btn-normal" type="button">عادي</button>
        <button type="button" id="fastScannerBtn" class="scan-btn scan-btn-fast">سريع</button>
      </div>

      <div class="row engine-row">
        <label for="engineSelect">مكتبة المسح</label>
        <select id="engineSelect" class="engine-select" aria-label="مكتبة المسح">
          ${engineSelectOptionsHtml}
        </select>
      </div>

      <div class="row">
        <label for="barcodeInput">اكتب الباركود</label>
        <input id="barcodeInput" type="text" placeholder="مثال: 1234567890" />
        <button id="searchBtn" class="primary">عرض المنتج</button>
      </div>
      <div class="scanner-shell hidden" id="scannerShell">
        <div class="scanner-toolbar">
          <button id="toggleTorchBtn" class="toolbar-btn toolbar-torch hidden" type="button">إضاءة</button>
          <button id="stopScannerOverlayBtn" class="toolbar-btn toolbar-stop" type="button">إيقاف الماسح</button>
        </div>
        <div class="scanner-viewport">
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
      </div>
      <div id="status" class="status">جاهز.</div>
    </section>

    <section class="card">
      <h2>تفاصيل المنتج</h2>
      <div id="resultWrap" class="result-wrap">لا توجد نتيجة بعد.</div>
    </section>
    </main>
  </div>
`;

const $ = (id) => document.getElementById(id);

const state = {
  codeReader: null,
  scannerRunning: false,
  scannerBusy: false,
  fastMode: false,
  selectedEngineId: 'zxingBrowser',
  activeEngineId: null,
  lastScan: '',
  lastScanAt: 0,
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

function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`.trim();
}

function updateEngineUi() {
  const sel = $('engineSelect');
  if (sel) sel.value = state.selectedEngineId;
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

function formatSourceDateClient(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.length > 20 ? s.slice(0, 20) : s;
}

function sortKeyForSourceDate(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function renderProduct(data) {
  const sources = Array.isArray(data.sources) ? data.sources.slice() : [];
  if (!sources.length) {
    $('resultWrap').innerHTML = `<div class="muted">لا توجد أسعار لهذا الباركود: ${data.barcode || '-'}</div>`;
    return;
  }

  const cheapest = sources.reduce(
    (best, s) => (!best || Number(s.price) < Number(best.price) ? s : best),
    null,
  );

  const bySource = new Map();
  for (const s of sources) {
    const key = s.source || '-';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(s);
  }

  const blocks = [...bySource.entries()].map(([sourceName, rows]) => {
    rows.sort((a, b) => {
      const ka = sortKeyForSourceDate(a.source_date);
      const kb = sortKeyForSourceDate(b.source_date);
      if (ka !== kb) return kb.localeCompare(ka);
      return Number(b.price || 0) - Number(a.price || 0);
    });
    return { sourceName, rows };
  });

  blocks.sort(
    (a, b) => Math.min(...a.rows.map((r) => Number(r.price || 0))) - Math.min(...b.rows.map((r) => Number(r.price || 0))),
  );

  const html = `
    <div class="product-head">
      <div><b>${data.name || 'بدون اسم'}</b><div class="muted">الباركود: ${data.barcode || '-'}</div></div>
      <div class="price-badge">الأرخص: ${Number(cheapest.price || 0).toFixed(2)}</div>
    </div>
    ${blocks
      .map(({ sourceName, rows }) => {
        const rowsHtml = rows
          .map((s) => {
            const fields = s.fields || {};
            const details = Object.keys(fields).length
              ? Object.entries(fields).map(([k, v]) => `<span class="field-pill">${k}: ${String(v)}</span>`).join('')
              : '<span class="muted">لا توجد تفاصيل إضافية</span>';
            const dateLabel = s.source_date
              ? formatSourceDateClient(s.source_date)
              : 'بدون تاريخ';
            return `<div class="source-price-block">
              <div class="source-price-line"><span class="source-date-tag">${dateLabel}</span><span class="source-price-val">${Number(s.price || 0).toFixed(2)}</span></div>
              <div class="field-row">${details}</div>
            </div>`;
          })
          .join('');
        return `<div class="source-card">
          <div class="source-group-title">${sourceName}</div>
          ${rowsHtml}
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

/** كاميرا خلفية رئيسية واحدة (بدون اختيار من المستخدم). */
async function resolvePrimaryBackDeviceId() {
  try {
    const devices = await BrowserMultiFormatReader.listVideoInputDevices();
    const cameras = devices.map((d) => ({ id: d.deviceId, label: d.label || '' }));
    return pickBestBackCamera(cameras);
  } catch (_) {
    return null;
  }
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

  const scanBox = scanBoxForViewport();
  $('scannerShell').style.setProperty('--scan-box-w', `${scanBox.width}px`);
  $('scannerShell').style.setProperty('--scan-box-h', `${scanBox.height}px`);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 400;
  const vh = typeof window !== 'undefined' ? Math.max(window.innerHeight, 320) : 700;

  const config = {
    fps: state.fastMode ? 20 : isIOS ? 12 : 16,
    qrbox: scanBox,
    disableFlip: true,
    aspectRatio: vw / vh,
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
  } finally {
    state.scannerBusy = false;
  }
}

async function startScanner(mode = 'normal') {
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
    const deviceId = await resolvePrimaryBackDeviceId();

    const box = scanBoxForViewport();
    $('scannerShell').style.setProperty('--scan-box-w', `${box.width}px`);
    $('scannerShell').style.setProperty('--scan-box-h', `${box.height}px`);

    await startSelectedEngine(deviceId);
    state.scannerRunning = true;
    setTorchUi();
    await applyIosFocusStabilityHints();
    setStatus('الماسح يعمل.', 'ok');
  } catch (e) {
    await stopActiveEngine();
    state.scannerRunning = false;
    $('scannerShell').classList.add('hidden');
    setScanButtonsState(false, false);
    setStatus('تعذر تشغيل الماسح.', 'error');
  } finally {
    state.scannerBusy = false;
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

$('stopScannerOverlayBtn').addEventListener('click', async () => {
  await stopScanner();
});

$('engineSelect').addEventListener('change', async () => {
  await setEngine($('engineSelect').value);
});

document.addEventListener('visibilitychange', async () => {
  if (document.hidden && state.scannerRunning) {
    await stopScanner();
  }
});

updateEngineUi();
resetScanRegionToVideo();
