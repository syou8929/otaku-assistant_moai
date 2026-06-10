const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');

/**
 * 案件チャンネルの終結アーカイブ（work-archive）。
 * プロジェクト完了時に `/archive-channel` でそのチャンネルの全ログ
 * （shared/messageArchive の蓄積）を markdown へ書き出し、統計カードを残す。
 * 「チャンネルは消しても記録は残る」終結の儀式。チャンネル削除はしない
 * （破壊操作は人間の手で — bot は記録だけ担う）。
 */

function exportDir() {
  return path.resolve(process.cwd(), 'data', 'exports');
}

function sanitizeFilename(name) {
  return String(name).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'channel';
}

function exportChannelMarkdown(ctx, { channelId, channelName }) {
  const rows = ctx.db.sqlite
    .prepare(`
      SELECT author_name, author_is_bot, clean_content, content, created_at
      FROM archived_messages
      WHERE channel_id = ? OR thread_id = ? OR parent_id = ?
      ORDER BY created_at ASC
    `)
    .all(channelId, channelId, channelId);

  if (rows.length === 0) {
    return null;
  }

  const participants = new Set();
  const lines = [
    `# #${channelName} アーカイブ`,
    '',
    `エクスポート日時: ${new Date().toISOString()}`,
    `メッセージ数: ${rows.length}`,
    ''
  ];

  for (const row of rows) {
    if (!row.author_is_bot && row.author_name) {
      participants.add(row.author_name);
    }

    const when = (row.created_at || '').slice(0, 16).replace('T', ' ');
    const body = (row.clean_content || row.content || '').trim();

    if (body) {
      lines.push(`**${row.author_name || '不明'}** (${when})`);
      lines.push(body);
      lines.push('');
    }
  }

  lines.splice(4, 0, `参加者: ${[...participants].join(', ')}`);

  fs.mkdirSync(exportDir(), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const destination = path.join(exportDir(), `channel-${sanitizeFilename(channelName)}-${stamp}.md`);
  fs.writeFileSync(destination, lines.join('\n'));

  return {
    destination,
    messageCount: rows.length,
    participantCount: participants.size,
    firstAt: (rows[0].created_at || '').slice(0, 10),
    lastAt: (rows[rows.length - 1].created_at || '').slice(0, 10)
  };
}

const archiveCommand = {
  data: new SlashCommandBuilder()
    .setName('archive-channel')
    .setDescription('チャンネルの全ログを markdown へ書き出します（管理者・終結の儀式）。')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('対象チャンネル（未指定なら実行チャンネル）')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum)
    ),

  async execute(interaction) {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ctx = archiveCommand.ctx;
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = exportChannelMarkdown(ctx, {
      channelId: String(channel.id),
      channelName: channel.name || String(channel.id)
    });

    if (!result) {
      await interaction.editReply(`<#${channel.id}> のアーカイブ済みメッセージは見つかりませんでした。`);
      return;
    }

    ctx.logger.info('Channel exported to markdown', {
      channelId: String(channel.id),
      messageCount: result.messageCount,
      destination: path.basename(result.destination)
    });

    await interaction.editReply(
      [
        `📦 <#${channel.id}> をアーカイブしました: \`${path.basename(result.destination)}\``,
        `期間: ${result.firstAt} 〜 ${result.lastAt} ／ ${result.messageCount} メッセージ ／ 参加者 ${result.participantCount} 名`,
        '-# チャンネルの削除は行いません。不要になったら手動で削除してください'
      ].join('\n')
    );
  }
};

module.exports = {
  name: 'work-archive',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  commands: [archiveCommand],
  init(ctx) {
    archiveCommand.ctx = ctx;
  }
};
