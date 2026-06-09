const { updateTweetTimelineCard, handleRouteAddedOnMessageUpdate } = require('../modules/timelineRelay');
const { saveMessageToArchive } = require('../shared/messageArchive');
const { saveIntroProfileFromMessage } = require('../shared/introProfiles');

function relayContext(client) {
  return {
    config: client.appConfig,
    db: client.db,
    logger: client.logger
  };
}

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
  },
  {
    name: 'tweet-card-update',
    priority: 101,
    handle: async (oldMessage, newMessage) => {
      await updateTweetTimelineCard(oldMessage, newMessage, relayContext(newMessage.client));
    }
  },
  {
    name: 'route-added-relay',
    priority: 102,
    handle: async (oldMessage, newMessage) => {
      await handleRouteAddedOnMessageUpdate(oldMessage, newMessage, relayContext(newMessage.client));
    }
  }
];

module.exports = {
  steps
};
