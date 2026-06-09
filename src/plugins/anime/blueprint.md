# anime プラグイン blueprint

アニメカード機能（参照実装 = 9層アナトミーの型元）。Annict/AniList からの作品解決、
カード投稿・更新、視聴/興味リアクション、レビュー収集、ハッシュタグ連携、名言など。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/anime/`（quoteData/ 含む） |
| config キー | `anime.*` / `annict.*` / `plugins.anime`（注: Stage F で本プラグインへ移動） |
| DB テーブル | `anime_*` 一式（`db.anime.*`。Stage D で repository.js へ） |
| intents | Guilds / GuildMessages / GuildMessageReactions / MessageContent（共有） |
| env | `ANNICT_ACCESS_TOKEN`（annict.accessTokenEnv で可変） |
| フック | `timelineRelay/hooks.registerHashtagPostHandler`（init で登録。未登録なら relay 側は no-op） |
| 依存（過渡的） | `modules/timelineRelay` のメディア系ユーティリティ 5 ファイルを deep import（Stage C で dependsOn + ctx.services へ） |

## capability 整理（Stage C で フラグ化予定）

| 層 | 現状 | 予定 |
|---|---|---|
| ⑧エンゲージメント（reviewRoles / 祝福DM） | `anime.reviewRoles` config 駆動 | `capabilities.engagement`（既定OFF）へ昇格 — spec §9 の主例 |
| ⑨機能間連携（hashtag 連携） | フック登録（常時） | `capabilities.crossFeature` フラグでガード |

## 9層アナトミー対応（参照実装）

| 層 | 実装 |
|---|---|
| ①プロバイダ | `annictClient.js` / `anilistClient.js` |
| ②解決 | `search.js` / `titleAliases.js` |
| ③リポジトリ | `db.anime.*` |
| ④ビュー | `buildAnimeMessages.js` |
| ⑤メディア方針 | `imagePolicy.js` |
| ⑥ライフサイクル | `index.js`（投稿・更新・孤児スキャン clientReady@105） |
| ⑦入力経路 | `/anime`（command.js）＋ reaction@110 ＋ watched-reply messageCreate@102 ＋ **component interactionCreate@90**（決め打ち排除済み） |
| ⑧エンゲージメント | `updateReviewRoles` ほか（capability 化予定） |
| ⑨機能間連携 | `hashtagIntegration.js`（フック反転 #3 で登録側に） |
