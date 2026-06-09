const {
  handleIntroReactionSetup,
  handleIntroReactionSetupRemoval,
  applyIntroReactionsToMessage
} = require('./introReactions');
const { registerIntroMessageSavedHandler } = require('../../shared/introProfiles');

module.exports = {
  name: 'intro',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'GuildMessageReactions'],
  capabilities: {},
  // 第2便（introDm + /intro コマンド）の移送まで commands は空。
  // cmd:intro は過渡的に ./introReactions を deep import している。
  commands: [],
  events: {
    // 旧チェーン順序: deletable → welcome → intro → anime。
    // welcome@30 の後ろ・legacy@100（deletable/anime）の前 = 35。
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
    }
  },
  init() {
    // プロフィール保存直後の intro リアクション付与（shared→plugin 依存の反転）。
    // このプラグインを無効化/削除するとフック未登録のままで保存処理は no-op 継続。
    registerIntroMessageSavedHandler(applyIntroReactionsToMessage);
  }
};
