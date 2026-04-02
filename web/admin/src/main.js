import './style.css';
import * as XLSX from 'xlsx';
import {
  apiGetMappingTemplate,
  apiSaveMappingTemplate,
  apiImport,
  apiListTemplates,
  apiAdminListGroups,
  apiAdminGetGroupProducts,
  apiAdminRenameGroup,
  apiAdminDeleteGroup,
  apiAdminUpdateGroupProduct,
  apiAdminDeleteGroupProduct,
  apiAdminListProducts,
  apiAdminUpdateProduct,
  apiAdminDeleteProduct,
  getBackendUrl,
} from './services/api.js';

document.querySelector('#app').innerHTML = `
  <div class="topbar">
    <div class="topbar-inner">
      <div class="brand">
        <div class="brand-dot"></div>
        <div>
          <div class="brand-title">سعر - إدارة الأسعار</div>
          <div class="brand-subtitle">نسخة سطح مكتب لإدارة الاستيراد والمطابقة</div>
        </div>
      </div>
      <div class="topbar-badge" id="mappingStatusBadge">جاهز لاستيراد Excel بمطابقة أعمدة</div>
    </div>
  </div>

  <div class="app app-desktop">
    <aside class="admin-sidebar">
      <div class="admin-tabs admin-tabs-vertical">
        <button type="button" class="tab-btn active" data-admin-tab="import">استيراد</button>
        <button type="button" class="tab-btn" data-admin-tab="groups">المجاميع</button>
        <button type="button" class="tab-btn" data-admin-tab="products">المنتجات</button>
      </div>
    </aside>

    <main class="admin-content">
      <div id="panel-import" class="tab-panel">
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
            <div id="sourceTemplateInfo" class="source-template-info">المصدر الحالي: — | القالب: غير محدد</div>

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
              <label>التاريخ (اختياري)</label>
              <select id="mapDate"></select>
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
            <div id="importSummary" class="import-summary hidden"></div>
            <pre id="result" class="result">---</pre>
            <div class="result-quick-actions">
              <button id="gotoGroupsBtn" type="button" class="mini-btn">إدارة المجاميع</button>
              <button id="gotoProductsBtn" type="button" class="mini-btn">إدارة المنتجات</button>
            </div>
          </section>
        </aside>
      </div>
      </div>

      <div id="panel-groups" class="tab-panel hidden">
      <section class="card">
        <h2>إدارة المجاميع</h2>
        <div class="management-grid">
          <div class="management-col">
            <div class="row compact">
              <label>بحث بالمجموعة</label>
              <input id="groupSearchInput" type="text" placeholder="ابحث باسم المجموعة..." />
            </div>
            <div id="groupsWrap" class="list-wrap"></div>
          </div>

          <div class="management-col">
            <div class="row compact">
              <label>منتجات المجموعة</label>
              <input id="groupProductsSearchInput" type="text" placeholder="بحث بالباركود أو الاسم..." />
            </div>
            <div id="groupProductsMeta" class="small-note">اختر مجموعة لعرض منتجاتها</div>
            <div id="groupProductsWrap" class="list-wrap"></div>
          </div>
        </div>
      </section>
      </div>

      <div id="panel-products" class="tab-panel hidden">
      <section class="card">
        <h2>كل المنتجات</h2>
        <div class="row compact">
          <label>بحث بالمنتج</label>
          <input id="productsSearchInput" type="text" placeholder="ابحث بالباركود أو الاسم..." />
        </div>
        <div id="allProductsWrap" class="list-wrap"></div>
      </section>
      </div>
    </main>
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
  mapping: { barcode: '', name: '', price: '', date: '' },
  extraKeys: [],
  groups: [],
  selectedGroupName: '',
  groupProducts: [],
  allProducts: [],
  importTotals: null,
  loadedTemplateSource: '',
  loadedTemplateMapping: null,
  uiTab: 'import',
};

function setTab(tabId) {
  state.uiTab = tabId;
  ['import', 'groups', 'products'].forEach((t) => {
    const panel = document.getElementById(`panel-${t}`);
    if (!panel) return;
    panel.classList.toggle('hidden', t !== tabId);
  });
  document.querySelectorAll('.tab-btn[data-admin-tab]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.adminTab === tabId);
  });
}

const RESERVED = new Set(['barcode', 'name', 'price', 'date']);
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
      if (state.mapping.date && c === state.mapping.date) td.className = 'cell-date';
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
      renderSourceTemplateInfo();
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
      renderSourceTemplateInfo();
    });
    row.append(keyLabel, select, delBtn);
    container.appendChild(row);
  }
}

function debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function formatPrice(price) {
  const n = Number(price);
  if (!Number.isFinite(n)) return '-';
  return n.toFixed(2);
}

function formatDateTime(value) {
  if (value == null || String(value).trim() === '') return '—';
  const s = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d/.test(s) ? s.replace(' ', 'T') : s;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return s;
  try {
    return d.toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return s;
  }
}

function formatSourceDateLabel(raw) {
  if (raw == null || String(raw).trim() === '') return '—';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (!Number.isNaN(d.getTime())) {
      try {
        return d.toLocaleDateString('ar', { dateStyle: 'medium' });
      } catch {
        return s.slice(0, 10);
      }
    }
  }
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function toDateInputValue(raw) {
  if (raw == null || String(raw).trim() === '') return '';
  const s = String(raw).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function renderImportSummary() {
  const box = $('importSummary');
  if (!box) return;
  if (!state.importTotals) {
    box.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  const t = state.importTotals;
  box.classList.remove('hidden');
  box.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div>المنتجات الجديدة</div><b>${t.products_created}</b></div>
      <div class="kpi"><div>المنتجات المحدّثة</div><b>${t.products_updated}</b></div>
      <div class="kpi"><div>صفوف المصدر الجديدة</div><b>${t.source_rows_created}</b></div>
      <div class="kpi"><div>صفوف المصدر المحدّثة</div><b>${t.source_rows_updated}</b></div>
      <div class="kpi"><div>إجمالي الصفوف</div><b>${t.rows_imported}</b></div>
    </div>
  `;
}

