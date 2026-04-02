function sortPriceHistoryDesc(history) {
  const arr = Array.isArray(history) ? [...history] : [];
  return arr.sort((a, b) => {
    const ad = a?.date ? String(a.date) : '';
    const bd = b?.date ? String(b.date) : '';
    if (ad && bd && ad !== bd) return bd.localeCompare(ad);
    if (ad && !bd) return -1;
    if (!ad && bd) return 1;
    return String(b?.recorded_at || '').localeCompare(String(a?.recorded_at || ''));
  });
}

function latestCalendarDateFromHistory(history) {
  if (!Array.isArray(history) || !history.length) return null;
  const withDates = history.map((h) => (h?.date ? String(h.date) : '')).filter(Boolean);
  if (!withDates.length) return null;
  return [...withDates].sort((a, b) => b.localeCompare(a))[0];
}

function parseHistoryJson(raw) {
  if (!raw) return [];
  try {
    const h = JSON.parse(raw);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}

module.exports = {
  sortPriceHistoryDesc,
  latestCalendarDateFromHistory,
  parseHistoryJson,
};
