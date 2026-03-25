function createProductSourcesRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO product_sources (product_id, source_name, price, extra_fields, updated_at)
    VALUES (@product_id, @source_name, @price, @extra_fields, datetime('now'))
    ON CONFLICT(product_id, source_name) DO UPDATE SET
      price = excluded.price,
      extra_fields = excluded.extra_fields,
      updated_at = datetime('now')
  `);

  function upsertProductSource({ product_id, source_name, price, extraFields }) {
    const extra = extraFields && Object.keys(extraFields).length ? JSON.stringify(extraFields) : null;
    upsertStmt.run({
      product_id,
      source_name,
      price,
      extra_fields: extra,
    });
  }

  return { upsertProductSource };
}

module.exports = { createProductSourcesRepository };

