const dotenv = require('dotenv');
const { createApp } = require('./app');
const { migrate } = require('./db/migrations');
const { getDb } = require('./db/sqlite');

dotenv.config();

async function main() {
  const db = getDb();
  migrate(db);

  const app = createApp();

  const host = process.env.HOST || '0.0.0.0';
  const port = process.env.PORT ? Number(process.env.PORT) : 5000;
  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`[price-backend] listening on http://${host}:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[price-backend] failed to start', err);
  process.exit(1);
});

