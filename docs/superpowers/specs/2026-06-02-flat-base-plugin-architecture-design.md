# フラット基盤 ＋ 着脱式プラグイン アーキテクチャ 設計 (Phase 1)

- 日付: 2026-06-02
- 対象リポジトリ: Otaku-Assistant_MOAI (discord.js / Node.js / better-sqlite3 / Components V2)
- 基盤アプリ名: **Armature**（各サーバーの有効構成＝有効plugin＋capability一式を **loadout** と呼ぶ）
- ステータス: ドラフト（ユーザーレビュー前）

## 1. 背景と目的

このリポジトリを「特定サーバー専用ボット」から、**サーバー横断で転用できるフラットな基盤**へ作り替える。

全体ロードマップ（5フェーズ）:

1. **（本 spec）** このリポをベースに中立な基盤を作る
2. 基盤をリポに上げ、各サーバー用にフォーク
3. 仕事用サーバーA へチューニング
4. 確認後、仕事用サーバーB へチューニング
5. 確認しつつ、身内向けサーバーへチューニング

### この spec の範囲（Phase 1）

- 汎用 Core ＋ Shared services ＋ 着脱式 Feature plugins への再編
- ディスカバリ型ローダ / イベントルータ / per-plugin の migrations・repository・config
- 2段階トグル（プラグイン on/off ＋ capability フラグ）
- 機能アナトミー（9層の型）と blueprint / `plugin:new` 足場
- 一括削除機構（prune ツール＋自己完結性検証）
- timeline スコープ模型（集約範囲 / 表示範囲 / バリア）の **データ模型・サービスIF まで**
- 管理面の方針（Discordネイティブ基盤＋ admin-dashboard 既定OFF）

### 非範囲（後続 spec）

- `admin-dashboard` プラグインの UI 実装（別 spec）
- timeline スコープ管理 UI の実装（別 spec）
- 各サーバー個別チューニング（フェーズ3〜5、各々別 spec）

## 2. 設計原則

1. **誰も個別 import しない**: Core は特定プラグイン名を一切参照しない。結線はディスカバリ（フォルダ走査＋マニフェスト）。
2. **1フォルダ = 1削除単位**: `src/plugins/<name>/` を消す＋config該当ブロックを消すだけで綺麗に外れる（他ファイル編集ゼロ）。セキュリティ上、未使用コードをフォークに残さないことを必須要件とする。
3. **2段階のつけ外し**: プラグイン単位（着脱・削除）＋ capability 単位（層 ON/OFF）。侵襲的な層は既定 OFF。
4. **型で揃える**: anime の9層構造を「機能の作り方テンプレート」として、文書（blueprint）と足場（`plugin:new`）の両方で強制。新機能は同じ形に乗せて作る。
5. **設定はスキーマが単一ソース**: 各プラグインの config スキーマが「検証」と「管理UIフォーム」の双方を駆動。

## 3. 全体像（3層）

| 層 | 役割 | 中身 |
|---|---|---|
| **Core** (`src/core/`) | ボットの土台。機能を持たず、特定プラグインを知らない | bootstrap / client(intents union) / pluginLoader / eventRouter / interactionRouter / configService / db(migrationRunner, repository mount) / logger / ops(health, notify) |
| **Shared services** (`src/shared/`) | 複数プラグインが依存する土台。単体では「機能」でない | messageArchive / introProfiles(読取API) / guildMembers / deletableMessages / discordLinks / util(text, permissions, accentColors) |
| **Feature plugins** (`src/plugins/<name>/`) | 着脱対象（既定OFF・削除可） | timeline-relay / anime / vc-profile / intro / welcome / question / entrance-guide / llm / admin-dashboard(別spec) |

> プラグインの正確な粒度（特に `intro-profiles` を shared に切り出す線引き、`timeline-relay` 内の hashtag-routing 分離可否）は plan 段階で依存を実測して確定する。

## 4. プラグイン契約（マニフェスト）

