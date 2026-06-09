# intro プラグイン blueprint

自己紹介まわりの機能群。**第1便（現状）**: intro リアクション（設定・保存済みリアクションの
自動付与）。**第2便（予定）**: introDm（参加者への自己紹介促し DM・キュー処理）と `/intro`
コマンド。プロフィールの保存・読取 API は `shared/introProfiles` が持つ（llm 等も読むため）。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/intro/` |
| config キー | `introReactionsMax` / `plugins.intro`（第2便で `introDm.*` も。注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | `intro_reactions`（注: Stage D で本プラグインへ移動。`intro_profiles` は shared 側の所有） |
| intents | Guilds / GuildMessages / GuildMessageReactions（他プラグインと共有） |
| client 状態 | `client.activeIntroReactionSetups` |
| フック | `shared/introProfiles.registerIntroMessageSavedHandler`（init で登録。未登録なら保存後の付与は no-op） |
| 依存元（過渡的） | `src/commands/intro.js`（legacy）が `./introReactions` を deep import — 第2便でコマンドごと本プラグインへ |

> **既知の過渡的不整合（第2便で解消）**: 移行期間中に `plugins.intro.enabled: false` にすると、
> リアクションイベント処理は止まるが legacy の `/intro` コマンドは静的リスト経由で生き残る。
> `setup-reactions` を実行すると消費者のいない setup 状態が残る。第2便（コマンド移送）まで
> このプラグインの無効化は想定外とする。

## 依存

- `shared/introProfiles`（フック登録先・読取API）

## 9層アナトミー対応（第1便時点）

| 層 | 実装 |
|---|---|
| ③リポジトリ | `db.introReactions`（Stage D で repository.js へ） |
| ⑥ライフサイクル | `applyIntroReactionsToMessage` / `backfillIntroReactions` |
| ⑦入力経路 | setup メッセージへの reaction（@35）＋ `/intro` サブコマンド（過渡的に legacy） |
| ⑨機能間連携 | `introProfiles` 保存フックへの登録（**shared→plugin 反転の初例**） |
