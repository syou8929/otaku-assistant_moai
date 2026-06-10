// archive-search の検索アクセサ。db['archive-search'] としてマウントされる。
// 3文字以上: FTS5 trigram（高速）。2文字以下: archived_messages への LIKE フォールバック。
const FTS_MIN_CHARS = 3;
const DEFAULT_LIMIT = 10;

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function createRepository(sqlite) {
  const statements = {
    fts: sqlite.prepare(`
      SELECT a.message_id AS messageId, a.guild_id AS guildId, a.channel_id AS channelId, a.parent_id AS parentId,
             a.author_id AS authorId, a.author_name AS authorName, a.clean_content AS content,
             a.created_at AS createdAt
      FROM archive_fts f
      JOIN archived_messages a ON a.message_id = f.message_id
      WHERE f.content MATCH ?
        AND a.author_is_bot = 0
        AND (? = '' OR a.channel_id = ?)
      ORDER BY a.created_at DESC
      LIMIT ?
    `),
    like: sqlite.prepare(`
      SELECT message_id AS messageId, guild_id AS guildId, channel_id AS channelId, parent_id AS parentId,
             author_id AS authorId, author_name AS authorName, clean_content AS content,
             created_at AS createdAt
      FROM archived_messages
      WHERE COALESCE(clean_content, content, '') LIKE ? ESCAPE '\\'
        AND author_is_bot = 0
        AND (? = '' OR channel_id = ?)
      ORDER BY created_at DESC
      LIMIT ?
    `),
    backfillCount: sqlite.prepare('SELECT COUNT(*) AS c FROM archive_fts'),
    archiveCount: sqlite.prepare('SELECT COUNT(*) AS c FROM archived_messages'),
    backfill: sqlite.prepare(`
      INSERT INTO archive_fts (message_id, content)
      SELECT message_id, COALESCE(clean_content, content, '')
      FROM archived_messages
      WHERE message_id NOT IN (SELECT message_id FROM archive_fts)
    `)
  };

  return {
    /**
     * @param query 検索語
     * @param opts.channelId 限定チャンネル（''=全体）
     * @param opts.limit 最大件数
     * @returns 一致メッセージ（新しい順）。FTS5 のクエリ構文エラーは握って空配列を返す
     */
    search(query, { channelId = '', limit = DEFAULT_LIMIT } = {}) {
      const trimmed = String(query || '').trim();

      if (!trimmed) {
        return { rows: [], mode: 'empty' };
      }

      const chars = [...trimmed].length;

      if (chars >= FTS_MIN_CHARS) {
        try {
          // ユーザー入力を 1 個の引用句として扱い、FTS5 演算子の誤爆を防ぐ
          const phrase = `"${trimmed.replace(/"/g, '""')}"`;
          const rows = statements.fts.all(phrase, channelId, channelId, limit);
          return { rows, mode: 'fts' };
        } catch {
          // 想定外のクエリ構文エラーは LIKE に退避
        }
      }

      const rows = statements.like.all(`%${escapeLike(trimmed)}%`, channelId, channelId, limit);
      return { rows, mode: 'like' };
    },

    /** init から呼ぶ既存行のバックフィル。挿入件数を返す */
    backfill() {
      const before = statements.backfillCount.get().c;
      statements.backfill.run();
      const after = statements.backfillCount.get().c;
      return { inserted: after - before, total: after, archiveTotal: statements.archiveCount.get().c };
    }
  };
}

module.exports = createRepository;
