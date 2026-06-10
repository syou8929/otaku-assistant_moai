const { updateGuildMemberVcJoined, upsertGuildMember } = require('../shared/guildMembers');

module.exports = {
  async execute(oldState, newState) {
    const member = newState.member || oldState.member || null;
    if (!member?.guild || !newState.channelId || oldState.channelId) {
      return;
    }

    try {
      upsertGuildMember(newState.client, member);
      updateGuildMemberVcJoined(newState.client, member, new Date());
    } catch (error) {
      newState.client.logger.error('Failed to handle VC intro detection', {
        guildId: member.guild?.id || null,
        userId: member.id,
        oldChannelId: oldState.channelId,
        newChannelId: newState.channelId,
        error: error.message
      });
    }
  }
};
