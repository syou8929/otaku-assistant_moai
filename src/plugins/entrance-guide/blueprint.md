# entrance-guide プラグイン blueprint

入口チャンネルへ Components V2 のガイドカード一式を投稿・更新する（`content/entranceGuide.md` を
ソースに card 群を構築）。`/guide-post` は案内用の任意テキストを管理者が投稿する補助コマンド
（実測ではガイド本体とコード依存なし。「案内系を同時に ON/OFF したい単位」として同梱）。

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | `src/plugins/entrance-guide/` |
| コンテンツ | `content/entranceGuide.md`（cwd 相対で読込。`npm run post-entrance-guide` の引数で差し替え可） |
| config キー | `entranceChannelId` / `plugins.entrance-guide`（注: 現状 `loadConfig.js` 共通スキーマに残置。Stage F で本プラグインへ移動） |
| DB テーブル | なし |
| intents | Guilds（他プラグインと共有） |
| npm script | `post-entrance-guide`（`scripts/postEntranceGuide.js` → 本プラグインの `guide.js` を参照） |
| 依存元（過渡的） | `src/commands/maintenance.js` の `post-entrance-guide` サブコマンドが deep import（maintenance 分解＝Stage E〜F で解消） |

## 既知の中立性課題（Stage F で対応）

- `guide.js` の `STATIC_CHANNELS` にサーバー固有のチャンネル ID がハードコードされている。
  基盤化（Armabot）時に config 駆動へ抽出が必要。

## 9層アナトミー対応

| 層 | 実装 |
|---|---|
| ④ビュー | `guide.js`（card builder 群・純関数寄り） |
| ⑥ライフサイクル | `postEntranceGuide`（既存ガイドの更新/再投稿） |
| ⑦入力経路 | `/guide-post` slash（`command.js`）＋ maintenance サブコマンド（過渡的）＋ CLI script |

①②③⑤⑧⑨は該当なし。
