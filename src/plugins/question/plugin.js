const resolveCommand = require('./resolveCommand');
const unresolveCommand = require('./unresolveCommand');
const { applyQuestionStatusTag } = require('./threadTags');

module.exports = {
  name: 'question',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: ['timeline-relay'],
  intents: ['Guilds', 'GuildMessages'],
  capabilities: {},
  commands: [resolveCommand, unresolveCommand],
  events: {},
  init({ services }) {
    // timeline-relay の question スレッド relay 時にステータスタグを適用するフック。
    // このプラグインを無効化/削除するとフックは未登録のままで relay 側は no-op。
    services['timeline-relay'].registerThreadTagApplier(applyQuestionStatusTag);
  }
};
