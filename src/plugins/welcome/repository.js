// このプラグインの prepared statements とアクセサ（Stage D: per-plugin repository）。
// loader が db.welcome としてマウントする。
function createRepository(sqlite) {
  const statements = {
    list: sqlite.prepare(`
      SELECT
        guild_id AS guildId,
        emoji_key AS emojiKey,
        emoji_name AS emojiName,
        emoji_id AS emojiId,
        animated,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM welcome_reactions
      WHERE guild_id = ?
      ORDER BY sort_order ASC, created_at ASC
    `),
    get: sqlite.prepare(`
      SELECT
        guild_id AS guildId,
        emoji_key AS emojiKey,
        emoji_name AS emojiName,
        emoji_id AS emojiId,
        animated,
        sort_order AS sortOrder,
        created_at AS createdAt
      FROM welcome_reactions
      WHERE guild_id = ? AND emoji_key = ?
      LIMIT 1
    `),
    insert: sqlite.prepare(`
      INSERT INTO welcome_reactions (
        guild_id,
        emoji_key,
        emoji_name,
        emoji_id,
        animated,
        sort_order,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    clear: sqlite.prepare(`
      DELETE FROM welcome_reactions
      WHERE guild_id = ?
    `),
    count: sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM welcome_reactions
      WHERE guild_id = ?
    `)
  };

  return {
    list(guildId) {
      return statements.list.all(guildId);
    },
    get(guildId, emojiKey) {
      return statements.get.get(guildId, emojiKey) || null;
    },
    count(guildId) {
      return Number(statements.count.get(guildId)?.count || 0);
    },
    insert({ guildId, emojiKey, emojiName, emojiId, animated, sortOrder }) {
      statements.insert.run(
        guildId,
        emojiKey,
        emojiName || null,
        emojiId || null,
        animated ? 1 : 0,
        sortOrder,
        new Date().toISOString()
      );
    },
    clear(guildId) {
      statements.clear.run(guildId);
    }
  };
}

module.exports = createRepository;
