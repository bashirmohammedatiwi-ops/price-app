const { normalizeProductSourceDateKey } = require('../lib/productSourceDateKey');

function createProductSourcesRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO product_sources (product_id, source_name, price, extra_fields, source_date, date_key, updated_at)
    VALUES (@product_id, @source_name, @price, @extra_fields, @source_date, @date_key, strftime('%Y-%m-%d %H:%M:%f','now'))
    ON CONFLICT(product_id, source_name, date_key) DO UPDATE SET
      price = excluded.price,
      extra_fields = excluded.extra_fields,
      source_date = excluded.source_date,
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  function upsertProductSource({ product_id, source_name, price, extraFields, sourceDate }) {
    const extra = extraFields && Object.keys(extraFields).length ? JSON.stringify(extraFields) : null;
    const dateVal =
      sourceDate != null && String(sourceDate).trim() ? String(sourceDate).trim().slice(0, 64) : null;
    const dateKey = normalizeProductSourceDateKey(dateVal);
    upsertStmt.run({
      product_id,
      source_name,
      price,
      extra_fields: extra,
      source_date: dateVal,
      date_key: dateKey,
    });
  }

  return { upsertProductSource };
}

module.exports = { createProductSourcesRepository };
