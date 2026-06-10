const {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags
} = require('discord.js');
const { getMessageJumpUrl } = require('../../shared/discordLinks');

const LIST_LIMIT = 15;

/**
 * 決定事項ログ（昇格エンジン第2スライス）。
 * `/decide` または メッセージ右クリック「決定として記録」で、会話中の結論を
 * 出典リンク付きで append-only 記録し、専用チャンネルへカード掲示。`/decisions` で一覧・検索。
 * 記録は人間の明示アクションのみ（自動抽出はしない＝誤記録を防ぐ）。
 */

function getPortalChannelId(ctx) {
  return String(ctx.config.plugins?.['decision-log']?.portalChannelId || '');
}

function buildPortalCard(decision) {
  const lines = [
    `📑 **決定** #${decision.id}`,
    decision.content,
    `-# 決定者: <@${decision.decided_by}>　${(decision.created_at || '').slice(0, 10)}`
  ];

  if (decision.source_url) {
    lines.push(`-# 出典: ${decision.source_url}`);
  }

  return { content: lines.join('\n'), allowedMentions: { parse: [] } };
}

async function recordDecision(ctx, { interaction, content, sourceChannelId, sourceMessageId }) {
  const sourceUrl =
    sourceChannelId && sourceMessageId
      ? getMessageJumpUrl({ guildId: interaction.guildId, channelId: sourceChannelId, messageId: sourceMessageId })
      : null;

  const id = ctx.db['decision-log'].insert({
    guildId: interaction.guildId,
    decidedBy: interaction.user.id,
    content,
    sourceChannelId,
    sourceMessageId,
    sourceUrl
  });

  const portalChannelId = getPortalChannelId(ctx);

  if (portalChannelId) {
    const decision = ctx.db['decision-log'].get(id);
    const portal = await ctx.client.channels.fetch(portalChannelId).catch(() => null);

    if (portal) {
      const portalMessage = await portal.send(buildPortalCard(decision));
      ctx.db['decision-log'].setPortalMessageId(id, portalMessage.id);
    } else {
      ctx.logger.warn('decision-log: portal channel unavailable', { portalChannelId });
    }
  }

  return id;
}

const decideCommand = {
  data: new SlashCommandBuilder()
    .setName('decide')
    .setDescription('決定事項を記録します。')
    .addStringOption((option) =>
      option.setName('content').setDescription('決定の内容').setRequired(true).setMaxLength(1000)
    ),

  async execute(interaction) {
    const ctx = decideCommand.ctx;
    const id = await recordDecision(ctx, {
      interaction,
      content: interaction.options.getString('content', true),
      sourceChannelId: null,
      sourceMessageId: null
    });

    await interaction.reply({
      content: `📑 決定 #${id} を記録しました。`,
      flags: MessageFlags.Ephemeral
    });
  }
};

const decisionsCommand = {
  data: new SlashCommandBuilder()
    .setName('decisions')
    .setDescription('決定事項の一覧・検索')
    .addStringOption((option) =>
      option.setName('query').setDescription('検索語（未指定なら最近の一覧）').setMaxLength(100)
    ),

  async execute(interaction) {
    const ctx = decisionsCommand.ctx;
    const query = interaction.options.getString('query');
    const rows = query
      ? ctx.db['decision-log'].search(query, LIST_LIMIT)
      : ctx.db['decision-log'].listActive(LIST_LIMIT);

    if (rows.length === 0) {
      await interaction.reply({ content: '該当する決定事項はありません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const lines = rows.map((row) => {
      const head = `#${row.id} ${(row.created_at || '').slice(0, 10)} — ${row.content.slice(0, 80)}`;
      return row.source_url ? `${head}\n　${row.source_url}` : head;
    });

    await interaction.reply({
      content: [`📑 決定事項（${rows.length}件）`, ...lines].join('\n'),
      flags: MessageFlags.Ephemeral
    });
  }
};

const recordContextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('決定として記録')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const message = interaction.targetMessage;
    const modal = new ModalBuilder()
      .setCustomId(`decide:ctx:${interaction.channelId}:${message.id}`)
      .setTitle('決定として記録')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('content')
            .setLabel('決定の内容（空欄なら元メッセージ本文）')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
            .setMaxLength(1000)
        )
      );

    // 元メッセージ本文を初期値に（編集して確定できる）
    if (message.content) {
      modal.components[0].components[0].setValue(message.content.slice(0, 1000));
    }

    await interaction.showModal(modal);
  }
};

async function handleComponent(interaction, ctx) {
  if (!interaction.isModalSubmit()) {
    return false;
  }

  const [, action, channelId, messageId] = interaction.customId.split(':');

  if (action !== 'ctx') {
    return false;
  }

  const content = (interaction.fields.getTextInputValue('content') || '').trim();

  if (!content) {
    await interaction.reply({ content: '決定の内容が空です。', flags: MessageFlags.Ephemeral });
    return true;
  }

  const id = await recordDecision(ctx, {
    interaction,
    content,
    sourceChannelId: channelId,
    sourceMessageId: messageId
  });

  await interaction.reply({
    content: `📑 決定 #${id} を記録しました（出典リンク付き）。`,
    flags: MessageFlags.Ephemeral
  });
  return true;
}

module.exports = {
  name: 'decision-log',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [decideCommand, decisionsCommand, recordContextCommand],
  components: {
    prefix: 'decide',
    handle: handleComponent
  },
  init(ctx) {
    decideCommand.ctx = ctx;
    decisionsCommand.ctx = ctx;
    recordContextCommand.ctx = ctx;

    if (!getPortalChannelId(ctx)) {
      ctx.logger.warn('decision-log: portalChannelId not configured; decisions are recorded but not posted', {});
    }
  }
};
