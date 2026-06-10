const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');

const DORMANT_DAYS = 28;

/**
 * 利用テレメトリの閲覧面（収集は core/telemetry.js が常時担当 — 集計カウントのみ・
 * ユーザーID なし）。/telemetry で直近の利用状況と「休眠プラグイン」を表示し、
 * 『有効だが使われていない機能』を loadout から剪定する判断材料にする。
 */

const telemetryCommand = {
  data: new SlashCommandBuilder()
    .setName('telemetry')
    .setDescription('機能の利用状況と休眠プラグインの確認（管理者）')
    .addIntegerOption((option) =>
      option.setName('days').setDescription('集計日数（既定30）').setMinValue(1).setMaxValue(90)
    ),

  async execute(interaction) {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const days = interaction.options.getInteger('days') || 30;
    const telemetry = interaction.client.telemetry;

    if (!telemetry) {
      await interaction.reply({ content: 'テレメトリが初期化されていません。', flags: MessageFlags.Ephemeral });
      return;
    }

    const rows = telemetry.summary(days);
    const byKind = { command: [], component: [], job: [] };

    for (const row of rows) {
      (byKind[row.kind] || (byKind[row.kind] = [])).push(row);
    }

    const lines = [`📊 利用状況（直近${days}日・集計のみ/個人情報なし）`];

    for (const [kind, label] of [['command', 'コマンド'], ['component', 'ボタン/メニュー'], ['job', 'ジョブ']]) {
      const top = (byKind[kind] || []).slice(0, 8);

      if (top.length > 0) {
        lines.push(`**${label}**: ${top.map((r) => `${r.key}×${r.total}`).join(' / ')}`);
      }
    }

    // 休眠検出: 有効なのに直近28日コマンド・コンポーネント利用ゼロのプラグイン
    const recent = telemetry.summary(DORMANT_DAYS);
    const usedPlugins = new Set();

    for (const row of recent) {
      if (row.kind === 'component') {
        usedPlugins.add(row.key); // prefix ≒ plugin
      }

      if (row.kind === 'job') {
        usedPlugins.add(String(row.key).split(':')[0]);
      }
    }

    const loaded = interaction.client.loadedPlugins || [];
    const dormant = loaded.filter(
      (name) => !usedPlugins.has(name) && !['backup', 'telemetry'].includes(name)
    );

    if (dormant.length > 0) {
      lines.push('');
      lines.push(`💤 休眠候補（${DORMANT_DAYS}日間 GUI/ジョブ利用なし）: ${dormant.join(', ')}`);
      lines.push('-# コマンド名とプラグイン名は一致しない場合があります（参考値）。剪定は plugins:prune で');
    }

    await interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
  }
};

module.exports = {
  name: 'telemetry',
  // 閲覧コマンドのみの薄い面（収集は core が常時行う）。表面ゼロ運用も可能なため既定 OFF
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds'],
  capabilities: {},
  commands: [telemetryCommand],
  init() {}
};
