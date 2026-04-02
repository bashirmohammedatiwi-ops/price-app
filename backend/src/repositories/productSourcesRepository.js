const { sortPriceHistoryDesc, latestCalendarDateFromHistory } = require('../utils/priceHistory');

function createProductSourcesRepository(db) {
  const selectStmt = db.prepare(`
    SELECT id, price, purchase_date, price_history, updated_at, extra_fields
    FROM product_sources
    WHERE product_id = @product_id AND source_name = @source_name
  `);

  const insertStmt = db.prepare(`
    INSERT INTO product_sources (product_id, source_name, price, extra_fields, updated_at, purchase_date, price_history)
    VALUES (
      @product_id,
      @source_name,
      @price,
      @extra_fields,
      strftime('%Y-%m-%d %H:%M:%f','now'),
      @purchase_date,
      @price_history
    )
  `);

  const updateStmt = db.prepare(`
    UPDATE product_sources
    SET price = @price,
        extra_fields = COALESCE(@extra_fields, extra_fields),
        purchase_date = @purchase_date,
        price_history = @price_history,
        updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
    WHERE id = @id
  `);

  function upsertProductSource({ product_id, source_name, price, extraFields, purchaseDate }) {
    const extra = extraFields && Object.keys(extraFields).length ? JSON.stringify(extraFields) : null;
    const p = Number(price);
    if (!Number.isFinite(p)) {
      throw new Error('invalid price');
    }
    const dateNorm = purchaseDate && String(purchaseDate).trim() ? String(purchaseDate).trim().slice(0, 40) : null;
    const recordedAt = new Date().toISOString();
    const entry = { date: dateNorm, price: p, recorded_at: recordedAt };

    const tx = db.transaction(() => {
      const existing = selectStmt.get({ product_id, source_name });

      let history = [];
      if (existing?.price_history) {
        try {
          history = JSON.parse(existing.price_history);
        } catch {
          history = [];
        }
      }
      if (!Array.isArray(history)) history = [];

      if (history.length === 0 && existing) {
        history.push({
          date: existing.purchase_date || null,
          price: Number(existing.price),
          recorded_at: existing.updated_at || recordedAt,
        });
      }

      const last = history[history.length - 1];
      if (!last || last.date !== entry.date || last.price !== entry.price) {
        history.push(entry);
      }

      history = sortPriceHistoryDesc(history);
      const calLatest = latestCalendarDateFromHistory(history);
      const purchaseDateStored = calLatest ?? dateNorm ?? existing?.purchase_date ?? null;
      const historyJson = JSON.stringify(history);

      if (existing) {
        updateStmt.run({
          id: existing.id,
          price: p,
          extra_fields: extra,
          purchase_date: purchaseDateStored,
          price_history: historyJson,
        });
      } else {
        const cal = latestCalendarDateFromHistory(sortPriceHistoryDesc([entry]));
        insertStmt.run({
          product_id,
          source_name,
          price: p,
          extra_fields: extra,
          purchase_date: cal ?? dateNorm,
          price_history: JSON.stringify(sortPriceHistoryDesc([entry])),
        });
      }
    });

    tx();
  }

  return { upsertProductSource };
}

module.exports = { createProductSourcesRepository };
