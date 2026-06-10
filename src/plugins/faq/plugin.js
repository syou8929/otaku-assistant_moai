const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags
} = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');

/**
 * 社内 FAQ / 定型情報の即答カード（query-cards + record-lookup 統合案）。
 * Wi-Fi パスワード・経費精算手順・よく使うリンク等を /faq <キー> で即答する。
 * キーは autocomplete で発見可能。追加は誰でも（知識は使う人が育てる）、削除は管理者。
 * 応答は ephemeral ＋「チャンネルに共有」ボタン（必要なときだけ公開＝ノイズ統治）。
 */

const faqCommand = {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('定型情報の即答カード')
    .addSubcommand((sub) =>
      sub
        .setName('show')
        .setDescription('FAQ を引く')
        .addStringOption((option) =>
          option
            .setName('key')
            .setDescription('キー（入力すると候補が出ます）')
            .setRequired(true)
            .setAutocomplete(true)
            .setMaxLength(50)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('FAQ を登録・更新する（誰でも可）')
        .addStringOption((option) =>
          option.setName('key').setDescription('キー（例: wifi / 経費精算）').setRequired(true).setMaxLength(50)
        )
        .addStringOption((option) =>
          option.setName('content').setDescription('内容').setRequired(true).setMaxLength(1000)
        )
        .addStringOption((option) =>
          option.setName('aliases').setDescription('別名（カンマ区切り。例: wi-fi,無線）').setMaxLength(100)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('FAQ 一覧'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('FAQ を削除する（管理者）')
        .addStringOption((option) =>
          option.setName('key').setDescription('キー').setRequired(true).setAutocomplete(true).setMaxLength(50)
        )
    ),

  async autocomplete(interaction) {
    const ctx = faqCommand.ctx;
    const focused = interaction.options.getFocused() || '';
    const entries = focused ? ctx.db.faq.search(focused) : ctx.db.faq.list(25);
    await interaction.respond(
      entries.slice(0, 25).map((entry) => ({ name: entry.key.slice(0, 100), value: entry.key.slice(0, 100) }))
    );
  },

  async execute(interaction) {
    const ctx = faqCommand.ctx;
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'show') {
      const key = interaction.options.getString('key', true);
      const entry = ctx.db.faq.getByKey(key) || ctx.db.faq.search(key)[0];

      if (!entry) {
        await interaction.reply({
          content: `「${key}」は登録されていません。\`/faq set\` で登録できます。`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      ctx.db.faq.bumpUse(entry.id);
      const share = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`faq:share:${entry.id}`)
          .setLabel('チャンネルに共有')
          .setEmoji('📢')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({
        content: `💡 **${entry.key}**\n${entry.content}`,
        components: [share],
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'set') {
      const key = interaction.options.getString('key', true).trim();
      const existing = ctx.db.faq.getByKey(key);
      ctx.db.faq.upsert({
        key,
        aliases: interaction.options.getString('aliases'),
        content: interaction.options.getString('content', true),
        userId: interaction.user.id
      });
      await interaction.reply({
        content: `💡 「${key}」を${existing ? '更新' : '登録'}しました。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'list') {
      const entries = ctx.db.faq.list();
      const lines = entries.length
        ? entries.map((entry) => `・**${entry.key}**${entry.aliases ? `（${entry.aliases}）` : ''} — 参照${entry.use_count}回`)
        : ['まだ登録がありません。`/faq set` で最初の1件を登録してください。'];
      await interaction.reply({ content: ['💡 FAQ 一覧', ...lines].join('\n').slice(0, 1990), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'remove') {
      if (!isAdministrator(interaction.member)) {
        await interaction.reply({ content: '削除は管理者のみ可能です。', flags: MessageFlags.Ephemeral });
        return;
      }

      const key = interaction.options.getString('key', true);
      const removed = ctx.db.faq.remove(key);
      await interaction.reply({
        content: removed ? `「${key}」を削除しました。` : `「${key}」は見つかりません。`,
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function handleComponent(interaction, ctx) {
  const [, action, id] = interaction.customId.split(':');

  if (action !== 'share' || !interaction.isButton()) {
    return false;
  }

  const entry = ctx.db.faq
    .list(1000)
    .find((row) => row.id === Number(id));

  if (!entry) {
    await interaction.reply({ content: 'この FAQ は削除されています。', flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.channel.send({
    content: `💡 **${entry.key}**\n${entry.content}\n-# /faq で引けます（共有: <@${interaction.user.id}>）`,
    allowedMentions: { parse: [] }
  });
  await interaction.update({ content: `💡 「${entry.key}」をチャンネルに共有しました。`, components: [] });
  return true;
}

module.exports = {
  name: 'faq',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [faqCommand],
  components: {
    prefix: 'faq',
    handle: handleComponent
  },
  init(ctx) {
    faqCommand.ctx = ctx;
  }
};
