const { saveMessageToArchive } = require('../shared/messageArchive');
const { saveIntroProfileFromMessage } = require('../shared/introProfiles');

/**
 * 旧 execute() の直列チェーンをステップ単位の router 登録へ分解したもの
 * （events/messageCreate.js と同じ方式）。停止するステップは無い。
 * archive と intro-profile は partial fetch を共有するため 1 ステップに束ねる。
 */
const steps = [
  {
    name: 'archive-update',
    priority: 100,
    handle: async (oldMessage, newMessage) => {
      const client = newMessage.client;
      const resolvedMessage = newMessage.partial ? await newMessage.fetch() : newMessage;
      await saveMessageToArchive(client, resolvedMessage);
      await saveIntroProfileFromMessage(client, resolvedMessage);
    }
  }
];

module.exports = {
  steps
};
