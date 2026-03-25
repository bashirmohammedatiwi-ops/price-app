const express = require('express');
const { z } = require('zod');

const { getDb } = require('../db/sqlite');
const { createMappingTemplateRepository } = require('../repositories/mappingTemplateRepository');

function mappingTemplateRoutes() {
  const router = express.Router();
  const db = getDb();
  const mappingTemplateRepository = createMappingTemplateRepository(db);

  const UpsertSchema = z.object({
    source_name: z.string().min(1).optional(),
    source: z.string().min(1).optional(),
    mapping: z.record(z.string(), z.any()).optional(),
    mapping_json: z.string().optional(),
  });

  router.post('/mapping-templates', (req, res, next) => {
    try {
      const body = UpsertSchema.parse(req.body ?? {});
      const source_name = body.source_name ?? body.source;
      if (!source_name) {
        const err = new Error('source_name is required');
        err.statusCode = 400;
        throw err;
      }

      let mapping = body.mapping;
      if (!mapping && body.mapping_json) {
        mapping = JSON.parse(body.mapping_json);
      }
      if (!mapping) mapping = {};

      mappingTemplateRepository.upsertTemplate({ source_name, mapping });
      res.json({ ok: true, source_name, mapping });
    } catch (err) {
      next(err);
    }
  });

  router.put('/mapping-templates/:source_name', (req, res, next) => {
    try {
      const source_name = String(req.params.source_name ?? '').trim();
      if (!source_name) {
        const err = new Error('source_name is required');
        err.statusCode = 400;
        throw err;
      }

      const body = req.body ?? {};
      const mapping = body.mapping ?? body.mapping_json ?? {};
      let normalizedMapping = mapping;
      if (typeof normalizedMapping === 'string') {
        normalizedMapping = JSON.parse(normalizedMapping);
      }
      if (!normalizedMapping || typeof normalizedMapping !== 'object') {
        const err = new Error('mapping must be an object');
        err.statusCode = 400;
        throw err;
      }

      mappingTemplateRepository.upsertTemplate({ source_name, mapping: normalizedMapping });
      res.json({ ok: true, source_name, mapping: normalizedMapping });
    } catch (err) {
      next(err);
    }
  });

  router.get('/mapping-templates/:source_name', (req, res, next) => {
    try {
      const source_name = String(req.params.source_name ?? '').trim();
      if (!source_name) {
        const err = new Error('source_name is required');
        err.statusCode = 400;
        throw err;
      }

      const tpl = mappingTemplateRepository.getBySourceName({ source_name });
      if (!tpl) {
        res.status(404).json({ error: 'Mapping template not found' });
        return;
      }
      res.json({ ok: true, ...tpl });
    } catch (err) {
      next(err);
    }
  });

  // List all templates (for desktop dropdown).
  router.get('/mapping-templates', (_req, res) => {
    try {
      const list = mappingTemplateRepository.listAll();
      res.json({ ok: true, templates: list });
    } catch (err) {
      res.status(500).json({ error: 'Failed to list templates' });
    }
  });

  return router;
}

module.exports = { mappingTemplateRoutes };

