// npm run plugins:prune -- <keep...> [--apply]
// loadout（残すプラグイン集合）を渡すと、loadout 外のプラグインフォルダを削除する
// （design spec §11 の一括削除機構）。既定は dry-run。--apply で実削除。
// 残すプラグインが消すプラグインに dependsOn していたら拒否する（依存整合検査）。
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const pluginsDir = path.join(projectRoot, 'src', 'plugins');
const { discoverPluginManifests } = require(path.join(projectRoot, 'src', 'core', 'pluginLoader'));

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const keepNames = args.filter((arg) => !arg.startsWith('--'));

const manifests = discoverPluginManifests(pluginsDir);
const allNames = manifests.map((manifest) => manifest.name);

if (keepNames.length === 0) {
  console.error('Usage: npm run plugins:prune -- <残すプラグイン...> [--apply]');
  console.error(`  現在のプラグイン: ${allNames.join(', ')}`);
  console.error('  例: npm run plugins:prune -- timeline-relay question welcome --apply');
  process.exit(1);
}

const unknown = keepNames.filter((name) => !allNames.includes(name));

if (unknown.length > 0) {
  console.error(`存在しないプラグイン名: ${unknown.join(', ')}`);
  console.error(`  現在のプラグイン: ${allNames.join(', ')}`);
  process.exit(1);
}

const keepSet = new Set(keepNames);
const removeManifests = manifests.filter((manifest) => !keepSet.has(manifest.name));

if (removeManifests.length === 0) {
  console.log('削除対象はありません（全プラグインが loadout に含まれています）。');
  process.exit(0);
}

// 依存整合検査: 残すプラグインが消すプラグインに依存していたら拒否
const removeSet = new Set(removeManifests.map((manifest) => manifest.name));
const violations = [];

for (const manifest of manifests) {
  if (!keepSet.has(manifest.name)) {
    continue;
  }

  for (const dependency of manifest.dependsOn || []) {
    if (removeSet.has(dependency)) {
      violations.push(`  ${manifest.name} → ${dependency}`);
    }
  }
}

if (violations.length > 0) {
  console.error('拒否: 残すプラグインが削除対象に依存しています。');
  console.error(violations.join('\n'));
  console.error('依存元も loadout から外すか、依存先を loadout に含めてください。');
  process.exit(1);
}

console.log(`loadout（残す ${keepNames.length}）: ${[...keepSet].join(', ')}`);
console.log(`削除対象（${removeManifests.length}）:`);

for (const manifest of removeManifests) {
  console.log(`  src/plugins/${manifest.name}/`);
}

if (!apply) {
  console.log('');
  console.log('dry-run です。実際に削除するには --apply を付けてください。');
  process.exit(0);
}

for (const manifest of removeManifests) {
  fs.rmSync(path.join(pluginsDir, manifest.name), { recursive: true, force: true });
  console.log(`削除: src/plugins/${manifest.name}/`);
}

console.log('');
console.log('後始末チェックリスト（各プラグインの blueprint.md「Removal footprint」参照）:');
console.log('  1. config.json / config.example.json の plugins ブロックと機能固有キーを削除');
console.log('  2. 既デプロイ DB に残る不要テーブルの整理（per-plugin migrations 化＝Stage D まで手動）');
console.log('  3. npm run check で整合確認');
console.log('  4. npm run register-commands で slash コマンド表面を同期');
console.log('  5. 取り消す場合: git checkout -- src/plugins/');
