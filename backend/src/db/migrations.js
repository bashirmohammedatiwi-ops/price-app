function migrateProductSourcesMultidate(db) {
  db.exec(`
    CREATE TABLE product_sources__new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      source_name TEXT NOT NULL,
      price REAL NOT NULL,
      extra_fields TEXT,
      source_date TEXT,
      date_key TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, source_name, date_key)
    );
  `);

  const oldRows = db.prepare('SELECT * FROM product_sources').all();
  const ins = db.prepare(`
    INSERT INTO product_sources__new (id, product_id, source_name, price, extra_fields, source_date, date_key, updated_at)
    VALUES (@id, @product_id, @source_name, @price, @extra_fields, @source_date, @date_key, @updated_at)
  `);

  for (const r of oldRows) {
    const sd = r.source_date != null && String(r.source_date).trim() ? String(r.source_date).trim() : null;
    const dk = sd ? sd.slice(0, 64) : '';
    ins.run({
      id: r.id,
      product_id: r.product_id,
      source_name: r.source_name,
      price: r.price,
      extra_fields: r.extra_fields,
      source_date: sd,
      date_key: dk,
      updated_at: r.updated_at,
    });
  }

  db.exec('DROP TABLE product_sources; ALTER TABLE product_sources__new RENAME TO product_sources;');
  db.exec('CREATE INDEX IF NOT EXISTS idx_product_sources_source ON product_sources(source_name);');
}

function migrateProductsConsumerPrice(db) {
  const names = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
  if (!names.includes('consumer_price')) {
    db.exec('ALTER TABLE products ADD COLUMN consumer_price REAL');
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT,
      consumer_price REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS mapping_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_name TEXT NOT NULL UNIQUE,
      mapping_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const psTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='product_sources'").get();
  if (!psTable) {
    db.exec(`
      CREATE TABLE product_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        source_name TEXT NOT NULL,
        price REAL NOT NULL,
        extra_fields TEXT,
        source_date TEXT,
        date_key TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE(product_id, source_name, date_key)
      );
      CREATE INDEX IF NOT EXISTS idx_product_sources_source ON product_sources(source_name);
    `);
  } else {
    const names = db.prepare('PRAGMA table_info(product_sources)').all().map((c) => c.name);
    if (!names.includes('date_key')) {
      migrateProductSourcesMultidate(db);
    } else {
      if (!names.includes('source_date')) {
        db.exec('ALTER TABLE product_sources ADD COLUMN source_date TEXT');
      }
    }
  }

  migrateProductsConsumerPrice(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      supplier_name TEXT NOT NULL DEFAULT '',
      invoice_number TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      movement_date TEXT,
      date_key TEXT NOT NULL DEFAULT '',
      edari_line_key TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(product_id, edari_line_key)
    );
    CREATE INDEX IF NOT EXISTS idx_purchase_movements_product ON purchase_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_purchase_movements_date ON purchase_movements(date_key);
  `);
}

module.exports = { migrate };
