const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { parseTimeSpec } = require('./timeSpec');
const { isQuietTime, deferUntilQuietEnd } = require('../../shared/notifyPolicy');

/**
 * リマインダーの作成・配達・操作（snooze/done/cancel）のライフサイクル。
 * scheduler のジョブ payload は { reminderId } のみ。真実源は reminders テーブルで、
 * cancel は行 status の変更だけで成立する（配達時に status を再確認する lazy 方式）。
 */

function createReminder(ctx, {
  guildId,
  creatorId,
  targetKind,
  targetChannelId,
  mentionUserId,
  content,
  sourceUrl,
  spec
}) {
  const id = ctx.db.reminder.insert({
    guildId,
    creatorId,
    targetKind,
    targetChannelId,
    mentionUserId,
    content,
    sourceUrl,
    timeDisplay: spec.display,
    cron: spec.kind === 'cron' ? spec.cron : null,
    runAt: spec.kind === 'once' ? spec.runAt : null
  });

  if (spec.kind === 'once') {
    ctx.scheduler.schedule({
      plugin: 'reminder',
      type: 'deliver',
      payload: { reminderId: id },
      runAt: spec.runAt
    });
  } else {
    ctx.scheduler.scheduleCron({
      plugin: 'reminder',
      type: 'deliver',
      payload: { reminderId: id },
      cron: spec.cron,
      key: `rem-${id}`
    });
  }

  return id;
}

function buildDeliveryButtons(reminderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`remind:snooze:${reminderId}:10`)
      .setLabel('10分後')
      .setEmoji('⏰')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remind:snooze:${reminderId}:60`)
      .setLabel('1時間後')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remind:snooze:${reminderId}:tomorrow`)
      .setLabel('明日9時')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remind:done:${reminderId}`)
      .setLabel('完了')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success)
  );
}

function buildDeliveryMessage(reminder) {
  const mention = `<@${reminder.mention_user_id || reminder.creator_id}>`;
  const lines = [`🔔 ${mention} リマインダー: **${reminder.content}**`];

  if (reminder.source_url) {
    lines.push(`出典: ${reminder.source_url}`);
  }

  if (reminder.cron) {
    lines.push(`-# ${reminder.time_display}（定期）。停止は /remind list から`);
  }

  return {
    content: lines.join('\n'),
    components: reminder.cron ? [] : [buildDeliveryButtons(reminder.id)],
    allowedMentions: { users: [reminder.mention_user_id || reminder.creator_id] }
  };
}

async function deliver(payload, ctx) {
  const reminder = ctx.db.reminder.get(payload.reminderId);

  if (!reminder || reminder.status === 'cancelled' || reminder.status === 'done') {
    return; // lazy cancel: 行が無効化済みなら配達しない
  }

  // 通知統治: quiet hours 中の配達は静音明けへ繰り延べ（人を起こさない）。
  // ユーザーが明示した時刻も対象になるため config 未設定なら無効（既定）。
  if (isQuietTime(ctx.config)) {
    const deferredTo = deferUntilQuietEnd(ctx.config);
    ctx.db.reminder.setRunAt(reminder.id, deferredTo);
    ctx.scheduler.schedule({
      plugin: 'reminder',
      type: 'deliver',
      payload: { reminderId: reminder.id },
      runAt: deferredTo
    });
    ctx.logger.info('Reminder deferred by quiet hours', {
      reminderId: reminder.id,
      deferredTo: deferredTo.toISOString()
    });
    return;
  }

  const message = buildDeliveryMessage(reminder);

  if (reminder.target_kind === 'dm') {
    const user = await ctx.client.users.fetch(reminder.mention_user_id || reminder.creator_id);
    await user.send(message);
  } else {
    const channel = await ctx.client.channels.fetch(reminder.target_channel_id);
    await channel.send(message);
  }

  if (!reminder.cron) {
    ctx.db.reminder.setStatus(reminder.id, 'delivered');
  }

  ctx.logger.info('Reminder delivered', {
    reminderId: reminder.id,
    targetKind: reminder.target_kind,
    recurring: Boolean(reminder.cron)
  });
}

function snooze(ctx, reminder, untilSpec) {
  let runAt;

  if (untilSpec === 'tomorrow') {
    runAt = new Date();
    runAt.setDate(runAt.getDate() + 1);
    runAt.setHours(9, 0, 0, 0);
  } else {
    const minutes = Number(untilSpec);

    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new Error(`invalid snooze spec: ${untilSpec}`);
    }

    runAt = new Date(Date.now() + minutes * 60_000);
  }

  runAt = deferUntilQuietEnd(ctx.config, runAt); // スヌーズ先が静音時間帯なら静音明けへ

  ctx.db.reminder.setRunAt(reminder.id, runAt);
  ctx.scheduler.schedule({
    plugin: 'reminder',
    type: 'deliver',
    payload: { reminderId: reminder.id },
    runAt
  });

  return runAt;
}

function cancel(ctx, reminder) {
  ctx.db.reminder.setStatus(reminder.id, 'cancelled');

  if (reminder.cron) {
    ctx.scheduler.cancelByKey('reminder', `rem-${reminder.id}`);
  }
}

module.exports = {
  createReminder,
  deliver,
  snooze,
  cancel,
  parseTimeSpec
};
