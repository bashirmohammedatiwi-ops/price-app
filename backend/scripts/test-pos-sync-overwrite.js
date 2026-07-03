const Database = require('better-sqlite3');
const { createPosSyncService } = require('../src/services/posSyncService');

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE products (
    barcode TEXT PRIMARY KEY,
    name TEXT,
    original_price INTEGER,
    final_price INTEGER,
    discount_percent REAL,
    discount_value REAL,
    discount_type INTEGER,
    offer_name TEXT,
    pos_stock INTEGER,
    pos_synced_at TEXT,
    consumer_price INTEGER,
    created_at TEXT,
    updated_at TEXT
  )
`);

const svc = createPosSyncService({ db, productRepository: {} });
svc.syncItems([{ barcode: '123', originalPrice: 15000, price: 15000, stock: 1 }]);
let row = db.prepare('SELECT original_price, final_price FROM products WHERE barcode = ?').get('123');
console.log('first sync:', row);

svc.syncItems([{ barcode: '123', originalPrice: 18000, price: 18000, stock: 2 }]);
row = db.prepare('SELECT original_price, final_price, pos_stock FROM products WHERE barcode = ?').get('123');
console.log('second sync:', row);

if (row.original_price !== 18000 || row.final_price !== 18000) {
  console.error('FAIL: prices were not overwritten');
  process.exit(1);
}
console.log('OK');
