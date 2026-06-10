// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pin_mirrors (
      source_channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      portal_message_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_channel_id, message_id)
    );
  `);
}

module.exports = runMigrations;
