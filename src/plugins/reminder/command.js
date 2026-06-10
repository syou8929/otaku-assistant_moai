const {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags,
  ChannelType
} = require('discord.js');
const { getMessageJumpUrl } = require('../../shared/discordLinks');
const { createReminder, parseTimeSpec, cancel } = require('./lifecycle');

const TIME_FORMAT_HELP =
  '時間の例: 「30分後」「明日 9:00」「6/15 09:00」「毎日 9:00」「毎週月 10:00」「平日 9:30」';

const slashCommand = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('リマインダーの作成・一覧・取り消しをします。')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('リマインダーを作成します。')
        .addStringOption((option) =>
          option.setName('time').setDescription(TIME_FORMAT_HELP).setRequired(true).setMaxLength(40)
        )
        .addStringOption((option) =>
          option.setName('content').setDescription('リマインド内容').setRequired(true).setMaxLength(500)
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('通知先チャンネル（未指定なら DM）')
            .addChannelTypes(ChannelType.GuildText)
        )
        .addUserOption((option) =>
          option.setName('user').setDescription('通知する相手（未指定なら自分）')
        )
    )
    .addSubcommand((sub) =>
      sub.setName('list').setDescription('自分のリマインダー一覧と取り消し')
    ),

  async execute(interaction) {
    const ctx = slashCommand.ctx;
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'add') {
      const timeInput = interaction.options.getString('time', true);
      const spec = parseTimeSpec(timeInput);

      if (!spec) {
        await interaction.reply({
          content: `時間「${timeInput}」を解釈できませんでした。\n${TIME_FORMAT_HELP}`,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const channel = interaction.options.getChannel('channel');
      const targetUser = interaction.options.getUser('user');

      const id = createReminder(ctx, {
        guildId: interaction.guildId,
        creatorId: interaction.user.id,
        targetKind: channel ? 'channel' : 'dm',
        targetChannelId: channel?.id || null,
        mentionUserId: targetUser?.id || null,
        content: interaction.options.getString('content', true),
        sourceUrl: null,
        spec
      });

      await interaction.reply({
        content: [
          `⏰ リマインダー #${id} を作成しました: **${spec.display}**`,
          `宛先: ${channel ? `<#${channel.id}>` : 'DM'}${targetUser ? ` → <@${targetUser.id}>` : ''}`
        ].join('\n'),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'list') {
      const reminders = ctx.db.reminder.listActiveByCreator(interaction.user.id);

      if (reminders.length === 0) {
        await interaction.reply({
          content: '有効なリマインダーはありません。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      const lines = reminders.map(
        (r) => `#${r.id} ${r.time_display} — ${r.content.slice(0, 60)}${r.cron ? '（定期）' : ''}`
      );

      const select = new StringSelectMenuBuilder()
        .setCustomId('remind:cancel')
        .setPlaceholder('取り消すリマインダーを選択')
        .addOptions(
          reminders.map((r) => ({
            label: `#${r.id} ${r.content.slice(0, 80)}`,
            description: r.time_display.slice(0, 90),
            value: String(r.id)
          }))
        );

      await interaction.reply({
        content: `あなたのリマインダー:\n${lines.join('\n')}`,
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

const contextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('このメッセージをリマインド')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const modal = new ModalBuilder()
      .setCustomId(`remind:ctx:${interaction.channelId}:${message.id}`)
      .setTitle('このメッセージをリマインド')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('time')
            .setLabel('いつ？（例: 30分後 / 明日 9:00 / 毎日 9:00）')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(40)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('note')
            .setLabel('メモ（任意）')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(200)
        )
      );

    await interaction.showModal(modal);
  }
};

/** modal 送信・ボタン・セレクトの処理（components prefix "remind"） */
async function handleComponent(interaction, ctx) {
  const [, action, ...args] = interaction.customId.split(':');

  if (action === 'ctx' && interaction.isModalSubmit()) {
    const [channelId, messageId] = args;
    const timeInput = interaction.fields.getTextInputValue('time');
    const note = interaction.fields.getTextInputValue('note') || '';
    const spec = parseTimeSpec(timeInput);

    if (!spec) {
      await interaction.reply({
        content: `時間「${timeInput}」を解釈できませんでした。\n${TIME_FORMAT_HELP}`,
        flags: MessageFlags.Ephemeral
      });
      return true;
    }

    const sourceUrl = getMessageJumpUrl({
      guildId: interaction.guildId,
      channelId,
      messageId
    });

    const id = createReminder(ctx, {
      guildId: interaction.guildId,
      creatorId: interaction.user.id,
      targetKind: 'dm',
      targetChannelId: null,
      mentionUserId: null,
      content: note || 'このメッセージを確認',
      sourceUrl,
      spec
    });

    await interaction.reply({
      content: `⏰ リマインダー #${id} を作成しました: **${spec.display}**（DM でお知らせします）`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  function canOperate(reminder, userId) {
    return reminder.creator_id === userId || reminder.mention_user_id === userId;
  }

  if (action === 'snooze' && interaction.isButton()) {
    const [reminderId, untilSpec] = args;
    const reminder = ctx.db.reminder.get(Number(reminderId));

    if (!reminder) {
      await interaction.reply({ content: 'リマインダーが見つかりません。', flags: MessageFlags.Ephemeral });
      return true;
    }

    if (!canOperate(reminder, interaction.user.id)) {
      await interaction.reply({ content: 'このリマインダーを操作できるのは作成者と通知対象者だけです。', flags: MessageFlags.Ephemeral });
      return true;
    }

    const { snooze } = require('./lifecycle');
    const runAt = snooze(ctx, reminder, untilSpec);
    await interaction.update({
      content: `${interaction.message.content}\n-# ⏰ ${runAt.getMonth() + 1}/${runAt.getDate()} ${String(runAt.getHours()).padStart(2, '0')}:${String(runAt.getMinutes()).padStart(2, '0')} に再通知します`,
      components: []
    });
    return true;
  }

  if (action === 'done' && interaction.isButton()) {
    const [reminderId] = args;
    const reminder = ctx.db.reminder.get(Number(reminderId));

    if (!reminder || !canOperate(reminder, interaction.user.id)) {
      await interaction.reply({ content: 'このリマインダーを操作できるのは作成者と通知対象者だけです。', flags: MessageFlags.Ephemeral });
      return true;
    }

    ctx.db.reminder.setStatus(Number(reminderId), 'done');
    await interaction.update({
      content: `${interaction.message.content}\n-# ✅ 完了`,
      components: []
    });
    return true;
  }

  if (action === 'cancel' && interaction.isStringSelectMenu()) {
    const reminderId = Number(interaction.values[0]);
    const reminder = ctx.db.reminder.get(reminderId);

    if (reminder && reminder.creator_id === interaction.user.id) {
      cancel(ctx, reminder);
      await interaction.update({
        content: `🗑 リマインダー #${reminderId} を取り消しました。`,
        components: []
      });
    } else {
      await interaction.reply({ content: '取り消せませんでした。', flags: MessageFlags.Ephemeral });
    }

    return true;
  }

  return false;
}

module.exports = {
  slashCommand,
  contextCommand,
  handleComponent
};
