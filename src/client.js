const { Client, Collection, GatewayIntentBits, Partials } = require('discord.js');
const commands = require('./commands');
const readyEvent = require('./events/ready');
const messageCreateEvent = require('./events/messageCreate');
const messageUpdateEvent = require('./events/messageUpdate');
const messageDeleteEvent = require('./events/messageDelete');
const messageBulkDeleteEvent = require('./events/messageBulkDelete');
const messageReactionAddEvent = require('./events/messageReactionAdd');
const interactionCreateEvent = require('./events/interactionCreate');
const voiceStateUpdateEvent = require('./events/voiceStateUpdate');
const guildMemberAddEvent = require('./events/guildMemberAdd');
const guildMemberRemoveEvent = require('./events/guildMemberRemove');

// 旧 events/*.js チェーンの dispatch 優先度。プラグインは <100 で前、
// >100 で後ろに割り込める。チェーン分解（Stage E）と共に消える定数。
const LEGACY_PRIORITY = 100;

const LEGACY_EVENTS = [
  { event: 'clientReady', handler: readyEvent, once: true },
  // discord.js v14 の実 emit 名は messageDeleteBulk（Events.MessageBulkDelete）。
  // 旧コードは 'messageBulkDelete' で listen しており一度も発火していなかった。
  { event: 'messageDeleteBulk', handler: messageBulkDeleteEvent },
  { event: 'messageReactionAdd', handler: messageReactionAddEvent },
  { event: 'interactionCreate', handler: interactionCreateEvent },
  { event: 'voiceStateUpdate', handler: voiceStateUpdateEvent },
  { event: 'guildMemberAdd', handler: guildMemberAddEvent },
  { event: 'guildMemberRemove', handler: guildMemberRemoveEvent }
];

function createBotClient({ appConfig, database, logger, eventRouter }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction, Partials.User]
  });

  client.commands = new Collection();
  client.appConfig = appConfig;
  client.db = database;
  client.logger = logger;
  client.voiceProfileCategoryMap = new Map();

  for (const command of commands.list) {
    if (command.enabled === false) {
      continue;
    }

    client.commands.set(command.data.name, command);
  }

  client.timelineRelayInFlight = new Set();
  client.timelineRelayMessageInFlight = new Set();
  client.recentInteractionExecutions = new Map();
  client.activeWelcomeReactionSetups = new Map();
  client.activeIntroReactionSetups = new Map();
  client.activeLlmUsers = new Set();
  client.llmGlobalRequestActive = false;
  client.questionResolveLocks = new Set();
  client.introDmQueueProcessing = false;
  client.introDmQueueInterval = null;
  client.voiceProfileReconcileInterval = null;

  for (const { event, handler, once } of LEGACY_EVENTS) {
    eventRouter.register(event, {
      name: `legacy:${event}`,
      priority: LEGACY_PRIORITY,
      once,
      handle: (...args) => handler.execute(...args)
    });
  }

  // ステップ分解済みイベント（各 events/*.js の steps 配列）。
  // priority が旧チェーンの並びを保存する。詳細は各ファイルの docblock を参照。
  const stepEvents = [
    ['messageCreate', messageCreateEvent.steps],
    ['messageUpdate', messageUpdateEvent.steps],
    ['messageDelete', messageDeleteEvent.steps]
  ];

  for (const [event, steps] of stepEvents) {
    for (const step of steps) {
      eventRouter.register(event, {
        name: `legacy:${event}:${step.name}`,
        priority: step.priority,
        handle: step.handle
      });
    }
  }

  return client;
}

/**
 * 有効プラグインが宣言した intents が client の intent 集合に含まれることを検査する。
 * intent 不足はイベントが「静かに来なくなる」事故なので fail-fast にする。
 * （Stage E で intents union による client 生成へ反転したらこの検査は逆向きになる）
 */
function assertPluginIntentsCovered(client, manifests) {
  const problems = [];

  for (const manifest of manifests) {
    for (const intent of manifest.intents || []) {
      const bit = GatewayIntentBits[intent];

      if (bit === undefined) {
        problems.push(`${manifest.name}: unknown intent "${intent}"`);
        continue;
      }

      if (!client.options.intents.has(bit)) {
        problems.push(`${manifest.name}: intent "${intent}" is not enabled on the client`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Plugin intent coverage check failed:\n  ${problems.join('\n  ')}`);
  }
}

module.exports = {
  createBotClient,
  assertPluginIntentsCovered
};
