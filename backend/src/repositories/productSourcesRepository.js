function createProductSourcesRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO product_sources (product_id, source_name, price, extra_fields, source_date, updated_at)
    VALUES (@product_id, @source_name, @price, @extra_fields, @source_date, strftime('%Y-%m-%d %H:%M:%f','now'))
    ON CONFLICT(product_id, source_name) DO UPDATE SET
      price = excluded.price,
      extra_fields = excluded.extra_fields,
      source_date = excluded.source_date,
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  function upsertProductSource({ product_id, source_name, price, extraFields, sourceDate }) {
    const extra = extraFields && Object.keys(extraFields).length ? JSON.stringify(extraFields) : null;
    const dateVal =
      sourceDate != null && String(sourceDate).trim() ? String(sourceDate).trim().slice(0, 64) : null;
    upsertStmt.run({
      product_id,
      source_name,
      price,
      extra_fields: extra,
      source_date: dateVal,
    });
  }

  return { upsertProductSource };
}

module.exports = { createProductSourcesRepository };

