// faq のアクセサ。db.faq としてマウントされる。
function createRepository(sqlite) {
  const statements = {
    upsert: sqlite.prepare(`
      INSERT INTO faq_entries (key, aliases, content, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET
        aliases = excluded.aliases, content = excluded.content,
        updated_by = excluded.created_by, updated_at = excluded.created_at
    `),
    getByKey: sqlite.prepare('SELECT * FROM faq_entries WHERE key = ?'),
    all: sqlite.prepare('SELECT * FROM faq_entries ORDER BY use_count DESC, key ASC'),
    remove: sqlite.prepare('DELETE FROM faq_entries WHERE key = ?'),
    bumpUse: sqlite.prepare('UPDATE faq_entries SET use_count = use_count + 1 WHERE id = ?')
  };

  function matches(entry, query) {
    const normalized = String(query).toLowerCase();

    if (entry.key.toLowerCase().includes(normalized)) {
      return true;
    }

    return String(entry.aliases || '')
      .toLowerCase()
      .split(',')
      .some((alias) => alias.trim() && alias.trim().includes(normalized));
  }

  return {
    upsert({ key, aliases, content, userId }) {
      statements.upsert.run(key, aliases || null, content, userId, new Date().toISOString());
    },
    getByKey(key) {
      return statements.getByKey.get(key) || null;
    },
    /** key・aliases の部分一致（完全一致を先頭に） */
    search(query, limit = 25) {
      const entries = statements.all.all().filter((entry) => matches(entry, query));
      const exact = entries.filter((e) => e.key.toLowerCase() === String(query).toLowerCase());
      const rest = entries.filter((e) => !exact.includes(e));
      return [...exact, ...rest].slice(0, limit);
    },
    list(limit = 30) {
      return statements.all.all().slice(0, limit);
    },
    remove(key) {
      return statements.remove.run(key).changes > 0;
    },
    bumpUse(id) {
      statements.bumpUse.run(id);
    }
  };
}

module.exports = createRepository;