各 `src/plugins/<name>/plugin.js` が、そのプラグインの全結線を自己完結で宣言する。

```js
module.exports = {
  name: 'anime',
  enabledByDefault: false,
  dependsOn: ['message-archive', 'timeline-relay'], // 依存ユニット: 他プラグイン/任意shared — prune・起動で存在&有効を検査
  intents: ['GuildMessages', 'MessageContent'],     // 必要 intent のみ宣言
  capabilities: {                                   // 層 ON/OFF の既定
    engagement: false,    // 侵襲的なので既定OFF
    crossFeature: false,
  },
  config:     require('./config'),       // 設定スキーマ / 既定値 / 検証（capability含む）
  migrations: require('./migrations'),   // このプラグインの CREATE TABLE だけ
  repository: require('./repository'),   // db.<name> ファクトリ（prepared statements）
  commands:  [require('./inputs/command')], // slash + component ハンドラ
  events: {                              // 優先度つき・true を返すと以降停止
    messageCreate: { priority: 50, handle: require('./inputs/events').onMessage },
  },
  init(ctx)     {/* interval / 状態をここで持つ（client 直書きを廃止）*/},
  teardown(ctx) {/* interval 解除 */},
};
```

`ctx = { client, db, config, logger, services }`。`services` は Shared services ＋ `dependsOn` で宣言した他プラグインの公開API。

## 5. ディスカバリ型ローダ（起動シーケンス）

`src/core/pluginLoader.js`:

1. `src/plugins/*/plugin.js` を走査
2. 有効集合を決定（`enabledByDefault` を config が上書き可能）
3. `dependsOn` をトポロジカル順に解決。**有効プラグインが無効/不在に依存していたら起動エラー**（fail-fast）
4. 有効プラグインの `intents` を **union** して `client` を生成（不要機能を消すと intent 表面も縮む＝セキュリティ向上）
5. 有効プラグインの `migrations` のみ実行し、`repository` を `db.<name>` にマウント
6. `commands` / component ハンドラを登録
7. `eventRouter` が Discord イベントごとに 1 リスナを張り、有効プラグインのハンドラを priority 順に dispatch（`true` で停止）
8. `init(ctx)` を起動、shutdown 時に `teardown(ctx)`

## 6. イベントルータ

現状は各 `events/*.js` が全モジュールを直接 import して直列実行している（`messageCreate` は9処理を内包）。これを反転する:

- Core が `client.on('<event>', ...)` を 1 つだけ張る
- 登録ハンドラを `priority` 昇順で呼ぶ。各ハンドラは `true` を返すと以降を停止（現状の早期 return セマンティクスを保持）
- 各ハンドラは Core が try/catch でラップし、1つの失敗が他を巻き込まない

`interactionRouter.js`: スラッシュは `command.execute`、コンポーネントは各プラグインが登録した `handleComponentInteraction` を順に試す（**現状の anime 決め打ちを廃止**）。

## 7. DB: per-plugin migrations + repository

現状の阻害要因（読込で確定）:

- `src/db/migrations.js`（555行）… 全テーブルを 1 関数で作成
- `src/db/database.js`（2687行）… 全機能の prepared statement を 1 ファイルに集約し `db.anime` / `db.relays` 等として名前空間提供

→ 各プラグインが自分の `migrations.js`（CREATE TABLE）と `repository.js`（statement＋アクセサ）を持つ。Core の `migrationRunner` が有効プラグイン分のみ実行し、`db[plugin.name] = plugin.repository(sqlite)` でマウント。

- プラグイン削除 → tables は作られず、repository も生えない
- 既デプロイ DB に残る不要 tables は prune ツールが一覧（`--drop-tables` で任意削除）
- プラグイン間のテーブル依存（例: anime が timeline-relay の relay 記録を参照）は `dependsOn` で表明し、blueprint と prune が整合を保証

## 8. 設定: config-as-schema

各プラグインの `config.js` が「スキーマ＋既定値＋検証＋正規化」を1箇所で定義（現状 `loadConfig.js` の集中検証を分解）。Core の `configService` が:

