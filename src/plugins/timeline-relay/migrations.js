// このプラグインが所有するテーブル（Stage D 型）。
// barrier_tiers: 情報バリアの Tier 割当（チャンネル or カテゴリ単位、数値が大きいほど機密）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS barrier_tiers (
      subject_id TEXT PRIMARY KEY,
      subject_type TEXT NOT NULL,        -- 'channel' | 'category'
      tier INTEGER NOT NULL,
      set_by TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

module.exports = runMigrations;
