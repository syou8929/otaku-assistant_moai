# timeline-relay プラグイン blueprint

サーバー内投稿のタイムライン集約・中継の基幹機能。フォーラム新スレッド relay、
スレッド内ツイート relay、グローバルハッシュタグ routing、返信ベース routing、
カード更新、メディア再アップロード（添付/Twitter/動画サムネ）、音楽リンク enrich。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/timeline-relay/` |
| config キー | `timelineChannelId` / `timeline.*` / `timelineShortMerge*` / `watchedForums.tweet` / `mediaRelay.*` / `twitterMedia.*` / `botHashtagRoutes` / `globalHashtagRoutes` / `plugins.timeline-relay`（Stage F で本プラグインへ） |
| DB テーブル | `barrier_tiers`（**本プラグイン所有**: migrations.js/repository.js = `db['timeline-relay']`）。`relayed_*` / `timeline_*` 系は中央残置（Stage D 続き） |
| intents | Guilds / GuildMessages / MessageContent（共有） |
| client 状態 | `client.timelineRelayInFlight` / `client.timelineRelayMessageInFlight` |
| 外部ツール | `yt-dlp`（twitterMedia.ytDlpPath） |
| **被依存** | **question / anime が dependsOn 宣言** — このプラグインを外すには両者を先に外すか無効化する（loader が fail-fast で強制） |

## 公開 API（manifest.api → ctx.services['timeline-relay']）

| 関数 | 利用者 |
|---|---|
| `registerThreadTagApplier` | question（init で登録） |
| `registerHashtagPostHandler` | anime（init で登録） |
| `updateQuestionTimelineCard` | question（過渡的には deep import。Stage D/F で services 経由へ） |
| `isRelayAllowed` | 情報を移動する全プラグイン（archive-search / digest 等）の共通バリア検査 |

## 既知の過渡的依存（Stage D/F で整理）

- anime が メディア系ユーティリティ 5 ファイル（extractFirstPost / buildTimelineMessage /
  twitterMediaResolver / videoThumbnail / attachmentRelay）を cross-plugin deep import
  （dependsOn 宣言済み）。**shared/media への昇格**か services 経由化を選ぶ。
- relay 本体の `forumType === 'question'` 分岐（guide message・`db.questions` 書込）は
  config（watchedForums.question）駆動のまま — question capability として整理予定。
- **barrierTier は実装済み**（barrier.js）: capability `barrier.enabled`（既定OFF）。
  Tier 割当は `/timeline-barrier set|remove|list|test`。deny-by-default
  （未割当ソース=9 / 未割当宛先=0）。強制点は送信前フィルタ（5経路）＋
  `sendRelayMessage` 内の防御的 assert の二段。複数タイムライン宛先
  （TimelineScope[] の sources 集約一般化 = times-scope）は後続実装。

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ②解決 | `extractFirstPost.js`（投稿抽出・整形） |
| ③リポジトリ | `db.relays` ほか（Stage D で repository.js へ） |
| ④ビュー | `buildTimelineMessage.js` |
| ⑤メディア方針 | `attachmentRelay.js` / `twitterMediaResolver.js` / `videoThumbnail.js` / `musicLinks.js` |
| ⑥ライフサイクル | `index.js`（relay・カード更新・short merge） |
| ⑦入力経路 | threadCreate@100 ＋ messageCreate@104-106 ＋ messageUpdate@101-102 |
| ⑨機能間連携 | `hooks.js`（question / anime が登録する側） |

①⑧は該当なし。
