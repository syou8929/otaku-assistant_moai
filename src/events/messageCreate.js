const { relayTweetMessage, relayGlobalHashtagMessage, handleReplyBasedGlobalHashtagRoute } = require('../modules/timelineRelay');
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
 * 旧 execute() の直列チェーンをステップ単位の router 登録へ分解したもの。
 * 実行順は priority 昇順で旧チェーンの並びを保存する。
 * - true を返すステップ（旧 early-return）は以降のステップを停止する
 * - 例外は router が隔離・記録するため、旧ステップ内 try/catch と同じ
 *   「失敗しても次のステップへ進む」継続セマンティクスになる
 * これにより llm / anime / timeline-relay を個別にプラグインへ抽出できる。
 */
const steps = [
  {
    name: 'archive',
    priority: 100,
    handle: async (message) => {
      await saveMessageToArchive(message.client, message);
    }
  },
  {
    name: 'intro-profile',
    priority: 101,
    handle: async (message) => {
      await saveIntroProfileFromMessage(message.client, message);
    }
  },
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
];

module.exports = {
  steps
};
