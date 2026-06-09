require('dotenv').config();

const path = require('node:path');
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const { loadConfig } = require('./config/loadConfig');
const { discoverPluginManifests, resolveEnabledManifests } = require('./core/pluginLoader');
const { createLogger } = require('./services/logger');

function collectPluginRegistrationData() {
  const appConfig = loadConfig(path.resolve(process.cwd(), 'config.json'));
  const manifests = resolveEnabledManifests(
    discoverPluginManifests(path.resolve(__dirname, 'plugins')),
    appConfig.plugins
  );

  return manifests
    .flatMap((manifest) => manifest.commands || [])
    .filter((command) => command.enabled !== false)
    .map((command) => command.data.toJSON());
}

async function registerCommands() {
  const logger = createLogger('commands');
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId || !guildId) {
    throw new Error('DISCORD_TOKEN, CLIENT_ID, GUILD_ID must be set in .env');
  }

  const rest = new REST({ version: '10' }).setToken(token);
  const payload = [...commands.registrationData, ...collectPluginRegistrationData()];

  const names = payload.map((command) => command.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

  if (duplicates.length > 0) {
    throw new Error(`Duplicate command names across core and plugins: ${duplicates.join(', ')}`);
  }

  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: payload
  });

  logger.info('Command registered', {
    guildId,
    commandNames: payload.map((command) => command.name)
  });
}

registerCommands().catch((error) => {
  const logger = createLogger('commands');
  logger.error('Failed to register commands', {
    error: error.message,
    stack: error.stack
  });
  process.exitCode = 1;
});
