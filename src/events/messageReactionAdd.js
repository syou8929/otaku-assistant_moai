const { handleAnimeReactionAdd } = require('../modules/anime');
const { handleDeletableMessageReaction } = require('../modules/deletableMessages');

module.exports = {
  async execute(reaction, user) {
    const client = reaction.message?.client;

    try {
      const handledDeletion = await handleDeletableMessageReaction(reaction, user);
      if (handledDeletion) {
        return;
      }
    } catch (error) {
      client?.logger?.error?.('Failed to handle deletable message reaction', {
        messageId: reaction.message?.id || null,
        channelId: reaction.message?.channelId || null,
        userId: user?.id || null,
        error: error.message
      });
    }

    try {
      await handleAnimeReactionAdd(reaction, user);
    } catch (error) {
      client?.logger?.error?.('Failed to handle anime messageReactionAdd', {
        messageId: reaction.message?.id || null,
        channelId: reaction.message?.channelId || null,
        userId: user?.id || null,
        error: error.message
      });
    }
  }
};