function renderSourceTemplateInfo() {
  const box = $('sourceTemplateInfo');
  if (!box) return;

  const source = String($('sourceName')?.value || '').trim();
  const selectedTemplate = String($('templateSelect')?.value || '').trim();
  const loadedFrom = state.loadedTemplateSource || '';
  const loadedMapping = state.loadedTemplateMapping || null;
  const currentMapping = getCurrentMappingFromUI();

  const mapPairs = Object.entries(currentMapping || {})
    .filter(([, v]) => String(v || '').trim())
    .map(([k, v]) => `${k}: ${v}`);

  const mapText = mapPairs.length ? mapPairs.join(' | ') : 'لا يوجد ربط أعمدة بعد';
  const templateLabel = loadedFrom
    ? `محمل من "${loadedFrom}"`
    : selectedTemplate
      ? `محدد "${selectedTemplate}" (لم يتم تحميله بعد)`
      : 'غير محدد';

  const loadedText = loadedMapping ? 'قالب محمل' : 'قالب غير محمل';
  box.textContent = `المصدر الحالي: ${source || '—'} | القالب: ${templateLabel} | الحالة: ${loadedText} | ${mapText}`;
}

function renderGroups() {
  const wrap = $('groupsWrap');
  if (!wrap) return;
  if (!state.groups.length) {
    wrap.innerHTML = '<div class="muted">لا توجد مجموعات بعد.</div>';
    return;
  }

  const rows = state.groups
    .map(
      (g) => `
      <div class="list-item ${state.selectedGroupName === g.source_name ? 'active' : ''}" data-group-name="${g.source_name}">
        <div class="list-item-main">
          <div class="list-item-title">${g.source_name} <span class="template-pill ${g.has_template ? 'ok' : 'warn'}">${g.has_template ? 'قالب محفوظ' : 'بدون قالب'}</span></div>
          <div class="list-item-meta">منتجات: ${g.products_count} | صفوف: ${g.source_rows_count} | آخر تحديث: ${formatDateTime(g.last_updated_at)}</div>
        </div>
        <div class="list-item-actions">
          <button type="button" class="mini-btn group-rename-btn" data-group-name="${g.source_name}">تعديل</button>
          <button type="button" class="mini-btn danger group-delete-btn" data-group-name="${g.source_name}">حذف</button>
        </div>
      </div>
    `,
    )
    .join('');

  wrap.innerHTML = rows;

  wrap.querySelectorAll('.list-item[data-group-name]').forEach((el) => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.group-rename-btn') || e.target.closest('.group-delete-btn')) return;
      const groupName = el.dataset.groupName;
      if (groupName) await loadGroupProducts(groupName);
    });
  });

  wrap.querySelectorAll('.group-rename-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const current = btn.dataset.groupName;
      if (!current) return;
      const next = window.prompt('اسم المجموعة الجديد:', current);
      if (!next || next.trim() === current) return;
      try {
        await apiAdminRenameGroup(current, next.trim());
        if (state.selectedGroupName === current) state.selectedGroupName = next.trim();
        await refreshGroups();
        if (state.selectedGroupName) await loadGroupProducts(state.selectedGroupName);
        setStatus(`تم تعديل اسم المجموعة من "${current}" إلى "${next.trim()}".`);
      } catch (err) {
        setStatus(`فشل تعديل المجموعة: ${err.message}`);
      }
    });
  });

  wrap.querySelectorAll('.group-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const groupName = btn.dataset.groupName;
      if (!groupName) return;
      if (!window.confirm(`حذف المجموعة "${groupName}"؟ سيتم حذف صفوف المصدر التابعة لها.`)) return;
      try {
        await apiAdminDeleteGroup(groupName, true);
        if (state.selectedGroupName === groupName) {
          state.selectedGroupName = '';
          state.groupProducts = [];
          renderGroupProducts();
        }
        await refreshGroups();
        await refreshAllProducts();
        setStatus(`تم حذف المجموعة "${groupName}".`);
      } catch (err) {
        setStatus(`فشل حذف المجموعة: ${err.message}`);
      }
    });
  });
}

