/* global fetch, XLSX */
const XLSX = require('xlsx');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

const $ = (id) => document.getElementById(id);

const state = {
  workbook: null,
  sheetNames: [],
  currentSheetName: null,
  columns: [], // excel headers as strings
  rows: [], // array of objects { [colName]: value }
  templates: [],
  mapping: {
    barcode: '',
    name: '',
    price: '',
    // extra fields are stored dynamically below
  },
  extraKeys: [], // keys for extra fields (dynamic, excluding barcode/name/price)
};

const RESERVED = new Set(['barcode', 'name', 'price']);

const defaultExtraKeys = ['brand', 'category', 'size', 'cost'];

const displayFieldName = {
  brand: 'العلامة التجارية',
  category: 'التصنيف',
  size: 'الحجم',
  cost: 'التكلفة',
};

function setStep(stepNum) {
  const steps = document.querySelectorAll('.step[data-step]');
  steps.forEach((el) => {
    const v = el.getAttribute('data-step');
    if (String(v) === String(stepNum)) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function getExtraKeysForMapping(mapping) {
  const extra = Object.keys(mapping || {})
    .filter((k) => !RESERVED.has(k) && mapping[k])
    .map((k) => String(k));
  return Array.from(new Set(extra));
}

function setStatus(msg) {
  $('result').textContent = msg;
}

function getColumnOptions() {
  return state.columns.map((c) => String(c));
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
  if (!raw || !raw.length) return { columns: [], rows: [] };

  const headerRow = raw[0] || [];
  const columns = headerRow
    .map((h) => (h === null || h === undefined ? '' : String(h).trim()))
    .filter((h) => h.length > 0);

  const colCount = headerRow.length;
  const normalizedColumns = headerRow
    .map((h, idx) => {
      const s = h === null || h === undefined ? '' : String(h).trim();
      if (!s) return null;
      // preserve original index so row values align correctly
      return { name: s, idx };
    })
    .filter(Boolean);

  const rows = [];
  for (let r = 1; r < raw.length; r++) {
    const rowArr = raw[r] || [];
    const obj = {};
    let anyValue = false;

    for (const c of normalizedColumns) {
      const v = rowArr[c.idx];
      if (v !== null && v !== undefined && String(v).trim() !== '') {
        anyValue = true;
      }
      obj[c.name] = v;
    }

    if (!anyValue) continue;
    rows.push(obj);
  }

  // Columns should be unique in case headers repeat; keep first occurrence.
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

  if (!meta || !tableWrap) return;

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
  for (const c of cols) {
    const th = document.createElement('th');
    th.textContent = c;
    headRow.appendChild(th);
  }
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  const barcodeCol = state.mapping.barcode;
  const priceCol = state.mapping.price;
  for (const r of previewRows) {
    const tr = document.createElement('tr');
    for (const c of cols) {
      const td = document.createElement('td');
      if (c && barcodeCol && c === barcodeCol) td.className = 'cell-barcode';
      if (c && priceCol && c === priceCol) td.className = 'cell-price';
      td.textContent = r[c] === undefined || r[c] === null ? '' : String(r[c]);
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

    const selected = state.mapping[key] || '';
    if (selected) select.value = selected;

    select.addEventListener('change', () => {
      state.mapping[key] = select.value || '';
      if (state.columns.length) setStep(3);
      updateMappingStatusBadge();
      updateImportButtonState();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'remove-field-btn';
    delBtn.textContent = 'حذف';
    delBtn.addEventListener('click', () => removeExtraFieldKey(key));

    row.appendChild(keyLabel);
    row.appendChild(select);
    row.appendChild(delBtn);
    container.appendChild(row);
  }
}

function getCurrentMappingFromUI() {
  const mapping = { ...state.mapping };
  // Prefer current UI selections, but fall back to state.mapping.
  mapping.barcode = $('mapBarcode').value || state.mapping.barcode || '';
  mapping.name = $('mapName').value || state.mapping.name || '';
  mapping.price = $('mapPrice').value || state.mapping.price || '';

  // Remove empty optional fields from payload to keep mapping clean.
  for (const k of Object.keys(mapping)) {
    if (!mapping[k]) delete mapping[k];
  }
  return mapping;
}

function setMappingToUI(mapping) {
  // Mapping keys are system fields. Values are excel column names.
  state.mapping = { barcode: '', name: '', price: '', ...mapping };

  // Recompute extra keys from mapping keys excluding reserved ones.
  state.extraKeys = getExtraKeysForMapping(mapping);

  renderExtraFields();

  const cols = getColumnOptions();
  renderSelectOptions($('mapBarcode'), cols, state.mapping.barcode);
  renderSelectOptions($('mapName'), cols, state.mapping.name);
  renderSelectOptions($('mapPrice'), cols, state.mapping.price);

  setStep(3);
  updateMappingStatusBadge();
  updateImportButtonState();
}

function populateColumnsUI() {
  const cols = getColumnOptions();
  renderSelectOptions($('mapBarcode'), cols, state.mapping.barcode);
  renderSelectOptions($('mapName'), cols, state.mapping.name);
  renderSelectOptions($('mapPrice'), cols, state.mapping.price);
  renderExtraFields();
}

async function apiGetMappingTemplate(sourceName) {
  const url = `${BACKEND_URL}/mapping-templates/${encodeURIComponent(sourceName)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
  return res.json();
}

async function apiSaveMappingTemplate(sourceName, mapping) {
  const url = `${BACKEND_URL}/mapping-templates`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_name: sourceName, mapping }),
  });
  if (!res.ok) throw new Error(`Failed to save template (${res.status})`);
  return res.json();
}

async function apiImport({ source, mapping, data }) {
  const res = await fetch(`${BACKEND_URL}/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, mapping, data }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error ? `${body.error}` : `Import failed (${res.status})`);
  }
  return body;
}

async function loadTemplateForCurrentSource() {
  const sourceName = $('sourceName').value.trim();
  if (!sourceName) return;
  setStatus(`جارٍ تحميل القالب للمصدر "${sourceName}"...`);

  try {
    const tpl = await apiGetMappingTemplate(sourceName);
    if (!tpl) {
      // No template: keep current UI as-is.
      setStatus(`لم يتم العثور على قالب للمصدر "${sourceName}". الرجاء ربط الأعمدة يدويًا.`);
      const ts = $('templateSelect');
      if (ts) ts.value = '';
      return;
    }

    const mapping = tpl.mapping || {};
    if (!state.columns.length) {
      // Columns not loaded yet; store mapping and apply later.
      // Reset mapping to avoid keeping leftover keys from a previous template.
      state.mapping = { barcode: '', name: '', price: '', ...mapping };
      state.extraKeys = getExtraKeysForMapping(mapping);
      renderExtraFields();
      setStep(1);
      updateMappingStatusBadge();
      updateImportButtonState();
      setStatus(`تم تحميل القالب للمصدر "${sourceName}". الرجاء رفع ملف واختيار ورقة للربط.`);
      return;
    }

    setMappingToUI(mapping);
    const ts = $('templateSelect');
    if (ts) ts.value = sourceName;
    setStatus(`تم تحميل القالب للمصدر "${sourceName}".`);
  } catch (e) {
    setStatus(`خطأ تحميل القالب: ${e.message}`);
  }
}

function preFilterRowsForImport({ mapping, rows }) {
  const barcodeCol = mapping.barcode;
  const priceCol = mapping.price;
  if (!barcodeCol || !priceCol) return [];

  const filtered = [];
  for (const r of rows) {
    const b = r[barcodeCol];
    const p = r[priceCol];
    const bOk = b !== null && b !== undefined && String(b).trim() !== '';
    const pOk = p !== null && p !== undefined && String(p).trim() !== '';
    if (!bOk || !pOk) continue;
    filtered.push(r);
  }
  return filtered;
}

function validateMappingColumnsExist({ mapping }) {
  const missing = [];
  for (const [key, colName] of Object.entries(mapping)) {
    if (!colName) continue;
    if (!state.columns.includes(colName)) {
      missing.push(`${key}: "${colName}" غير موجود في أعمدة sheet الحالية`);
    }
  }
  return missing;
}

function computeImportReadiness() {
  if (!state.rows.length || !state.columns.length) {
    return { canImport: false, status: 'warn', message: 'قم برفع ملف Excel ثم اختر ورقة للمعاينة.' };
  }

  const mapping = getCurrentMappingFromUI();

  const requiredMissing = [];
  if (!mapping.barcode) requiredMissing.push('ربط عمود الباركود');
  if (!mapping.price) requiredMissing.push('ربط عمود السعر');

  const missingColumns = validateMappingColumnsExist({ mapping });

  if (requiredMissing.length) {
    return {
      canImport: false,
      status: 'error',
      message: `مطلوب: ${requiredMissing.join(' و ')}`,
    };
  }

  if (missingColumns.length) {
    return {
      canImport: false,
      status: 'error',
      message: `أعمدة مفقودة في sheet الحالية:\n- ${missingColumns.join('\n- ')}`,
    };
  }

  return { canImport: true, status: 'ok', message: 'جاهز للاستيراد بمطابقة أعمدة' };
}

function updateMappingStatusBadge() {
  const el = $('mappingStatusBadge');
  if (!el) return;
  const readiness = computeImportReadiness();

  el.classList.remove('badge-ok', 'badge-warn', 'badge-error');
  if (readiness.status === 'ok') el.classList.add('badge-ok');
  if (readiness.status === 'warn') el.classList.add('badge-warn');
  if (readiness.status === 'error') el.classList.add('badge-error');

  el.textContent = readiness.message;
}

function updateImportButtonState() {
  const btn = $('importBtn');
  if (!btn) return;
  const readiness = computeImportReadiness();
  btn.disabled = !readiness.canImport;
  return readiness.canImport;
}

function removeExtraFieldKey(key) {
  if (!key) return;
  state.extraKeys = state.extraKeys.filter((k) => k !== key);
  delete state.mapping[key];
  renderExtraFields();
  if (state.columns.length) setStep(3);
  updateMappingStatusBadge();
  updateImportButtonState();
}

async function onImport() {
  const sourceName = $('sourceName').value.trim();
  if (!sourceName) {
    setStatus('الرجاء تحديد اسم المصدر.');
    return;
  }

  if (!state.rows.length || !state.columns.length) {
    setStatus('الرجاء رفع ملف Excel ثم اختيار ورقة أولاً.');
    return;
  }

  const mapping = getCurrentMappingFromUI();
  if (!mapping.barcode) return setStatus('الرجاء ربط عمود الباركود.');
  if (!mapping.price) return setStatus('الرجاء ربط عمود السعر.');

  const missingColumns = validateMappingColumnsExist({ mapping });
  if (missingColumns.length) {
    setStatus(`لا يمكن الاستيراد. الأعمدة التالية مفقودة:\n- ${missingColumns.join('\n- ')}`);
    return;
  }

  // Backend expects data: array of row objects.
  const data = preFilterRowsForImport({ mapping, rows: state.rows });
  if (!data.length) {
    setStatus('لم يتم العثور على صفوف مطابقة للباركود + السعر. تحقق من الـ mapping.');
    return;
  }

  setStatus(`جارٍ الاستيراد... (${data.length} صف من ${state.rows.length})`);
  try {
    const result = await apiImport({ source: sourceName, mapping, data });
    setStatus(JSON.stringify(result, null, 2));
    setStep(4);
    updateMappingStatusBadge();
    updateImportButtonState();
  } catch (e) {
    setStatus(`خطأ الاستيراد: ${e.message}`);
    updateMappingStatusBadge();
    updateImportButtonState();
  }
}

async function onSaveTemplate() {
  const sourceName = $('sourceName').value.trim();
  if (!sourceName) {
    setStatus('الرجاء تحديد اسم المصدر لحفظ القالب.');
    return;
  }
  const mapping = getCurrentMappingFromUI();
  if (!mapping.barcode || !mapping.price) {
    setStatus('الرجاء ربط الباركود والسعر على الأقل قبل حفظ القالب.');
    return;
  }

  setStatus('جارٍ حفظ القالب...');
  try {
    const result = await apiSaveMappingTemplate(sourceName, mapping);
    setStatus(`تم حفظ القالب للمصدر "${sourceName}".`);
  } catch (e) {
    setStatus(`خطأ حفظ القالب: ${e.message}`);
  }
}

function ensureExcelLoadedUI() {
  $('sheetSelect').disabled = false;
  $('sheetSelect').innerHTML = '';
  for (const n of state.sheetNames) {
    const o = document.createElement('option');
    o.value = n;
    o.textContent = n;
    $('sheetSelect').appendChild(o);
  }
}

async function handleFile(file) {
  setStatus('جارٍ قراءة Excel...');
  const buf = await file.arrayBuffer();
  const workbook = XLSX.read(buf, { type: 'array' });

  state.workbook = workbook;
  state.sheetNames = workbook.SheetNames || [];
  state.currentSheetName = null;
  state.columns = [];
  state.rows = [];

  ensureExcelLoadedUI();
  const meta = $('previewMeta');
  const tableWrap = $('previewTableWrap');
  if (meta) meta.textContent = 'اختر ورقة للمعاينة.';
  if (tableWrap) tableWrap.innerHTML = '';
  setStatus('تم تحميل الملف. الرجاء اختيار ورقة.');

  // Auto-select first sheet
  if (state.sheetNames.length) {
    $('sheetSelect').value = state.sheetNames[0];
    const first = state.sheetNames[0];
    const { columns, rows } = buildRowsFromSheet(workbook, first);
    state.columns = columns;
    state.rows = rows;
    state.currentSheetName = first;
    populateColumnsUI();
    renderPreview();
    setStep(2);
    updateMappingStatusBadge();
    updateImportButtonState();
  }
}

$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  await handleFile(f);
});

$('sheetSelect').addEventListener('change', (e) => {
  const sheetName = e.target.value;
  if (!state.workbook || !sheetName) return;

  const { columns, rows } = buildRowsFromSheet(state.workbook, sheetName);
  state.columns = columns;
  state.rows = rows;
  state.currentSheetName = sheetName;

  populateColumnsUI();
  renderPreview();
  setStep(2);
  updateMappingStatusBadge();
  updateImportButtonState();
});

$('sourcePreset').addEventListener('change', () => {
  const v = $('sourcePreset').value;
  if (!v) return;
  $('sourceName').value = v;
});

let lastTemplateLoadKey = '';
$('sourceName').addEventListener('change', async () => {
  const key = $('sourceName').value.trim();
  if (!key || key === lastTemplateLoadKey) return;
  lastTemplateLoadKey = key;
  await loadTemplateForCurrentSource();
});

$('loadTemplateBtn').addEventListener('click', async () => loadTemplateForCurrentSource());
$('saveTemplateBtn').addEventListener('click', async () => onSaveTemplate());
$('importBtn').addEventListener('click', async () => onImport());

$('templateSelect').addEventListener('change', async () => {
  const v = $('templateSelect').value;
  if (!v) return;
  $('sourceName').value = v;
  await loadTemplateForCurrentSource();
});

async function loadTemplateDropdownList() {
  try {
    const res = await fetch(`${BACKEND_URL}/mapping-templates`);
    if (!res.ok) return;
    const body = await res.json();
    const templates = body?.templates ?? [];
    state.templates = templates;

    const selectEl = $('templateSelect');
    const current = selectEl.value;
    selectEl.innerHTML = '<option value="">قالب: (اختياري)</option>';
    for (const t of templates) {
      const o = document.createElement('option');
      o.value = t.source_name;
      o.textContent = t.source_name;
      selectEl.appendChild(o);
    }
    if (current) selectEl.value = current;
  } catch (_) {
    // ignore dropdown errors
  }
}

function addCustomFieldKey(keyRaw) {
  const key = String(keyRaw || '').trim();
  if (!key) return;
  if (RESERVED.has(key)) {
    setStatus(`"${key}" محجوز ولا يمكن إضافته كحقل مخصص.`);
    return;
  }
  if (state.extraKeys.includes(key)) {
    setStatus(`"${key}" موجود بالفعل.`);
    return;
  }
  state.extraKeys = [...state.extraKeys, key];
  state.mapping[key] = state.mapping[key] || '';
  renderExtraFields();
}

$('addCustomFieldBtn').addEventListener('click', () => {
  const key = $('customFieldKey').value;
  addCustomFieldKey(key);
  $('customFieldKey').value = '';
});

// Initialize defaults (extra fields)
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

// Keep UI in sync when required mapping dropdowns change.
['mapBarcode', 'mapName', 'mapPrice'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('change', () => {
    if (state.columns.length) setStep(3);
    updateMappingStatusBadge();
    updateImportButtonState();
  });
});

