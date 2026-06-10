// このプラグインの prepared statements（Stage D 型）。db.reminder としてマウントされる。
function createRepository(sqlite) {
  const statements = {
    insert: sqlite.prepare(`
      INSERT INTO reminders (
        guild_id, creator_id, target_kind, target_channel_id, mention_user_id,
        content, source_url, time_display, cron, run_at, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `),
    get: sqlite.prepare('SELECT * FROM reminders WHERE id = ?'),
    listActiveByCreator: sqlite.prepare(`
      SELECT * FROM reminders
      WHERE creator_id = ? AND status IN ('active', 'delivered')
      ORDER BY COALESCE(run_at, created_at) ASC
      LIMIT 25
    `),
    setStatus: sqlite.prepare('UPDATE reminders SET status = ? WHERE id = ?'),
    setRunAt: sqlite.prepare("UPDATE reminders SET run_at = ?, status = 'active' WHERE id = ?")
  };

  return {
    insert(record) {
      const result = statements.insert.run(
        record.guildId || null,
        record.creatorId,
        record.targetKind,
        record.targetChannelId || null,
        record.mentionUserId || null,
        record.content,
        record.sourceUrl || null,
        record.timeDisplay,
        record.cron || null,
        record.runAt ? new Date(record.runAt).toISOString() : null,
        new Date().toISOString()
      );
      return Number(result.lastInsertRowid);
    },
    get(id) {
      return statements.get.get(id) || null;
    },
    listActiveByCreator(creatorId) {
      return statements.listActiveByCreator.all(creatorId);
    },
    setStatus(id, status) {
      statements.setStatus.run(status, id);
    },
    setRunAt(id, runAt) {
      statements.setRunAt.run(new Date(runAt).toISOString(), id);
    }
  };
}

module.exports = createRepository;
