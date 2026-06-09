const command = require('./command');

module.exports = {
  name: 'entrance-guide',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  commands: [command]
};
