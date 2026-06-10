# work-archive プラグイン blueprint

案件チャンネルの終結アーカイブ。`/archive-channel`（管理者）でそのチャンネル
（スレッド・フォーラム投稿含む）の全ログを shared/messageArchive の蓄積から
markdown へ書き出し、統計（期間・件数・参加者）を返す。
**チャンネル削除はしない** — 破壊操作は人間の手で、bot は記録だけ担う。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/work-archive/` |
| config キー | `plugins.work-archive` |
| DB テーブル | なし（archived_messages を読むだけ。書き出し先は `data/exports/`） |
| intents | Guilds（共有） |
| コマンド表面 | `/archive-channel`（管理者） |
| 依存元 | なし |

## 設計判断

- ソースは Discord API の遡及フェッチではなく **messageArchive の蓄積**
  （bot 導入後の全履歴が既にある。導入前の履歴は対象外 — guide に明記）
- channel_id / thread_id / parent_id の3列でフォーラム・スレッド込みに対応
- LLM 要約（結論サマリ自動生成）は将来 capability — まず生ログの確実な保全から
- ファイル名はチャンネル名を sanitize（Unicode 文字・数字・`_-` のみ許可）

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ④ビュー | markdown ドキュメント＋統計カード |
| ⑥ライフサイクル | exportChannelMarkdown |
| ⑦入力経路 | `/archive-channel` |

他層は該当なし。
