const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const { isAdministrator } = require('../../utils/permissions');
const { getMessageJumpUrl } = require('../../shared/discordLinks');

const EXCERPT_LENGTH = 200;

/**
 * 全チャンネルのピン留めを1つのポータルチャンネルへ自動ミラーする
 * （昇格エンジン第1スライス。誰も新しい操作を覚えなくてよい＝既存のピン習慣に寄生）。
 *
 * 漏洩ガード: ミラー対象は config の sources（チャンネル/カテゴリ ID）に
 * 明示列挙されたものだけ（deny-by-default）。私的チャンネルのピンが
 * 公開ポータルへ出る事故を構造的に防ぐ。barrier 検査（基盤③）導入後は
 * その検査に置き換える。
 *
 * config 例: "plugins": { "pin-portal": {
 *   "enabled": true, "portalChannelId": "...", "sources": ["channelId", "categoryId"] } }
 */

function getSettings(ctx) {
  const raw = ctx.config.plugins?.['pin-portal'] || {};
  return {
    portalChannelId: String(raw.portalChannelId || ''),
    sources: Array.isArray(raw.sources) ? raw.sources.map(String) : []
  };
}

function isSourceAllowed(channel, sources) {
  return sources.includes(String(channel.id)) || sources.includes(String(channel.parentId || ''));
}

function buildPortalCard(channel, message) {
  const excerpt = (message.content || '').slice(0, EXCERPT_LENGTH) || '（本文なし／添付メッセージ）';
  const jumpUrl = getMessageJumpUrl({
    guildId: message.guildId,
    channelId: channel.id,
    messageId: message.id
  });

  return {
    content: [
      `📌 <#${channel.id}> — ${message.author ? `<@${message.author.id}>` : '不明'}`,
      `> ${excerpt.replace(/\n/g, '\n> ')}`,
      jumpUrl
    ].join('\n'),
    allowedMentions: { parse: [] }
  };
}

/** ピン一覧スナップショットと DB を突合し、増分をポータルへ・減分をポータルから反映する */
async function reconcileChannelPins(ctx, channel) {
  const settings = getSettings(ctx);

  if (!settings.portalChannelId || !isSourceAllowed(channel, settings.sources)) {
    return { skipped: true };
  }

  const portal = await ctx.client.channels.fetch(settings.portalChannelId);
  const pinned = await channel.messages.fetchPinned();
  const stored = ctx.db['pin-portal'].listByChannel(channel.id);
  const storedByMessageId = new Map(stored.map((row) => [row.message_id, row]));

  let added = 0;
  let removed = 0;

  for (const [messageId, message] of pinned) {
    if (storedByMessageId.has(messageId)) {
      storedByMessageId.delete(messageId);
      continue;
    }

    const portalMessage = await portal.send(buildPortalCard(channel, message));
    ctx.db['pin-portal'].insert({
      sourceChannelId: channel.id,
      messageId,
      portalMessageId: portalMessage.id
    });
    added += 1;
  }

  // 残った stored = ピン解除済み → ポータルから撤去
  for (const [messageId, row] of storedByMessageId) {
    await portal.messages.delete(row.portal_message_id).catch(() => null);
    ctx.db['pin-portal'].remove(channel.id, messageId);
    removed += 1;
  }

  if (added > 0 || removed > 0) {
    ctx.logger.info('Pin portal reconciled', {
      sourceChannelId: channel.id,
      added,
      removed
    });
  }

  return { added, removed };
}

const syncCommand = {
  data: new SlashCommandBuilder()
    .setName('pin-sync')
    .setDescription('指定チャンネルのピン留めをポータルへ手動同期します（管理者）。')
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('同期するチャンネル（未指定なら実行チャンネル）')
        .addChannelTypes(ChannelType.GuildText)
    ),

  async execute(interaction) {
    if (!isAdministrator(interaction.member)) {
      await interaction.reply({ content: 'このコマンドは管理者のみ使用できます。', flags: MessageFlags.Ephemeral });
      return;
    }

    const ctx = syncCommand.ctx;
    const channel = interaction.options.getChannel('channel') || interaction.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await reconcileChannelPins(ctx, channel);

    if (result.skipped) {
      await interaction.editReply(
        `<#${channel.id}> は同期対象ではありません（plugins["pin-portal"].sources に追加してください）。`
      );
      return;
    }

    await interaction.editReply(`同期しました: 追加 ${result.added} / 撤去 ${result.removed}`);
  }
};

module.exports = {
  name: 'pin-portal',
  // 新規機能は spec の原則どおり既定 OFF。
  enabledByDefault: false,
  dependsOn: [],
  intents: ['Guilds', 'GuildMessages', 'MessageContent'],
  capabilities: {},
  migrations: require('./migrations'),
  repository: require('./repository'),
  commands: [syncCommand],
  events: {
    // channelPinsUpdate はどのメッセージが増減したかを教えないため、
    // fetchPinned との差分取り（reconcile）で反映する。
    channelPinsUpdate: {
      priority: 100,
      handle: async (channel) => {
        await reconcileChannelPins(module.exports._ctx, channel);
      }
    }
  },
  init(ctx) {
    module.exports._ctx = ctx;
    syncCommand.ctx = ctx;

    const settings = getSettings(ctx);

    if (!settings.portalChannelId) {
      ctx.logger.warn('pin-portal: portalChannelId is not configured; mirroring is disabled', {});
    }
  }
};
