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
    },
    // 旧 messageDelete チェーンの llm_responses 掃除スロット（archive@100 の後・deletable@102 の前）。
    messageDelete: {
      priority: 101,
      handle: async (message) => {
        const client = message?.client;
        const messageId = message?.id;

        if (!client || !messageId) {
          return;
        }

        client.db.llmResponses.deleteByMessageId(messageId);
        client.logger.info('LLM response reference deleted', {
          messageId
        });
      }
    },
    // 旧 messageBulkDelete チェーンの llm_responses 一括掃除スロット（archive@100 の後）。
    messageDeleteBulk: {
      priority: 101,
      handle: async (messages) => {
        const firstMessage = messages?.first?.() || null;
        const client = firstMessage?.client;

        if (!client || !messages?.size) {
          return;
        }

        const messageIds = Array.from(messages.keys());
        client.db.llmResponses.deleteByMessageIds(messageIds);
        client.logger.info('LLM response reference bulk deleted', {
          count: messageIds.length
        });
      }
    }
  }
};
