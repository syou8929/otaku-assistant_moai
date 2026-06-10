const {
  SlashCommandBuilder,
  ContextMenuCommandBuilder,
  ApplicationCommandType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  MessageFlags
} = require('discord.js');
const { getMessageJumpUrl } = require('../../shared/discordLinks');
const { saveImageLocally } = require('./media');

const CARD_ITEM_COUNT = 8;
const NEW_BOARD_VALUE = '__new__';

/**
 * 案件別リファレンスボード。メッセージ右クリック「ボードに保存」→ボード選択→保存。
 * 画像添付はローカル保存（リンク切れ耐性）。ボードごとに常設カードを自動更新。
 * 保存フロー: 右クリック → ephemeral セレクト（modal にはセレクトを置けないため）→
 * 既存ボード即保存 / 「新規ボード」選択時のみ命名 modal。
 */

function getSettings(ctx) {
  const raw = ctx.config.plugins?.['ref-board'] || {};
  return { boardChannelId: String(raw.boardChannelId || '') };
}

function buildBoardCard(ctx, board) {
  const repo = ctx.db['ref-board'];
  const items = repo.listItems(board.id, CARD_ITEM_COUNT);
  const total = repo.countItems(board.id);
  const lines = [`🗂 **${board.name}**（${total}件）`];

  for (const item of items) {
    const note = item.note ? `${item.note.slice(0, 60)}` : 'リファレンス';
    const link = item.source_url || item.image_url || '';
    lines.push(`・${note}${item.local_path ? ' 💾' : ''}　${link}`);
  }

  if (total === 0) {
    lines.push('-# まだ何も保存されていません');
  } else if (total > CARD_ITEM_COUNT) {
    lines.push(`-# 最新${CARD_ITEM_COUNT}件を表示。全件は /ref view name:${board.name}`);
  }

  return { content: lines.join('\n'), flags: MessageFlags.SuppressEmbeds };
}

async function refreshBoardCard(ctx, boardId) {
  const settings = getSettings(ctx);

  if (!settings.boardChannelId) {
    return;
  }

  const repo = ctx.db['ref-board'];
  const board = repo.getBoard(boardId);
  const channel = await ctx.client.channels.fetch(settings.boardChannelId).catch(() => null);

  if (!board || !channel) {
    return;
  }

  const payload = buildBoardCard(ctx, board);

  if (board.card_message_id) {
    const existing = await channel.messages.fetch(board.card_message_id).catch(() => null);

    if (existing) {
      await existing.edit(payload);
      return;
    }
  }

  const sent = await channel.send(payload);
  repo.setCardMessageId(board.id, sent.id);
}

async function saveMessageToBoard(ctx, interaction, boardId, channelId, messageId) {
  const repo = ctx.db['ref-board'];
  const sourceChannel = await ctx.client.channels.fetch(channelId).catch(() => null);
  const message = sourceChannel
    ? await sourceChannel.messages.fetch(messageId).catch(() => null)
    : null;

  const sourceUrl = getMessageJumpUrl({
    guildId: interaction.guildId,
    channelId,
    messageId
  });

  // 最初の画像添付をローカル保存（失敗しても URL 参照で保存は成立）
  let imageUrl = null;
  let localPath = null;
  const attachment = message?.attachments?.find?.((a) => String(a.contentType || '').startsWith('image/'))
    || message?.attachments?.first?.();

  if (attachment) {
    imageUrl = attachment.url;
    localPath = await saveImageLocally(attachment.url, boardId, `${messageId}-${attachment.id}`);
  }

  const note = (message?.content || '').slice(0, 100) || null;
  const itemId = repo.addItem({
    boardId,
    note,
    sourceUrl,
    imageUrl,
    localPath,
    savedBy: interaction.user.id
  });

  await refreshBoardCard(ctx, boardId);
  return { itemId, localSaved: Boolean(localPath) };
}

const saveContextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName('ボードに保存')
    .setType(ApplicationCommandType.Message),

  async execute(interaction) {
    const ctx = saveContextCommand.ctx;
    const boards = ctx.db['ref-board'].listBoards();
    const options = [
      ...boards.slice(0, 24).map((board) => ({
        label: `${board.name}（${board.item_count}件）`,
        value: String(board.id)
      })),
      { label: '＋ 新規ボードを作る', value: NEW_BOARD_VALUE }
    ];

    const select = new StringSelectMenuBuilder()
      .setCustomId(`ref:saveto:${interaction.channelId}:${interaction.targetMessage.id}`)
      .setPlaceholder('保存先ボードを選択')
      .addOptions(options);

    await interaction.reply({
      content: '保存先のボードを選んでください。',
      components: [new ActionRowBuilder().addComponents(select)],
      flags: MessageFlags.Ephemeral
    });
  }
};

