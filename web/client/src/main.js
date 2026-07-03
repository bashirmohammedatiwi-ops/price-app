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

app.innerHTML = `
  <div class="client-shell">
    <header class="client-company-header">
      <h1 class="client-company-name">شركه ديما الحياه</h1>
    </header>

    <main class="container">
    <section class="card scanner-card">
      <button id="toggleScannerBtn" class="scan-btn scan-btn-main" type="button">مسح الباركود</button>

      <div class="row">
        <label for="barcodeInput">اكتب الباركود</label>
        <input id="barcodeInput" type="text" placeholder="مثال: 1234567890" inputmode="numeric" autocomplete="off" />
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

    <section class="card result-card">
      <div class="result-card-head">
        <h2>بيانات المنتج</h2>
        <p class="result-card-sub">الأسعار من POS — التفاصيل والمشتريات من Edari</p>
      </div>
      <div id="resultWrap" class="result-wrap">
        <div class="empty-state">
          <div class="empty-state-icon" aria-hidden="true">▦</div>
          <p class="empty-state-title">لم يُمسح منتج بعد</p>
          <p class="empty-state-text">استخدم الماسح أو اكتب الباركود لعرض السعر وحركة الشراء</p>
        </div>
      </div>
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
  /** يثبّت الكاميرا الخلفية بين جلسات فتح/إغلاق الماسح (تجنّب التحويل للأمامية). */
  cachedPrimaryBackDeviceId: null,

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

function isProbablyFrontCameraLabel(labelRaw) {
  const l = String(labelRaw || '').toLowerCase();
  if (!l.trim()) return false;
  return (
    /\bfront\b|facetime|selfie|user-facing|user facing|\buser\b.*camera|camera.*\buser\b|wide angle front|الأمامية|الامامية|كاميرا أمامية|كاميرا امامية/.test(
      l,
    ) || (l.includes('front') && !l.includes('back'))
  );
}

function pickBestBackCamera(cameras) {
  if (!Array.isArray(cameras) || !cameras.length) return null;
  const normalized = cameras.map((c) => ({ ...c, l: String(c.label || '').toLowerCase() }));

  const withLabel = normalized.filter((c) => c.l.trim());
  const noFront = withLabel.length ? normalized.filter((c) => !isProbablyFrontCameraLabel(c.l)) : normalized;
  const pool = noFront.length ? noFront : normalized;

  const score = (cam) => {
    let s = 0;
    const l = cam.l;
    if (l.includes('back') || l.includes('rear') || l.includes('environment')) s += 40;
    if (isIOS) {
      if (l.includes('tele') || l.includes('photo') || l.includes('2x') || l.includes('3x')) s -= 60;
      if (l.includes('ultra') || l.includes('0.5') || l.includes('macro')) s += 35;
      if (l.includes('wide') || l.includes('1x') || l.includes('back camera')) s += 20;
    } else {
      if (l.includes('tele') || l.includes('photo')) s += 10;
      if (l.includes('wide') && !l.includes('ultra')) s += 8;
      if (l.includes('ultra') || l.includes('0.5')) s -= 20;
    }
    if (l.includes('front') && !l.includes('back')) s -= 80;
    if (l.includes('user') && (l.includes('camera') || l.includes('facing'))) s -= 80;
    return s;
  };

  const sorted = [...pool].sort((a, b) => {
    const d = score(b) - score(a);
    if (d !== 0) return d;
    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0]?.id || null;
}

function rememberPrimaryCameraFromScannerVideo() {
  try {
    const v = document.querySelector(`#${SCAN_REGION_ID} video`);
    const stream = v?.srcObject;
    const track = stream?.getVideoTracks?.()?.[0];
    const id = track?.getSettings?.()?.deviceId;
    if (id) state.cachedPrimaryBackDeviceId = id;
  } catch (_) {}
}

function setStatus(msg, type = '') {
  const el = $('status');
  el.textContent = msg;
  el.className = `status ${type}`.trim();
}

