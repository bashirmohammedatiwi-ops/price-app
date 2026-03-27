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
