const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const ignoreDirs = new Set(['node_modules', '.git', 'data']);

function collectJsFiles(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue;
      }

      files.push(...collectJsFiles(path.join(directory, entry.name)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(path.join(directory, entry.name));
    }
  }

  return files;
}

const files = collectJsFiles(projectRoot);

for (const filePath of files) {
  execFileSync(process.execPath, ['--check', filePath], { stdio: 'inherit' });
}

// require 解決の検証: エントリポイント以外の src/ 全モジュールをロードする。
// node --check は構文のみで、壊れた require パス（モジュール移動の取りこぼし）を
// 検出できないため。index.js は bot 起動、registerCommands.js は Discord API を
// require 時に呼ぶため除外する。
const requireEntryPoints = new Set([
  path.join(projectRoot, 'src', 'index.js'),
  path.join(projectRoot, 'src', 'registerCommands.js')
]);
const srcPrefix = path.join(projectRoot, 'src') + path.sep;

for (const filePath of files) {
  if (!filePath.startsWith(srcPrefix) || requireEntryPoints.has(filePath)) {
    continue;
  }

  require(filePath);
}

const { createDatabase } = require(path.join(projectRoot, 'src', 'db', 'database'));
const {
  ANIME_QUOTES_PATH,
  validateAnimeQuoteDatabase
} = require(path.join(projectRoot, 'src', 'modules', 'anime', 'animeQuoteMessages'));
const commands = require(path.join(projectRoot, 'src', 'commands'));
const tempDatabasePath = path.join(os.tmpdir(), `otaku-assistant-check-${process.pid}.db`);
const database = createDatabase(tempDatabasePath);
database.sqlite.close();
fs.rmSync(tempDatabasePath, { force: true });
fs.rmSync(`${tempDatabasePath}-shm`, { force: true });
fs.rmSync(`${tempDatabasePath}-wal`, { force: true });

const { discoverPluginManifests } = require(path.join(projectRoot, 'src', 'core', 'pluginLoader'));
const pluginManifests = discoverPluginManifests(path.join(projectRoot, 'src', 'plugins'));
const pluginCommands = pluginManifests.flatMap((manifest) => manifest.commands || []);
const allCommands = [...commands.list, ...pluginCommands].filter((entry) => entry.enabled !== false);

for (const command of allCommands) {
  const optionCount = Array.isArray(command?.data?.options) ? command.data.options.length : 0;
  if (optionCount > 25) {
    throw new Error(`Command ${command.data?.name || 'unknown'} has too many top-level options: ${optionCount}`);
  }
}

const commandNames = allCommands.map((command) => command.data.name);
const duplicateNames = commandNames.filter((name, index) => commandNames.indexOf(name) !== index);
if (duplicateNames.length > 0) {
  throw new Error(`Duplicate command names across core and plugins: ${duplicateNames.join(', ')}`);
}

const configExample = JSON.parse(fs.readFileSync(path.join(projectRoot, 'config.example.json'), 'utf8'));
const animeQuoteValidation = validateAnimeQuoteDatabase({
  reviewRoles: configExample?.anime?.reviewRoles
});

if (!animeQuoteValidation.ok) {
  throw new Error(`Anime quote database validation failed for ${ANIME_QUOTES_PATH}: ${animeQuoteValidation.errors.join(' | ')}`);
}

console.log(`Checked ${files.length} JavaScript files.`);
console.log(`Validated ${pluginManifests.length} plugin manifest(s): ${pluginManifests.map((manifest) => manifest.name).join(', ') || '(none)'}`);