function renderGroupProducts() {
  const meta = $('groupProductsMeta');
  const wrap = $('groupProductsWrap');
  if (!wrap || !meta) return;

  if (!state.selectedGroupName) {
    meta.textContent = 'اختر مجموعة لعرض منتجاتها';
    wrap.innerHTML = '<div class="muted">لم يتم اختيار مجموعة.</div>';
    return;
  }

  meta.textContent = `المجموعة: ${state.selectedGroupName} | عدد صفوف الأسعار (مع التواريخ): ${state.groupProducts.length}`;
  if (!state.groupProducts.length) {
    wrap.innerHTML = '<div class="muted">لا توجد منتجات في هذه المجموعة.</div>';
    return;
  }

  wrap.innerHTML = state.groupProducts
    .map((p) => {
      const fieldsText = Object.keys(p.fields || {}).length ? JSON.stringify(p.fields) : '';
      const rowId = Number(p.source_row_id);
      const datePill = p.source_date
        ? `<span class="template-pill ok">${formatSourceDateLabel(p.source_date)}</span>`
        : `<span class="template-pill warn">بدون تاريخ</span>`;
      return `
        <div class="list-item" data-source-row-id="${rowId}">
          <div class="list-item-main">
            <div class="list-item-title">${p.barcode} - ${p.name || 'بدون اسم'} ${datePill}</div>
            <div class="list-item-meta">السعر: ${formatPrice(p.price)} | تحديث السجل: ${formatDateTime(p.updated_at)}</div>
            <div class="edit-grid">
              <input class="gp-name" data-source-row-id="${rowId}" type="text" value="${p.name || ''}" placeholder="اسم المنتج" />
              <input class="gp-price" data-source-row-id="${rowId}" type="number" step="0.01" value="${formatPrice(p.price)}" />
              <input class="gp-fields" data-source-row-id="${rowId}" type="text" value='${fieldsText.replace(/'/g, '&#39;')}' placeholder='JSON fields' />
            </div>
            <div class="edit-row-date">
              <label class="gp-date-label">تاريخ السعر (من الملف أو يدوي)</label>
              <input class="gp-date" data-source-row-id="${rowId}" type="date" value="${toDateInputValue(p.source_date)}" />
            </div>
          </div>
          <div class="list-item-actions">
            <button type="button" class="mini-btn gp-save-btn" data-barcode="${p.barcode}" data-source-row-id="${rowId}">حفظ</button>
            <button type="button" class="mini-btn danger gp-delete-btn" data-barcode="${p.barcode}" data-source-row-id="${rowId}">حذف الصف</button>
          </div>
        </div>
      `;
    })
    .join('');

  wrap.querySelectorAll('.gp-save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const barcode = btn.dataset.barcode;
      const rowId = Number(btn.dataset.sourceRowId);
      const name = wrap.querySelector(`.gp-name[data-source-row-id="${rowId}"]`)?.value || '';
      const priceRaw = wrap.querySelector(`.gp-price[data-source-row-id="${rowId}"]`)?.value || '';
      const fieldsRaw = wrap.querySelector(`.gp-fields[data-source-row-id="${rowId}"]`)?.value || '';
      let fields = {};
      if (fieldsRaw.trim()) {
        try {
          fields = JSON.parse(fieldsRaw);
        } catch {
          return setStatus('صيغة fields يجب أن تكون JSON صحيح.');
        }
      }
      const dateRaw = wrap.querySelector(`.gp-date[data-source-row-id="${rowId}"]`)?.value || '';
      try {
        await apiAdminUpdateGroupProduct(state.selectedGroupName, barcode, {
          source_row_id: rowId,
          name: name.trim() || null,
          price: Number(priceRaw),
          fields,
          source_date: dateRaw.trim() || null,
        });
        await loadGroupProducts(state.selectedGroupName);
        await refreshAllProducts();
        setStatus(`تم تحديث المنتج ${barcode} في المجموعة ${state.selectedGroupName}.`);
      } catch (err) {
        setStatus(`فشل تحديث المنتج: ${err.message}`);
      }
    });
  });

  wrap.querySelectorAll('.gp-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const barcode = btn.dataset.barcode;
      const rowId = Number(btn.dataset.sourceRowId);
      if (!barcode || !rowId) return;
      if (
        !window.confirm(
          `حذف صف السعر هذا للمنتج ${barcode} من المجموعة ${state.selectedGroupName}؟ (صف واحد = تاريخ وسعر محددان)`,
        )
      )
        return;
      try {
        await apiAdminDeleteGroupProduct(state.selectedGroupName, barcode, true, rowId);
        await loadGroupProducts(state.selectedGroupName);
        await refreshGroups();
        await refreshAllProducts();
        setStatus(`تم حذف المنتج ${barcode} من المجموعة.`);
      } catch (err) {
        setStatus(`فشل حذف المنتج: ${err.message}`);
      }
    });
  });
}

