const defaultBackendUrl =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000';

const CONFIGURED_BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || defaultBackendUrl).replace(/\/$/, '');

function buildCandidateBaseUrls() {
  const out = [CONFIGURED_BACKEND_URL];
  if (typeof window !== 'undefined' && window.location?.origin && window.location?.hostname) {
    const origin = window.location.origin.replace(/\/$/, '');
    const host = window.location.hostname;
    const candidates = [
      `${origin}/price-api`,
      `${origin}/api`,
      `http://${host}:5000`,
      `https://${host}:5000`,
    ];
    for (const c of candidates) {
      const v = c.replace(/\/$/, '');
      if (!out.includes(v)) out.push(v);
    }
  }
  return out;
}

const CANDIDATE_BASE_URLS = buildCandidateBaseUrls();
let activeBaseUrl = CANDIDATE_BASE_URLS[0];

export function getBackendUrl() {
  return activeBaseUrl;
}

async function parseBody(res) {
  return res.json().catch(() => ({}));
}

async function fetchWithFallback(path, init = {}) {
  let lastRes = null;
  let lastErr = null;

  for (const baseUrl of CANDIDATE_BASE_URLS) {
    try {
      const res = await fetch(`${baseUrl}${path}`, init);
      if (res.status === 404) {
        lastRes = res;
        continue;
      }
      activeBaseUrl = baseUrl;
      return res;
    } catch (e) {
      lastErr = e;
    }
  }

  if (lastRes) return lastRes;
  if (lastErr) throw lastErr;
  throw new Error('Unable to reach backend');
}

export async function apiGetMappingTemplate(sourceName) {
  const res = await fetchWithFallback(`/mapping-templates/${encodeURIComponent(sourceName)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
  return parseBody(res);
}

export async function apiSaveMappingTemplate(sourceName, mapping) {
  const res = await fetchWithFallback('/mapping-templates', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_name: sourceName, mapping }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to save template (${res.status})`);
  return body;
}

export async function apiListTemplates() {
  const res = await fetchWithFallback('/mapping-templates');
  if (!res.ok) throw new Error(`Failed to list templates (${res.status})`);
  const body = await parseBody(res);
  return body?.templates || [];
}

export async function apiImport({ source, mapping, data }) {
  const res = await fetchWithFallback('/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, mapping, data }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Import failed (${res.status})`);
  return body;
}

export async function apiAdminListGroups(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetchWithFallback(`/admin/groups${query}`);
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to list groups (${res.status})`);
  return body?.groups || [];
}

export async function apiAdminGetGroupProducts(sourceName, search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetchWithFallback(`/admin/groups/${encodeURIComponent(sourceName)}/products${query}`);
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to load group products (${res.status})`);
  return body;
}

export async function apiAdminRenameGroup(sourceName, newSourceName) {
  const res = await fetchWithFallback(`/admin/groups/${encodeURIComponent(sourceName)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ new_source_name: newSourceName }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to rename group (${res.status})`);
  return body;
}

export async function apiAdminDeleteGroup(sourceName, removeOrphans = true) {
  const query = `?remove_orphans=${removeOrphans ? '1' : '0'}`;
  const res = await fetchWithFallback(`/admin/groups/${encodeURIComponent(sourceName)}${query}`, {
    method: 'DELETE',
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to delete group (${res.status})`);
  return body;
}

export async function apiAdminUpdateGroupProduct(sourceName, barcode, payload) {
  const res = await fetchWithFallback(
    `/admin/groups/${encodeURIComponent(sourceName)}/products/${encodeURIComponent(barcode)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to update group product (${res.status})`);
  return body;
}

export async function apiAdminDeleteGroupProduct(sourceName, barcode, removeOrphan = true) {
  const query = `?remove_orphan=${removeOrphan ? '1' : '0'}`;
  const res = await fetchWithFallback(
    `/admin/groups/${encodeURIComponent(sourceName)}/products/${encodeURIComponent(barcode)}${query}`,
    {
      method: 'DELETE',
    },
  );
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to delete group product (${res.status})`);
  return body;
}

export async function apiAdminListProducts(search = '') {
  const query = search ? `?search=${encodeURIComponent(search)}` : '';
  const res = await fetchWithFallback(`/admin/products${query}`);
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to list products (${res.status})`);
  return body?.products || [];
}

export async function apiAdminUpdateProduct(barcode, payload) {
  const res = await fetchWithFallback(`/admin/products/${encodeURIComponent(barcode)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to update product (${res.status})`);
  return body;
}

export async function apiAdminDeleteProduct(barcode) {
  const res = await fetchWithFallback(`/admin/products/${encodeURIComponent(barcode)}`, {
    method: 'DELETE',
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to delete product (${res.status})`);
  return body;
}
