// このプラグインが所有するテーブル（Stage D 型）。append-only の決定事項ログ。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      decided_by TEXT NOT NULL,
      content TEXT NOT NULL,
      source_channel_id TEXT,
      source_message_id TEXT,
      source_url TEXT,
      portal_message_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_decisions_active
      ON decisions (status, created_at DESC);
  `);
}

module.exports = runMigrations;
