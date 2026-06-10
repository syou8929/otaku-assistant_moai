/**
 * archived_messages（shared/messageArchive 所有）の全文インデックス。
 * FTS5 trigram で日本語を分かち書きなしに検索する（trigram は3文字以上のクエリにマッチ。
 * 2文字以下は repository 側で LIKE フォールバック）。
 * 外部キー content は archived_messages.clean_content、rowid 代わりに message_id を保持。
 * 同期トリガで archived_messages の変更を追従する。既存行は init のバックフィルで投入。
 */
function runMigrations(sqlite) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS archive_fts USING fts5(
      message_id UNINDEXED,
      content,
      tokenize = 'trigram'
    );

    CREATE TRIGGER IF NOT EXISTS archive_fts_insert
    AFTER INSERT ON archived_messages BEGIN
      INSERT INTO archive_fts (message_id, content)
      VALUES (new.message_id, COALESCE(new.clean_content, new.content, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS archive_fts_update
    AFTER UPDATE ON archived_messages BEGIN
      DELETE FROM archive_fts WHERE message_id = old.message_id;
      INSERT INTO archive_fts (message_id, content)
      VALUES (new.message_id, COALESCE(new.clean_content, new.content, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS archive_fts_delete
    AFTER DELETE ON archived_messages BEGIN
      DELETE FROM archive_fts WHERE message_id = old.message_id;
    END;
  `);
}

module.exports = runMigrations;
