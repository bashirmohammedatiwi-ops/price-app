const express = require('express');
const { z } = require('zod');

const { getDb } = require('../db/sqlite');
const {
  sortPriceHistoryDesc,
  latestCalendarDateFromHistory,
  parseHistoryJson,
} = require('../utils/priceHistory');

function adminRoutes() {
  const router = express.Router();
  const db = getDb();

  const updateGroupSchema = z.object({
    new_source_name: z.string().min(1),
  });

  const updateGroupProductSchema = z.object({
    name: z.string().trim().optional().nullable(),
    price: z.coerce.number().finite().positive(),
    fields: z.record(z.string(), z.any()).optional().nullable(),
  });

  const updateProductSchema = z.object({
    name: z.string().trim().optional().nullable(),
  });

  router.get('/admin/groups', (req, res, next) => {
    try {
      const searchRaw = String(req.query.search || '').trim().toLowerCase();
      const params = {};
      const where = searchRaw ? 'WHERE LOWER(ps.source_name) LIKE @q' : '';
      if (searchRaw) params.q = `%${searchRaw}%`;

      const rows = db
        .prepare(
          `
          SELECT
            ps.source_name,
            COUNT(*) AS source_rows_count,
            COUNT(DISTINCT ps.product_id) AS products_count,
            MAX(ps.updated_at) AS last_updated_at
          FROM product_sources ps
          ${where}
          GROUP BY ps.source_name
          ORDER BY MAX(ps.updated_at) DESC, ps.source_name ASC
          `,
        )
        .all(params);

      const templates = db.prepare('SELECT source_name FROM mapping_templates').all();
      const templateSet = new Set(templates.map((r) => r.source_name));

      res.json({
        ok: true,
        groups: rows.map((r) => ({
          source_name: r.source_name,
          source_rows_count: Number(r.source_rows_count || 0),
          products_count: Number(r.products_count || 0),
          has_template: templateSet.has(r.source_name),
          last_updated_at: r.last_updated_at || null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/groups/:sourceName/products', (req, res, next) => {
    try {
      const sourceName = String(req.params.sourceName || '').trim();
      if (!sourceName) {
        const err = new Error('sourceName is required');
        err.statusCode = 400;
        throw err;
      }

      const searchRaw = String(req.query.search || '').trim().toLowerCase();
      const params = { source_name: sourceName };
      let searchSql = '';
      if (searchRaw) {
        params.q = `%${searchRaw}%`;
        searchSql = `
          AND (
            LOWER(p.barcode) LIKE @q
            OR LOWER(COALESCE(p.name, '')) LIKE @q
          )
        `;
      }

      const rows = db
        .prepare(
          `
          SELECT
            p.barcode,
            p.name,
            ps.price,
            ps.extra_fields,
            ps.updated_at,
            ps.purchase_date,
            ps.price_history
          FROM product_sources ps
          INNER JOIN products p
            ON p.id = ps.product_id
          WHERE ps.source_name = @source_name
            AND ps.id = (
              SELECT ps3.id
              FROM product_sources ps3
              WHERE ps3.product_id = ps.product_id
                AND ps3.source_name = ps.source_name
              ORDER BY ps3.updated_at DESC, ps3.id DESC
              LIMIT 1
            )
          ${searchSql}
          ORDER BY ps.updated_at DESC, p.barcode ASC
          `,
        )
        .all(params);

      const products = rows.map((r) => {
        let fields = {};
        try {
          fields = r.extra_fields ? JSON.parse(r.extra_fields) : {};
        } catch {
          fields = {};
        }
        const priceHistory = parseHistoryJson(r.price_history);
        return {
          barcode: r.barcode,
          name: r.name,
          price: Number(r.price),
          fields,
          updated_at: r.updated_at,
          purchase_date: r.purchase_date || null,
          price_history: priceHistory,
        };
      });

      res.json({
        ok: true,
        source_name: sourceName,
        products_count: products.length,
        products,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/groups/:sourceName', (req, res, next) => {
    try {
      const sourceName = String(req.params.sourceName || '').trim();
      if (!sourceName) {
        const err = new Error('sourceName is required');
        err.statusCode = 400;
        throw err;
      }
      const { new_source_name } = updateGroupSchema.parse(req.body || {});
      const targetName = String(new_source_name || '').trim();
      if (!targetName) {
        const err = new Error('new_source_name is required');
        err.statusCode = 400;
        throw err;
      }
      if (sourceName === targetName) {
        res.json({ ok: true, source_name: sourceName, renamed_to: targetName, changed: false });
        return;
      }

      const tx = db.transaction(() => {
        const srcExists = db
          .prepare('SELECT COUNT(*) AS c FROM product_sources WHERE source_name = @source_name')
          .get({ source_name: sourceName });
        if (!srcExists?.c) {
          const err = new Error('المجموعة غير موجودة');
          err.statusCode = 404;
          throw err;
        }

        const targetExists = db
          .prepare('SELECT COUNT(*) AS c FROM product_sources WHERE source_name = @source_name')
          .get({ source_name: targetName });
        if (targetExists?.c) {
          const err = new Error('اسم المجموعة الجديد مستخدم بالفعل');
          err.statusCode = 409;
          throw err;
        }

        const updateSources = db
          .prepare(
            `
            UPDATE product_sources
            SET source_name = @target, updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
            WHERE source_name = @source
            `,
          )
          .run({ source: sourceName, target: targetName });

        db.prepare('UPDATE mapping_templates SET source_name = @target WHERE source_name = @source').run({
          source: sourceName,
          target: targetName,
        });

        return updateSources.changes;
      });

      const changedRows = tx();
      res.json({
        ok: true,
        source_name: sourceName,
        renamed_to: targetName,
        changed: true,
        source_rows_updated: Number(changedRows || 0),
      });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/groups/:sourceName', (req, res, next) => {
    try {
      const sourceName = String(req.params.sourceName || '').trim();
      if (!sourceName) {
        const err = new Error('sourceName is required');
        err.statusCode = 400;
        throw err;
      }
      const removeOrphans = String(req.query.remove_orphans || '1') !== '0';

      const tx = db.transaction(() => {
        const sourceRows = db
          .prepare('SELECT product_id FROM product_sources WHERE source_name = @source_name')
          .all({ source_name: sourceName });
        if (!sourceRows.length) {
          const err = new Error('المجموعة غير موجودة');
          err.statusCode = 404;
          throw err;
        }

        const sourceProductIds = sourceRows.map((r) => r.product_id);
        const deletedSourceRows = db
          .prepare('DELETE FROM product_sources WHERE source_name = @source_name')
          .run({ source_name: sourceName }).changes;

        db.prepare('DELETE FROM mapping_templates WHERE source_name = @source_name').run({ source_name: sourceName });

        let deletedProducts = 0;
        if (removeOrphans) {
          const deleteOrphanStmt = db.prepare(
            `
            DELETE FROM products
            WHERE id = @id
              AND NOT EXISTS (
                SELECT 1 FROM product_sources ps WHERE ps.product_id = products.id
              )
            `,
          );
          for (const id of sourceProductIds) {
            deletedProducts += deleteOrphanStmt.run({ id }).changes;
          }
        }

        return {
          deleted_source_rows: Number(deletedSourceRows || 0),
          deleted_orphan_products: Number(deletedProducts || 0),
        };
      });

      const result = tx();
      res.json({
        ok: true,
        source_name: sourceName,
        ...result,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/groups/:sourceName/products/:barcode', (req, res, next) => {
    try {
      const sourceName = String(req.params.sourceName || '').trim();
      const barcode = String(req.params.barcode || '').trim();
      if (!sourceName || !barcode) {
        const err = new Error('sourceName and barcode are required');
        err.statusCode = 400;
        throw err;
      }

      const body = updateGroupProductSchema.parse(req.body || {});
      const fieldsJson = body.fields && Object.keys(body.fields).length ? JSON.stringify(body.fields) : null;
      const safeName = body.name && String(body.name).trim() ? String(body.name).trim() : null;

      const tx = db.transaction(() => {
        const product = db.prepare('SELECT id FROM products WHERE barcode = @barcode').get({ barcode });
        if (!product) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }

        const sourceRow = db
          .prepare(
            `
            SELECT id, price, purchase_date, price_history, updated_at
            FROM product_sources
            WHERE product_id = @product_id AND source_name = @source_name
            `,
          )
          .get({ product_id: product.id, source_name: sourceName });
        if (!sourceRow) {
          const err = new Error('المنتج غير موجود داخل هذه المجموعة');
          err.statusCode = 404;
          throw err;
        }

        if (safeName !== null) {
          db.prepare('UPDATE products SET name = @name, updated_at = strftime(\'%Y-%m-%d %H:%M:%f\',\'now\') WHERE id = @id').run({
            id: product.id,
            name: safeName,
          });
        }

        let history = parseHistoryJson(sourceRow.price_history);
        if (!history.length) {
          history.push({
            date: sourceRow.purchase_date || null,
            price: Number(sourceRow.price),
            recorded_at: sourceRow.updated_at || new Date().toISOString(),
          });
        }
        const prevPrice = Number(sourceRow.price);
        const newPrice = Number(body.price);
        if (prevPrice !== newPrice) {
          history.push({
            date: null,
            price: newPrice,
            recorded_at: new Date().toISOString(),
          });
        }
        history = sortPriceHistoryDesc(history);
        const purchaseDateStored = latestCalendarDateFromHistory(history);

        db.prepare(
          `
          UPDATE product_sources
          SET price = @price,
              extra_fields = @extra_fields,
              purchase_date = @purchase_date,
              price_history = @price_history,
              updated_at = strftime('%Y-%m-%d %H:%M:%f','now')
          WHERE id = @id
          `,
        ).run({
          id: sourceRow.id,
          price: body.price,
          extra_fields: fieldsJson,
          purchase_date: purchaseDateStored,
          price_history: JSON.stringify(history),
        });
      });

      tx();
      res.json({ ok: true, source_name: sourceName, barcode });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/groups/:sourceName/products/:barcode', (req, res, next) => {
    try {
      const sourceName = String(req.params.sourceName || '').trim();
      const barcode = String(req.params.barcode || '').trim();
      if (!sourceName || !barcode) {
        const err = new Error('sourceName and barcode are required');
        err.statusCode = 400;
        throw err;
      }
      const removeOrphan = String(req.query.remove_orphan || '1') !== '0';

      const tx = db.transaction(() => {
        const product = db.prepare('SELECT id FROM products WHERE barcode = @barcode').get({ barcode });
        if (!product) {
          const err = new Error('المنتج غير موجود');
          err.statusCode = 404;
          throw err;
        }

        const deleted = db
          .prepare('DELETE FROM product_sources WHERE product_id = @product_id AND source_name = @source_name')
          .run({ product_id: product.id, source_name: sourceName }).changes;
        if (!deleted) {
          const err = new Error('المنتج غير موجود داخل هذه المجموعة');
          err.statusCode = 404;
          throw err;
        }

        let deletedProduct = 0;
        if (removeOrphan) {
          deletedProduct = db
            .prepare(
              `
              DELETE FROM products
              WHERE id = @id
                AND NOT EXISTS (
                  SELECT 1 FROM product_sources ps WHERE ps.product_id = products.id
                )
              `,
            )
            .run({ id: product.id }).changes;
        }
        return { deleted_source_rows: deleted, deleted_orphan_product: deletedProduct };
      });

      const result = tx();
      res.json({ ok: true, source_name: sourceName, barcode, ...result });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/products', (req, res, next) => {
    try {
      const searchRaw = String(req.query.search || '').trim().toLowerCase();
      const params = {};
      let where = '';
      if (searchRaw) {
        where = `
          WHERE (
            LOWER(p.barcode) LIKE @q
            OR LOWER(COALESCE(p.name, '')) LIKE @q
          )
        `;
        params.q = `%${searchRaw}%`;
      }

      const rows = db
        .prepare(
          `
          SELECT
            p.barcode,
            p.name,
            p.updated_at,
            COUNT(ps.id) AS groups_count,
            MIN(ps.price) AS min_price,
            MAX(ps.price) AS max_price
          FROM products p
          LEFT JOIN product_sources ps
            ON ps.product_id = p.id
          ${where}
          GROUP BY p.id
          ORDER BY p.updated_at DESC, p.barcode ASC
          LIMIT 300
          `,
        )
        .all(params);

      res.json({
        ok: true,
        products: rows.map((r) => ({
          barcode: r.barcode,
          name: r.name,
          updated_at: r.updated_at,
          groups_count: Number(r.groups_count || 0),
          min_price: r.min_price === null ? null : Number(r.min_price),
          max_price: r.max_price === null ? null : Number(r.max_price),
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/products/:barcode', (req, res, next) => {
    try {
      const barcode = String(req.params.barcode || '').trim();
      if (!barcode) {
        const err = new Error('barcode is required');
        err.statusCode = 400;
        throw err;
      }
      const body = updateProductSchema.parse(req.body || {});
      const safeName = body.name && String(body.name).trim() ? String(body.name).trim() : null;

      const result = db
        .prepare('UPDATE products SET name = @name, updated_at = datetime(\'now\') WHERE barcode = @barcode')
        .run({ barcode, name: safeName });

      if (!result.changes) {
        const err = new Error('المنتج غير موجود');
        err.statusCode = 404;
        throw err;
      }

      res.json({ ok: true, barcode, name: safeName });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/admin/products/:barcode', (req, res, next) => {
    try {
      const barcode = String(req.params.barcode || '').trim();
      if (!barcode) {
        const err = new Error('barcode is required');
        err.statusCode = 400;
        throw err;
      }

      const result = db.prepare('DELETE FROM products WHERE barcode = @barcode').run({ barcode });
      if (!result.changes) {
        const err = new Error('المنتج غير موجود');
        err.statusCode = 404;
        throw err;
      }

      res.json({ ok: true, barcode, deleted: true });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { adminRoutes };
