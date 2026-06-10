// decision-log のアクセサ。db['decision-log'] としてマウントされる。
const DEFAULT_LIMIT = 15;

function createRepository(sqlite) {
  const statements = {
    insert: sqlite.prepare(`
      INSERT INTO decisions (
        guild_id, decided_by, content, source_channel_id, source_message_id, source_url,
        portal_message_id, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `),
    setPortalMessageId: sqlite.prepare('UPDATE decisions SET portal_message_id = ? WHERE id = ?'),
    get: sqlite.prepare('SELECT * FROM decisions WHERE id = ?'),
    listActive: sqlite.prepare(`
      SELECT * FROM decisions WHERE status = 'active' ORDER BY created_at DESC LIMIT ?
    `),
    search: sqlite.prepare(`
      SELECT * FROM decisions
      WHERE status = 'active' AND content LIKE ? ESCAPE '\\'
      ORDER BY created_at DESC LIMIT ?
    `),
    revoke: sqlite.prepare("UPDATE decisions SET status = 'revoked' WHERE id = ?")
  };

  return {
    insert(record) {
      const result = statements.insert.run(
        record.guildId || null,
        record.decidedBy,
        record.content,
        record.sourceChannelId || null,
        record.sourceMessageId || null,
        record.sourceUrl || null,
        record.portalMessageId || null,
        new Date().toISOString()
      );
      return Number(result.lastInsertRowid);
    },
    setPortalMessageId(id, portalMessageId) {
      statements.setPortalMessageId.run(portalMessageId, id);
    },
    get(id) {
      return statements.get.get(id) || null;
    },
    listActive(limit = DEFAULT_LIMIT) {
      return statements.listActive.all(limit);
    },
    search(query, limit = DEFAULT_LIMIT) {
      const escaped = String(query).replace(/[\\%_]/g, (ch) => `\\${ch}`);
      return statements.search.all(`%${escaped}%`, limit);
    },
    revoke(id) {
      return statements.revoke.run(id).changes > 0;
    }
  };
}

module.exports = createRepository;
