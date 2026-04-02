const express = require('express');
const { z } = require('zod');

const { getDb } = require('../db/sqlite');
const { createProductRepository } = require('../repositories/productRepository');
const { createProductSourcesRepository } = require('../repositories/productSourcesRepository');
const { createMappingTemplateRepository } = require('../repositories/mappingTemplateRepository');
const { createImportService } = require('../services/importService');

function importRoutes() {
  const router = express.Router();

  const db = getDb();
  const productRepository = createProductRepository(db);
  const productSourcesRepository = createProductSourcesRepository(db);
  const mappingTemplateRepository = createMappingTemplateRepository(db);
  const importService = createImportService({ db, productRepository, productSourcesRepository });

  const BodySchema = z.object({
    source: z.string().min(1),
    mapping: z.record(z.string(), z.string().min(1)).optional().nullable(),
    data: z.array(z.record(z.string(), z.any())).min(1),
  });

  router.post('/import', (req, res, next) => {
    try {
      const body = BodySchema.parse(req.body);
      const source_name = body.source;

      let mapping = body.mapping ?? null;
      if (!mapping) {
        const template = mappingTemplateRepository.getBySourceName({ source_name });
        if (!template) {
          const err = new Error('mapping is required when no template exists for this source');
          err.statusCode = 400;
          throw err;
        }
        mapping = template.mapping;
      }

      const result = importService.importRows({
        source_name,
        mapping,
        data: body.data,
      });

      res.json({
        ok: true,
        source: source_name,
        mapping_applied: mapping,
        imported_rows: result.imported_rows,
        products: result.products,
        product_sources: result.product_sources,
        rows_received: body.data.length,
        rows_imported: result.imported_rows,
        products_created: result.products?.new || 0,
        products_updated: result.products?.updated || 0,
        source_rows_created: result.product_sources?.new || 0,
        source_rows_updated: result.product_sources?.updated || 0,
        ignored_rows: 0,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { importRoutes };

