# faq プラグイン blueprint

社内 FAQ / 定型情報の即答カード（カタログの query-cards + record-lookup 統合案）。
Wi-Fi・経費精算手順・リンク集などを `/faq show`（autocomplete つき）で即答。
追加は誰でも（知識は使う人が育てる）、削除は管理者。応答は ephemeral ＋
「チャンネルに共有」ボタンで必要なときだけ公開（ノイズ統治）。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/faq/` |
| config キー | `plugins.faq` |
| DB テーブル | `faq_entries`（本プラグイン所有） |
| intents | Guilds（共有） |
| コマンド表面 | `/faq show|set|list|remove` |
| customId 空間 | `faq:*` |
| 依存元 | なし |

## 設計判断

- **autocomplete でキーを発見可能に**（このユニットで core の interactionCreate に
  autocomplete dispatch を追加 — `command.autocomplete(interaction)` 規約）
- use_count で「よく引かれる順」に並ぶ（休眠 FAQ の剪定判断にも使える）
- 検索は key + aliases の部分一致（完全一致優先）。件数が小さいため全件走査で十分
- LLM 連携（自然文質問→FAQ マッチ）は将来 capability

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ②解決 | `repository.search`（key/aliases 部分一致・完全一致優先） |
| ③リポジトリ | `faq_entries` |
| ④ビュー | 即答カード＋共有ボタン |
| ⑦入力経路 | `/faq` ＋ autocomplete ＋ `faq:share` ボタン |

①⑤⑥⑧⑨は該当なし。
