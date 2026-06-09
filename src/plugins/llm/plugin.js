const { handleLlmMessage } = require('./responder');

module.exports = {
  name: 'llm',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  // 実行時の有効/無効は従来どおり config の llmEnabled も併用される（responder 内で判定）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'MessageContent'],
  capabilities: {},
  commands: [],
  events: {
    // 旧チェーンの llm スロット（anime-watched-reply@102 の後・reply-hashtag-route@104 の前）。
    // 返値は捨てる（このステップは後続を停止しない）。
    messageCreate: {
      priority: 103,
      handle: async (message) => {
        await handleLlmMessage(message);
      }
    }
  }
};
