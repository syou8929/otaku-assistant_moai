// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      creator_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,            -- 'channel' | 'dm'
      target_channel_id TEXT,               -- channel 配達時の宛先
      mention_user_id TEXT,                 -- 通知時にメンションする相手（既定は作成者）
      content TEXT NOT NULL,
      source_url TEXT,                      -- 右クリック起点の出典メッセージリンク
      time_display TEXT NOT NULL,           -- 入力解釈の表示用文字列
      cron TEXT,                            -- 定期リマインダーのみ
      run_at TEXT,                          -- one-shot の次回時刻（表示用。真実源は scheduler）
      status TEXT NOT NULL DEFAULT 'active',-- active | delivered | done | cancelled
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_creator
      ON reminders (creator_id, status);
  `);
}

module.exports = runMigrations;
