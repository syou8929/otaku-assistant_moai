# question プラグイン blueprint

質問フォーラムスレッドの解決管理。`/resolve` `/unresolve` でタイトル接頭辞
（`[解決済]`）とフォーラムタグ（resolved/open）を同期し、タイムラインカードも更新する。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/question/` |
| config キー | `questions.*` / `questionForumTags` / `watchedForums.question`（注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | `question_threads`（`db.questions.*`。注: 現状 `db/migrations.js` で集中作成。Stage D で本プラグインへ移動） |
| intents | Guilds / GuildMessages（他プラグインと共有） |
| npm script | `backfill-question-tags`（`scripts/backfillQuestionTags.js` → 本プラグインを参照） |
| フック | `timelineRelay/hooks.registerThreadTagApplier`（init で登録。未登録なら relay 側は no-op） |
| 依存元（過渡的） | `src/commands/maintenance.js` の question 系サブコマンドが deep import（Stage E〜F で解消） |

## 依存（過渡的）

- `resolver.js` → `modules/timelineRelay.updateQuestionTimelineCard`（解決時のカード更新）。
  timeline-relay プラグイン化（Stage C）で `dependsOn: ['timeline-relay']` ＋ `ctx.services` 経由へ。
- timeline-relay 側の `forumType === 'question'` 分岐（guide message 投稿・`db.questions` 書込）は
  relay 本体に残っている。Stage C で capability として整理する。

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ③リポジトリ | `db.questions.*`（Stage D で repository.js へ） |
| ⑥ライフサイクル | `resolver.js`（resolve/unresolve の状態遷移＋タグ＋カード整合） |
| ⑦入力経路 | `/resolve` `/unresolve` slash ＋ maintenance サブコマンド（過渡的）＋ CLI script |
| ⑨機能間連携 | timeline-relay フックへの `applyQuestionStatusTag` 登録（**フック反転の初例**） |

①②④⑤⑧は該当なし。
