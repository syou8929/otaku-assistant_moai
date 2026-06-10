// このプラグインの prepared statements（Stage D 型）。db['timeline-relay'] としてマウントされる。
// 注: relay 本体の relays/questions 系テーブルは中央 db に残置（Stage D 続き）。
function createRepository(sqlite) {
  const statements = {
    upsertTier: sqlite.prepare(`
      INSERT INTO barrier_tiers (subject_id, subject_type, tier, set_by, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (subject_id) DO UPDATE SET subject_type = excluded.subject_type,
        tier = excluded.tier, set_by = excluded.set_by
    `),
    getTier: sqlite.prepare('SELECT * FROM barrier_tiers WHERE subject_id = ?'),
    removeTier: sqlite.prepare('DELETE FROM barrier_tiers WHERE subject_id = ?'),
    listTiers: sqlite.prepare('SELECT * FROM barrier_tiers ORDER BY tier DESC, subject_type ASC')
  };

  return {
    upsertTier({ subjectId, subjectType, tier, setBy }) {
      statements.upsertTier.run(subjectId, subjectType, tier, setBy || null, new Date().toISOString());
    },
    getTier(subjectId) {
      const row = statements.getTier.get(subjectId);
      return row ? row.tier : null;
    },
    removeTier(subjectId) {
      return statements.removeTier.run(subjectId).changes > 0;
    },
    listTiers() {
      return statements.listTiers.all();
    }
  };
}

module.exports = createRepository;
