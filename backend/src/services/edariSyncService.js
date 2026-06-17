const { z } = require('zod');

function normalizeBarcode(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  if (!s) return null;
  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.length > 64 ? s.slice(0, 64) : s;
}

function parseNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createEdariSyncService({ db, productRepository, purchaseMovementRepository }) {
  const ProductSchema = z.object({
    barcode: z.string().min(1),
    name: z.string().optional().nullable(),
    consumer_price: z.union([z.number(), z.string()]).optional().nullable(),
    stock_balance: z.union([z.number(), z.string()]).optional().nullable(),
  });

  const MovementSchema = z.object({
    barcode: z.string().min(1),
    supplier: z.string().optional().nullable(),
    invoice: z.union([z.string(), z.number()]).optional().nullable(),
    quantity: z.union([z.number(), z.string()]).optional().nullable(),
    unit_price: z.union([z.number(), z.string()]).optional().nullable(),
    total_price: z.union([z.number(), z.string()]).optional().nullable(),
    date: z.union([z.string(), z.number()]).optional().nullable(),
    edari_key: z.string().optional().nullable(),
  });

  const updateConsumerPriceStmt = db.prepare(`
    UPDATE products
    SET consumer_price = @consumer_price,
        name = COALESCE(@name, name),
        updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
    WHERE id = @id
  `);

  const updateStockBalanceStmt = db.prepare(`
    UPDATE products
    SET stock_balance = @stock_balance,
        name = COALESCE(@name, name),
        updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
    WHERE id = @id
  `);

  function syncPayload({ products = [], movements = [] }) {
    if (!Array.isArray(products)) products = [];
    if (!Array.isArray(movements)) movements = [];
    if (!products.length && !movements.length) {
      const err = new Error('products or movements array is required');
      err.statusCode = 400;
      throw err;
    }

    let productsUpserted = 0;
    let consumerPricesUpdated = 0;
    let stockBalancesUpdated = 0;
    let movementsUpserted = 0;
    const barcodeToId = new Map();

    const tx = db.transaction(() => {
      for (let i = 0; i < products.length; i++) {
        const parsed = ProductSchema.safeParse(products[i]);
        if (!parsed.success) {
          const err = new Error(`Invalid product at index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const barcode = normalizeBarcode(parsed.data.barcode);
        if (!barcode) continue;

        const name =
          parsed.data.name != null && String(parsed.data.name).trim()
            ? String(parsed.data.name).trim()
            : null;
        const consumerPrice = parseNumber(parsed.data.consumer_price, NaN);
        const stockBalance = parseNumber(parsed.data.stock_balance, NaN);

        const existing = productRepository.upsertProduct({ barcode, name });
        barcodeToId.set(barcode, existing.id);
        productsUpserted += 1;

        if (Number.isFinite(consumerPrice) && consumerPrice > 0) {
          updateConsumerPriceStmt.run({
            id: existing.id,
            consumer_price: consumerPrice,
            name,
          });
          consumerPricesUpdated += 1;
        }

        if (parsed.data.stock_balance != null && Number.isFinite(stockBalance)) {
          updateStockBalanceStmt.run({
            id: existing.id,
            stock_balance: stockBalance,
            name,
          });
          stockBalancesUpdated += 1;
        }
      }

      for (let i = 0; i < movements.length; i++) {
        const parsed = MovementSchema.safeParse(movements[i]);
        if (!parsed.success) {
          const err = new Error(`Invalid movement at index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const barcode = normalizeBarcode(parsed.data.barcode);
        if (!barcode) continue;

        let productId = barcodeToId.get(barcode);
        if (!productId) {
          const product = productRepository.upsertProduct({ barcode, name: null });
          productId = product.id;
          barcodeToId.set(barcode, productId);
          productsUpserted += 1;
        }

        const quantity = parseNumber(parsed.data.quantity, 0);
        const unitPrice = parseNumber(parsed.data.unit_price, 0);
        let totalPrice = parseNumber(parsed.data.total_price, 0);
        if (!totalPrice && quantity && unitPrice) totalPrice = quantity * unitPrice;

        const edariKey =
          parsed.data.edari_key != null && String(parsed.data.edari_key).trim()
            ? String(parsed.data.edari_key).trim()
            : `${barcode}|${parsed.data.invoice ?? ''}|${normalizeDate(parsed.data.date) ?? ''}|${unitPrice}|${quantity}`;

        purchaseMovementRepository.upsertMovement({
          product_id: productId,
          supplier_name: parsed.data.supplier || '',
          invoice_number: parsed.data.invoice != null ? String(parsed.data.invoice) : '',
          quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
          movement_date: normalizeDate(parsed.data.date),
          edari_line_key: edariKey,
        });
        movementsUpserted += 1;
      }
    });

    tx();

    return {
      ok: true,
      products_upserted: productsUpserted,
      consumer_prices_updated: consumerPricesUpdated,
      stock_balances_updated: stockBalancesUpdated,
      movements_upserted: movementsUpserted,
    };
  }

  return { syncPayload };
}

module.exports = { createEdariSyncService };
