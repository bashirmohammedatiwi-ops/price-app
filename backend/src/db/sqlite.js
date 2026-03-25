const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

let dbSingleton = null;

function getDatabasePath() {
  const p = process.env.DATABASE_PATH || './data/prices.sqlite';
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function getDb() {
  if (dbSingleton) return dbSingleton;

  const dbPath = getDatabasePath();
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  dbSingleton = new Database(dbPath);
  dbSingleton.pragma('foreign_keys = ON');
  return dbSingleton;
}

module.exports = { getDb };

