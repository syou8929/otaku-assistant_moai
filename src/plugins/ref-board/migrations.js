// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS ref_boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      card_message_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ref_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id INTEGER NOT NULL,
      note TEXT,
      source_url TEXT,
      image_url TEXT,
      local_path TEXT,
      saved_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_ref_items_board ON ref_items (board_id, created_at DESC);
  `);
}

module.exports = runMigrations;
