// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS faq_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      aliases TEXT,                       -- カンマ区切りの別名
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      updated_by TEXT,
      use_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );
  `);
}

module.exports = runMigrations;
