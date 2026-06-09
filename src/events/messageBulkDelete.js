/**
 * 旧 execute() の直列チェーンをステップ単位の router 登録へ分解したもの
 * （events/messageDelete.js と同じ方式）。停止するステップは無い。
 * llm_responses の一括掃除は llm プラグイン（messageDeleteBulk@101）が行う。
 */
const steps = [
  {
    name: 'archive-cleanup',
    priority: 100,
    handle: async (messages) => {
      const firstMessage = messages?.first?.() || null;
      const client = firstMessage?.client;

      if (!client || !messages?.size) {
        return;
      }

      const messageIds = Array.from(messages.keys());
      client.db.archives.deleteMessages(messageIds);

      for (const messageId of messageIds) {
        client.db.introProfiles.deleteByMessageId(messageId);
      }

      client.logger.info('Message archive bulk deleted', {
        count: messageIds.length
      });
    }
  }
];

module.exports = {
  steps
};
