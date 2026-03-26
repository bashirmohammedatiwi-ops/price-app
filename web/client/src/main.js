import './style.css';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const DEFAULT_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000');
const RECENT_KEY = 'price_client_recent_barcodes';
const SCAN_REGION_ID = 'scanRegion';
const SCAN_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
];
const IOS_PRIMARY_BOX = { width: 300, height: 170 };
const IOS_FALLBACK_BOX = { width: 280, height: 170 };
const DEFAULT_PRIMARY_BOX = { width: 340, height: 180 };
const DEFAULT_FALLBACK_BOX = { width: 300, height: 170 };
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
        <div id="scanRegion" class="scan-region"></div>
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
  scanner: null,
  scannerRunning: false,
  scannerBusy: false,
  switchingCamera: false,
  lastScan: '',
  lastScanAt: 0,
  selectedCameraId: null,
  cameras: [],
  torchOn: false,
};

function pickBestBackCamera(cameras) {
  if (!Array.isArray(cameras) || !cameras.length) return null;
  const normalized = cameras.map((c) => ({
    ...c,
    l: String(c.label || '').toLowerCase(),
  }));

  // iPhone: avoid tele lenses for near barcode focus; prefer wide/back camera.
  const score = (cam) => {
    let s = 0;
    if (cam.l.includes('back') || cam.l.includes('rear') || cam.l.includes('environment')) s += 40;
    if (isIOS) {
      if (cam.l.includes('tele') || cam.l.includes('photo') || cam.l.includes('2x') || cam.l.includes('3x')) s -= 60;
      // For close barcode distance on iPhone 13/12 class devices, ultra-wide often focuses better.
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

async function resolveCameraTarget(cameraIdOverride = null) {
  try {
    const cameras = await Html5Qrcode.getCameras();
    state.cameras = cameras;
    $('switchCameraBtn').classList.toggle('hidden', cameras.length <= 1);

    if (cameraIdOverride) {
      const exists = cameras.some((c) => c.id === cameraIdOverride);
      if (exists) {
        state.selectedCameraId = cameraIdOverride;
        updateCameraLabel(cameraIdOverride);
        return { deviceId: { exact: cameraIdOverride } };
      }
    }

    if (state.selectedCameraId) {
      const exists = cameras.some((c) => c.id === state.selectedCameraId);
      if (exists) {
        updateCameraLabel(state.selectedCameraId);
        return { deviceId: { exact: state.selectedCameraId } };
      }
    }

    const best = pickBestBackCamera(cameras);
    if (best) {
      state.selectedCameraId = best;
      updateCameraLabel(best);
      return { deviceId: { exact: best } };
    }
  } catch (_) {
    // Fallback below when camera labels are unavailable.
  }
  return { facingMode: 'environment' };
}

async function switchCamera() {
  if (state.switchingCamera || state.scannerBusy) return;
  state.switchingCamera = true;
  if (!state.cameras.length) {
    try {
      state.cameras = await Html5Qrcode.getCameras();
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
        await state.scanner?.stop();
      } catch (_) {}
      state.scannerRunning = false;
      await startScannerInternal(nextCameraId);
      state.scannerRunning = true;
      state.scannerBusy = false;
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

function buildScannerConfig(mode = 'primary') {
  if (isIOS) {
    if (mode === 'fallback') {
      return {
        fps: 16,
        qrbox: IOS_FALLBACK_BOX,
        aspectRatio: 1.3333333,
        rememberLastUsedCamera: true,
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 960 },
          height: { ideal: 720 },
        },
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
      };
    }
    return {
      fps: 16,
      qrbox: IOS_PRIMARY_BOX,
      aspectRatio: 1.3333333,
      rememberLastUsedCamera: true,
      disableFlip: true,
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 960 },
      },
      experimentalFeatures: { useBarCodeDetectorIfSupported: false },
    };
  }

  if (mode === 'fallback') {
    return {
      fps: 18,
      qrbox: DEFAULT_FALLBACK_BOX,
      aspectRatio: 1.3333333,
      rememberLastUsedCamera: true,
      disableFlip: true,
      videoConstraints: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    };
  }
  return {
    fps: 26,
    qrbox: DEFAULT_PRIMARY_BOX,
    aspectRatio: 1.7777778,
    rememberLastUsedCamera: true,
    disableFlip: true,
    videoConstraints: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  };
}

function ensureScannerInstance() {
  if (state.scanner) return state.scanner;
  state.scanner = new Html5Qrcode(SCAN_REGION_ID, {
    formatsToSupport: SCAN_FORMATS,
    verbose: false,
  });
  return state.scanner;
}

async function startScannerInternal(cameraIdOverride = null) {
  const scanner = ensureScannerInstance();
  const cameraTarget = await resolveCameraTarget(cameraIdOverride);
  const onDecode = async (decodedText) => {
    const now = Date.now();
    if (decodedText === state.lastScan && now - state.lastScanAt < 1200) return;
    state.lastScan = decodedText;
    state.lastScanAt = now;
    await stopScanner();
    $('barcodeInput').value = decodedText;
    await searchProduct(decodedText);
  };

  // Two-step start: primary config then fallback if iPhone fails.
  try {
    const primaryConfig = buildScannerConfig('primary');
    const pb = primaryConfig.qrbox || DEFAULT_PRIMARY_BOX;
    $('scannerShell').style.setProperty('--scan-box-w', `${pb.width}px`);
    $('scannerShell').style.setProperty('--scan-box-h', `${pb.height}px`);
    await scanner.start(cameraTarget, primaryConfig, onDecode, () => {});
  } catch (_) {
    const fallbackConfig = buildScannerConfig('fallback');
    const fb = fallbackConfig.qrbox || DEFAULT_FALLBACK_BOX;
    $('scannerShell').style.setProperty('--scan-box-w', `${fb.width}px`);
    $('scannerShell').style.setProperty('--scan-box-h', `${fb.height}px`);
    await scanner.start({ facingMode: 'environment' }, fallbackConfig, onDecode, () => {});
  }
}

async function tuneCameraForBarcode() {
  // Disabled by request: no focus/zoom tuning at all.
}

async function setTorch(on) {
  if (!state.scannerRunning || !state.scanner) return;
  try {
    const caps = state.scanner.getRunningTrackCapabilities?.() || {};
    if (!caps.torch) return;
    await state.scanner.applyVideoConstraints({ advanced: [{ torch: on }] });
    state.torchOn = on;
    const btn = $('toggleTorchBtn');
    if (btn) btn.textContent = on ? 'إطفاء الإضاءة' : 'تشغيل الإضاءة';
  } catch (_) {
    // Some iOS devices expose torch in caps but still reject toggling.
  }
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
  if (!state.scanner || !state.scannerRunning || state.scannerBusy) return;
  state.scannerBusy = true;
  try {
    await state.scanner.stop();
  } catch (_) {
    // Ignore stop errors on iOS race conditions.
  }
  state.scannerRunning = false;
  $('scannerShell').classList.add('hidden');
  $('toggleScannerBtn').textContent = 'تشغيل الماسح بالكاميرا';
  $('toggleScannerBtn').classList.remove('active');
  $('toggleTorchBtn').classList.add('hidden');
  $('switchCameraBtn').classList.toggle('hidden', state.cameras.length <= 1);
  state.torchOn = false;
  state.scannerBusy = false;
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
    await tuneCameraForBarcode();
    // show torch button only if supported
    try {
      const caps = state.scanner.getRunningTrackCapabilities?.() || {};
      $('toggleTorchBtn').classList.toggle('hidden', !caps.torch);
    } catch {
      $('toggleTorchBtn').classList.add('hidden');
    }
    setStatus('الماسح يعمل بأعلى سرعة قراءة.', 'ok');
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
  // iOS Safari may freeze camera stream in background.
  if (document.hidden && state.scannerRunning) {
    await stopScanner();
  }
});

renderRecent();
