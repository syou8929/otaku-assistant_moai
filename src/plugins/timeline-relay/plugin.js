const {
  relayForumThread,
  relayTweetMessage,
  relayGlobalHashtagMessage,
  handleReplyBasedGlobalHashtagRoute,
  updateTweetTimelineCard,
  handleRouteAddedOnMessageUpdate,
  updateQuestionTimelineCard
} = require('./index');
const { registerThreadTagApplier, registerHashtagPostHandler } = require('./hooks');

function relayContext(client) {
  return {
    config: client.appConfig,
    db: client.db,
    logger: client.logger
  };
}

module.exports = {
  name: 'timeline-relay',
  // 稼働中サーバーの無停止移行のため移行期間中は既定ON。
  // 基盤ニュートラル化（Stage F）で既定OFFへ反転する（dependency-map.md §3-4）。
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'MessageContent'],
  capabilities: {},
  commands: [],
  // 依存プラグイン（question / anime）が init(ctx) から使う公開面。
  api: {
    registerThreadTagApplier,
    registerHashtagPostHandler,
    updateQuestionTimelineCard
  },
  events: {
    // 旧 events/threadCreate.js の全体（フォーラム新スレッドの relay）。
    threadCreate: {
      priority: 100,
      handle: async (thread) => {
        const client = thread.client;

        client.logger.info('threadCreate received', {
          threadId: thread.id,
          threadName: thread.name,
          parentId: String(thread.parentId || ''),
          ownerId: thread.ownerId || null
        });

        await relayForumThread(thread, relayContext(client));
      }
    },
    // 旧 messageCreate チェーンの relay 3スロット（@104〜106）。
    messageCreate: [
      {
        name: 'reply-hashtag-route',
        priority: 104,
        handle: async (message) =>
          (await handleReplyBasedGlobalHashtagRoute(message, relayContext(message.client))) === true
      },
      {
        name: 'tweet-relay',
        priority: 105,
        handle: async (message) => {
          if (!message.inGuild() || !message.channel?.isThread?.()) {
            return;
          }

          message.client.logger.info('messageCreate received in thread', {
            messageId: message.id,
            channelId: message.channelId,
            parentId: String(message.channel.parentId || ''),
            authorId: message.author?.id || null
          });

          await relayTweetMessage(message, relayContext(message.client));
        }
      },
      {
        name: 'global-hashtag-relay',
        priority: 106,
        handle: async (message) => {
          await relayGlobalHashtagMessage(message, relayContext(message.client));
        }
      }
    ],
    // 旧 messageUpdate チェーンの relay 2スロット（@101〜102）。
    messageUpdate: [
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
    ]
  }
};
