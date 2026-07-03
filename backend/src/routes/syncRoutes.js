const express = require('express');
const { getDb } = require('../db/sqlite');
const { createProductRepository } = require('../repositories/productRepository');
const { createPurchaseMovementRepository } = require('../repositories/purchaseMovementRepository');
const { createEdariSyncService } = require('../services/edariSyncService');
const { createPosSyncService } = require('../services/posSyncService');

function assertSyncKey(req) {
  const expected = String(process.env.PRICE_SYNC_KEY || '').trim();
  if (!expected) return;
  const provided = String(req.get('x-sync-key') || req.get('X-Sync-Key') || '').trim();
  if (provided !== expected) {
    const err = new Error('Invalid sync key');
    err.statusCode = 401;
    throw err;
  }
}

function syncRoutes() {
  const router = express.Router();
  const db = getDb();
  const productRepository = createProductRepository(db);
  const purchaseMovementRepository = createPurchaseMovementRepository(db);
  const edariSyncService = createEdariSyncService({
    db,
    productRepository,
    purchaseMovementRepository,
  });
  const posSyncService = createPosSyncService({ db, productRepository });

  router.get('/sync/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'price-sync',
      pricingSource: 'pos',
      detailsSource: 'edari',
    });
  });

  router.post('/sync/edari', (req, res, next) => {
    try {
      assertSyncKey(req);
      const result = edariSyncService.syncPayload(req.body || {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  /** pos-sync-desktop compatibility */
  router.post('/sync/inventory/bulk', (req, res, next) => {
    try {
      assertSyncKey(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const result = posSyncService.syncItems(items);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/sync/pos/bulk', (req, res, next) => {
    try {
      assertSyncKey(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const result = posSyncService.syncItems(items);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { syncRoutes };
