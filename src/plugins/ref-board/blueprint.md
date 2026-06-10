# ref-board プラグイン blueprint

案件別リファレンスボード。メッセージ右クリック「ボードに保存」→ ephemeral セレクトで
ボード選択（または新規作成 modal）→ 保存。画像添付は VPS ローカルへ保存（リンク切れ耐性）。
ボードごとの常設カードを自動更新。

## Removal footprint

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/ref-board/` |
| config キー | `plugins.ref-board`（boardChannelId） |
| DB テーブル | `ref_boards` / `ref_items`（本プラグイン所有） |
| ローカルファイル | `data/ref-media/`（保存画像。削除は手動） |
| intents | Guilds / GuildMessages / MessageContent（共有） |
| コマンド表面 | `/ref boards|view` ＋ 右クリック「ボードに保存」 |
| customId 空間 | `ref:*` |
| 外部通信 | 保存時の画像ダウンロードのみ（Discord CDN / 元 URL への read-only GET） |
| 依存元 | なし |

## 設計判断

- **modal にセレクトを置けない Discord 制約**のため、保存フローは
  右クリック → ephemeral セレクト → （新規時のみ）命名 modal の2段
- 画像ローカル保存は **content-type が image/* かつ 10MB 以下**のみ。
  ダウンロード失敗は致命でない（URL 参照で保存は成立、💾 マークなし）
- ボードカードは「最新8件＋件数」のテキストカード（embed 抑制）。
  グリッド表示は Discord の embed 制約により見送り（カタログ時の判断どおり）
- ストレージ肥大は retention 基盤（将来）で TTL 管理予定。それまでは手動

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ③リポジトリ | `repository.js`（boards / items） |
| ④ビュー | `buildBoardCard` |
| ⑤メディア方針 | `media.js`（画像のみ・上限・失敗許容）— anime/relay 以外で初の⑤層実装 |
| ⑥ライフサイクル | `saveMessageToBoard` / `refreshBoardCard` |
| ⑦入力経路 | 右クリック＋セレクト＋modal＋`/ref` |

①②⑧⑨は該当なし。
