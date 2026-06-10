// news-digest のアクセサ。db['news-digest'] としてマウントされる。
// 重複排除: url_key（PK）で同一記事、title_key で同一ニュースの媒体違いを名寄せ。
// 同じ title_key を別ソースが報じるたび source_count が伸び、Hot スコアになる。
function createRepository(sqlite) {
  const statements = {
    get: sqlite.prepare('SELECT * FROM news_items WHERE url_key = ?'),
    insert: sqlite.prepare(`
      INSERT OR IGNORE INTO news_items
        (url_key, category, source_name, url, title, title_key, published_at, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    recountSources: sqlite.prepare(`
      UPDATE news_items SET source_count = (
        SELECT COUNT(DISTINCT n2.source_name) FROM news_items n2
        WHERE n2.title_key = news_items.title_key
      )
      WHERE title_key = ?
    `),
    digestCandidates: sqlite.prepare(`
      SELECT * FROM news_items
      WHERE category = ? AND delivered_at IS NULL AND first_seen_at >= ?
      ORDER BY source_count DESC, COALESCE(published_at, first_seen_at) DESC
      LIMIT ?
    `),
    markDelivered: sqlite.prepare('UPDATE news_items SET delivered_at = ? WHERE url_key = ?'),
    stats: sqlite.prepare(`
      SELECT category, COUNT(*) AS total,
             SUM(CASE WHEN delivered_at IS NULL THEN 1 ELSE 0 END) AS pending
      FROM news_items GROUP BY category
    `)
  };

  return {
    /** @returns true=新規 / false=既出 */
    upsertItem({ urlKey, category, sourceName, url, title, titleKey, publishedAt }) {
      const result = statements.insert.run(
        urlKey, category, sourceName, url, title, titleKey, publishedAt || null, new Date().toISOString()
      );

      if (result.changes === 0) {
        return false;
      }

      // 同一話題（title_key）の source_count をユニークソース数で再計算
      // （増分更新は経路によりドリフトするため毎回再集計 — 件数は小さい）
      statements.recountSources.run(titleKey);

      return true;
    },
    digestCandidates(category, { sinceDays = 3, limit = 50 } = {}) {
      const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
      return statements.digestCandidates.all(category, since, limit);
    },
    markDelivered(urlKeyValue) {
      statements.markDelivered.run(new Date().toISOString(), urlKeyValue);
    },
    stats() {
      return statements.stats.all();
    }
  };
}

module.exports = createRepository;