function renderAllProducts() {
  const wrap = $('allProductsWrap');
  if (!wrap) return;
  if (!state.allProducts.length) {
    wrap.innerHTML = '<div class="muted">لا توجد منتجات.</div>';
    return;
  }

  wrap.innerHTML = state.allProducts
    .map(
      (p) => `
      <div class="list-item">
        <div class="list-item-main">
          <div class="list-item-title">${p.barcode}</div>
          <div class="list-item-meta">مجموعات: ${p.groups_count} | ${formatPrice(p.min_price)} - ${formatPrice(p.max_price)} | أحدث تاريخ سعر: ${formatSourceDateLabel(p.latest_source_date)} | تعديل الاسم: ${formatDateTime(p.updated_at)}</div>
          <input class="ap-name" data-barcode="${p.barcode}" type="text" value="${p.name || ''}" placeholder="اسم المنتج" />
        </div>
        <div class="list-item-actions">
          <button type="button" class="mini-btn ap-save-btn" data-barcode="${p.barcode}">حفظ</button>
          <button type="button" class="mini-btn danger ap-delete-btn" data-barcode="${p.barcode}">حذف</button>
        </div>
      </div>
    `,
    )
    .join('');

  wrap.querySelectorAll('.ap-save-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const barcode = btn.dataset.barcode;
      const name = wrap.querySelector(`.ap-name[data-barcode="${barcode}"]`)?.value || '';
      try {
        await apiAdminUpdateProduct(barcode, { name: name.trim() || null });
        await refreshAllProducts();
        if (state.selectedGroupName) await loadGroupProducts(state.selectedGroupName);
        setStatus(`تم تحديث المنتج ${barcode}.`);
      } catch (err) {
        setStatus(`فشل تحديث المنتج: ${err.message}`);
      }
    });
  });

  wrap.querySelectorAll('.ap-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const barcode = btn.dataset.barcode;
      if (!barcode) return;
      if (!window.confirm(`حذف المنتج ${barcode} بالكامل من كل المجموعات؟`)) return;
      try {
        await apiAdminDeleteProduct(barcode);
        await refreshAllProducts();
        await refreshGroups();
        if (state.selectedGroupName) await loadGroupProducts(state.selectedGroupName);
        setStatus(`تم حذف المنتج ${barcode}.`);
      } catch (err) {
        setStatus(`فشل حذف المنتج: ${err.message}`);
      }
    });
  });
}

