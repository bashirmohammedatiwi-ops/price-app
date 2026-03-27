import './style.css';
import { BrowserMultiFormatReader, BarcodeFormat } from '@zxing/browser';
import { DecodeHintType } from '@zxing/library';

const DEFAULT_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000');
const RECENT_KEY = 'price_client_recent_barcodes';
const SCAN_VIDEO_ID = 'scanVideo';

const IOS_SCAN_BOX = { width: 300, height: 170 };
const DEFAULT_SCAN_BOX = { width: 340, height: 180 };

const isIOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="container">
    <header class="header">
      <div class="app-chip">Price Mobile</div>
      <h1>سعر</h1>
      <p>نسخة مخصصة للهاتف بتجربة مسح فائقة السرعة</p>
    </header>

    <section class="card scanner-card">
      <div class="quick-actions">
        <button id="toggleScannerBtn" class="scan-btn">تشغيل الماسح بالكاميرا</button>
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
        <div id="scanRegion" class="scan-region">
          <video id="${SCAN_VIDEO_ID}" playsinline muted></video>
        </div>
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
  scanControls: null,
  scannerRunning: false,
  scannerBusy: false,
  switchingCamera: false,
  lastScan: '',
  lastScanAt: 0,
  selectedCameraId: null,
  cameras: [],
  torchOn: false,
};

const POSSIBLE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
];

function pickBestBackCamera(cameras) {
  if (!Array.isArray(cameras) || !cameras.length) return null;
  const normalized = cameras.map((c) => ({
    ...c,
    l: String(c.label || '').toLowerCase(),
  }));

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

async function refreshCameraList() {
  const devices = await BrowserMultiFormatReader.listVideoInputDevices();
  state.cameras = devices.map((d) => ({
    id: d.deviceId,
    label: d.label || '',
  }));
  $('switchCameraBtn').classList.toggle('hidden', state.cameras.length <= 1);
}

/** @returns {Promise<string|null>} deviceId أو null لاستخدام الكاميرا الخلفية الافتراضية */
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

function buildVideoConstraints(deviceId, tier) {
  const wide = isIOS
    ? { width: { ideal: 1280 }, height: { ideal: 720 } }
    : { width: { ideal: 1920 }, height: { ideal: 1080 } };
  const medium = isIOS
    ? { width: { ideal: 960 }, height: { ideal: 540 } }
    : { width: { ideal: 1280 }, height: { ideal: 720 } };

  const video =
    tier === 'primary'
      ? deviceId
        ? { ...wide, deviceId: { exact: deviceId } }
        : { ...wide, facingMode: { ideal: 'environment' } }
      : tier === 'fallback'
        ? deviceId
          ? { ...medium, deviceId: { exact: deviceId } }
          : { ...medium, facingMode: { ideal: 'environment' } }
        : deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: 'environment' };

  return { video };
}

function ensureReader() {
  if (state.codeReader) return state.codeReader;
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, POSSIBLE_FORMATS);
  if (isIOS) {
    hints.set(DecodeHintType.TRY_HARDER, true);
  }
  const scanOptions = {
    delayBetweenScanAttempts: isIOS ? 90 : 60,
    delayBetweenScanSuccess: 120,
    tryPlayVideoTimeout: 8000,
  };
  state.codeReader = new BrowserMultiFormatReader(hints, scanOptions);
  return state.codeReader;
}

function resetScannerUi() {
  $('scannerShell').classList.add('hidden');
  $('toggleScannerBtn').textContent = 'تشغيل الماسح بالكاميرا';
  $('toggleScannerBtn').classList.remove('active');
  $('toggleTorchBtn').classList.add('hidden');
  $('switchCameraBtn').classList.toggle('hidden', state.cameras.length <= 1);
  state.torchOn = false;
}

function createDecodeCallback() {
  return (result, _err, controls) => {
    if (!result) return;
    void handleDecodeResult(result, controls);
  };
}

async function handleDecodeResult(result, controls) {
  const text = result.getText()?.trim();
  if (!text) return;

  const now = Date.now();
  if (text === state.lastScan && now - state.lastScanAt < 1200) return;

  state.lastScan = text;
  state.lastScanAt = now;

  state.scannerBusy = true;
  try {
    try {
      controls.stop();
    } catch (_) {}
    state.scanControls = null;
    state.scannerRunning = false;
    resetScannerUi();

    $('barcodeInput').value = text;
    await searchProduct(text);
  } finally {
    state.scannerBusy = false;
  }
}

