/**
 * 仕事サーバー向けチャンネルのプロビジョニング（一回きり・REST のみ）。
 * Gateway 接続（常駐起動）はしない。冪等: 同名チャンネルが既にあれば再利用する。
 *
 * 使い方:
 *   node scripts/provisionChannels.js --guild <GUILD_ID>           # dry-run（何を作るか表示のみ）
 *   node scripts/provisionChannels.js --guild <GUILD_ID> --apply   # 実際に作成
 *
 * 前提: bot がそのサーバーに招待済みで「チャンネルの管理」権限を持つこと。
 * 出力: 作成/再利用したチャンネル ID と、config.json に貼れる plugins スニペット。
 */

require('dotenv').config();
const { REST, Routes, ChannelType } = require('discord.js');

const CATEGORY_NAME = '🤖｜bot';

// 名前 → どの config キーに割り当てるか
const CHANNEL_PLAN = [
  { name: '📌｜ピン留めまとめ', configPath: ['pin-portal', 'portalChannelId'] },
  { name: '📑｜決定事項', configPath: ['decision-log', 'portalChannelId'] },
  { name: '🗂｜リファレンス', configPath: ['ref-board', 'boardChannelId'] },
  { name: '📰｜ニュース', configPath: ['news-digest', '<categories.*.channelId>'] },
  { name: '🎬｜インスピレーション', configPath: ['muse-gacha', 'deliveryChannelId'] }
];

function parseArgs(argv) {
  const args = { guildId: '', apply: false };

  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--guild') {
      args.guildId = String(argv[i + 1] || '');
      i += 1;
    } else if (argv[i] === '--apply') {
      args.apply = true;
    }
  }

  return args;
}

function buildConfigSnippet(assignments) {
  const ids = Object.fromEntries(assignments.map((a) => [a.name, a.id]));
  return JSON.stringify(
    {
      plugins: {
        faq: { enabled: true },
        reminder: { enabled: true },
        'archive-search': { enabled: true },
        telemetry: { enabled: true },
        'decision-log': { enabled: true, portalChannelId: ids['📑｜決定事項'] },
        'pin-portal': {
          enabled: true,
          portalChannelId: ids['📌｜ピン留めまとめ'],
          sources: ['<公開カテゴリのIDをここに>']
        },
        'ref-board': { enabled: true, boardChannelId: ids['🗂｜リファレンス'] },
        'news-digest': {
          enabled: false,
          categories: {
            テック: {
              channelId: ids['📰｜ニュース'],
              feeds: [{ name: 'Hacker News', url: 'https://news.ycombinator.com/rss' }]
            }
          },
          digestCron: '0 8 * * 1-5'
        },
        'muse-gacha': {
          enabled: false,
          pools: { MV: ['<YouTubeチャンネルID>'] },
          deliveryChannelId: ids['🎬｜インスピレーション'],
          deliveryCron: '0 9 * * 1-5'
        }
      },
      notifications: { quietHours: { start: '23:00', end: '07:00' } }
    },
    null,
    2
  );
}

async function main() {
  const { guildId, apply } = parseArgs(process.argv);
  const token = process.env.DISCORD_TOKEN;

  if (!guildId || !token) {
    console.error('Usage: node scripts/provisionChannels.js --guild <GUILD_ID> [--apply]');
    console.error('DISCORD_TOKEN は .env から読み込まれます。');
    process.exit(1);
  }

  const rest = new REST({ version: '10' }).setToken(token);

  const existing = await rest.get(Routes.guildChannels(guildId));
  const byName = new Map(existing.map((channel) => [channel.name, channel]));

  console.log(`サーバー内の既存チャンネル: ${existing.length} 件`);
  console.log(apply ? '--apply: 実際に作成します' : 'dry-run: 作成はしません（--apply で実行）');
  console.log('');

  // カテゴリ
  let category = byName.get(CATEGORY_NAME);

  if (category) {
    console.log(`[再利用] カテゴリ ${CATEGORY_NAME} (${category.id})`);
  } else if (apply) {
    category = await rest.post(Routes.guildChannels(guildId), {
      body: { name: CATEGORY_NAME, type: ChannelType.GuildCategory }
    });
    console.log(`[作成] カテゴリ ${CATEGORY_NAME} (${category.id})`);
  } else {
    console.log(`[予定] カテゴリ ${CATEGORY_NAME}`);
  }

  // チャンネル
  const assignments = [];

  for (const plan of CHANNEL_PLAN) {
    let channel = byName.get(plan.name);

    if (channel) {
      console.log(`[再利用] #${plan.name} (${channel.id}) → plugins.${plan.configPath.join('.')}`);
    } else if (apply) {
      channel = await rest.post(Routes.guildChannels(guildId), {
        body: { name: plan.name, type: ChannelType.GuildText, parent_id: category?.id }
      });
      console.log(`[作成] #${plan.name} (${channel.id}) → plugins.${plan.configPath.join('.')}`);
    } else {
      console.log(`[予定] #${plan.name} → plugins.${plan.configPath.join('.')}`);
    }

    assignments.push({ name: plan.name, id: channel?.id || '<作成後に入る>' });
  }

  console.log('');
  console.log('=== config.json に貼るスニペット（plugins / notifications）===');
  console.log(buildConfigSnippet(assignments));
  console.log('');
  console.log('次の手順: config.json へ反映 → npm run register-commands → bot 再起動');
}

main().catch((error) => {
  console.error('provision failed:', error.message);
  process.exit(1);
});
