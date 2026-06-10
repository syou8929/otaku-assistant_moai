const {
  initializeVoiceProfileMappings,
  rebuildVoiceProfileState,
  startVoiceProfileReconciliation,
  handleVoiceStateUpdate
} = require('./vcProfile');

module.exports = {
  name: 'vc-profile',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'GuildVoiceStates'],
  capabilities: {},
  commands: [],
  events: {
    // legacy:clientReady (priority 100) が ops 起動通知で voiceProfileCategoryMap
    // を読むため、その前（50）に初期化を済ませる。once は client.once 同等。
    clientReady: {
      priority: 50,
      once: true,
      handle: async (client) => {
        await initializeVoiceProfileMappings(client);
        await rebuildVoiceProfileState(client, { reason: 'ready_resync' });
        startVoiceProfileReconciliation(client);
      }
    },
    // legacy:voiceStateUpdate (priority 100) には guildMembers/introDm の
    // VC入室検知が残っている。旧チェーンでは vcProfile が先頭だったので 50。
    voiceStateUpdate: {
      priority: 50,
      handle: async (oldState, newState) => {
        await handleVoiceStateUpdate(oldState, newState);
      }
    }
  },
  teardown({ client }) {
    if (client.voiceProfileReconcileInterval) {
      clearInterval(client.voiceProfileReconcileInterval);
      client.voiceProfileReconcileInterval = null;
    }
  }
};
