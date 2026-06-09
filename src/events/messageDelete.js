/**
 * 旧 execute() の直列チェーンをステップ単位の router 登録へ分解したもの
 * （events/messageCreate.js と同じ方式）。停止するステップは無い。
 * llm_responses の掃除は llm プラグイン（messageDelete@101）、anime カードの
 * 親メッセージ後始末は anime プラグイン（messageDelete@110）が行う。
 */
const steps = [
  {
    name: 'archive-cleanup',
    priority: 100,
    handle: async (message) => {
      const client = message?.client;
      const messageId = message?.id;

      if (!client || !messageId) {
        return;
      }

      client.db.archives.deleteMessage(messageId);
      client.db.introProfiles.deleteByMessageId(messageId);
      client.logger.info('Message archive deleted', {
        messageId,
        channelId: message.channelId || null
      });
    }
  },
  {
    name: 'deletable-cleanup',
    priority: 102,
    handle: async (message) => {
      const client = message?.client;
      const messageId = message?.id;

      if (!client || !messageId) {
        return;
      }

      client.db.deletableMessages.delete(messageId);
    }
  }
];

module.exports = {
  steps
};
