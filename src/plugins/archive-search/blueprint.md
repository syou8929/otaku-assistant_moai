# archive-search プラグイン blueprint

shared/messageArchive の全メッセージ蓄積に対する全文検索（基盤級）。`/search` で横断検索、
結果は ephemeral（検索者のみ）。FTS5 trigram で日本語を分かち書きなしに引く。
api 公開で digest / helpdesk の検索基盤も兼ねる。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/archive-search/` |
| config キー | `plugins.archive-search` |
| DB | `archive_fts`（FTS5 仮想表）＋ archived_messages への同期トリガ3本（migrations 所有。archived_messages 本体は shared の所有で残る） |
| intents | Guilds（共有） |
| コマンド表面 | `/search` |
| api | `services['archive-search'].search` |
| 依存元 | （将来）channel-digest / helpdesk が search api を利用 |

## 漏洩ガード（重要）

- 結果は **ephemeral**（検索者だけに見える）
- timeline-barrier 導入前の代替として、**検索者がそのチャンネルを閲覧できるか**
  （`permissionsFor(member).has('ViewChannel')`）でフィルタ。取得できないチャンネルは安全側で除外
- 多めに取得→権限フィルタ→上限まで、の順で「見えないチャンネルの内容が件数に漏れる」のも防ぐ
- **削除済みメッセージもアーカイブに残るため検索対象になる**点はサーバー運用ポリシーで明示が必要

## 設計判断

- trigram は**3文字以上**のクエリにマッチ。2文字以下は archived_messages への
  LIKE フォールバック（低速だが正しく引ける）
- ユーザー入力は FTS5 の引用句（`"..."`）として渡し、演算子の誤爆・構文エラーを防ぐ
  （構文エラー時も LIKE へ退避）
- 既存行はトリガで追従しないため、init で一括バックフィル（`message_id NOT IN fts`）

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ②解決 | `repository.js`（FTS5 / LIKE の検索） |
| ③リポジトリ | `archive_fts` + 同期トリガ |
| ④ビュー | `buildResultCard`（スニペット＋出典リンク） |
| ⑦入力経路 | `/search` |
| ⑨機能間連携 | `api.search`（digest / helpdesk へ提供） |

①⑤⑥⑧は該当なし。
