const command = require('./command');
const {
  handleWelcomeReactionSetup,
  handleWelcomeReactionSetupRemoval,
  applyWelcomeReactionsToMessage
} = require('./welcomeReactions');

module.exports = {
  name: 'welcome',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'GuildMessageReactions'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [command],
  events: {
    // 旧 events/*.js チェーンと同様、welcome 系ハンドラは後続を停止しない
    //（戻り値を捨てて undefined を返す）。priority は旧チェーン内の相対位置を踏襲。
    messageCreate: {
      priority: 40,
      handle: async (message) => {
        await applyWelcomeReactionsToMessage(message);
      }
    },
    messageReactionAdd: {
      priority: 30,
      handle: async (reaction, user) => {
        await handleWelcomeReactionSetup(reaction, user);
      }
    },
    messageReactionRemove: {
      priority: 30,
      handle: async (reaction, user) => {
        await handleWelcomeReactionSetupRemoval(reaction, user);
      }
    }
  }
};