async function refreshGroups() {
  const search = $('groupSearchInput')?.value?.trim() || '';
  state.groups = await apiAdminListGroups(search);
  if (state.selectedGroupName && !state.groups.some((g) => g.source_name === state.selectedGroupName)) {
    state.selectedGroupName = '';
    state.groupProducts = [];
  }
  renderGroups();
}

async function loadGroupProducts(groupName) {
  const search = $('groupProductsSearchInput')?.value?.trim() || '';
  const body = await apiAdminGetGroupProducts(groupName, search);
  state.selectedGroupName = groupName;
  state.groupProducts = body.products || [];
  renderGroups();
  renderGroupProducts();
}

async function refreshAllProducts() {
  const search = $('productsSearchInput')?.value?.trim() || '';
  state.allProducts = await apiAdminListProducts(search);
  renderAllProducts();
}
function getCurrentMappingFromUI() {
  const mapping = { ...state.mapping };
  mapping.barcode = $('mapBarcode').value || state.mapping.barcode || '';
  mapping.name = $('mapName').value || state.mapping.name || '';
  mapping.price = $('mapPrice').value || state.mapping.price || '';
  mapping.date = $('mapDate').value || state.mapping.date || '';
  for (const k of Object.keys(mapping)) if (!mapping[k]) delete mapping[k];
  return mapping;
}
function setMappingToUI(mapping) {
  state.mapping = { barcode: '', name: '', price: '', date: '', ...mapping };
  state.extraKeys = getExtraKeysForMapping(mapping);
  renderSelectOptions($('mapBarcode'), getColumnOptions(), state.mapping.barcode);
  renderSelectOptions($('mapName'), getColumnOptions(), state.mapping.name);
  renderSelectOptions($('mapPrice'), getColumnOptions(), state.mapping.price);
  renderSelectOptions($('mapDate'), getColumnOptions(), state.mapping.date);
  renderExtraFields();
  renderSourceTemplateInfo();
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
    if (!tpl) {
      state.loadedTemplateSource = '';
      state.loadedTemplateMapping = null;
      renderSourceTemplateInfo();
      return setStatus(`لم يتم العثور على قالب للمصدر "${sourceName}".`);
    }
    setMappingToUI(tpl.mapping || {});
    state.loadedTemplateSource = sourceName;
    state.loadedTemplateMapping = tpl.mapping || {};
    $('templateSelect').value = sourceName;
    renderSourceTemplateInfo();
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

  // Import in chunks to avoid 413 (payload too large) on proxies/servers.
  const CHUNK_SIZE = 500;
  const chunks = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  }

  const totals = {
    rows_received: 0,
    rows_imported: 0,
    products_created: 0,
    products_updated: 0,
    source_rows_created: 0,
    source_rows_updated: 0,
    ignored_rows: 0,
  };
  state.importTotals = null;
  renderImportSummary();

  try {
    for (let i = 0; i < chunks.length; i++) {
      const part = chunks[i];
      setStatus(`جارٍ الاستيراد... الدفعة ${i + 1}/${chunks.length} (${part.length} صف)`);
      const result = await apiImport({ source, mapping, data: part });
      totals.rows_received += Number(result?.rows_received || part.length);
      totals.rows_imported += Number(result?.rows_imported || 0);
      totals.products_created += Number(result?.products_created || 0);
      totals.products_updated += Number(result?.products_updated || 0);
      totals.source_rows_created += Number(result?.source_rows_created || 0);
      totals.source_rows_updated += Number(result?.source_rows_updated || 0);
      totals.ignored_rows += Number(result?.ignored_rows || 0);
    }

    setStatus(
      JSON.stringify(
        {
          ok: true,
          message: `تم الاستيراد على ${chunks.length} دفعة`,
          source,
          totals,
        },
        null,
        2
      )
    );
    state.importTotals = totals;
    renderImportSummary();
    await refreshGroups();
    await refreshAllProducts();
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
    state.loadedTemplateSource = source;
    state.loadedTemplateMapping = { ...mapping };
    renderSourceTemplateInfo();
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
    renderSelectOptions($('mapDate'), columns, state.mapping.date);
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
  renderSelectOptions($('mapDate'), columns, state.mapping.date);
  renderExtraFields();
  renderPreview();
  updateMappingStatusBadge();
  updateImportButtonState();
});
$('sourcePreset').addEventListener('change', () => {
  const v = $('sourcePreset').value;
  if (v) $('sourceName').value = v;
  renderSourceTemplateInfo();
});
$('sourceName').addEventListener('input', () => renderSourceTemplateInfo());
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
  renderSourceTemplateInfo();
  await loadTemplateForCurrentSource();
});
$('addCustomFieldBtn').addEventListener('click', () => {
  const key = String($('customFieldKey').value || '').trim();
  if (!key || RESERVED.has(key) || state.extraKeys.includes(key)) return;
  state.extraKeys.push(key);
  state.mapping[key] = '';
  $('customFieldKey').value = '';
  renderExtraFields();
  renderSourceTemplateInfo();
});
['mapBarcode', 'mapName', 'mapPrice', 'mapDate'].forEach((id) => {
  $(id).addEventListener('change', () => {
    setStep(3);
    updateMappingStatusBadge();
    updateImportButtonState();
    renderPreview();
    renderSourceTemplateInfo();
  });
});

