const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');
const { fetchChannelFeed } = require('./rss');
const { pickSet, buildPickMessage } = require('./picker');

/**
 * ミューズ・ガチャ: ジャンル別チャンネルプール（YouTube RSS・キー不要）から
 * 「今日の3本」（2本=対象ジャンル + 1本=乱入枠）を抽選して配信する。
 * 既出回避は picks 履歴（既定60日）。プールは定期クロールで蓄積。
 *
 * config 例: "plugins": { "muse-gacha": {
 *   "enabled": true,
 *   "pools": { "MV": ["UCxxxx"], "モーション": ["UCyyyy"] },
 *   "deliveryChannelId": "...", "deliveryCron": "0 9 * * *",
 *   "crawlCron": "30 5 * * *", "excludeDays": 60 } }
 */

function getSettings(ctx) {
  const raw = ctx.config.plugins?.['muse-gacha'] || {};
  return {
    pools: raw.pools && typeof raw.pools === 'object' ? raw.pools : {},
    deliveryChannelId: String(raw.deliveryChannelId || ''),
    deliveryCron: String(raw.deliveryCron || ''),
    crawlCron: String(raw.crawlCron || '30 5 * * *'),
    excludeDays: Number.isFinite(raw.excludeDays) ? raw.excludeDays : 60
  };
}

async function crawlPools(ctx) {
  const settings = getSettings(ctx);
  const repo = ctx.db['muse-gacha'];
  let added = 0;
  let failed = 0;

  for (const [genre, channelIds] of Object.entries(settings.pools)) {
    for (const channelId of channelIds) {
      try {
        const entries = await fetchChannelFeed(channelId);

        for (const entry of entries) {
          repo.upsertVideo({
            videoId: entry.videoId,
            genre,
            channelId,
            channelTitle: entry.channelTitle,
            title: entry.title,
            publishedAt: entry.publishedAt
          });
          added += 1;
        }
      } catch (error) {
        failed += 1;
        ctx.logger.warn('muse-gacha crawl failed for channel', {
          genre,
          channelId,
          error: error.message
        });
      }
    }
  }

  ctx.logger.info('muse-gacha crawl complete', {
    upserted: added,
    failedChannels: failed,
    poolTotal: repo.poolCount()
  });

  return { added, failed };
}

function runGacha(ctx, genre) {
  const settings = getSettings(ctx);
  const genres = Object.keys(settings.pools);
  const targetGenre = genre && genres.includes(genre)
    ? genre
    : genres[Math.floor(Math.random() * genres.length)];

  if (!targetGenre) {
    return null;
  }

  const result = pickSet(ctx.db['muse-gacha'], genres, targetGenre, {
    excludeDays: settings.excludeDays
  });

  return buildPickMessage(result);
}

const museCommand = {
  data: new SlashCommandBuilder()
    .setName('muse')
    .setDescription('インスピレーション動画ガチャ')
    .addSubcommand((sub) =>
      sub
        .setName('pick')
        .setDescription('今すぐ3本ガチャを回す')
        .addStringOption((option) =>
          option.setName('genre').setDescription('ジャンル（未指定ならランダム）').setMaxLength(50)
        )
    )
    .addSubcommand((sub) => sub.setName('status').setDescription('プールの蓄積状況'))
    .addSubcommand((sub) => sub.setName('crawl').setDescription('プールを今すぐ巡回取得（管理者）')),

  async execute(interaction) {
    const ctx = museCommand.ctx;
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'pick') {
      const message = runGacha(ctx, interaction.options.getString('genre'));

      if (!message) {
        await interaction.reply({
          content: 'プールが未設定です。config の plugins["muse-gacha"].pools にジャンルとチャンネル ID を設定してください。',
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply(message);
      return;
    }

    if (subcommand === 'status') {
      const stats = ctx.db['muse-gacha'].genreStats();
      const lines = stats.length
        ? stats.map((row) => `・${row.genre}: ${row.count}本`)
        : ['プールは空です。/muse crawl で取り込んでください。'];
      await interaction.reply({
        content: [`🎬 プール蓄積（計 ${ctx.db['muse-gacha'].poolCount()}本）`, ...lines].join('\n'),
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    if (subcommand === 'crawl') {
      if (!isAdministrator(interaction.member)) {
        await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await crawlPools(ctx);
      await interaction.editReply(`巡回完了: 取込/更新 ${result.added} 件、失敗チャンネル ${result.failed}`);
    }
  }
};

module.exports = {
  name: 'muse-gacha',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [museCommand],
  jobs: {
    crawl: async (payload, ctx) => {
      await crawlPools(ctx);
    },
    deliver: async (payload, ctx) => {
      const settings = getSettings(ctx);

      if (!settings.deliveryChannelId) {
        return;
      }

      const message = runGacha(ctx, null);

      if (!message) {
        return;
      }

      const channel = await ctx.client.channels.fetch(settings.deliveryChannelId);
      await channel.send(message.content ? { content: message.content } : message);
    }
  },
  init(ctx) {
    museCommand.ctx = ctx;
    const settings = getSettings(ctx);

    if (Object.keys(settings.pools).length === 0) {
      ctx.logger.warn('muse-gacha: pools is empty; gacha is idle', {});
      return;
    }

    ctx.scheduler.scheduleCron({
      plugin: 'muse-gacha',
      type: 'crawl',
      cron: settings.crawlCron,
      key: 'crawl'
    });

    if (settings.deliveryChannelId && settings.deliveryCron) {
      ctx.scheduler.scheduleCron({
        plugin: 'muse-gacha',
        type: 'deliver',
        cron: settings.deliveryCron,
        key: 'daily-deliver'
      });
    }
  }
};
