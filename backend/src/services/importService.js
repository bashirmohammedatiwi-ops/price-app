const { z } = require('zod');

const reservedKeys = new Set(['barcode', 'name', 'price', 'date']);

function normalizeBarcode(value) {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  return s;
}

function normalizeSourceDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel serial date (typical range)
    if (value > 20000 && value < 1200000) {
      const ms = (value - 25569) * 86400 * 1000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const s = String(value).trim();
  if (!s) return null;
  const isoPrefix = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const d = new Date(s.includes(' ') && !s.includes('T') ? s.replace(' ', 'T') : s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.length > 64 ? s.slice(0, 64) : s;
}

function parsePrice(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  let s = String(value).trim();
  if (!s) return null;

  // Handle common formatting:
  // - "1,234.56" -> "1234.56"
  // - "10,5" -> "10.5" (if there's no dot)
  if (s.includes(',') && !s.includes('.')) {
    s = s.replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }

  // Remove currency symbols / whitespace, keep digits, dot, minus.
  s = s.replace(/[^0-9.\-]/g, '');

  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

function buildExtraFields({ mapping, row }) {
  const extra = {};
  for (const systemField of Object.keys(mapping)) {
    if (reservedKeys.has(systemField)) continue;
    const colKey = mapping[systemField];
    const v = row ? row[colKey] : undefined;

    if (v === undefined || v === null) continue;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (!s) continue;

    extra[systemField] = s;
  }
  return extra;
}

function validateAndNormalizeMapping({ mapping }) {
  const MappingSchema = z
    .record(z.string(), z.string().min(1))
    .refine((m) => typeof m.barcode === 'string' && m.barcode.trim().length > 0, {
      message: "mapping must include required field 'barcode'",
    })
    .refine((m) => typeof m.price === 'string' && m.price.trim().length > 0, {
      message: "mapping must include required field 'price'",
    });

  const parsed = MappingSchema.safeParse(mapping);
  if (!parsed.success) {
    // Return first issue message to keep errors clean.
    const msg = parsed.error.issues[0]?.message || 'Invalid mapping';
    const err = new Error(msg);
    err.statusCode = 400;
    throw err;
  }

  return parsed.data;
}

function createImportService({ db, productRepository, productSourcesRepository }) {
  const ImportRowSchema = z.record(z.string(), z.any());

  function importRows({ source_name, mapping, data }) {
    const source = z.string().min(1).parse(source_name);
    if (!Array.isArray(data) || data.length === 0) {
      const err = new Error('data must be a non-empty array');
      err.statusCode = 400;
      throw err;
    }

    const normalizedMapping = validateAndNormalizeMapping({ mapping });

    // Pre-validate that required mapped columns exist in at least one row.
    // (We still validate each row during import.)
    const sample = data[0];
    const requiredBarcodeColKey = normalizedMapping.barcode;
    const requiredPriceColKey = normalizedMapping.price;
    if (!sample || !(requiredBarcodeColKey in sample) || !(requiredPriceColKey in sample)) {
      const err = new Error('One or more required mapped columns are missing in the sample row');
      err.statusCode = 400;
      throw err;
    }

    const productIdExistsStmt = db.prepare(`
      SELECT id FROM products WHERE barcode = @barcode
    `);

    const productSourceExistsStmt = db.prepare(`
      SELECT id FROM product_sources
      WHERE product_id = @product_id AND source_name = @source_name
    `);

    const tx = db.transaction(() => {
      let importedRows = 0;
      let newProducts = 0;
      let existingProducts = 0;
      let newSources = 0;
      let updatedSources = 0;
      // Avoid counting duplicates multiple times for the same barcode/source pair.
      // We still upsert every row so the last row wins for the final stored price/fields.
      const seenProductBarcodes = new Set();
      const seenProductSourcePairs = new Set();

      for (let i = 0; i < data.length; i++) {
        const row = data[i];
        const rowParsed = ImportRowSchema.safeParse(row);
        if (!rowParsed.success) {
          const err = new Error(`Invalid row at index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const barcodeRaw = rowParsed.data[normalizedMapping.barcode];
        const barcode = normalizeBarcode(barcodeRaw);
        if (!barcode) {
          const err = new Error(`Missing/empty barcode at row index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const priceVal = rowParsed.data[normalizedMapping.price];
        const price = parsePrice(priceVal);
        if (price === null) {
          const err = new Error(`Missing/invalid price at row index ${i}`);
          err.statusCode = 400;
          throw err;
        }

        const name =
          normalizedMapping.name && typeof normalizedMapping.name === 'string'
            ? (() => {
                const v = rowParsed.data[normalizedMapping.name];
                if (v === undefined || v === null) return null;
                const s = String(v).trim();
                return s ? s : null;
              })()
            : null;

        const existed = seenProductBarcodes.has(barcode) ? null : productIdExistsStmt.get({ barcode });
        const product = productRepository.upsertProduct({ barcode, name });
        if (!seenProductBarcodes.has(barcode)) {
          if (existed?.id) existingProducts += 1;
          else newProducts += 1;
          seenProductBarcodes.add(barcode);
        }

        const product_id = product.id;

        const extraFields = buildExtraFields({ mapping: normalizedMapping, row: rowParsed.data });
        let sourceDate = null;
        if (normalizedMapping.date && typeof normalizedMapping.date === 'string') {
          const col = normalizedMapping.date;
          sourceDate = normalizeSourceDate(rowParsed.data[col]);
        }
        const pairKey = `${product_id}::${source}`;
        const sourceExisted = seenProductSourcePairs.has(pairKey) ? null : productSourceExistsStmt.get({ product_id, source_name: source });
        productSourcesRepository.upsertProductSource({
          product_id,
          source_name: source,
          price,
          extraFields,
          sourceDate,
        });

        if (!seenProductSourcePairs.has(pairKey)) {
          if (sourceExisted?.id) updatedSources += 1;
          else newSources += 1;
          seenProductSourcePairs.add(pairKey);
        }

        importedRows += 1;
      }

      return {
        imported_rows: importedRows,
        products: { new: newProducts, updated: existingProducts },
        product_sources: { new: newSources, updated: updatedSources },
      };
    });

    return tx();
  }

  return { importRows };
}

module.exports = { createImportService };

