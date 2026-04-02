function createProductRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO products (barcode, name, created_at, updated_at)
    VALUES (@barcode, @name, strftime('%Y-%m-%d %H:%M:%f','now'), strftime('%Y-%m-%d %H:%M:%f','now'))
    ON CONFLICT(barcode) DO UPDATE SET
      name = COALESCE(excluded.name, products.name),
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  const selectIdStmt = db.prepare(`
    SELECT id, name, updated_at
    FROM products
    WHERE barcode = @barcode
  `);

  function upsertProduct({ barcode, name }) {
    upsertStmt.run({
      barcode,
      name: name && String(name).trim() ? String(name).trim() : null,
    });
    return selectIdStmt.get({ barcode });
  }

  function getProductWithSourcesByBarcode({ barcode }) {
    const stmt = db.prepare(`
      SELECT
        p.barcode AS barcode,
        p.name AS name,
        ps.source_name AS source_name,
        ps.price AS price,
        ps.extra_fields AS extra_fields,
        ps.source_date AS source_date,
        ps.updated_at AS updated_at
      FROM products p
      LEFT JOIN product_sources ps
        ON ps.product_id = p.id
       AND ps.id = (
         SELECT ps3.id
         FROM product_sources ps3
         WHERE ps3.product_id = p.id
           AND ps3.source_name = ps.source_name
         ORDER BY ps3.updated_at DESC, ps3.id DESC
         LIMIT 1
       )
      WHERE p.barcode = @barcode
      ORDER BY ps.updated_at DESC
    `);

    const rows = stmt.all({ barcode });
    if (!rows.length) return null;

    const product = {
      barcode: rows[0].barcode,
      name: rows[0].name,
      sources: [],
    };

    for (const r of rows) {
      if (!r.source_name) continue;
      let fields = {};
      try {
        fields = r.extra_fields ? JSON.parse(r.extra_fields) : {};
      } catch {
        fields = {};
      }

      product.sources.push({
        source: r.source_name,
        price: r.price,
        fields,
        source_date: r.source_date || null,
        updated_at: r.updated_at,
      });
    }

    return product;
  }

  return { upsertProduct, getProductWithSourcesByBarcode };
}

module.exports = { createProductRepository };

