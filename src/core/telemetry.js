/**
 * 利用テレメトリ（基盤）。「3ヶ月後も使われているか」を測る。
 * - 集計カウントのみ（日付 × 種別 × キー）。ユーザー ID・内容は一切記録しない
 * - 収集点は core の3箇所: コマンド実行 / コンポーネント操作 / スケジュールジョブ
 * - 閲覧は telemetry プラグイン（/telemetry）が担当
 */

function ensureSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      date TEXT NOT NULL,
      kind TEXT NOT NULL,
      key TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, kind, key)
    );
  `);
}

function createTelemetry({ db }) {
  const sqlite = db.sqlite;
  ensureSchema(sqlite);

  const statements = {
    increment: sqlite.prepare(`
      INSERT INTO usage_counters (date, kind, key, count) VALUES (?, ?, ?, 1)
      ON CONFLICT (date, kind, key) DO UPDATE SET count = count + 1
    `),
    summary: sqlite.prepare(`
      SELECT kind, key, SUM(count) AS total
      FROM usage_counters
      WHERE date >= ?
      GROUP BY kind, key
      ORDER BY total DESC
    `)
  };

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  return {
    /** 失敗しても本処理を巻き込まない（テレメトリは常に best-effort） */
    increment(kind, key) {
      try {
        statements.increment.run(today(), kind, String(key).slice(0, 80));
      } catch {
        // 計測失敗は無視
      }
    },
    summary(sinceDays = 30) {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
      return statements.summary.all(since);
    }
  };
}

module.exports = {
  createTelemetry
};
