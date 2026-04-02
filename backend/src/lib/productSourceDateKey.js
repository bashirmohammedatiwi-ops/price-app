function normalizeProductSourceDateKey(sourceDate) {
  if (sourceDate == null) return '';
  const s = String(sourceDate).trim();
  if (!s) return '';
  return s.slice(0, 64);
}

module.exports = { normalizeProductSourceDateKey };
