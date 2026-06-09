require('dotenv').config();

const path = require('node:path');
const { createBotClient } = require('./client');
const { loadConfig } = require('./config/loadConfig');
const { createDatabase } = require('./db/database');
const { createLogger } = require('./services/logger');
const { notifyOpsChannel } = require('./modules/ops/notify');
const { createEventRouter } = require('./core/eventRouter');
const {
  discoverPluginManifests,
  resolveEnabledManifests,
  assertDependenciesSatisfied,
  sortByDependencies,
  loadPlugins
} = require('./core/pluginLoader');

const bootstrapLogger = createLogger('app');
let activeClient = null;
let activePluginRuntime = null;
let shuttingDown = false;

async function notifyFatal(title, error) {
  if (!activeClient?.isReady?.()) {
    return;
  }

  await notifyOpsChannel(activeClient, [
    title,
    `- Error: ${error?.message || String(error)}`,
    `- PID: ${process.pid}`
  ].join('\n'));
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  bootstrapLogger.warn('Shutdown requested', { signal, exitCode });

  if (activeClient?.isReady?.()) {
    await notifyOpsChannel(activeClient, [
      '⚠️ Otaku Assistant shutting down',
      `- Signal: ${signal}`,
      `- PID: ${process.pid}`
    ].join('\n'));
  }

  activePluginRuntime?.teardown();

  try {
    activeClient?.destroy();
  } catch (error) {
    bootstrapLogger.warn('Failed to destroy Discord client during shutdown', {
      signal,
      error: error.message
    });
  }

  process.exit(exitCode);
}

async function main() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  const appConfig = loadConfig(configPath);
  const database = createDatabase(path.resolve(process.cwd(), 'data', 'otaku-assistant.db'));

  const client = createBotClient({
    appConfig,
    database,
    logger: bootstrapLogger
  });
  activeClient = client;

  const eventRouter = createEventRouter({ logger: bootstrapLogger });
  const manifests = discoverPluginManifests(path.resolve(__dirname, 'plugins'));
  const enabledManifests = sortByDependencies(
    resolveEnabledManifests(manifests, appConfig.plugins)
  );
  assertDependenciesSatisfied(enabledManifests);
  activePluginRuntime = loadPlugins({
    manifests: enabledManifests,
    client,
    db: database,
    config: appConfig,
    logger: bootstrapLogger,
    eventRouter
  });
  eventRouter.attach(client);
  bootstrapLogger.info('Plugins loaded', {
    discovered: manifests.map((manifest) => manifest.name),
    enabled: activePluginRuntime.loaded
  });

  client.once('shardError', (error) => {
    bootstrapLogger.error('Discord shard error', { error: error.message });
  });

  await client.login(process.env.DISCORD_TOKEN);
}

process.on('unhandledRejection', async (reason) => {
  bootstrapLogger.error('Unhandled promise rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
  await notifyFatal('⚠️ Otaku Assistant unhandled rejection', reason);
});

process.on('uncaughtException', async (error) => {
  bootstrapLogger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack
  });
  await notifyFatal('❌ Otaku Assistant uncaught exception', error);
  await shutdown('uncaughtException', 1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT', 0);
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM', 0);
});

main().catch((error) => {
  bootstrapLogger.error('Failed to start bot', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
