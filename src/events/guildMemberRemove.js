const { markGuildMemberLeft } = require('../shared/guildMembers');

module.exports = {
  async execute(member) {
    const client = member.client;
    try {
      markGuildMemberLeft(client, member.guild.id, member.id);
    } catch (error) {
      client.logger.error('Failed to handle guildMemberRemove', {
        guildId: member.guild?.id || null,
        userId: member.id,
        error: error.message
      });
    }
  }
};
