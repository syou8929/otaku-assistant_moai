# intro プラグイン blueprint

自己紹介まわりの機能群（移送完了）: intro リアクション（設定・保存済みリアクションの自動付与）、
introDm（参加者への自己紹介促し DM・キュー処理・DM 返信対応）、`/intro` コマンド。
プロフィールの保存・読取 API は `shared/introProfiles` が持つ（llm 等も読むため）。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/intro/` |
| config キー | `introReactionsMax` / `plugins.intro`（第2便で `introDm.*` も。注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | `intro_reactions`（**本プラグイン所有**: `migrations.js`＋`repository.js`＝`db.intro`。`intro_profiles` は shared 側の所有、introDm 系テーブルは中央残置＝Stage D 続き） |
| intents | Guilds / GuildMessages / GuildMessageReactions（他プラグインと共有） |
| client 状態 | `client.activeIntroReactionSetups` |
| フック | `shared/introProfiles.registerIntroMessageSavedHandler`（init で登録。未登録なら保存後の付与は no-op） |
| 依存元（過渡的） | なし（第2便でコマンド・introDm とも本プラグインへ移送済み。`introDm.js`/`command.js` が `modules/guildMembers` を deep import — guildMembers の shared 昇格で解消） |

> 第1便時の既知の不整合（legacy `/intro` がプラグイン無効時も生存）は第2便のコマンド移送で解消済み。
> `plugins.intro.enabled: false` で `/intro`・リアクション・DM・キューが揃って消える。

## 依存

- `shared/introProfiles`（フック登録先・読取API）

## 9層アナトミー対応（第1便時点）

| 層 | 実装 |
|---|---|
| ③リポジトリ | `db.introReactions`（Stage D で repository.js へ） |
| ⑥ライフサイクル | `applyIntroReactionsToMessage` / `backfillIntroReactions` |
| ⑦入力経路 | setup メッセージへの reaction（@35）＋ `/intro` サブコマンド（過渡的に legacy） |
| ⑨機能間連携 | `introProfiles` 保存フックへの登録（**shared→plugin 反転の初例**） |
