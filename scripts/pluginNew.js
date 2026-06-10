// npm run plugin:new <name> — プラグインの足場を生成する（design spec §10）。
// 既存 8 プラグインで安定した manifest 契約と blueprint の型をそのまま雛形にする。
// 新規プラグインは spec の原則どおり既定 OFF（enabledByDefault: false）で生成される。
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const name = process.argv[2];

if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Usage: npm run plugin:new <kebab-case-name>');
  console.error('  例: npm run plugin:new birthday-celebration');
  process.exit(1);
}

const pluginDir = path.join(projectRoot, 'src', 'plugins', name);

if (fs.existsSync(pluginDir)) {
  console.error(`src/plugins/${name}/ は既に存在します。`);
  process.exit(1);
}

const pluginJs = `module.exports = {
  name: '${name}',
  // 新規プラグインは既定 OFF（spec §9）。有効化は config.json の
  // plugins['${name}'].enabled = true で行う。
  enabledByDefault: false,
  // 依存する他プラグイン名。起動時に存在と有効を検査され、
  // ctx.services[依存名] で公開 API を使える。
  dependsOn: [],
  // この機能が必要とする Gateway intents（宣言のみ。Stage E で client 生成に反映）
  intents: ['Guilds'],
  // 層単位の ON/OFF フラグ。侵襲的な層（エンゲージメント等）は既定 false にする
  capabilities: {},
  // slash コマンド: { data: SlashCommandBuilder, execute(interaction) } の配列
  commands: [],
  // イベント登録: { priority, once?, handle } または同一イベント複数なら
  // { name, priority, handle } の配列。priority <100 は legacy 前、>100 は後。
  // handle が true を返すと以降のハンドラを停止する。
  events: {},
  // 他プラグインへ公開する API（ctx.services['${name}'] として見える）
  api: {},
  // このプラグイン所有のテーブル（任意）: migrations(sqlite) を起動時に実行し、
  // repository(sqlite) の戻り値を db['${name}'] としてマウントする
  // migrations: require('./migrations'),
  // repository: require('./repository'),
  // スケジュールジョブ（任意）: handle(payload, ctx, job)。予約は ctx.scheduler から:
  //   ctx.scheduler.schedule({ plugin: '${name}', type: 'x', payload, runAt })
  //   ctx.scheduler.scheduleCron({ plugin: '${name}', type: 'x', cron: '0 9 * * *', key: 'k' })
  // jobs: { x: async (payload, ctx) => {} },
  // ボタン/セレクト/モーダルの受け口（任意）: customId は '${name}:action:args' 形式。
  // 先頭セグメントが prefix に一致すると handle(interaction, ctx) が呼ばれる
  // components: { prefix: '${name}', handle: async (interaction, ctx) => false },
  init(ctx) {
    // 起動時の初期化（login 前に同期実行される）。
    // interval や他プラグインへのフック登録はここで行う。
    // ctx = { client, db, config, logger, services, scheduler }
  },
  teardown(ctx) {
    // shutdown 時の後始末（init で張った interval の解除など）
  }
};
`;

const blueprintMd = `# ${name} プラグイン blueprint

（この機能が何をするかを 1〜3 行で）

## Removal footprint（このプラグインを外すときに消えるもの）

| 項目 | 内容 |
|---|---|
| フォルダ | \`src/plugins/${name}/\` |
| config キー | \`plugins.${name}\`（＋機能固有キーがあれば列挙） |
| DB テーブル | （あれば。Stage D までは db/migrations.js に追記し、ここに記録する） |
| intents | （manifest の宣言と一致させる） |
| client 状態 | （client.* に状態を持つ場合は列挙し、teardown で解除する） |
| フック | （他プラグインへ登録するフックがあれば） |
| 依存元 | （このプラグインに依存する他プラグイン。無ければ「なし」） |

## capability 一覧

| capability | 既定 | 内容 |
|---|---|---|
| （なし） | — | 侵襲的な層を持つ場合はフラグ化し、既定 OFF にする |

## 9層アナトミー対応（該当する層のみ記入。参照実装: src/plugins/anime/）

| 層 | 実装 |
|---|---|
| ①プロバイダ（外部API＋キャッシュ） | |
| ②解決（検索/名寄せ） | |
| ③リポジトリ（永続化） | |
| ④ビュー（データ→payload 純関数） | |
| ⑤メディア方針 | |
| ⑥ライフサイクル（create/update/teardown） | |
| ⑦入力経路（slash/reaction/reply） | |
| ⑧エンゲージメント（capability・既定OFF） | |
| ⑨機能間連携（フック登録） | |
`;

fs.mkdirSync(pluginDir, { recursive: true });
fs.writeFileSync(path.join(pluginDir, 'plugin.js'), pluginJs);
fs.writeFileSync(path.join(pluginDir, 'blueprint.md'), blueprintMd);

console.log(`Created src/plugins/${name}/`);
console.log('  plugin.js     … manifest（既定 OFF で生成）');
console.log('  blueprint.md  … Removal footprint / capability / 9層の記入テンプレート');
console.log('');
console.log('次の手順:');
console.log(`  1. config.example.json の plugins に "${name}": { "enabled": true } を追記`);
console.log(`  2. 自分の config.json でも有効化して動作確認`);
console.log('  3. npm run check（manifest 検証とコマンド名衝突検査が走る）');
