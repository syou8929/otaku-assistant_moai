// ref-board のアクセサ。db['ref-board'] としてマウントされる。
function createRepository(sqlite) {
  const statements = {
    createBoard: sqlite.prepare(
      'INSERT INTO ref_boards (name, created_by, created_at) VALUES (?, ?, ?)'
    ),
    getBoard: sqlite.prepare('SELECT * FROM ref_boards WHERE id = ?'),
    getBoardByName: sqlite.prepare('SELECT * FROM ref_boards WHERE name = ?'),
    listBoards: sqlite.prepare(`
      SELECT b.*, COUNT(i.id) AS item_count
      FROM ref_boards b LEFT JOIN ref_items i ON i.board_id = b.id
      GROUP BY b.id ORDER BY b.name
    `),
    setCardMessageId: sqlite.prepare('UPDATE ref_boards SET card_message_id = ? WHERE id = ?'),
    addItem: sqlite.prepare(`
      INSERT INTO ref_items (board_id, note, source_url, image_url, local_path, saved_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    listItems: sqlite.prepare(
      'SELECT * FROM ref_items WHERE board_id = ? ORDER BY created_at DESC LIMIT ?'
    ),
    countItems: sqlite.prepare('SELECT COUNT(*) AS c FROM ref_items WHERE board_id = ?')
  };

  return {
    createBoard({ name, createdBy }) {
      const result = statements.createBoard.run(name, createdBy, new Date().toISOString());
      return Number(result.lastInsertRowid);
    },
    getBoard(id) {
      return statements.getBoard.get(id) || null;
    },
    getBoardByName(name) {
      return statements.getBoardByName.get(name) || null;
    },
    listBoards() {
      return statements.listBoards.all();
    },
    setCardMessageId(boardId, messageId) {
      statements.setCardMessageId.run(messageId, boardId);
    },
    addItem(item) {
      const result = statements.addItem.run(
        item.boardId,
        item.note || null,
        item.sourceUrl || null,
        item.imageUrl || null,
        item.localPath || null,
        item.savedBy,
        new Date().toISOString()
      );
      return Number(result.lastInsertRowid);
    },
    listItems(boardId, limit = 8) {
      return statements.listItems.all(boardId, limit);
    },
    countItems(boardId) {
      return statements.countItems.get(boardId).c;
    }
  };
}

module.exports = createRepository;
