const { z } = require('zod');
const { pricingFromSyncItem, resolveStoredPricing } = require('../lib/posPricing');

function normalizeBarcode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function createPosSyncService({ db, productRepository }) {
  const ItemSchema = z.object({
    barcode: z.string().min(1),
    productCode: z.union([z.string(), z.number()]).optional().nullable(),
    productNum: z.union([z.string(), z.number()]).optional().nullable(),
    name: z.string().optional().nullable(),
    price: z.union([z.number(), z.string()]).optional().nullable(),
    originalPrice: z.union([z.number(), z.string()]).optional().nullable(),
    discountPercent: z.union([z.number(), z.string()]).optional().nullable(),
    discountValue: z.union([z.number(), z.string()]).optional().nullable(),
    discountType: z.union([z.number(), z.string()]).optional().nullable(),
    stock: z.union([z.number(), z.string()]).optional().nullable(),
    offerName: z.string().optional().nullable(),
  });

  const selectExistingStmt = db.prepare(`
    SELECT original_price, final_price, discount_percent, discount_value,
           discount_type, offer_name, consumer_price
    FROM products
    WHERE barcode = @barcode
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO products (
      barcode, name, original_price, final_price, discount_percent,
      discount_value, discount_type, offer_name, pos_stock, pos_synced_at,
      consumer_price, created_at, updated_at
    ) VALUES (
      @barcode, @name, @original_price, @final_price, @discount_percent,
      @discount_value, @discount_type, @offer_name, @pos_stock, @pos_synced_at,
      @consumer_price, strftime('%Y-%m-%d %H:%M:%f','now'), strftime('%Y-%m-%d %H:%M:%f','now')
    )
    ON CONFLICT(barcode) DO UPDATE SET
      name = COALESCE(products.name, excluded.name),
      original_price = CASE
        WHEN excluded.original_price > 0 THEN excluded.original_price
        ELSE products.original_price
      END,
      final_price = CASE
        WHEN excluded.final_price > 0 THEN excluded.final_price
        WHEN products.final_price > 0 THEN products.final_price
        ELSE excluded.final_price
      END,
      discount_percent = COALESCE(excluded.discount_percent, products.discount_percent),
      discount_value = COALESCE(excluded.discount_value, products.discount_value),
      discount_type = COALESCE(excluded.discount_type, products.discount_type),
      offer_name = COALESCE(excluded.offer_name, products.offer_name),
      pos_stock = excluded.pos_stock,
      pos_synced_at = excluded.pos_synced_at,
      consumer_price = CASE
        WHEN excluded.final_price > 0 THEN excluded.final_price
        WHEN excluded.consumer_price > 0 THEN excluded.consumer_price
        ELSE products.consumer_price
      END,
      updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
  `);

  function syncItems(items = []) {
    if (!Array.isArray(items) || !items.length) {
      const err = new Error('items array is required');
      err.statusCode = 400;
      throw err;
    }

    const now = new Date().toISOString();
    let synced = 0;

    const tx = db.transaction(() => {
      for (let i = 0; i < items.length; i++) {
        const parsed = ItemSchema.safeParse(items[i]);
        if (!parsed.success) {
          const err = new Error(`Invalid item at index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const barcode = normalizeBarcode(parsed.data.barcode);
        if (!barcode) continue;

        let pricing = pricingFromSyncItem({
          originalPrice: parsed.data.originalPrice,
          price: parsed.data.price,
          discountPercent: parsed.data.discountPercent,
          discountValue: parsed.data.discountValue,
          discountType: parsed.data.discountType,
          offerName: parsed.data.offerName,
        });

        const existing = selectExistingStmt.get({ barcode });
        if (existing) {
          pricing = resolveStoredPricing({
            original_price: pricing.originalPrice || existing.original_price,
            final_price: pricing.finalPrice || existing.final_price || existing.consumer_price,
            consumer_price: pricing.finalPrice || existing.consumer_price,
            discount_percent: pricing.discountPercent ?? existing.discount_percent,
            discount_value: pricing.discountValue ?? existing.discount_value,
            discount_type: pricing.discountType ?? existing.discount_type,
            offer_name: pricing.offerName || existing.offer_name,
          });
        }

        const posName =
          parsed.data.name != null && String(parsed.data.name).trim()
            ? String(parsed.data.name).trim()
            : null;

        upsertStmt.run({
          barcode,
          name: posName,
          original_price: pricing.originalPrice,
          final_price: pricing.finalPrice,
          discount_percent: pricing.discountPercent,
          discount_value: pricing.discountValue,
          discount_type: pricing.discountType,
          offer_name:
            parsed.data.offerName != null && String(parsed.data.offerName).trim()
              ? String(parsed.data.offerName).trim()
              : pricing.offerName,
          pos_stock: Math.max(0, Math.round(Number(parsed.data.stock) || 0)),
          pos_synced_at: now,
          consumer_price: pricing.finalPrice,
        });

        synced += 1;
      }
    });

    tx();

    return {
      ok: true,
      synced,
      failed: Math.max(0, items.length - synced),
      data: { synced, failed: Math.max(0, items.length - synced) },
    };
  }

  return { syncItems };
}

module.exports = { createPosSyncService };
