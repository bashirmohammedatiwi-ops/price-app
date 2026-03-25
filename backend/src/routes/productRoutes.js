const express = require('express');
const { getDb } = require('../db/sqlite');
const { createProductRepository } = require('../repositories/productRepository');

function productRoutes() {
  const router = express.Router();

  const db = getDb();
  const productRepository = createProductRepository(db);

  router.get('/product/:barcode', (req, res, next) => {
    try {
      const barcode = String(req.params.barcode ?? '').trim();
      if (!barcode) {
        const err = new Error('barcode is required');
        err.statusCode = 400;
        throw err;
      }

      const product = productRepository.getProductWithSourcesByBarcode({ barcode });
      if (!product) {
        res.status(404).json({ error: 'Product not found' });
        return;
      }

      res.json(product);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { productRoutes };

