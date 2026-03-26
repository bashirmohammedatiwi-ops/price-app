import './style.css';
import { Html5Qrcode } from 'html5-qrcode';

const DEFAULT_URL =
  import.meta.env.VITE_BACKEND_URL ||
  (typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000');
const URL_KEY = 'price_client_backend_url';
const RECENT_KEY = 'price_client_recent_barcodes';
const SCAN_REGION_ID = 'scanRegion';

const app = document.querySelector('#app');
app.innerHTML = `
  <main class="container">
    <header class="header">
      <h1>سعر - تطبيق ويب</h1>
      <p>بحث سريع بالباركود (كاميرا + إدخال يدوي)</p>
    </header>

    <section class="card">
      <div class="row">
        <label for="backendUrl">رابط السيرفر</label>
        <input id="backendUrl" type="text" />
        <button id="saveBackendBtn">حفظ</button>
      </div>
      <div class="row">
        <label for="barcodeInput">الباركود</label>
        <input id="barcodeInput" type="text" placeholder="مثال: 1234567890" />
        <button id="searchBtn" class="primary">عرض المنتج</button>
      </div>
      <div class="row"><button id="toggleScannerBtn">تشغيل الماسح بالكاميرا</button></div>
      <div id="scanRegion" class="scan-region hidden"></div>
      <div id="status" class="status">جاهز.</div>
    </section>

    <section class="card">
      <h2>آخر عمليات البحث</h2>
      <div id="recentWrap" class="recent-wrap"></div>
    </section>

    <section class="card">
      <h2>نتيجة المنتج</h2>
      <div id="resultWrap" class="result-wrap">لا توجد نتيجة بعد.</div>
    </section>
  </main>
`;

const $ = (id) => document.getElementById(id);
const state = { scanner: null, scannerRunning: false };

function normalizeUrl(url) {
  let u = String(url || '').trim();
  if (!u) u = DEFAULT_URL;
  if (u.startsWith('/')) return u.endsWith('/') ? u.slice(0, -1) : u;
  if (!u.startsWith('http://') && !u.startsWith('https://')) u = `http://${u}`;
  return u.endsWith('/') ? u.slice(0, -1) : u;
}
function getBackendUrl() {
  return normalizeUrl(localStorage.getItem(URL_KEY) || DEFAULT_URL);
}
function setBackendUrl(url) {
  localStorage.setItem(URL_KEY, normalizeUrl(url));
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
  await state.scanner.stop();
  state.scannerRunning = false;
  $('scanRegion').classList.add('hidden');
  $('toggleScannerBtn').textContent = 'تشغيل الماسح بالكاميرا';
}
async function startScanner() {
  if (state.scannerRunning) return;
  state.scanner = state.scanner || new Html5Qrcode(SCAN_REGION_ID);
  $('scanRegion').classList.remove('hidden');
  $('toggleScannerBtn').textContent = 'إيقاف الماسح';
  await state.scanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 260, height: 160 } },
    async (decodedText) => {
      await stopScanner();
      $('barcodeInput').value = decodedText;
      await searchProduct(decodedText);
    },
    () => {}
  );
  state.scannerRunning = true;
  setStatus('الماسح يعمل. وجّه الكاميرا إلى الباركود.');
}

$('backendUrl').value = getBackendUrl();
$('saveBackendBtn').addEventListener('click', () => {
  setBackendUrl($('backendUrl').value);
  $('backendUrl').value = getBackendUrl();
  setStatus('تم حفظ رابط السيرفر.', 'ok');
});
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
