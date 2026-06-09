# vc-profile プラグイン blueprint

VC 在室者のプロフィールカードを対応テキストチャンネルへ自動掲示する。
入退室（voiceStateUpdate）で同期し、起動時に全再構築、以後は定期リコンサイル。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/vc-profile/` |
| config キー | `voiceProfileChannels` / `voiceProfile.*` / `vcListenOnlyChannelIds` / `plugins.vc-profile`（注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | なし（プロフィール本文は intro 投稿から都度取得） |
| intents | Guilds / GuildMessages / **GuildVoiceStates**（このプラグイン以外に利用者なし → 削除時に intent 表面が縮む） |
| client 状態 | `client.voiceProfileCategoryMap`（health.js が `?? 0` で安全に読む）/ `client.voiceProfileReconcileInterval`（teardown で解除） |
| 依存元（過渡的） | `src/commands/maintenance.js` の vc 系サブコマンドが deep import（Stage E〜F で解消）/ `src/events/ready.js` と `src/modules/ops/health.js` が `voiceProfileCategoryMap` を読取（未ロード時は 0 と表示） |

## capability 一覧

| capability | 既定 | 内容 |
|---|---|---|
| （なし） | — | 全層が core。reconcile 間隔等は config（`voiceProfile.reconcileIntervalMinutes`）で調整 |

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ②解決 | `findLatestIntroMessage.js`（本人の最新 intro 投稿の名寄せ） |
| ④ビュー | `buildProfileMessage.js`（プロフィールカード payload・純関数） |
| ⑥ライフサイクル | `initializeVoiceProfileMappings` / `rebuildVoiceProfileState` / `startVoiceProfileReconciliation`（clientReady@50 で legacy ready の ops 通知より先に初期化） |
| ⑦入力経路 | voiceStateUpdate@50（slash なし） |

①③⑤⑧⑨は該当なし。