const refCommand = {
  data: new SlashCommandBuilder()
    .setName('ref')
    .setDescription('リファレンスボード')
    .addSubcommand((sub) => sub.setName('boards').setDescription('ボード一覧'))
    .addSubcommand((sub) =>
      sub
        .setName('view')
        .setDescription('ボードの中身を見る')
        .addStringOption((option) =>
          option.setName('name').setDescription('ボード名').setRequired(true).setMaxLength(50)
        )
    ),

  async execute(interaction) {
    const ctx = refCommand.ctx;
    const repo = ctx.db['ref-board'];
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'boards') {
      const boards = repo.listBoards();
      const lines = boards.length
        ? boards.map((board) => `・**${board.name}** — ${board.item_count}件`)
        : ['ボードはまだありません。メッセージを右クリック →「ボードに保存」から作成できます。'];
      await interaction.reply({ content: ['🗂 ボード一覧', ...lines].join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'view') {
      const board = repo.getBoardByName(interaction.options.getString('name', true));

      if (!board) {
        await interaction.reply({ content: 'そのボードは見つかりません。', flags: MessageFlags.Ephemeral });
        return;
      }

      const items = repo.listItems(board.id, 20);
      const lines = [`🗂 **${board.name}**（全${repo.countItems(board.id)}件・最新20件）`];

      for (const item of items) {
        lines.push(`・${item.note || 'リファレンス'}${item.local_path ? ' 💾' : ''}　${item.source_url || item.image_url || ''}`);
      }

      await interaction.reply({
        content: lines.join('\n').slice(0, 1990),
        flags: MessageFlags.Ephemeral | MessageFlags.SuppressEmbeds
      });
    }
  }
};

async function handleComponent(interaction, ctx) {
  const [, action, channelId, messageId] = interaction.customId.split(':');

  if (action === 'saveto' && interaction.isStringSelectMenu()) {
    const selected = interaction.values[0];

    if (selected === NEW_BOARD_VALUE) {
      const modal = new ModalBuilder()
        .setCustomId(`ref:newboard:${channelId}:${messageId}`)
        .setTitle('新規ボード')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('name')
              .setLabel('ボード名（例: 案件A 絵コンテ参考）')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMaxLength(50)
          )
        );
      await interaction.showModal(modal);
      return true;
    }

    const result = await saveMessageToBoard(ctx, interaction, Number(selected), channelId, messageId);
    const board = ctx.db['ref-board'].getBoard(Number(selected));
    await interaction.update({
      content: `🗂 「${board?.name}」へ保存しました${result.localSaved ? '（画像をローカル保存済み 💾）' : ''}。`,
      components: []
    });
    return true;
  }

  if (action === 'newboard' && interaction.isModalSubmit()) {
    const name = interaction.fields.getTextInputValue('name').trim();
    const repo = ctx.db['ref-board'];

    if (!name || repo.getBoardByName(name)) {
      await interaction.reply({ content: 'その名前は使えません（空または重複）。', flags: MessageFlags.Ephemeral });
      return true;
    }

    const boardId = repo.createBoard({ name, createdBy: interaction.user.id });
    const result = await saveMessageToBoard(ctx, interaction, boardId, channelId, messageId);
    await interaction.reply({
      content: `🗂 ボード「${name}」を作成し、保存しました${result.localSaved ? '（画像をローカル保存済み 💾）' : ''}。`,
      flags: MessageFlags.Ephemeral
    });
    return true;
  }

  return false;
}

module.exports = {
  name: 'ref-board',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'MessageContent'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [refCommand, saveContextCommand],
  components: {
    prefix: 'ref',
    handle: handleComponent
  },
  init(ctx) {
    refCommand.ctx = ctx;
    saveContextCommand.ctx = ctx;

    if (!getSettings(ctx).boardChannelId) {
      ctx.logger.warn('ref-board: boardChannelId not configured; board cards are disabled (saving still works)', {});
    }
  }
};
