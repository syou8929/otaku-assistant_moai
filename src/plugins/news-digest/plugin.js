const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');
const { fetchFeed, urlKey, titleKey } = require('./feed');

const DIGEST_ITEMS_PER_CATEGORY = 5;

/**
 * 日次ニュースダイジェスト。カテゴリ別の RSS/Atom フィード（キー不要）を巡回蓄積し、
 * 重複排除＋複数ソース同時出現スコアで「1日1枚のダイジェスト」を配信する。
 * 垂れ流し RSS bot との違い: 横断重複排除 / Hot スコア / 1日1枚（通知洪水にしない）/ 既配信の再掲なし。
 *
 * config 例: "plugins": { "news-digest": {
 *   "enabled": true,
 *   "categories": {
 *     "テック": { "channelId": "...", "feeds": [
 *       { "name": "HN", "url": "https://news.ycombinator.com/rss" },
 *       { "name": "Publickey", "url": "https://www.publickey1.jp/atom.xml" } ] },
 *     "AI": { "channelId": "...", "feeds": [
 *       { "name": "r/LocalLLaMA", "url": "https://www.reddit.com/r/LocalLLaMA/.rss" } ] }
 *   },
 *   "digestCron": "0 8 * * 1-5", "crawlCron": "15 (2時間ごとの例: 15 *\/2 * * *)" } }
 */

function getSettings(ctx) {
  const raw = ctx.config.plugins?.['news-digest'] || {};
  return {
    categories: raw.categories && typeof raw.categories === 'object' ? raw.categories : {},
    digestCron: String(raw.digestCron || ''),
    crawlCron: String(raw.crawlCron || '15 */2 * * *'),
    itemsPerCategory: Number.isFinite(raw.itemsPerCategory)
      ? raw.itemsPerCategory
      : DIGEST_ITEMS_PER_CATEGORY
  };
}

async function crawlAll(ctx) {
  const settings = getSettings(ctx);
  const repo = ctx.db['news-digest'];
  let added = 0;
  let failed = 0;

  for (const [category, categoryConfig] of Object.entries(settings.categories)) {
    for (const feed of categoryConfig.feeds || []) {
      try {
        const items = await fetchFeed(feed.url);

        for (const item of items) {
          const isNew = repo.upsertItem({
            urlKey: urlKey(item.url),
            category,
            sourceName: feed.name || feed.url,
            url: item.url,
            title: item.title,
            titleKey: titleKey(item.title),
            publishedAt: item.publishedAt
          });

          if (isNew) {
            added += 1;
          }
        }
      } catch (error) {
        failed += 1;
        ctx.logger.warn('news-digest feed crawl failed', {
          category,
          feed: feed.url,
          error: error.message
        });
      }
    }
  }

  ctx.logger.info('news-digest crawl complete', { newItems: added, failedFeeds: failed });
  return { added, failed };
}

function buildDigestContent(category, items) {
  const lines = [`📰 **${category} ダイジェスト**（${new Date().getMonth() + 1}/${new Date().getDate()}）`];

  for (const item of items) {
    const hot = item.source_count > 1 ? ` 🔥x${item.source_count}` : '';
    lines.push(`・**${item.title.slice(0, 90)}**${hot}　-# ${item.source_name}`);
    lines.push(`　${item.url}`);
  }

  return lines.join('\n');
}

async function deliverDigests(ctx) {
  const settings = getSettings(ctx);
  const repo = ctx.db['news-digest'];

  for (const [category, categoryConfig] of Object.entries(settings.categories)) {
    if (!categoryConfig.channelId) {
      continue;
    }

    const candidates = repo.digestCandidates(category, { limit: settings.itemsPerCategory });

    if (candidates.length === 0) {
      continue;
    }

    const channel = await ctx.client.channels.fetch(String(categoryConfig.channelId)).catch(() => null);

    if (!channel) {
      ctx.logger.warn('news-digest delivery channel unavailable', { category });
      continue;
    }

    await channel.send({
      content: buildDigestContent(category, candidates),
      flags: MessageFlags.SuppressEmbeds
    });

    for (const item of candidates) {
      repo.markDelivered(item.url_key);
    }

    ctx.logger.info('news-digest delivered', { category, items: candidates.length });
  }
}

const newsCommand = {
  data: new SlashCommandBuilder()
    .setName('news')
    .setDescription('ニュースダイジェスト')
    .addSubcommand((sub) => sub.setName('now').setDescription('ダイジェストを今すぐ配信（管理者）'))
    .addSubcommand((sub) => sub.setName('crawl').setDescription('フィードを今すぐ巡回（管理者）'))
    .addSubcommand((sub) => sub.setName('status').setDescription('蓄積状況')),

  async execute(interaction) {
    const ctx = newsCommand.ctx;
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'status') {
      const stats = ctx.db['news-digest'].stats();
      const lines = stats.length
        ? stats.map((row) => `・${row.category}: 蓄積 ${row.total}（未配信 ${row.pending}）`)
        : ['まだ何も蓄積されていません。'];
      await interaction.reply({ content: ['📰 ニュース蓄積状況', ...lines].join('\n'), flags: MessageFlags.Ephemeral });
      return;
    }

    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'crawl') {
      const result = await crawlAll(ctx);
      await interaction.editReply(`巡回完了: 新規 ${result.added} 件、失敗フィード ${result.failed}`);
      return;
    }

    if (subcommand === 'now') {
      await deliverDigests(ctx);
      await interaction.editReply('ダイジェストを配信しました。');
    }
  }
};

module.exports = {
  name: 'news-digest',
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [newsCommand],
  jobs: {
    crawl: async (payload, ctx) => {
      await crawlAll(ctx);
    },
    digest: async (payload, ctx) => {
      await deliverDigests(ctx);
    }
  },
  init(ctx) {
    newsCommand.ctx = ctx;
    const settings = getSettings(ctx);

    if (Object.keys(settings.categories).length === 0) {
      ctx.logger.warn('news-digest: categories is empty; digest is idle', {});
      return;
    }

    ctx.scheduler.scheduleCron({ plugin: 'news-digest', type: 'crawl', cron: settings.crawlCron, key: 'crawl' });

    if (settings.digestCron) {
      ctx.scheduler.scheduleCron({ plugin: 'news-digest', type: 'digest', cron: settings.digestCron, key: 'digest' });
    }
  }
};
