// このプラグインの prepared statements（Stage D 型）。db['pin-portal'] としてマウントされる。
function createRepository(sqlite) {
  const statements = {
    insert: sqlite.prepare(`
      INSERT OR REPLACE INTO pin_mirrors (source_channel_id, message_id, portal_message_id, created_at)
      VALUES (?, ?, ?, ?)
    `),
    listByChannel: sqlite.prepare(
      'SELECT * FROM pin_mirrors WHERE source_channel_id = ?'
    ),
    remove: sqlite.prepare(
      'DELETE FROM pin_mirrors WHERE source_channel_id = ? AND message_id = ?'
    )
  };

  return {
    insert({ sourceChannelId, messageId, portalMessageId }) {
      statements.insert.run(sourceChannelId, messageId, portalMessageId, new Date().toISOString());
    },
    listByChannel(sourceChannelId) {
      return statements.listByChannel.all(sourceChannelId);
    },
    remove(sourceChannelId, messageId) {
      statements.remove.run(sourceChannelId, messageId);
    }
  };
}

module.exports = createRepository;
