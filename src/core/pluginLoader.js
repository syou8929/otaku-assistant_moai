const fs = require('node:fs');
const path = require('node:path');

/**
 * ディスカバリ型プラグインローダ。
 * src/plugins/<name>/plugin.js を走査し、マニフェスト契約
 * （design spec §4: name / enabledByDefault / dependsOn / intents /
 *   commands / events / init / teardown）に従って結線する。
 * Core は特定プラグイン名を一切参照しない。
 */

function validateManifest(manifest, folderName) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Plugin "${folderName}" must export a manifest object from plugin.js`);
  }

  if (manifest.name !== folderName) {
    throw new Error(
      `Plugin manifest name "${manifest.name}" must match its folder name "${folderName}"`
    );
  }

  if (manifest.dependsOn !== undefined && !Array.isArray(manifest.dependsOn)) {
    throw new Error(`Plugin "${manifest.name}": dependsOn must be an array`);
  }

  if (manifest.intents !== undefined && !Array.isArray(manifest.intents)) {
    throw new Error(`Plugin "${manifest.name}": intents must be an array`);
  }

  if (manifest.commands !== undefined) {
    if (!Array.isArray(manifest.commands)) {
      throw new Error(`Plugin "${manifest.name}": commands must be an array`);
    }

    for (const command of manifest.commands) {
      if (!command?.data?.name || typeof command.execute !== 'function') {
        throw new Error(
          `Plugin "${manifest.name}": each command needs data.name and an execute function`
        );
      }
    }
  }

  if (manifest.events !== undefined) {
    if (typeof manifest.events !== 'object' || Array.isArray(manifest.events)) {
      throw new Error(`Plugin "${manifest.name}": events must be an object keyed by event name`);
    }

    for (const [eventName, entry] of Object.entries(manifest.events)) {
      if (typeof entry?.handle !== 'function') {
        throw new Error(
          `Plugin "${manifest.name}": events.${eventName} needs a handle function`
        );
      }
    }
  }

  for (const hookName of ['init', 'teardown']) {
    if (manifest[hookName] !== undefined && typeof manifest[hookName] !== 'function') {
      throw new Error(`Plugin "${manifest.name}": ${hookName} must be a function`);
    }
  }
}

function discoverPluginManifests(pluginsDir) {
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }

  const manifests = [];

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(pluginsDir, entry.name, 'plugin.js');

    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    const manifest = require(manifestPath);
    validateManifest(manifest, entry.name);
    manifests.push(manifest);
  }

  return manifests;
}

function resolveEnabledManifests(manifests, pluginsConfig = {}) {
  return manifests.filter((manifest) => {
    const override = pluginsConfig[manifest.name]?.enabled;
    return override !== undefined ? override !== false : manifest.enabledByDefault === true;
  });
}

/**
 * 有効プラグインの dependsOn を検査する。依存先は「有効なプラグイン」か
 * 「提供済み shared service 名」のどちらかでなければ起動エラー（fail-fast）。
 */
function assertDependenciesSatisfied(enabledManifests, availableServiceNames = new Set()) {
  const enabledNames = new Set(enabledManifests.map((manifest) => manifest.name));

  for (const manifest of enabledManifests) {
    for (const dependency of manifest.dependsOn || []) {
      if (!enabledNames.has(dependency) && !availableServiceNames.has(dependency)) {
        throw new Error(
          `Plugin "${manifest.name}" depends on "${dependency}", which is neither an enabled plugin nor an available service`
        );
      }
    }
  }
}

/** プラグイン間依存をトポロジカル順に並べる。循環依存は起動エラー。 */
function sortByDependencies(enabledManifests) {
  const byName = new Map(enabledManifests.map((manifest) => [manifest.name, manifest]));
  const sorted = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(manifest, trail) {
    if (visited.has(manifest.name)) {
      return;
    }

    if (visiting.has(manifest.name)) {
      throw new Error(`Plugin dependency cycle detected: ${[...trail, manifest.name].join(' -> ')}`);
    }

    visiting.add(manifest.name);

    for (const dependency of manifest.dependsOn || []) {
      const dependencyManifest = byName.get(dependency);

      if (dependencyManifest) {
        visit(dependencyManifest, [...trail, manifest.name]);
      }
    }

    visiting.delete(manifest.name);
    visited.add(manifest.name);
    sorted.push(manifest);
  }

  for (const manifest of enabledManifests) {
    visit(manifest, []);
  }

  return sorted;
}

/**
 * 有効プラグインを結線する。
 * - commands を client.commands へ登録（既存 interactionCreate の経路に乗る）
 * - events を eventRouter へ priority つきで登録（ctx を末尾引数で渡す）
 * - init(ctx) を依存順に実行
 * 返り値の teardown() は逆順で teardown(ctx) を呼ぶ。
 */
function loadPlugins({ manifests, client, db, config, logger, services = {}, eventRouter }) {
  const loadedEntries = [];

  for (const manifest of manifests) {
    const ctx = { client, db, config, logger, services };

    for (const command of manifest.commands || []) {
      if (command.enabled === false) {
        continue;
      }

      if (client.commands.has(command.data.name)) {
        throw new Error(
          `Plugin "${manifest.name}" command "${command.data.name}" conflicts with an existing command`
        );
      }

      client.commands.set(command.data.name, command);
    }

    for (const [eventName, entry] of Object.entries(manifest.events || {})) {
      eventRouter.register(eventName, {
        name: `${manifest.name}:${eventName}`,
        priority: entry.priority,
        once: entry.once,
        handle: (...args) => entry.handle(...args, ctx)
      });
    }

    manifest.init?.(ctx);
    loadedEntries.push({ manifest, ctx });
  }

  return {
    loaded: loadedEntries.map((entry) => entry.manifest.name),
    teardown() {
      for (const entry of [...loadedEntries].reverse()) {
        try {
          entry.manifest.teardown?.(entry.ctx);
        } catch (error) {
          logger.warn('Plugin teardown failed', {
            plugin: entry.manifest.name,
            error: error.message
          });
        }
      }
    }
  };
}

module.exports = {
  discoverPluginManifests,
  resolveEnabledManifests,
  assertDependenciesSatisfied,
  sortByDependencies,
  loadPlugins,
  validateManifest
};
