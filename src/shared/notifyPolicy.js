/**
 * 通知統治（quiet hours）の共有ポリシー。
 * DM・メンションを伴う「人を起こす」通知の深夜配達を抑止し、静音明けへ繰り延べる。
 * チャンネルへの定期投稿（digest 等）は operator が cron で時刻を制御するため対象外。
 *
 * config（トップレベル）:
 *   "notifications": { "quietHours": { "start": "23:00", "end": "07:00" } }
 * 未設定なら quiet hours なし（全時刻許可）。
 */

function parseClock(text) {
  const match = String(text || '').match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

function getQuietHours(config) {
  const raw = config.notifications?.quietHours;

  if (!raw) {
    return null;
  }

  const start = parseClock(raw.start);
  const end = parseClock(raw.end);

  if (start === null || end === null || start === end) {
    return null;
  }

  return { start, end };
}

/** now が quiet hours 内か（日跨ぎ範囲 23:00-07:00 にも対応） */
function isQuietTime(config, now = new Date()) {
  const quiet = getQuietHours(config);

  if (!quiet) {
    return false;
  }

  const minutes = now.getHours() * 60 + now.getMinutes();

  if (quiet.start < quiet.end) {
    return minutes >= quiet.start && minutes < quiet.end;
  }

  return minutes >= quiet.start || minutes < quiet.end; // 日跨ぎ
}

/** quiet hours 明けの時刻を返す（quiet でなければ now のまま） */
function deferUntilQuietEnd(config, now = new Date()) {
  if (!isQuietTime(config, now)) {
    return now;
  }

  const { end } = getQuietHours(config);
  const result = new Date(now.getTime());
  result.setHours(Math.floor(end / 60), end % 60, 0, 0);

  if (result <= now) {
    result.setDate(result.getDate() + 1); // 日跨ぎ範囲で end が翌日
  }

  return result;
}

module.exports = {
  getQuietHours,
  isQuietTime,
  deferUntilQuietEnd
};