- 有効プラグインのスキーマをマージし、`config.json`（または DB）を検証・ロード
- 同じスキーマから管理UIのフォームを自動生成（→ プラグインを足すと管理パネルも自動で生える）
- 保存IF（`load` / `validate` / `save`）を提供し、Discordコマンド・Webダッシュボード双方の単一の真実源とする

## 9. 2段階トグル: プラグイン on/off ＋ capability

- **第1段階（プラグイン単位）**: `enabledByDefault` ＋ config 上書き。削除も可。
- **第2段階（capability 単位）**: プラグイン config 内のフラグで「層」を ON/OFF。lifecycle 等が各 capability をフラグでガード。
- **loadout**: 第1＋第2段階で確定する「そのフォークの有効構成（有効plugin＋capabilityフラグ一式）」を **loadout** と呼ぶ。`configService` がこれを単一の真実源とし、起動時の有効集合・prune・admin-dashboard が参照する。
- **掟**: 邪魔になりうる層は必ずフラグの後ろに置き、侵襲的なものは既定 OFF。
  - 例: anime の **engagement**（レビューロール／記念DM）は `anime.capabilities.engagement = false` 既定。`updateReviewRoles`＋祝福DMを丸ごとガード。仕事サーバーで無効。

## 10. 機能アナトミー（9層の型）と blueprint

anime を参照実装とする「1機能の完成形」の9層。各層は **[core]=無いと成立しない / [capability]=独立ON/OFF** で分類:

| 層 | 区分 | 既定 | anime の実装位置 |
|---|---|---|---|
| ①プロバイダ（外部API＋キャッシュ） | core*（外部データ使用時） | — | `annictClient.js` / `anilistClient.js` |
| ②解決（検索/名寄せ/ランク） | core*（検索系） | — | `search.js` / `titleAliases.js` |
| ③リポジトリ（永続化・cascade削除） | core | — | `db.anime.*` ＋ `anime_*` テーブル |
| ④ビュー（データ→payload・純関数） | core | — | `buildAnimeMessages.js` |
| ⑤メディア方針（検証・キャッシュ・劣化動作） | capability | ON | `imagePolicy.js` |
| ⑥ライフサイクル（create/update/teardown＋整合） | core | — | `postAnimeToChannel` / `update*Card` / `runAnimeOrphanScan` |
| ⑦入力経路（slash＋reaction＋reply） | core(slash)＋capability(他) | slashのみON | `inputs/`（`handleAnimeWatchedPromptReply` 等） |
| ⑧エンゲージメント（カウンタ→ロール→通知） | capability | **OFF** | `updateReviewRoles` / `sendAnimeRoleCongratulations` |
| ⑨機能間連携（他機能の pipeline 合成） | capability | OFF | `hashtagIntegration.js` / `updateAnimeRelayedCards` |

### blueprint（2種）

- `docs/blueprints/feature-anatomy.md` … 9層の汎用テンプレ（型カタログ本体）。各層に「目的 / core or capability / 再利用パターン / anime の参照位置」。
- `src/plugins/<name>/blueprint.md` … その実例。**Removal footprint**（フォルダ / config キー / テーブル / intents / 依存元）＋ **capability 一覧**（各フラグが何を ON/OFF するか・既定・有効化すべき場面）。

### `npm run plugin:new <name>` 足場

最初から anime の形でスケルトンを生成:

```
src/plugins/<name>/
  plugin.js        config.js        migrations.js     repository.js
  providers/       resolve.js       view/             lifecycle.js
  inputs/          engagement.js    blueprint.md
```

`blueprint.md` はテンプレから生成し、9層の core/capability 記入を促す。

## 11. 一括削除機構（bulk removal）

