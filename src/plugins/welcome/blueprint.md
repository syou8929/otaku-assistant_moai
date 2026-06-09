# welcome プラグイン blueprint

参加通知（UserJoin システムメッセージ）へ保存済みリアクションを自動付与し、
`/welcome` コマンドでリアクションの登録・確認・全削除・既存通知への補完を行う。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/welcome/` |
| config キー | `welcomeChannelId` / `welcomeReactionsMax` / `plugins.welcome`（注: 現状 `loadConfig.js` の共通スキーマに残置。Stage F の config-as-schema 化で本プラグインへ移動） |
| DB テーブル | `welcome_reactions`（注: 現状 `db/migrations.js` で集中作成。Stage D の per-plugin migrations 化で本プラグインへ移動） |
| intents | Guilds / GuildMessages / GuildMessageReactions（他プラグインと共有） |
| client 状態 | `client.activeWelcomeReactionSetups`（モジュール内 `ensureSetupStore` が自前確保するため `client.js` 直書きは不要） |
| 依存元 | なし（被依存ゼロ。dependency-map.md 実測で確認済み） |

## capability 一覧

| capability | 既定 | 内容 |
|---|---|---|
| （なし） | — | 全層が core。侵襲的な層（エンゲージメント等）を持たない |

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ③リポジトリ | `db.welcomeReactions`（Stage D で `repository.js` へ切り出し予定） |
| ⑥ライフサイクル | `applyWelcomeReactionsToMessage` / `backfillWelcomeReactions` |
| ⑦入力経路 | `/welcome` slash（`command.js`）＋ setup メッセージへの reaction（`plugin.js` events） |

①②④⑤⑧⑨は該当なし（外部 API・検索・カード・メディア・エンゲージメント・機能間連携を持たない）。
