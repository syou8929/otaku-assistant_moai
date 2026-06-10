const fs = require('node:fs');
const path = require('node:path');
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');

const DEFAULT_CRON = '0 4 * * *'; // 毎日 4:00
const DEFAULT_KEEP = 14;

/**
 * バックアップ/エクスポート基盤。
 * - better-sqlite3 のオンラインバックアップ API で日次スナップショット（WAL 安全）
 * - 世代管理: 最新 N 世代だけ保持（既定14）
 * - 知識資産のエクスポート出口: decision-log の決定事項を markdown へ
 *   （SQLite ロックイン回避。テーブルが無ければ静かにスキップ）
 *
 * 例外的に既定 ON: ユーザー向け表面を持たない純粋な安全装置であり、
 * 「守る仕組みの不在」がカタログ批評で致命的欠落とされたため。
 * 復元は手動（bot 停止 → data/otaku-assistant.db を差し替え → 起動）。
 */

function getSettings(ctx) {
  const raw = ctx.config.plugins?.backup || {};
  return {
    cron: String(raw.cron || DEFAULT_CRON),
    keep: Number.isFinite(raw.keep) && raw.keep > 0 ? raw.keep : DEFAULT_KEEP
  };
}

function backupDir() {
  return path.resolve(process.cwd(), 'data', 'backups');
}

function exportDir() {
  return path.resolve(process.cwd(), 'data', 'exports');
}

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function runBackup(ctx) {
  const directory = backupDir();
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `backup-${timestamp()}.db`);

  await ctx.db.sqlite.backup(destination);

  const { keep } = getSettings(ctx);
  const backups = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith('backup-') && name.endsWith('.db'))
    .sort()
    .reverse();

  let pruned = 0;

  for (const old of backups.slice(keep)) {
    fs.rmSync(path.join(directory, old), { force: true });
    pruned += 1;
  }

  const size = fs.statSync(destination).size;
  ctx.logger.info('Backup complete', {
    destination: path.basename(destination),
    bytes: size,
    generations: Math.min(backups.length, keep),
    pruned
  });

  return { destination, size, generations: Math.min(backups.length, keep), pruned };
}

/** decision-log の決定事項を markdown へエクスポート（テーブル不在なら null） */
function exportDecisionsMarkdown(ctx) {
  const sqlite = ctx.db.sqlite;
  const hasTable = sqlite
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'decisions'")
    .get();

  if (!hasTable) {
    return null;
  }

  const rows = sqlite
    .prepare("SELECT * FROM decisions WHERE status = 'active' ORDER BY created_at ASC")
    .all();

  const lines = ['# 決定事項ログ', '', `エクスポート日時: ${new Date().toISOString()}`, ''];

  for (const row of rows) {
    lines.push(`## #${row.id} ${(row.created_at || '').slice(0, 10)}`);
    lines.push('');
    lines.push(row.content);

    if (row.source_url) {
      lines.push('');
      lines.push(`出典: ${row.source_url}`);
    }

    lines.push('');
  }

  fs.mkdirSync(exportDir(), { recursive: true });
  const destination = path.join(exportDir(), `decisions-${timestamp()}.md`);
  fs.writeFileSync(destination, lines.join('\n'));
  return { destination, count: rows.length };
}

const backupCommand = {
  data: new SlashCommandBuilder()
    .setName('backup')
    .setDescription('バックアップの管理（管理者）')
    .addSubcommand((sub) => sub.setName('now').setDescription('今すぐバックアップを取得'))
    .addSubcommand((sub) => sub.setName('status').setDescription('世代一覧'))
    .addSubcommand((sub) => sub.setName('export').setDescription('決定事項ログを markdown へ書き出し')),

  async execute(interaction) {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ctx = backupCommand.ctx;
    const subcommand = interaction.options.getSubcommand(true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'now') {
      const result = await runBackup(ctx);
      await interaction.editReply(
        `💾 バックアップ完了: \`${path.basename(result.destination)}\`（${(result.size / 1024 / 1024).toFixed(1)}MB、保持 ${result.generations} 世代）`
      );
      return;
    }

    if (subcommand === 'status') {
      const directory = backupDir();
      const backups = fs.existsSync(directory)
        ? fs.readdirSync(directory).filter((n) => n.endsWith('.db')).sort().reverse()
        : [];
      const lines = backups.length
        ? backups.map((name) => {
            const size = fs.statSync(path.join(directory, name)).size;
            return `・${name}（${(size / 1024 / 1024).toFixed(1)}MB）`;
          })
        : ['バックアップはまだありません。'];
      await interaction.editReply(['💾 バックアップ世代:', ...lines].join('\n'));
      return;
    }

    if (subcommand === 'export') {
      const result = exportDecisionsMarkdown(ctx);
      await interaction.editReply(
        result
          ? `📤 決定事項 ${result.count} 件を \`${path.basename(result.destination)}\` へ書き出しました。`
          : 'decision-log のデータが見つかりません。'
      );
    }
  }
};

module.exports = {
  name: 'backup',
  // 例外的に既定 ON（表面を持たない純粋な安全装置。blueprint 参照）
  enabledByDefault: true,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  commands: [backupCommand],
  jobs: {
    run: async (payload, ctx) => {
      await runBackup(ctx);
    }
  },
  init(ctx) {
    backupCommand.ctx = ctx;
    ctx.scheduler.scheduleCron({
      plugin: 'backup',
      type: 'run',
      cron: getSettings(ctx).cron,
      key: 'daily'
    });
  }
};
