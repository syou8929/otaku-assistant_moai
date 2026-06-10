# decision-log プラグイン blueprint

決定事項ログ（昇格エンジン第2スライス）。`/decide` または右クリック「決定として記録」で
会話の結論を append-only 記録し、出典リンク付きでポータルチャンネルへ掲示。`/decisions` で
一覧・検索。記録は人間の明示アクションのみ（自動抽出なし＝誤記録防止）。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/decision-log/` |
| config キー | `plugins.decision-log`（portalChannelId） |
| DB テーブル | `decisions`（本プラグイン所有） |
| intents | Guilds（共有） |
| コマンド表面 | `/decide` / `/decisions` / 右クリック「決定として記録」 |
| customId 空間 | `decide:*` |
| 依存元 | なし |

## 設計判断

- **append-only**: 取り消しは status='revoked'（行は残す）。決定の履歴は消さない
- 記録は人間の明示操作のみ。LLM 自動抽出は誤記録リスクのため非搭載（将来 capability）
- 右クリック時は元メッセージ本文を modal 初期値に入れ、編集して確定できる
- ポータル未設定でも記録は成立（掲示のみスキップ）
- 検索は LIKE（決定は件数が少なくFTS5不要）。将来 archive-search api への委譲も可

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ③リポジトリ | `repository.js`（`db['decision-log']`） |
| ④ビュー | `buildPortalCard` |
| ⑥ライフサイクル | `recordDecision`（記録→掲示） |
| ⑦入力経路 | `/decide` ＋ `/decisions` ＋ 右クリック modal（`decide:*`） |

①②⑤⑧⑨は該当なし。pin-portal と同じ「メッセージ→型付きカード昇格」エンジンの
decision バリアント（統合キュー上は将来1エンジンへ収斂しうる）。
