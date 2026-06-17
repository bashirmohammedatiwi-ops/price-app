const { normalizeProductSourceDateKey } = require('../lib/productSourceDateKey');

function createPurchaseMovementRepository(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO purchase_movements (
      product_id, supplier_name, invoice_number, quantity, unit_price, total_price,
      movement_date, date_key, edari_line_key, updated_at
    )
    VALUES (
      @product_id, @supplier_name, @invoice_number, @quantity, @unit_price, @total_price,
      @movement_date, @date_key, @edari_line_key, strftime('%Y-%m-%d %H:%M:%f','now')
    )
    ON CONFLICT(product_id, edari_line_key) DO UPDATE SET
      supplier_name = excluded.supplier_name,
      invoice_number = excluded.invoice_number,
      quantity = excluded.quantity,
      unit_price = excluded.unit_price,
      total_price = excluded.total_price,
      movement_date = excluded.movement_date,
      date_key = excluded.date_key,
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  const listByProductIdStmt = db.prepare(`
    SELECT
      id,
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

  function upsertMovement({
    product_id,
    supplier_name,
    invoice_number,
    quantity,
    unit_price,
    total_price,
    movement_date,
    edari_line_key,
  }) {
    const dateVal =
      movement_date != null && String(movement_date).trim()
        ? String(movement_date).trim().slice(0, 64)
        : null;
    const dateKey = normalizeProductSourceDateKey(dateVal);
    upsertStmt.run({
      product_id,
      supplier_name: String(supplier_name || '').trim(),
      invoice_number: String(invoice_number || '').trim(),
      quantity: Number(quantity) || 0,
      unit_price: Number(unit_price) || 0,
      total_price: Number(total_price) || 0,
      movement_date: dateVal,
      date_key: dateKey,
      edari_line_key: String(edari_line_key || '').trim(),
    });
  }

  function listByProductId(product_id) {
    return listByProductIdStmt.all({ product_id });
  }

  return { upsertMovement, listByProductId };
}

module.exports = { createPurchaseMovementRepository };
