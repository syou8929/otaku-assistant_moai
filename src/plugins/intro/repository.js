// このプラグインの prepared statements とアクセサ（Stage D: per-plugin repository）。
// loader が db.intro としてマウントする。
// 注: introDm 系のテーブル/statement は中央 database.js に残置（Stage D 続き）。
function createRepository(sqlite) {
  const statements = {
    insert: sqlite.prepare(`
      INSERT INTO intro_reactions (
        guild_id,
        emoji_key,
        emoji_name,
        emoji_id,
        animated,
        sort_order,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    list: sqlite.prepare(`
      SELECT
        guild_id AS guildId,
        emoji_key AS emojiKey,
        emoji_name AS emojiName,
        emoji_id AS emojiId,
        animated,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM intro_reactions
      WHERE guild_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `),
    clear: sqlite.prepare(`
      DELETE FROM intro_reactions
      WHERE guild_id = ?
    `),
    count: sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM intro_reactions
      WHERE guild_id = ?
    `)
  };

  return {
    insert({ guildId, emojiKey, emojiName, emojiId, animated = false, sortOrder }) {
      statements.insert.run(
        guildId,
        emojiKey,
        emojiName,
        emojiId,
        animated ? 1 : 0,
        sortOrder,
        new Date().toISOString()
      );
    },
    list(guildId) {
      return statements.list.all(guildId);
    },
    clear(guildId) {
      statements.clear.run(guildId);
    },
    count(guildId) {
      return Number(statements.count.get(guildId)?.count || 0);
    }
  };
}

module.exports = createRepository;
