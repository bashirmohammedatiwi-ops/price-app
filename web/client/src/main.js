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
const state = { scanner: null, scannerRunning: false, lastScan: '', lastScanAt: 0, focusRefreshTimer: null };

function pickBestBackCamera(cameras) {
  if (!Array.isArray(cameras) || !cameras.length) return null;
  const normalized = cameras.map((c) => ({
    ...c,
    l: String(c.label || '').toLowerCase(),
  }));

  // iPhone often exposes ultra-wide first; prefer standard/tele for better focus.
  const score = (cam) => {
    let s = 0;
    if (cam.l.includes('back') || cam.l.includes('rear') || cam.l.includes('environment')) s += 40;
    if (cam.l.includes('tele') || cam.l.includes('photo')) s += 25;
    if (cam.l.includes('wide') && !cam.l.includes('ultra')) s += 10;
    if (cam.l.includes('ultra') || cam.l.includes('0.5')) s -= 30;
    if (cam.l.includes('front') || cam.l.includes('user')) s -= 50;
    return s;
  };

  normalized.sort((a, b) => score(b) - score(a));
  return normalized[0]?.id || null;
}

async function resolveCameraTarget() {
  try {
    const cameras = await Html5Qrcode.getCameras();
    const best = pickBestBackCamera(cameras);
    if (best) return { deviceId: { exact: best } };
  } catch (_) {
    // Fallback below when camera labels are unavailable.
  }
  return { facingMode: 'environment' };
}

async function tuneCameraForBarcode() {
  if (!state.scanner) return;
  try {
    const capabilities = state.scanner.getRunningTrackCapabilities?.() || {};
    const constraints = {};

    // Prefer continuous autofocus when available.
    if (capabilities.focusMode && Array.isArray(capabilities.focusMode)) {
      if (capabilities.focusMode.includes('continuous')) constraints.focusMode = 'continuous';
      else if (capabilities.focusMode.includes('auto')) constraints.focusMode = 'auto';
    }

    // A slight zoom-in usually improves 1D barcode readability.
    if (typeof capabilities.zoom === 'object' && capabilities.zoom) {
      const min = Number(capabilities.zoom.min ?? 1);
      const max = Number(capabilities.zoom.max ?? 1);
      const targetZoom = isIOS ? 2.0 : 1.5;
      if (max > min) constraints.zoom = Math.min(max, Math.max(min, targetZoom));
    }

    if (Object.keys(constraints).length) {
      await state.scanner.applyVideoConstraints(constraints);
    }
  } catch (_) {
    // Camera tuning is best-effort; keep scanner running on unsupported devices.
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
  if (!state.scanner || !state.scannerRunning) return;
  if (state.focusRefreshTimer) {
    clearInterval(state.focusRefreshTimer);
    state.focusRefreshTimer = null;
  }
  await state.scanner.stop();
  state.scannerRunning = false;
  $('scannerShell').classList.add('hidden');
  $('toggleScannerBtn').textContent = 'تشغيل الماسح بالكاميرا';
  $('toggleScannerBtn').classList.remove('active');
}
async function startScanner() {
  if (state.scannerRunning) return;
  state.scanner =
    state.scanner ||
    new Html5Qrcode(SCAN_REGION_ID, {
      formatsToSupport: SCAN_FORMATS,
      verbose: false,
    });
  $('scannerShell').classList.remove('hidden');
  $('toggleScannerBtn').textContent = 'إيقاف الماسح';
  $('toggleScannerBtn').classList.add('active');
  const scannerConfig = isIOS
    ? {
        // iPhone Safari performs better with moderate fps and 4:3 camera ratio.
        fps: 12,
        qrbox: { width: 300, height: 170 },
        aspectRatio: 1.3333333,
        rememberLastUsedCamera: true,
        disableFlip: true,
        videoConstraints: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 },
        },
        // BarcodeDetector path can be unstable on iOS, keep it off there.
        experimentalFeatures: { useBarCodeDetectorIfSupported: false },
      }
    : {
        fps: 20,
        qrbox: { width: 340, height: 180 },
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
  const cameraTarget = await resolveCameraTarget();
  await state.scanner.start(
    cameraTarget,
    scannerConfig,
    async (decodedText) => {
      const now = Date.now();
      if (decodedText === state.lastScan && now - state.lastScanAt < 1200) return;
      state.lastScan = decodedText;
      state.lastScanAt = now;
      await stopScanner();
      $('barcodeInput').value = decodedText;
      await searchProduct(decodedText);
    },
    () => {}
  );
  state.scannerRunning = true;
  await tuneCameraForBarcode();
  // iOS focus sometimes drifts; periodic refresh helps keep it sharp.
  if (isIOS) {
    state.focusRefreshTimer = setInterval(() => {
      tuneCameraForBarcode().catch(() => {});
    }, 2500);
  }
  setStatus('الماسح يعمل الآن... ثبّت الباركود داخل الإطار.', 'ok');
}

$('searchBtn').addEventListener('click', () => searchProduct($('barcodeInput').value));
$('barcodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchProduct($('barcodeInput').value);
});
$('toggleScannerBtn').addEventListener('click', async () => {
  try {
    if (state.scannerRunning) await stopScanner();
    else await startScanner();
  } catch (e) {
    setStatus(`تعذر تشغيل الكاميرا: ${e.message}`, 'error');
  }
});

renderRecent();
