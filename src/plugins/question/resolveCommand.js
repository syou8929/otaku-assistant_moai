const { SlashCommandBuilder } = require('discord.js');
const { resolveThread } = require('./resolver');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resolve')
    .setDescription('この質問を解決済みにします。'),
  async execute(interaction) {
    await resolveThread({
      interaction,
      mode: 'resolve'
    });
  }
};
