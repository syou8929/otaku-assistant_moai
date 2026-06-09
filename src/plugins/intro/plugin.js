const command = require('./command');
const {
  handleIntroReactionSetup,
  handleIntroReactionSetupRemoval,
  applyIntroReactionsToMessage
} = require('./introReactions');
const {
  handleIntroDmMessage,
  enqueueWelcomeJoinDm,
  maybeSendVcNoIntroDm,
  startIntroDmQueueProcessor
} = require('./introDm');
const { registerIntroMessageSavedHandler } = require('../../shared/introProfiles');

module.exports = {
  name: 'intro',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'GuildMessageReactions', 'GuildMembers', 'DirectMessages', 'GuildVoiceStates'],
  capabilities: {},
  commands: [command],
  events: {
    // 旧チェーンで introDm は messageCreate の先頭・early-return だった。
    // true を返すと以降（welcome@40 / legacy@100）を停止 = 旧セマンティクス保存。
    messageCreate: {
      priority: 10,
      handle: async (message) => {
        const handled = await handleIntroDmMessage(message);
        return handled === true;
      }
    },
    // 旧チェーン順序: deletable → welcome → intro → anime。welcome@30 の後ろ = 35。
    messageReactionAdd: {
      priority: 35,
      handle: async (reaction, user) => {
        await handleIntroReactionSetup(reaction, user);
      }
    },
    messageReactionRemove: {
      priority: 35,
      handle: async (reaction, user) => {
        await handleIntroReactionSetupRemoval(reaction, user);
      }
    },
    // legacy@100（guildMembers upsert）の後 = 旧 try ブロック内の実行順を保存。
    guildMemberAdd: {
      priority: 110,
      handle: async (member) => {
        await enqueueWelcomeJoinDm(member.client, member);
      }
    },
    // legacy@100（guildMembers upsert + vcJoined 更新）の後。ゲート条件は旧チェーンと同一。
    voiceStateUpdate: {
      priority: 110,
      handle: async (oldState, newState) => {
        const member = newState.member || oldState.member || null;

        if (!member?.guild || !newState.channelId || oldState.channelId) {
          return;
        }

        await maybeSendVcNoIntroDm(newState.client, member);
      }
    },
    // 旧 ready ハンドラ末尾相当。legacy:clientReady@100 の後に開始する。
    clientReady: {
      priority: 110,
      once: true,
      handle: (client) => {
        startIntroDmQueueProcessor(client);
      }
    }
  },
  init() {
    // プロフィール保存直後の intro リアクション付与（shared→plugin 依存の反転）。
    // このプラグインを無効化/削除するとフック未登録のままで保存処理は no-op 継続。
    registerIntroMessageSavedHandler(applyIntroReactionsToMessage);
  },
  teardown({ client }) {
    if (client.introDmQueueInterval) {
      clearInterval(client.introDmQueueInterval);
      client.introDmQueueInterval = null;
    }
  }
};
