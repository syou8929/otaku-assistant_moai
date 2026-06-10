// このプラグインが所有するテーブル（Stage D 型）。
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS muse_videos (
      video_id TEXT PRIMARY KEY,
      genre TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_title TEXT,
      title TEXT NOT NULL,
      published_at TEXT,
      first_seen_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_muse_videos_genre ON muse_videos (genre);

    CREATE TABLE IF NOT EXISTS muse_picks (
      video_id TEXT NOT NULL,
      picked_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_muse_picks_video ON muse_picks (video_id, picked_at DESC);
  `);
}

module.exports = runMigrations;
