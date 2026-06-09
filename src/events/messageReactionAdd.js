const { handleDeletableMessageReaction } = require('../shared/deletableMessages');

module.exports = {
  async execute(reaction, user) {
    const client = reaction.message?.client;

    try {
      const handledDeletion = await handleDeletableMessageReaction(reaction, user);
      if (handledDeletion) {
        // true を返して以降のハンドラ（anime@110 等）を停止する（旧チェーンのゲートと同じ）
        return true;
      }
    } catch (error) {
      client?.logger?.error?.('Failed to handle deletable message reaction', {
        messageId: reaction.message?.id || null,
        channelId: reaction.message?.channelId || null,
        userId: user?.id || null,
        error: error.message
      });
    }
  }
};
