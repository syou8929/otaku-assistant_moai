// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS news_items (
      url_key TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      title_key TEXT NOT NULL,
      source_count INTEGER NOT NULL DEFAULT 1,
      published_at TEXT,
      first_seen_at TEXT NOT NULL,
      delivered_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_news_items_digest
      ON news_items (category, delivered_at, first_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_news_items_title
      ON news_items (title_key);
  `);
}

module.exports = runMigrations;
