const defaultBackendUrl =
  typeof window !== 'undefined' && window.location?.origin
    ? `${window.location.origin}/price-api`
    : 'http://localhost:5000';
const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || defaultBackendUrl).replace(/\/$/, '');

export function getBackendUrl() {
  return BACKEND_URL;
}

async function parseBody(res) {
  return res.json().catch(() => ({}));
}

export async function apiGetMappingTemplate(sourceName) {
  const res = await fetch(`${BACKEND_URL}/mapping-templates/${encodeURIComponent(sourceName)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load template (${res.status})`);
  return parseBody(res);
}

export async function apiSaveMappingTemplate(sourceName, mapping) {
  const res = await fetch(`${BACKEND_URL}/mapping-templates`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source_name: sourceName, mapping }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Failed to save template (${res.status})`);
  return body;
}

export async function apiListTemplates() {
  const res = await fetch(`${BACKEND_URL}/mapping-templates`);
  if (!res.ok) throw new Error(`Failed to list templates (${res.status})`);
  const body = await parseBody(res);
  return body?.templates || [];
}

export async function apiImport({ source, mapping, data }) {
  const res = await fetch(`${BACKEND_URL}/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, mapping, data }),
  });
  const body = await parseBody(res);
  if (!res.ok) throw new Error(body?.error || `Import failed (${res.status})`);
  return body;
}
