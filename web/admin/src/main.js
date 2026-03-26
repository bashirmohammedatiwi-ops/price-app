import './style.css';
import * as XLSX from 'xlsx';
import {
  apiGetMappingTemplate,
  apiSaveMappingTemplate,
  apiImport,
  apiListTemplates,
  getBackendUrl,
} from './services/api.js';

document.querySelector('#app').innerHTML = `
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <div class="brand-dot"></div>
        <div class="brand-title">سعر - إدارة الأسعار (ويب)</div>
      </div>
      <div class="topbar-badge" id="mappingStatusBadge">جاهز لاستيراد Excel بمطابقة أعمدة</div>
    </div>
  </div>

  <div class="app">
    <h1 class="hero-title">استيراد Excel ذكي</h1>
    <div class="small-note">Backend: <span id="backendUrlText"></span></div>
    <div class="stepper">
      <div class="step active" data-step="1"><span>1</span> المصدر</div>
      <div class="step" data-step="2"><span>2</span> المعاينة</div>
      <div class="step" data-step="3"><span>3</span> Mapping</div>
      <div class="step" data-step="4"><span>4</span> النتيجة</div>
    </div>

    <div class="layout">
      <div class="main">
        <section class="card">
          <h2>1) المصدر والملف</h2>
          <div class="row">
            <label>المصدر</label>
            <div class="source-controls">
              <select id="sourcePreset">
                <option value="">قوالب جاهزة...</option>
                <option value="company">الشركة</option>
                <option value="dubai">دبي</option>
                <option value="market">السوق</option>
              </select>
              <select id="templateSelect">
                <option value="">قالب: (اختياري)</option>
              </select>
              <input id="sourceName" type="text" placeholder="مثال: dubai" />
            </div>
          </div>

          <div class="row">
            <label>ملف Excel</label>
            <input id="fileInput" type="file" accept=".xlsx,.xls" />
          </div>

          <div class="row">
            <label>الورقة (Sheet)</label>
            <select id="sheetSelect" disabled></select>
          </div>
        </section>

        <section class="card">
          <h2>2) المعاينة</h2>
          <div id="previewWrap" class="preview-wrap">
            <div id="previewMeta" class="preview-meta">قم برفع ملف Excel للمعاينة.</div>
            <div id="previewTableWrap"></div>
          </div>
        </section>

        <section class="card">
          <h2>3) ربط الأعمدة (Mapping)</h2>

          <div class="row">
            <label>الباركود (مطلوب)</label>
            <select id="mapBarcode"></select>
          </div>

          <div class="row">
            <label>اسم المنتج (اختياري)</label>
            <select id="mapName"></select>
          </div>

          <div class="row">
            <label>السعر (مطلوب)</label>
            <select id="mapPrice"></select>
          </div>

          <div class="row">
            <label>حقول إضافية (ديناميكية)</label>
            <div class="extra-fields"><div id="extraFields"></div></div>
          </div>

          <div class="row extra-add">
            <input id="customFieldKey" type="text" placeholder="أضف مفتاح حقل (مثال: brand_uam)" />
            <button id="addCustomFieldBtn" type="button">إضافة حقل</button>
          </div>

          <div class="row actions">
            <button id="loadTemplateBtn" type="button">تحميل القالب</button>
            <button id="saveTemplateBtn" type="button">حفظ القالب</button>
            <button id="importBtn" type="button" class="primary">استيراد</button>
          </div>
        </section>
      </div>

      <aside class="side">
        <section class="card side-card">
          <h2>حالة الاستيراد</h2>
          <div class="side-status">
            <div class="side-status-label">الجاهزية</div>
            <div class="side-status-badge" id="mappingStatusBadgeMirror">—</div>
          </div>
          <div class="side-actions">
            <button id="importBtnMirror" type="button" class="primary">استيراد الآن</button>
            <button id="scrollToMappingBtn" type="button">الذهاب للـ Mapping</button>
          </div>
          <div class="side-hint">- اربط <b>Barcode</b> و <b>Price</b> أولاً<br />- استخدم قالب المصدر لتسريع العمل</div>
        </section>

        <section class="card" id="cardImportResult">
          <h2>4) النتيجة</h2>
          <pre id="result" class="result">---</pre>
        </section>
      </aside>
    </div>
  </div>
`;

