function columnExists(db, table, name) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all();
  return rows.some((r) => r.name === name);
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS product_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      price REAL NOT NULL,
      extra_fields TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(product_id, source_name),
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_product_sources_source
      ON product_sources(source_name);

    CREATE TABLE IF NOT EXISTS mapping_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL UNIQUE,
      mapping_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  if (!columnExists(db, 'product_sources', 'purchase_date')) {
    db.exec(`ALTER TABLE product_sources ADD COLUMN purchase_date TEXT`);
  }
  if (!columnExists(db, 'product_sources', 'price_history')) {
    db.exec(`ALTER TABLE product_sources ADD COLUMN price_history TEXT`);
  }
}

module.exports = { migrate };

