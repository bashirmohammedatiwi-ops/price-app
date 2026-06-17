function createProductRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO products (barcode, name, created_at, updated_at)
    VALUES (@barcode, @name, strftime('%Y-%m-%d %H:%M:%f','now'), strftime('%Y-%m-%d %H:%M:%f','now'))
    ON CONFLICT(barcode) DO UPDATE SET
      name = COALESCE(excluded.name, products.name),
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  const selectIdStmt = db.prepare(`
    SELECT id, name, consumer_price, updated_at
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
    const productRow = db.prepare(`
      SELECT id, barcode, name, consumer_price, stock_balance
      FROM products
      WHERE barcode = @barcode
    `).get({ barcode });

    if (!productRow) return null;

    const sourceStmt = db.prepare(`
      SELECT
        ps.source_name AS source_name,
        ps.price AS price,
        ps.extra_fields AS extra_fields,
        ps.source_date AS source_date,
        ps.updated_at AS updated_at,
        ps.id AS source_row_id
      FROM product_sources ps
      WHERE ps.product_id = @product_id
      ORDER BY ps.source_name ASC,
        CASE WHEN IFNULL(ps.date_key, '') = '' THEN 1 ELSE 0 END ASC,
        ps.date_key DESC,
        ps.updated_at DESC
    `);

    const movementStmt = db.prepare(`
      SELECT
        supplier_name AS supplier,
        invoice_number AS invoice,
        quantity,
        unit_price,
        total_price,
        movement_date,
        updated_at
      FROM purchase_movements
      WHERE product_id = @product_id
      ORDER BY
        CASE WHEN IFNULL(date_key, '') = '' THEN 1 ELSE 0 END ASC,
        date_key DESC,
        id DESC
    `);

    const rows = sourceStmt.all({ product_id: productRow.id });
    const movements = movementStmt.all({ product_id: productRow.id });

    const product = {
      barcode: productRow.barcode,
      name: productRow.name,
      consumer_price:
        productRow.consumer_price != null && Number.isFinite(Number(productRow.consumer_price))
          ? Number(productRow.consumer_price)
          : null,
      stock_balance:
        productRow.stock_balance != null && Number.isFinite(Number(productRow.stock_balance))
          ? Number(productRow.stock_balance)
          : null,
      sources: [],
      movements: movements.map((m) => ({
        supplier: m.supplier || '',
        invoice: m.invoice || '',
        quantity: Number(m.quantity || 0),
        unit_price: Number(m.unit_price || 0),
        total_price: Number(m.total_price || 0),
        date: m.movement_date || null,
        updated_at: m.updated_at,
      })),
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
        source_row_id: r.source_row_id,
      });
    }

    return product;
  }

  return { upsertProduct, getProductWithSourcesByBarcode };
}

module.exports = { createProductRepository };