const $ = (id) => document.getElementById(id);

const state = {
  workbook: null,
  sheetNames: [],
  currentSheetName: null,
  columns: [],
  rows: [],
  templates: [],
  mapping: { barcode: '', name: '', price: '' },
  extraKeys: [],
};

const RESERVED = new Set(['barcode', 'name', 'price']);
const defaultExtraKeys = ['brand', 'category', 'size', 'cost'];
const displayFieldName = { brand: 'العلامة التجارية', category: 'التصنيف', size: 'الحجم', cost: 'التكلفة' };

function setStep(stepNum) {
  document.querySelectorAll('.step[data-step]').forEach((el) => {
    el.classList.toggle('active', String(el.getAttribute('data-step')) === String(stepNum));
  });
}
function setStatus(msg) {
  $('result').textContent = msg;
}
function getColumnOptions() {
  return state.columns.map(String);
}
function getExtraKeysForMapping(mapping) {
  return Array.from(new Set(Object.keys(mapping || {}).filter((k) => !RESERVED.has(k) && mapping[k])));
}
function renderSelectOptions(selectEl, options, selectedValue) {
  selectEl.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = options.length ? '-- اختر عمود --' : '-- حمّل Excel أولاً --';
  selectEl.appendChild(placeholder);
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt;
    o.textContent = opt;
    selectEl.appendChild(o);
  }
  if (selectedValue) selectEl.value = selectedValue;
}
function buildRowsFromSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!raw?.length) return { columns: [], rows: [] };
  const headerRow = raw[0] || [];
  const normalizedColumns = headerRow
    .map((h, idx) => {
      const s = h == null ? '' : String(h).trim();
      return s ? { name: s, idx } : null;
    })
    .filter(Boolean);
  const rows = [];
  for (let r = 1; r < raw.length; r++) {
    const rowArr = raw[r] || [];
    const obj = {};
    let anyValue = false;
    for (const c of normalizedColumns) {
      const v = rowArr[c.idx];
      if (v != null && String(v).trim() !== '') anyValue = true;
      obj[c.name] = v;
    }
    if (anyValue) rows.push(obj);
  }
  const uniqueColumns = [];
  const seen = new Set();
  for (const c of normalizedColumns) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    uniqueColumns.push(c.name);
  }
  return { columns: uniqueColumns, rows };
}
function renderPreview() {
  const meta = $('previewMeta');
  const tableWrap = $('previewTableWrap');
  if (!state.rows.length) {
    meta.textContent = 'قم برفع ملف Excel للمعاينة.';
    tableWrap.innerHTML = '';
    return;
  }
  const previewRows = state.rows.slice(0, 20);
  const cols = state.columns;
  meta.textContent = `عدد الصفوف: ${state.rows.length} | أعرض أول 20 صف في المعاينة.`;
  const table = document.createElement('table');
  table.className = 'preview';
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  cols.forEach((c) => {
    const th = document.createElement('th');
    th.textContent = c;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const r of previewRows) {
    const tr = document.createElement('tr');
    for (const c of cols) {
      const td = document.createElement('td');
      if (c === state.mapping.barcode) td.className = 'cell-barcode';
      if (c === state.mapping.price) td.className = 'cell-price';
      td.textContent = r[c] == null ? '' : String(r[c]);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  tableWrap.innerHTML = '';
  const scroll = document.createElement('div');
  scroll.className = 'preview-scroll';
  scroll.appendChild(table);
  tableWrap.appendChild(scroll);
}
function renderExtraFields() {
  const container = $('extraFields');
  container.innerHTML = '';
  const options = getColumnOptions();
  for (const key of state.extraKeys) {
    const row = document.createElement('div');
    row.className = 'extra-field-row';
    const keyLabel = document.createElement('div');
    keyLabel.className = 'key';
    keyLabel.textContent = displayFieldName[key] || key;
    const select = document.createElement('select');
    select.dataset.key = key;
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? '-- عمود اختياري --' : '-- حمّل Excel أولاً --';
    select.appendChild(placeholder);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt;
      select.appendChild(o);
    }
    select.value = state.mapping[key] || '';
    select.addEventListener('change', () => {
      state.mapping[key] = select.value || '';
      updateMappingStatusBadge();
      updateImportButtonState();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'remove-field-btn';
    delBtn.textContent = 'حذف';
    delBtn.addEventListener('click', () => {
      state.extraKeys = state.extraKeys.filter((k) => k !== key);
      delete state.mapping[key];
      renderExtraFields();
      updateMappingStatusBadge();
      updateImportButtonState();
    });
    row.append(keyLabel, select, delBtn);
    container.appendChild(row);
  }
}
function getCurrentMappingFromUI() {
  const mapping = { ...state.mapping };
  mapping.barcode = $('mapBarcode').value || state.mapping.barcode || '';
  mapping.name = $('mapName').value || state.mapping.name || '';
  mapping.price = $('mapPrice').value || state.mapping.price || '';
  for (const k of Object.keys(mapping)) if (!mapping[k]) delete mapping[k];
  return mapping;
}
function setMappingToUI(mapping) {
  state.mapping = { barcode: '', name: '', price: '', ...mapping };
  state.extraKeys = getExtraKeysForMapping(mapping);
  renderSelectOptions($('mapBarcode'), getColumnOptions(), state.mapping.barcode);
  renderSelectOptions($('mapName'), getColumnOptions(), state.mapping.name);
  renderSelectOptions($('mapPrice'), getColumnOptions(), state.mapping.price);
  renderExtraFields();
}
function computeImportReadiness() {
  if (!state.rows.length || !state.columns.length) return { canImport: false, status: 'warn', message: 'قم برفع ملف Excel ثم اختر ورقة للمعاينة.' };
  const mapping = getCurrentMappingFromUI();
  if (!mapping.barcode || !mapping.price) return { canImport: false, status: 'error', message: 'مطلوب ربط الباركود والسعر.' };
  return { canImport: true, status: 'ok', message: 'جاهز للاستيراد بمطابقة أعمدة' };
}
function updateMappingStatusBadge() {
  const readiness = computeImportReadiness();
  ['mappingStatusBadge', 'mappingStatusBadgeMirror'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.classList.remove('badge-ok', 'badge-warn', 'badge-error');
    if (readiness.status === 'ok') el.classList.add('badge-ok');
    if (readiness.status === 'warn') el.classList.add('badge-warn');
    if (readiness.status === 'error') el.classList.add('badge-error');
    el.textContent = readiness.message;
  });
}
function updateImportButtonState() {
  const canImport = computeImportReadiness().canImport;
  $('importBtn').disabled = !canImport;
  $('importBtnMirror').disabled = !canImport;
}
async function loadTemplateForCurrentSource() {
  const sourceName = $('sourceName').value.trim();
  if (!sourceName) return;
  setStatus(`جارٍ تحميل القالب للمصدر "${sourceName}"...`);
  try {
    const tpl = await apiGetMappingTemplate(sourceName);
    if (!tpl) return setStatus(`لم يتم العثور على قالب للمصدر "${sourceName}".`);
    setMappingToUI(tpl.mapping || {});
    $('templateSelect').value = sourceName;
    setStatus(`تم تحميل القالب للمصدر "${sourceName}".`);
  } catch (e) {
    setStatus(`خطأ تحميل القالب: ${e.message}`);
  }
}
async function onImport() {
  const source = $('sourceName').value.trim();
  if (!source) return setStatus('الرجاء تحديد اسم المصدر.');
  const mapping = getCurrentMappingFromUI();
  if (!mapping.barcode || !mapping.price) return setStatus('الرجاء ربط عمود الباركود والسعر.');
  const data = state.rows.filter((r) => String(r[mapping.barcode] ?? '').trim() && String(r[mapping.price] ?? '').trim());
  if (!data.length) return setStatus('لا توجد صفوف صالحة للاستيراد.');
  setStatus(`جارٍ الاستيراد... (${data.length} صف)`);
  try {
    const result = await apiImport({ source, mapping, data });
    setStatus(JSON.stringify(result, null, 2));
    setStep(4);
  } catch (e) {
    setStatus(`خطأ الاستيراد: ${e.message}`);
  }
}
async function onSaveTemplate() {
  const source = $('sourceName').value.trim();
  if (!source) return setStatus('الرجاء تحديد المصدر.');
  const mapping = getCurrentMappingFromUI();
  if (!mapping.barcode || !mapping.price) return setStatus('الباركود والسعر مطلوبان لحفظ القالب.');
  try {
    await apiSaveMappingTemplate(source, mapping);
    setStatus(`تم حفظ القالب للمصدر "${source}".`);
    await loadTemplateDropdownList();
  } catch (e) {
    setStatus(`خطأ حفظ القالب: ${e.message}`);
  }
}
async function handleFile(file) {
  setStatus('جارٍ قراءة Excel...');
  const buf = await file.arrayBuffer();
  state.workbook = XLSX.read(buf, { type: 'array' });
  state.sheetNames = state.workbook.SheetNames || [];
  const sheetSelect = $('sheetSelect');
  sheetSelect.disabled = false;
  sheetSelect.innerHTML = '';
  state.sheetNames.forEach((n) => {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    sheetSelect.appendChild(o);
  });
  if (state.sheetNames.length) {
    sheetSelect.value = state.sheetNames[0];
    const first = state.sheetNames[0];
    const { columns, rows } = buildRowsFromSheet(state.workbook, first);
    state.columns = columns;
    state.rows = rows;
    renderSelectOptions($('mapBarcode'), columns, state.mapping.barcode);
    renderSelectOptions($('mapName'), columns, state.mapping.name);
    renderSelectOptions($('mapPrice'), columns, state.mapping.price);
    renderExtraFields();
    renderPreview();
    setStep(2);
    setStatus('تم تحميل الملف.');
    updateMappingStatusBadge();
    updateImportButtonState();
  }
}
async function loadTemplateDropdownList() {
  try {
    const templates = await apiListTemplates();
    state.templates = templates;
    const selectEl = $('templateSelect');
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">قالب: (اختياري)</option>';
    templates.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.source_name;
      o.textContent = t.source_name;
      selectEl.appendChild(o);
    });
    if (current) selectEl.value = current;
  } catch (_) {}
}

$('backendUrlText').textContent = getBackendUrl();
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (f) await handleFile(f);
});
$('sheetSelect').addEventListener('change', (e) => {
  const sheet = e.target.value;
  if (!state.workbook || !sheet) return;
  const { columns, rows } = buildRowsFromSheet(state.workbook, sheet);
  state.columns = columns;
  state.rows = rows;
  renderSelectOptions($('mapBarcode'), columns, state.mapping.barcode);
  renderSelectOptions($('mapName'), columns, state.mapping.name);
  renderSelectOptions($('mapPrice'), columns, state.mapping.price);
  renderExtraFields();
  renderPreview();
  updateMappingStatusBadge();
  updateImportButtonState();
});
$('sourcePreset').addEventListener('change', () => {
  const v = $('sourcePreset').value;
  if (v) $('sourceName').value = v;
});
$('sourceName').addEventListener('change', () => loadTemplateForCurrentSource());
$('loadTemplateBtn').addEventListener('click', () => loadTemplateForCurrentSource());
$('saveTemplateBtn').addEventListener('click', () => onSaveTemplate());
$('importBtn').addEventListener('click', () => onImport());
$('importBtnMirror').addEventListener('click', () => onImport());
$('scrollToMappingBtn').addEventListener('click', () => $('mapBarcode').scrollIntoView({ behavior: 'smooth', block: 'center' }));
$('templateSelect').addEventListener('change', async () => {
  const v = $('templateSelect').value;
  if (!v) return;
  $('sourceName').value = v;
  await loadTemplateForCurrentSource();
});
$('addCustomFieldBtn').addEventListener('click', () => {
  const key = String($('customFieldKey').value || '').trim();
  if (!key || RESERVED.has(key) || state.extraKeys.includes(key)) return;
  state.extraKeys.push(key);
  state.mapping[key] = '';
  $('customFieldKey').value = '';
  renderExtraFields();
});
['mapBarcode', 'mapName', 'mapPrice'].forEach((id) => {
  $(id).addEventListener('change', () => {
    setStep(3);
    updateMappingStatusBadge();
    updateImportButtonState();
    renderPreview();
  });
});

state.extraKeys = defaultExtraKeys.slice();
renderExtraFields();
renderSelectOptions($('mapBarcode'), [], '');
renderSelectOptions($('mapName'), [], '');
renderSelectOptions($('mapPrice'), [], '');
loadTemplateDropdownList();
setStatus('جاهز.');
setStep(1);
updateMappingStatusBadge();
updateImportButtonState();
