const { slashCommand, contextCommand, handleComponent } = require('./command');
const { deliver } = require('./lifecycle');

module.exports = {
  name: 'reminder',
  // 新規機能は spec の原則どおり既定 OFF。loadout（config.plugins）で有効化する。
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [slashCommand, contextCommand],
  components: {
    prefix: 'remind',
    handle: handleComponent
  },
  jobs: {
    deliver
  },
  init(ctx) {
    // コマンド実行時に ctx へ到達するための保持（commands は manifest 経由で
    // client.commands に登録され、execute(interaction) しか受け取れないため）。
    slashCommand.ctx = ctx;
    contextCommand.ctx = ctx;
  }
};
