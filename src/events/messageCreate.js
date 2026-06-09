const { relayTweetMessage, relayGlobalHashtagMessage, handleReplyBasedGlobalHashtagRoute } = require('../modules/timelineRelay');
const { saveMessageToArchive } = require('../shared/messageArchive');
const { handleLlmMessage } = require('../modules/llm');
const { saveIntroProfileFromMessage } = require('../shared/introProfiles');
const { handleAnimeWatchedPromptReply } = require('../modules/anime');

module.exports = {
  async execute(message) {
    const client = message.client;

    try {
      await saveMessageToArchive(client, message);
    } catch (error) {
      client.logger.error('Archive save failed', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }

    try {
      await saveIntroProfileFromMessage(client, message);
    } catch (error) {
      client.logger.error('Intro profile save failed', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }

    try {
      const handledAnimeWatchedPromptReply = await handleAnimeWatchedPromptReply(message);
      if (handledAnimeWatchedPromptReply) {
        return;
      }
    } catch (error) {
      client.logger.error('Failed to handle anime watched prompt reply', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }

    try {
      await handleLlmMessage(message);
    } catch (error) {
      client.logger.error('Failed to handle LLM message trigger', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }

    try {
      const handledReplyRoute = await handleReplyBasedGlobalHashtagRoute(message, {
        config: client.appConfig,
        db: client.db,
        logger: client.logger
      });
      if (handledReplyRoute) {
        return;
      }
    } catch (error) {
      client.logger.error('Failed to handle reply-based hashtag route', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }

    if (message.inGuild() && message.channel?.isThread?.()) {
      client.logger.info('messageCreate received in thread', {
        messageId: message.id,
        channelId: message.channelId,
        parentId: String(message.channel.parentId || ''),
        authorId: message.author?.id || null
      });

      try {
        await relayTweetMessage(message, {
          config: client.appConfig,
          db: client.db,
          logger: client.logger
        });
      } catch (error) {
        client.logger.error('Failed to handle messageCreate tweet relay', {
          messageId: message.id,
          channelId: message.channelId,
          parentId: String(message.channel.parentId || ''),
          error: error.message
        });
      }
    }

    try {
      await relayGlobalHashtagMessage(message, {
        config: client.appConfig,
        db: client.db,
        logger: client.logger
      });
    } catch (error) {
      client.logger.error('Failed to handle global hashtag relay', {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      });
    }
  }
};
