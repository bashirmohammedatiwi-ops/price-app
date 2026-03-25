const express = require('express');
const cors = require('cors');

const { importRoutes } = require('./routes/importRoutes');
const { productRoutes } = require('./routes/productRoutes');
const { mappingTemplateRoutes } = require('./routes/mappingTemplateRoutes');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use(importRoutes());
  app.use(productRoutes());
  app.use(mappingTemplateRoutes());

  // Fallback error handler (kept last).
  app.use((err, _req, res, _next) => {
    // eslint-disable-next-line no-console
    console.error('[price-backend] unhandled error', err);

    if (err?.name === 'ZodError') {
      res.status(400).json({
        error: 'Validation error',
        issues: err.issues ?? [],
      });
      return;
    }

    res.status(err?.statusCode || 500).json({
      error: err?.message || 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };

