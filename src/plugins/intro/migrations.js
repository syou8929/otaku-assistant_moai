// このプラグインが所有するテーブルだけを作成する（Stage D: per-plugin migrations）。
// 有効時のみ loader が実行する。既存 DB に対しては IF NOT EXISTS で冪等。
// 注: intro_profiles は shared/introProfiles の所有（中央 migrations に残置）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS intro_reactions (
      guild_id TEXT NOT NULL,
      emoji_key TEXT NOT NULL,
      emoji_name TEXT,
      emoji_id TEXT,
      animated INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (guild_id, emoji_key)
    );
  `);
}

module.exports = runMigrations;
