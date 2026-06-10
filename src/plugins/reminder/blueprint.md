# reminder プラグイン blueprint

SlackBot 的リマインダー。`/remind add`（one-shot・定期）、メッセージ右クリック
「このメッセージをリマインド」（modal→出典リンク付き）、配達カードの
snooze（10分/1時間/明日9時）・完了ボタン、`/remind list` からの取り消し。
時刻解釈は決定的日本語パーサ（LLM 不使用 — 誤解釈は誤配達になるため）。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/reminder/` |
| config キー | `plugins.reminder` |
| DB テーブル | `reminders`（本プラグイン所有: migrations.js / repository.js = `db.reminder`） |
| scheduler ジョブ | plugin='reminder' の行（無効化後は orphaned マークされ再試行されない） |
| intents | Guilds（共有） |
| コマンド表面 | `/remind` ＋ 右クリック「このメッセージをリマインド」 |
| customId 空間 | `remind:*` |
| 依存元 | なし |

## 設計判断

- **lazy cancel**: 取り消しは reminders 行の status 変更のみ。配達ジョブは実行時に
  status を再確認して無効行をスキップする（scheduler ジョブとの同期を持たない）
- 定期リマインダーは scheduler の cron キー `rem-<id>` で冪等管理
- 配達失敗（チャンネル削除等）は scheduler 側の隔離・last_error 記録に委ねる
- 将来 capability: 当番ローテーション（round-robin メンション）— rotation-duty 案の吸収先

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ②解決 | `timeSpec.js`（日本語時刻指定の決定的解釈） |
| ③リポジトリ | `repository.js`（`db.reminder.*`） |
| ④ビュー | `lifecycle.js` の配達メッセージ/ボタン構築 |
| ⑥ライフサイクル | `lifecycle.js`（作成→配達→snooze/done/cancel） |
| ⑦入力経路 | slash ＋ 右クリック modal ＋ ボタン/セレクト（`remind:*`） |

①⑤⑧⑨は該当なし。基盤①scheduler と②コンポーネント規約の最初の実証プラグイン。
