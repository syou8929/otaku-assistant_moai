const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { getMessageJumpUrl } = require('../../shared/discordLinks');

const SNIPPET_LENGTH = 120;
const MAX_RESULTS = 10;

/**
 * shared/messageArchive の蓄積に対する全文検索（基盤級プラグイン）。
 * 結果は ephemeral（検索者だけに見える）。情報バリア前提として、
 * 検索者がそのチャンネルを閲覧できるか（権限チェック）で結果を絞る。
 * api: ctx.services['archive-search'].search(query, opts) を digest/helpdesk が再利用。
 */

function canViewChannel(interaction, channelId) {
  const channel = interaction.guild?.channels?.cache?.get(channelId);

  if (!channel) {
    return false; // 取得不能なチャンネルは出さない（安全側）
  }

  const perms = channel.permissionsFor(interaction.member);
  return Boolean(perms?.has('ViewChannel'));
}

function buildResultCard(interaction, result) {
  const lines = [`🔎 「${result.query}」の検索結果（${result.rows.length}件）`];

  if (result.rows.length === 0) {
    lines.push(
      result.mode === 'like'
        ? '一致なし。（2文字以下は前方後方一致検索です）'
        : '一致するメッセージは見つかりませんでした。'
    );
    return lines.join('\n');
  }

  for (const row of result.rows) {
    const snippet = (row.content || '')
      .replace(/\n/g, ' ')
      .slice(0, SNIPPET_LENGTH);
    const jump = getMessageJumpUrl({
      guildId: row.guildId,
      channelId: row.channelId,
      messageId: row.messageId
    });
    const when = (row.createdAt || '').slice(0, 10);
    lines.push(`・**${row.authorName || '不明'}**（<#${row.channelId}> ${when}）\n　${snippet}　${jump}`);
  }

  return lines.join('\n');
}

const searchCommand = {
  data: new SlashCommandBuilder()
    .setName('search')
    .setDescription('過去のメッセージを全文検索します（結果は自分にだけ表示）。')
    .addStringOption((option) =>
      option.setName('query').setDescription('検索語').setRequired(true).setMaxLength(100)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('このチャンネルに限定')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum)
    ),

  async execute(interaction) {
    const ctx = searchCommand.ctx;
    const query = interaction.options.getString('query', true);
    const channel = interaction.options.getChannel('channel');

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // 多めに取得し、閲覧権限フィルタ後に上限まで絞る（漏洩ガード: 見えないチャンネルの内容は出さない）
    const raw = ctx.db['archive-search'].search(query, {
      channelId: channel?.id || '',
      limit: MAX_RESULTS * 5
    });

    const visibleRows = raw.rows
      .filter((row) => canViewChannel(interaction, row.channelId))
      .slice(0, MAX_RESULTS);

    await interaction.editReply(
      buildResultCard(interaction, { query, rows: visibleRows, mode: raw.mode })
    );
  }
};

module.exports = {
  name: 'archive-search',
  // 新規機能は spec の原則どおり既定 OFF。
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [searchCommand],
  // digest / helpdesk が ctx.services['archive-search'].search() で再利用する公開面
  api: {
    search: null // init で実体を差し込む（repository は db 経由でしか取れないため）
  },
  init(ctx) {
    searchCommand.ctx = ctx;
    module.exports.api.search = (query, opts) => ctx.db['archive-search'].search(query, opts);

    // 既存アーカイブのバックフィル（トリガは新規行のみ追従するため、初回に一括投入）
    const result = ctx.db['archive-search'].backfill();
    ctx.logger.info('archive-search backfill complete', {
      inserted: result.inserted,
      indexed: result.total,
      archiveTotal: result.archiveTotal
    });
  }
};
