const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');
const { isRelayAllowed, getBarrierConfig } = require('./barrier');

const ASSIGNABLE_TYPES = [
  ChannelType.GuildText,
  ChannelType.GuildForum,
  ChannelType.GuildCategory,
  ChannelType.GuildAnnouncement
];

const barrierCommand = {
  data: new SlashCommandBuilder()
    .setName('timeline-barrier')
    .setDescription('情報バリア（Tier）の管理。数値が大きいほど機密です。')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('チャンネルまたはカテゴリへ Tier を割り当てます。')
        .addChannelOption((option) =>
          option
            .setName('target')
            .setDescription('対象チャンネル / カテゴリ')
            .addChannelTypes(...ASSIGNABLE_TYPES)
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('tier')
            .setDescription('Tier（0=公開 〜 9=最機密）')
            .setMinValue(0)
            .setMaxValue(9)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Tier 割当を解除します。')
        .addChannelOption((option) =>
          option
            .setName('target')
            .setDescription('対象チャンネル / カテゴリ')
            .addChannelTypes(...ASSIGNABLE_TYPES)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Tier 割当一覧とバリアの状態'))
    .addSubcommand((sub) =>
      sub
        .setName('test')
        .setDescription('ソース→宛先の中継可否を検査します（dry-run）。')
        .addChannelOption((option) =>
          option.setName('source').setDescription('ソース').setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('destination')
            .setDescription('宛先')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ctx = barrierCommand.ctx;

    if (!ctx) {
      await interaction.reply({ content: 'バリア機能が初期化されていません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const repo = ctx.db['timeline-relay'];
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'set') {
      const target = interaction.options.getChannel('target', true);
      const tier = interaction.options.getInteger('tier', true);
      const subjectType = target.type === ChannelType.GuildCategory ? 'category' : 'channel';

      repo.upsertTier({
        subjectId: String(target.id),
        subjectType,
        tier,
        setBy: interaction.user.id
      });

      ctx.logger.info('Barrier tier assigned', {
        subjectId: String(target.id),
        subjectType,
        tier,
        setBy: interaction.user.id
      });

      await interaction.reply({
        content: `🛡 <#${target.id}>（${subjectType}）に Tier **${tier}** を割り当てました。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'remove') {
      const target = interaction.options.getChannel('target', true);
      const removed = repo.removeTier(String(target.id));
      await interaction.reply({
        content: removed
          ? `🛡 <#${target.id}> の Tier 割当を解除しました（未割当の既定値に戻ります）。`
          : `<#${target.id}> に割当はありません。`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'list') {
      const barrier = getBarrierConfig(ctx.config);
      const rows = repo.listTiers();
      const lines = [
        `バリア: **${barrier.enabled ? '有効' : '無効'}**`,
        `未割当の既定値: ソース=${barrier.defaultSourceTier} / 宛先=${barrier.defaultDestinationTier}（deny-by-default）`,
        ''
      ];

      if (rows.length === 0) {
        lines.push('Tier 割当はまだありません。`/timeline-barrier set` で割り当ててください。');
      } else {
        for (const row of rows) {
          lines.push(`Tier ${row.tier} — <#${row.subject_id}>（${row.subject_type}）`);
        }
      }

      await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    if (subcommand === 'test') {
      const source = interaction.options.getChannel('source', true);
      const destination = interaction.options.getChannel('destination', true);
      const verdict = await isRelayAllowed({
        sourceChannel: source,
        destinationChannel: destination,
        db: ctx.db,
        config: ctx.config,
        client: interaction.client
      });

      await interaction.reply({
        content: [
          `${verdict.allowed ? '✅ 中継許可' : '⛔ 中継拒否'}: <#${source.id}> → <#${destination.id}>`,
          verdict.reason === 'barrier-disabled'
            ? '-# バリアが無効のため全て許可されます'
            : `-# ソース Tier ${verdict.sourceTier} → 宛先 Tier ${verdict.destinationTier}`
        ].join('\n'),
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

module.exports = {
  barrierCommand
};