- 削除手順 = `src/plugins/<name>/` 削除 ＋ config 該当ブロック削除。他ファイル編集ゼロ。
- `npm run plugins:prune` … 残す集合（＝そのフォークの **loadout**）を渡すと loadout 外のフォルダを削除し、**依存整合を検査**（残すプラグインが消すプラグインに依存していたら拒否）、孤立 tables を一覧（`--drop-tables` で任意削除）、結果を要約。
- `npm run check` 拡張 … マニフェスト検証 ／ **プラグイン跨ぎの深い import 禁止**（依存は `ctx.services` 経由のみ）／ Core が特定プラグイン名を参照していないことを保証 ／ 各 blueprint.md の Removal footprint 必須項目チェック。

## 12. timeline スコープ模型（集約 / 表示 / バリア）

現状 `timelineChannelId`（単一）を **TimelineScope[]** に一般化（timeline-relay プラグインの capability）。`@silent` 等の投稿単位抑制とは直交。既存の「1ソース→複数宛先」配管（`relayed_message_targets`）を土台に拡張。

```
TimelineScope {
  id, name,
  destinationChannelId,   // 表示範囲: 出力先。誰が見えるかは Discord のカテゴリ/ロール権限が支配
  barrierTier,            // 情報バリア階層（例 public=1 / internal=2 / secret=3）
  sources: [              // 集約範囲: 取り込み元
    { type: 'category'|'channel'|'forum', id, forumType?, mode: 'include'|'exclude' }
  ]
}
```

Discord 権限と同じ発想:

- **集約はカテゴリ単位が基本**。`category include` → 配下を取り込み、`channel exclude` で個別に外す（カテゴリ権限＋チャンネル上書きと同型の階層解決）。
- **表示範囲＝宛先の可視性は Discord に委ねる**（ロール/カテゴリ権限）。ボットの責務は **バリア強制**: ソース投稿はそれを含むスコープにしか中継せず、`barrierTier` により「高Tierソース→低Tierスコープ」を機械的に拒否（私的カテゴリの内容が公開タイムラインへ漏れない）。
- **カテゴリ単位でタイムライン分割** = スコープを複数定義し各宛先を各カテゴリ内に置く。
- 後方互換: スコープ1個＝現行挙動。

この spec ではデータ模型と `configService` 上のサービスIF（CRUD＋バリア検証）まで。管理 UI は後続 spec。

## 13. 管理面

土台は §8 の `configService`（スキーマ駆動）。面は2系統:

- **A: Discordネイティブ基盤（常時オン）** … スラッシュ＋Components V2。`ChannelSelect`/`RoleSelect` で範囲指定、modal で命名/Tier。認可は Discord 管理者権限、Web 表面ゼロ。既存流儀（anime/maintenance）と同型。
- **B: admin-dashboard プラグイン（既定OFF・別spec）** … ローカル Web ダッシュボード。`127.0.0.1` バインド（SSHトンネル/リバプロ経由）、Discord OAuth2 で管理者限定、CSP/CSRF/HTTPS。カテゴリ×スコープ行列・バリア色分け・プレビュー・全プラグイン設定の一元管理。**管理画面自体を着脱式・既定OFF・要塞化前提のプラグインにする**ことで、安全第一＋サーバー毎最適の思想と一致させる。

## 14. ディレクトリ構成

```
src/
  index.js                 # require('./core/bootstrap')
  core/
    bootstrap.js  client.js  pluginLoader.js  eventRouter.js
    interactionRouter.js  configService.js
    db/ database.js  migrationRunner.js
    ops/ health.js  notify.js
    logger.js
  shared/
    messageArchive/  introProfiles/  guildMembers/  deletableMessages/
    discordLinks.js  util/ (text, permissions, accentColors)
  plugins/
    timeline-relay/  anime/  vc-profile/  intro/  welcome/
    question/  entrance-guide/  llm/  admin-dashboard/(別spec)
docs/
  blueprints/ feature-anatomy.md
  superpowers/specs/ ...
scripts/
  pluginNew.js  prunePlugins.js  check.js(拡張)
```

## 15. 段階移行計画（動かしながら / strangler-fig）