document.querySelectorAll('.tab-btn[data-admin-tab]').forEach((btn) => {
  btn.addEventListener('click', () => setTab(btn.dataset.adminTab));
});

$('gotoGroupsBtn')?.addEventListener('click', () => setTab('groups'));
$('gotoProductsBtn')?.addEventListener('click', () => setTab('products'));

$('groupSearchInput')?.addEventListener('input', debounce(async () => {
  try {
    await refreshGroups();
  } catch (e) {
    setStatus(`فشل تحميل المجاميع: ${e.message}`);
  }
}, 260));

$('groupProductsSearchInput')?.addEventListener('input', debounce(async () => {
  if (!state.selectedGroupName) return;
  try {
    await loadGroupProducts(state.selectedGroupName);
  } catch (e) {
    setStatus(`فشل تحميل منتجات المجموعة: ${e.message}`);
  }
}, 260));

$('productsSearchInput')?.addEventListener('input', debounce(async () => {
  try {
    await refreshAllProducts();
  } catch (e) {
    setStatus(`فشل تحميل المنتجات: ${e.message}`);
  }
}, 260));

state.extraKeys = defaultExtraKeys.slice();
renderExtraFields();
renderSelectOptions($('mapBarcode'), [], '');
renderSelectOptions($('mapName'), [], '');
renderSelectOptions($('mapPrice'), [], '');
renderSelectOptions($('mapDate'), [], '');
loadTemplateDropdownList();
refreshGroups().catch(() => {});
refreshAllProducts().catch(() => {});
renderSourceTemplateInfo();
setTab(state.uiTab);
setStatus('جاهز.');
setStep(1);
updateMappingStatusBadge();
updateImportButtonState();
