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
    bumpCoOccurrence: sqlite.prepare(`
      UPDATE news_items SET source_count = source_count + 1
      WHERE title_key = ? AND source_name != ? AND delivered_at IS NULL
    `),
    hasSameStoryOtherSource: sqlite.prepare(`
      SELECT 1 FROM news_items WHERE title_key = ? AND source_name != ? LIMIT 1
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

      // 別ソースが同じ話題を報じていたら相互に Hot 加点
      if (statements.hasSameStoryOtherSource.get(titleKey, sourceName)) {
        statements.bumpCoOccurrence.run(titleKey, '');
      }

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