不変条件: **各段階で family（現otaku）サーバーが動作し続ける**こと。

- **A. 足場導入**: `core/` に pluginLoader/eventRouter/configService を追加。既存 `modules/` は並走。0プラグインでも現行挙動を壊さない。
- **B. 低リスク機能で型確立**: question か welcome-reactions を最初に `plugins/` へ移送。`npm run check`＋該当イベント実機確認。
- **C. anime を参照実装として移送**: engagement を capability OFF 化。
- **D. DB モノリス分解**: 移送済み分から `migrations.js`/`database.js` を per-plugin に切り出し。
- **E. 旧結線撤去**: `client.js` 直書き＋`commands/index` 静的 list を撤去 → 完全ディスカバリ化。
- **F. 仕上げ**: config-as-schema 化、prune/plugin:new ツール、feature-anatomy.md＋各 blueprint.md 整備。

## 16. テスト

- **`npm run check` 拡張**: マニフェスト検証 / 跨ぎ深い import 禁止 / per-plugin migrations を一時DBで実行 / config スキーマ検証 / blueprint Removal footprint 必須チェック。
- **単体**: resolve(検索), view(builder純関数), config schema, scope解決。
- **結合**: イベントルータの優先度・停止、loader の依存解決と「無効依存で起動エラー」、prune の依存検査。
- **バリア**: 高Tierソースが低Tierスコープに出ないことの漏洩テスト。

## 17. 現状の密結合 → 対応

| 現状 | 問題 | 対応 |
|---|---|---|
| `client.js` 全イベント直接 import ＋ client へ状態直書き | 削除で壊れる | eventRouter ＋ plugin `init()` が状態を保持 |
| `events/*.js` が全モジュール直列呼び | 同上 | priority つき登録ハンドラへ反転 |
| `interactionCreate.js` の anime 決め打ち | 特定機能依存 | component ハンドラ登録制 |
| `db/migrations.js` 一括作成 | 一括削除不可 | per-plugin migrations |
| `db/database.js` 2687行集中 | 同上 | per-plugin repository を `db.<name>` マウント |
| `loadConfig.js` 集中検証 | 同上 | per-plugin config スキーマ |
| anime → `timelineRelay/*`・`deletableMessages` 深い import | 独立削除不可 | Shared services 化＋`dependsOn` 宣言 |

## 18. 決定事項と残課題（2026-06-02 更新）

1. **命名・脱ブランド — 決定済み: 基盤アプリ名 = `Armature`**。
   - ベースアプリ（Armature）を1つ作り、それをフォークして各サーバー特化へ作り替える運用を前提とする。
   - **loadout**: 各フォーク／サーバーの有効構成（有効plugin＋capability一式）を指す用語。`configService`・prune・admin-dashboard が共有する中核概念。
   - リネーム対象: リポ名 → `armature` / `package.json` name / systemd サービス名（`otaku-assistant.service` → `armature.service`）/ DB ファイル名（`otaku-assistant.db` → `armature.db`、`DB_PATH` env で可変）/ コード内 "Otaku Assistant" 文言 → `botIdentity.name`（config 駆動、フォークが個別表示名を持てる）。
   - CLI 候補: `armature new-plugin` / `armature prune` 等へ統合（現 `npm run plugin:new` / `plugins:prune` をラップ。plan で確定）。
2. **プラグイン粒度 — plan 段階で確定**。`intro`（profiles/reactions/dm）/ `welcome`（reactions/dm）/ `question`（resolver/watcher）を束ねるか分割するかは依存実測後に決める。`intro-profiles` は被依存のため shared 側へ切り出す前提。
3. **config の保存先 — 決定: ローカルファイル先行、DB 化を見据えた構造**。
   - まず `config.json`＋per-plugin スキーマ検証で設計。
   - `configService` の保存IF（load / validate / save）を差し替え可能にし、将来の DB 化時に **per-scope / per-entity のより細かい粒度**の設定へ拡張できる構造にしておく。
