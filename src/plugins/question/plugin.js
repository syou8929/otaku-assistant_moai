const resolveCommand = require('./resolveCommand');
const unresolveCommand = require('./unresolveCommand');
const { applyQuestionStatusTag } = require('./threadTags');
const { registerThreadTagApplier } = require('../../modules/timelineRelay/hooks');

module.exports = {
  name: 'question',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  // timeline-relay がプラグイン化（Stage C）したら dependsOn: ['timeline-relay'] に変更
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages'],
  capabilities: {},
  commands: [resolveCommand, unresolveCommand],
  events: {},
  init() {
    // timeline-relay の question スレッド relay 時にステータスタグを適用するフック。
    // このプラグインを無効化/削除するとフックは未登録のままで relay 側は no-op。
    registerThreadTagApplier(applyQuestionStatusTag);
  }
};
