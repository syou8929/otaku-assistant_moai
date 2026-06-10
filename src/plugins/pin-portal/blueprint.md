# pin-portal プラグイン blueprint

全チャンネルのピン留めを1つのポータルチャンネルへ自動ミラーする（昇格エンジン第1スライス）。
既存の「ピンする」習慣をそのまま入力 UI に使うため、**誰も新しい操作を覚えなくてよい**。
ピン解除でポータルからも自動撤去。`/pin-sync` で手動バックフィル。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/pin-portal/` |
| config キー | `plugins.pin-portal`（portalChannelId / sources） |
| DB テーブル | `pin_mirrors`（本プラグイン所有） |
| intents | Guilds / GuildMessages / MessageContent（共有） |
| コマンド表面 | `/pin-sync`（管理者） |
| 残骸 | ポータルチャンネル内の既投稿カード（削除は手動 or ポータルチャンネルごと削除） |
| 依存元 | なし |

## 漏洩ガード（重要）

ミラー対象は config の `sources`（チャンネル/カテゴリ ID の明示列挙）に含まれるもの**のみ**
（deny-by-default）。私的チャンネルのピンが公開ポータルへ出る事故を構造的に防ぐ。
timeline-barrier（基盤③）導入後は、ポータルと同 Tier 以下のソースのみ許可する検査へ置換予定。

## 設計判断

- `channelPinsUpdate` は増減したメッセージを教えないため、`fetchPinned()` との
  **差分 reconcile** 方式（スナップショットは pin_mirrors テーブル）
- 起動時の全チャンネル走査はしない（イベント駆動＋手動 `/pin-sync`）。
  bot 停止中のピン変更は次の pins 更新イベント時または手動同期で追いつく

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ③リポジトリ | `repository.js`（`db['pin-portal']`） |
| ④ビュー | `buildPortalCard`（抜粋＋出典リンク、メンション無効化） |
| ⑥ライフサイクル | `reconcileChannelPins`（差分の追加・撤去） |
| ⑦入力経路 | channelPinsUpdate@100 ＋ `/pin-sync` |

①②⑤⑧は該当なし。将来: 昇格エンジン第2スライス（decision-log）と統合し、
「右クリック昇格」の card type の1つになる可能性あり。