function updateEngineUi() {
  /* مكتبة المسح ثابتة (zxingBrowser) — لا واجهة اختيار */
}

function setScanButtonsState(running) {
  const btn = $('toggleScannerBtn');
  if (!btn) return;

  if (!running) {
    btn.textContent = 'مسح الباركود';
    btn.classList.remove('active');
    return;
  }

  btn.textContent = 'إيقاف المسح';
  btn.classList.add('active');
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

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function fmtQty(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtDateDisplay(raw) {
  if (raw == null || String(raw).trim() === '') return '—';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s.length > 10 ? s.slice(0, 10) : s;
}

function sortKeyForDate(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s;
}

function summarizeMovements(movements) {
  const rows = movements.slice().sort((a, b) => sortKeyForDate(b.date).localeCompare(sortKeyForDate(a.date)));
  let totalQty = 0;
  let totalValue = 0;
  const suppliers = new Set();

  for (const m of rows) {
    const qty = Number(m.quantity || 0);
    const total = Number(m.total_price || 0);
    const unit = Number(m.unit_price || 0);
    totalQty += qty;
    totalValue += total > 0 ? total : qty * unit;
    if (m.supplier) suppliers.add(String(m.supplier).trim());
  }

  const avgPrice = totalQty > 0 ? totalValue / totalQty : null;
  const latest = rows[0] || null;

  return {
    rows,
    count: rows.length,
    totalQty,
    totalValue,
    avgPrice,
    latest,
    supplierCount: suppliers.size,
  };
}

function renderMovementRow(m, index) {
  const qty = Number(m.quantity || 0);
  const unit = Number(m.unit_price || 0);
  const total = Number(m.total_price || 0) || qty * unit;
  const isLatest = index === 0;
  const isAggregate = String(m.supplier || '').includes('بدون تفاصيل فواتير');

  return `
    <article class="movement-item${isLatest ? ' movement-item-latest' : ''}${isAggregate ? ' movement-item-aggregate' : ''}">
      <div class="movement-item-top">
        <time class="movement-date" datetime="${esc(m.date || '')}">${esc(fmtDateDisplay(m.date))}</time>
        ${isLatest ? '<span class="movement-badge">آخر شراء</span>' : ''}
        ${isAggregate ? '<span class="movement-badge movement-badge-aggregate">إجمالي مشتريات</span>' : ''}
      </div>
      <div class="movement-supplier">${esc(m.supplier || '—')}</div>
      <div class="movement-meta">
        <span class="movement-meta-chip">فاتورة ${esc(m.invoice || '—')}</span>
      </div>
      <div class="movement-numbers">
        <div class="movement-num">
          <span class="movement-num-label">الكمية</span>
          <strong>${esc(fmtQty(qty))}</strong>
        </div>
        <div class="movement-num">
          <span class="movement-num-label">السعر</span>
          <strong>${esc(fmtMoney(unit))}</strong>
        </div>
        <div class="movement-num movement-num-total">
          <span class="movement-num-label">الإجمالي</span>
          <strong>${esc(fmtMoney(total))}</strong>
        </div>
      </div>
    </article>
  `;
}

function renderLegacySources(sources) {
  if (!sources.length) return '';

  const bySource = new Map();
  for (const s of sources) {
    const key = s.source || '-';
    if (!bySource.has(key)) bySource.set(key, []);
    bySource.get(key).push(s);
  }

  const blocks = [...bySource.entries()]
    .map(([sourceName, rows]) => {
      rows.sort((a, b) => sortKeyForDate(b.source_date).localeCompare(sortKeyForDate(a.source_date)));
      const rowsHtml = rows
        .map(
          (s) => `
          <div class="legacy-row">
            <span class="legacy-date">${esc(fmtDateDisplay(s.source_date) || 'بدون تاريخ')}</span>
            <span class="legacy-price">${esc(fmtMoney(s.price))}</span>
          </div>`,
        )
        .join('');
      return `
        <div class="legacy-group">
          <div class="legacy-group-title">${esc(sourceName)}</div>
          ${rowsHtml}
        </div>`;
    })
    .join('');

  return `
    <details class="legacy-block">
      <summary>أسعار إضافية (${sources.length})</summary>
      <div class="legacy-inner">${blocks}</div>
    </details>`;
}

function fmtPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n % 1 === 0 ? `${n}٪` : `${n.toFixed(1)}٪`;
}

function renderProduct(data) {
  const sources = Array.isArray(data.sources) ? data.sources.slice() : [];
  const movements = Array.isArray(data.movements) ? data.movements.slice() : [];
  const originalPrice =
    data.original_price != null && Number.isFinite(Number(data.original_price))
      ? Number(data.original_price)
      : null;
  const finalPrice =
    data.final_price != null && Number.isFinite(Number(data.final_price))
      ? Number(data.final_price)
      : data.consumer_price != null && Number.isFinite(Number(data.consumer_price))
        ? Number(data.consumer_price)
        : null;
  const discountPercent =
    data.discount_percent != null && Number.isFinite(Number(data.discount_percent))
      ? Number(data.discount_percent)
      : null;
  const hasOffer = Boolean(data.has_offer) || (discountPercent != null && discountPercent > 0);
  const stockBalance =
    data.stock_balance != null && Number.isFinite(Number(data.stock_balance))
      ? Number(data.stock_balance)
      : null;
  const posStock =
    data.pos_stock != null && Number.isFinite(Number(data.pos_stock))
      ? Number(data.pos_stock)
      : null;
  const summary = summarizeMovements(movements);

  if (!sources.length && !summary.count && finalPrice == null && stockBalance == null && originalPrice == null) {
    $('resultWrap').innerHTML = `
      <div class="empty-state empty-state-warn">
        <div class="empty-state-icon" aria-hidden="true">?</div>
        <p class="empty-state-title">لا توجد بيانات</p>
        <p class="empty-state-text">الباركود <strong dir="ltr">${esc(data.barcode || '-')}</strong> غير مسجّل — نفّذ المزامنة من تطبيق الإدارة</p>
      </div>`;
    return;
  }

  const statsHtml = summary.count
    ? `
      <div class="stats-grid">
        <div class="stat-box">
          <span class="stat-label">حركات الشراء</span>
          <strong class="stat-value">${esc(fmtQty(summary.count))}</strong>
        </div>
        <div class="stat-box">
          <span class="stat-label">إجمالي الكمية</span>
          <strong class="stat-value">${esc(fmtQty(summary.totalQty))}</strong>
        </div>
        <div class="stat-box">
          <span class="stat-label">متوسط السعر</span>
          <strong class="stat-value">${summary.avgPrice != null ? esc(fmtMoney(summary.avgPrice)) : '—'}</strong>
        </div>
        <div class="stat-box">
          <span class="stat-label">الموردون</span>
          <strong class="stat-value">${esc(fmtQty(summary.supplierCount))}</strong>
        </div>
      </div>`
    : '';

  const priceHtml =
    originalPrice != null || finalPrice != null || stockBalance != null || posStock != null
      ? `
      <section class="price-hero-row price-hero-row-triple" aria-label="الأسعار من POS">
        <div class="price-hero-cell${originalPrice == null ? ' price-hero-cell-muted' : ''}">
          <div class="price-hero-label">السعر الأصلي</div>
          <div class="price-hero-value price-hero-value-original${originalPrice == null ? ' price-hero-value-muted' : ''}">${originalPrice != null ? esc(fmtMoney(originalPrice)) : '—'}</div>
        </div>
        <div class="price-hero-cell price-hero-cell-discount${!hasOffer ? ' price-hero-cell-muted' : ''}">
          <div class="price-hero-label">نسبة التخفيض</div>
          <div class="price-hero-value price-hero-value-discount${!hasOffer ? ' price-hero-value-muted' : ''}">${hasOffer ? esc(fmtPercent(discountPercent)) : '—'}</div>
          ${data.offer_name && hasOffer ? `<div class="price-offer-name">${esc(data.offer_name)}</div>` : ''}
        </div>
        <div class="price-hero-cell price-hero-cell-final${finalPrice == null ? ' price-hero-cell-muted' : ''}">
          <div class="price-hero-label">السعر بعد التخفيض</div>
          <div class="price-hero-value price-hero-value-final${finalPrice == null ? ' price-hero-value-muted' : ''}">${finalPrice != null ? esc(fmtMoney(finalPrice)) : '—'}</div>
        </div>
      </section>
      <div class="price-hero-row price-hero-row-stock">
        <div class="price-hero-cell price-hero-cell-stock${posStock == null ? ' price-hero-cell-muted' : ''}">
          <div class="price-hero-label">مخزون POS</div>
          <div class="price-hero-value price-hero-value-stock${posStock == null ? ' price-hero-value-muted' : ''}${posStock != null && posStock <= 0 ? ' price-hero-value-low' : ''}">${posStock != null ? esc(fmtQty(posStock)) : '—'}</div>
        </div>
        <div class="price-hero-cell price-hero-cell-stock${stockBalance == null ? ' price-hero-cell-muted' : ''}">
          <div class="price-hero-label">رصيد Edari</div>
          <div class="price-hero-value price-hero-value-stock${stockBalance == null ? ' price-hero-value-muted' : ''}${stockBalance != null && stockBalance <= 0 ? ' price-hero-value-low' : ''}">${stockBalance != null ? esc(fmtQty(stockBalance)) : '—'}</div>
        </div>
      </div>
      ${
        summary.latest
          ? `<div class="price-hero-note">آخر شراء: ${esc(fmtDateDisplay(summary.latest.date))} · ${esc(summary.latest.supplier || '—')}</div>`
          : ''
      }`
      : `<div class="price-hero price-hero-missing">
          <div class="price-hero-label">الأسعار (POS)</div>
          <div class="price-hero-value price-hero-value-muted">غير متوفرة — شغّل مزامنة POS</div>
        </div>`;

  const movementsHtml = summary.count
    ? `
      <section class="movements-section">
        <header class="section-head">
          <div>
            <h3 class="section-title">حركة المشتريات</h3>
            <p class="section-sub">${esc(fmtQty(summary.count))} حركة · إجمالي ${esc(fmtMoney(summary.totalValue))}</p>
          </div>
        </header>
        <div class="movements-list">
          ${summary.rows.map((m, i) => renderMovementRow(m, i)).join('')}
        </div>
        <div class="movements-table-desktop">
          <table class="movements-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>المصدر</th>
                <th>الفاتورة</th>
                <th>الكمية</th>
                <th>السعر</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              ${summary.rows
                .map(
                  (m) => {
                    const qty = Number(m.quantity || 0);
                    const unit = Number(m.unit_price || 0);
                    const total = Number(m.total_price || 0) || qty * unit;
                    return `<tr>
                      <td>${esc(fmtDateDisplay(m.date))}</td>
                      <td>${esc(m.supplier || '—')}</td>
                      <td dir="ltr">${esc(m.invoice || '—')}</td>
                      <td>${esc(fmtQty(qty))}</td>
                      <td>${esc(fmtMoney(unit))}</td>
                      <td><strong>${esc(fmtMoney(total))}</strong></td>
                    </tr>`;
                  },
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </section>`
    : `<div class="info-banner">لا توجد حركات مشتريات مسجّلة لهذا المنتج بعد.</div>`;

  $('resultWrap').innerHTML = `
    <article class="product-sheet">
      <header class="product-hero">
        <div class="product-hero-main">
          <p class="product-kicker">مادة</p>
          <h3 class="product-name">${esc(data.name || 'بدون اسم')}</h3>
          <div class="product-barcode" dir="ltr">${esc(data.barcode || '-')}</div>
        </div>
      </header>
      ${priceHtml}
      ${statsHtml}
      ${movementsHtml}
      ${renderLegacySources(sources)}
    </article>`;
}

async function searchProduct(barcodeRaw) {
  const barcode = String(barcodeRaw || '').trim();
  if (!barcode) return;
  setStatus('جارٍ جلب بيانات المنتج...');
  try {
    const res = await fetch(`${getBackendUrl()}/product/${encodeURIComponent(barcode)}`);
    if (res.status === 404) {
      $('resultWrap').innerHTML = `
        <div class="empty-state empty-state-warn">
          <div class="empty-state-icon" aria-hidden="true">✕</div>
          <p class="empty-state-title">المنتج غير موجود</p>
          <p class="empty-state-text">الباركود <strong dir="ltr">${esc(barcode)}</strong> غير مسجّل في النظام</p>
        </div>`;
      setStatus('المنتج غير موجود.', 'warn');
      return;
    }
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const body = await res.json();
    renderProduct(body);
    setStatus('تم تحميل المنتج بنجاح.', 'ok');
  } catch (e) {
    $('resultWrap').innerHTML = `
      <div class="empty-state empty-state-error">
        <div class="empty-state-icon" aria-hidden="true">!</div>
        <p class="empty-state-title">تعذر الاتصال</p>
        <p class="empty-state-text">${esc(e.message)}</p>
      </div>`;
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
    const cached = state.cachedPrimaryBackDeviceId;
    if (cached && cameras.some((c) => c.id === cached)) {
      return cached;
    }
    const picked = pickBestBackCamera(cameras);
    if (picked) state.cachedPrimaryBackDeviceId = picked;
    return picked;
  } catch (_) {
    return state.cachedPrimaryBackDeviceId;
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
  /* بدون deviceId: عيّن الخلفية بصرامة قدر الإمكان لتفادي اختيار الكاميرا الأمامية بعد إعادة الفتح على بعض المتصفحات */
  return {
    video: {
      width: { ideal: selected.w },
      height: { ideal: selected.h },
      facingMode: { ideal: 'environment' },
    },
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
    setScanButtonsState(false);
    $('toggleTorchBtn').classList.add('hidden');
  } finally {
    state.scannerBusy = false;
  }
}

async function startScanner() {
  if (state.scannerBusy) return;

  if (state.scannerRunning) {
    await stopScanner();
  }

  state.fastMode = false;
  state.scannerBusy = true;
  $('scannerShell').classList.remove('hidden');
  setScanButtonsState(true);

  try {
    assertCameraAllowedContext();
    const deviceId = await resolvePrimaryBackDeviceId();

    const box = scanBoxForViewport();
    $('scannerShell').style.setProperty('--scan-box-w', `${box.width}px`);
    $('scannerShell').style.setProperty('--scan-box-h', `${box.height}px`);

    await startSelectedEngine(deviceId);
    state.scannerRunning = true;
    rememberPrimaryCameraFromScannerVideo();
    setTimeout(() => rememberPrimaryCameraFromScannerVideo(), 150);
    setTimeout(() => rememberPrimaryCameraFromScannerVideo(), 450);
    setTorchUi();
    await applyIosFocusStabilityHints();
    setStatus('الماسح يعمل.', 'ok');
  } catch (e) {
    await stopActiveEngine();
    state.scannerRunning = false;
    $('scannerShell').classList.add('hidden');
    setScanButtonsState(false);
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
    await startScanner();
  }
}

$('searchBtn').addEventListener('click', () => searchProduct($('barcodeInput').value));
$('barcodeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') searchProduct($('barcodeInput').value);
});

$('toggleScannerBtn').addEventListener('click', async () => {
  if (state.scannerRunning) {
    await stopScanner();
    return;
  }
  await startScanner();
});

$('toggleTorchBtn').addEventListener('click', async () => {
  await setTorch(!state.torchOn);
});

$('stopScannerOverlayBtn').addEventListener('click', async () => {
  await stopScanner();
});

document.addEventListener('visibilitychange', async () => {
  if (document.hidden && state.scannerRunning) {
    await stopScanner();
  }
});

updateEngineUi();
resetScanRegionToVideo();