async function startScannerInternal(cameraIdOverride = null) {
  const reader = ensureReader();
  const videoEl = $(SCAN_VIDEO_ID);
  const deviceId = await resolveSelectedDeviceId(cameraIdOverride);

  const box = isIOS ? IOS_SCAN_BOX : DEFAULT_SCAN_BOX;
  $('scannerShell').style.setProperty('--scan-box-w', `${box.width}px`);
  $('scannerShell').style.setProperty('--scan-box-h', `${box.height}px`);

  const callback = createDecodeCallback();
  const tiers = ['primary', 'fallback', 'minimal'];

  let lastErr;
  for (const tier of tiers) {
    try {
      const constraints = buildVideoConstraints(deviceId, tier);
      state.scanControls = await reader.decodeFromConstraints(constraints, videoEl, callback);
      return;
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr ?? new Error('تعذر فتح الكاميرا');
}

async function switchCamera() {
  if (state.switchingCamera || state.scannerBusy) return;
  state.switchingCamera = true;
  if (!state.cameras.length) {
    try {
      await refreshCameraList();
    } catch {
      state.switchingCamera = false;
      return;
    }
  }
  if (state.cameras.length <= 1) {
    state.switchingCamera = false;
    return;
  }

  const currentIndex = state.cameras.findIndex((c) => c.id === state.selectedCameraId);
  const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % state.cameras.length : 0;
  const nextCameraId = state.cameras[nextIndex].id;
  state.selectedCameraId = nextCameraId;
  updateCameraLabel(nextCameraId);

  try {
    if (state.scannerRunning) {
      state.scannerBusy = true;
      try {
        state.scanControls?.stop();
      } catch (_) {}
      state.scanControls = null;
      state.scannerRunning = false;
      await startScannerInternal(nextCameraId);
      state.scannerRunning = true;
      state.scannerBusy = false;
      setTorchUi();
      setStatus('تم التبديل إلى الكاميرا التالية.', 'ok');
    } else {
      setStatus('تم اختيار كاميرا جديدة. شغّل الماسح للبدء.', 'ok');
    }
  } catch (e) {
    state.scannerBusy = false;
    setStatus(`تعذر التبديل: ${e?.message || 'Unknown error'}`, 'error');
  } finally {
    state.switchingCamera = false;
  }
}

async function setTorch(on) {
  if (!state.scannerRunning || !state.scanControls?.switchTorch) return;
  try {
    await state.scanControls.switchTorch(on);
    state.torchOn = on;
    const btn = $('toggleTorchBtn');
    if (btn) btn.textContent = on ? 'إطفاء الإضاءة' : 'تشغيل الإضاءة';
  } catch (_) {}
}

function setTorchUi() {
  const hidden = typeof state.scanControls?.switchTorch !== 'function';
  $('toggleTorchBtn').classList.toggle('hidden', hidden);
}

function getBackendUrl() {
  return DEFAULT_URL.endsWith('/') ? DEFAULT_URL.slice(0, -1) : DEFAULT_URL;
}
function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`.trim();
}
function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
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
async function stopScanner() {
  if ((!state.scanControls && !state.scannerRunning) || state.scannerBusy) return;
  state.scannerBusy = true;
  try {
    try {
      state.scanControls?.stop();
    } catch (_) {}
    state.scanControls = null;
    state.scannerRunning = false;
    resetScannerUi();
  } finally {
    state.scannerBusy = false;
  }
}
async function startScanner() {
  if (state.scannerRunning || state.scannerBusy) return;
  state.scannerBusy = true;
  $('scannerShell').classList.remove('hidden');
  $('toggleScannerBtn').textContent = 'إيقاف الماسح';
  $('toggleScannerBtn').classList.add('active');
  try {
    await startScannerInternal();
    state.scannerRunning = true;
    setTorchUi();
    setStatus('الماسح يعمل (ZXing).', 'ok');
  } catch (e) {
    $('scannerShell').classList.add('hidden');
    $('toggleScannerBtn').textContent = 'تشغيل الماسح بالكاميرا';
    $('toggleScannerBtn').classList.remove('active');
    setStatus(`تعذر تشغيل الكاميرا: ${e?.message || 'Unknown error'}`, 'error');
  } finally {
    state.scannerBusy = false;
  }
}

$('searchBtn').addEventListener('click', () => searchProduct($('barcodeInput').value));
$('barcodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchProduct($('barcodeInput').value);
});
$('toggleScannerBtn').addEventListener('click', async () => {
  if (state.scannerRunning) await stopScanner();
  else await startScanner();
});

$('toggleTorchBtn').addEventListener('click', async () => {
  await setTorch(!state.torchOn);
});

$('switchCameraBtn').addEventListener('click', async () => {
  await switchCamera();
});

document.addEventListener('visibilitychange', async () => {
  if (document.hidden && state.scannerRunning) {
    await stopScanner();
  }
});

renderRecent();
