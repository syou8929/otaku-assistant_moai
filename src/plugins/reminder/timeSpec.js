/**
 * 日本語の時刻指定を one-shot（runAt）または cron に解釈する決定的パーサ。
 * LLM は使わない（誤解釈がそのまま誤配達になるため）。
 * 対応形式:
 *   相対: 「30分後」「2時間後」「3日後」
 *   絶対: 「18:00」「今日 18:00」「明日 9:00」「明日」(=9:00)「6/15 09:00」「15時30分」
 *   定期: 「毎日 9:00」「毎週月 10:00」「平日 9:30」
 * タイムゾーンはプロセスのローカル時刻。
 */

const DOW_MAP = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const DEFAULT_MORNING_HOUR = 9;

function normalize(input) {
  return String(input)
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .replace(/\s+/g, ' ');
}

/** "18:00" / "18時" / "18時30分" → { hour, minute } / null */
function parseClock(text) {
  const colonMatch = text.match(/^(\d{1,2}):(\d{2})$/);

  if (colonMatch) {
    return { hour: Number(colonMatch[1]), minute: Number(colonMatch[2]) };
  }

  const jpMatch = text.match(/^(\d{1,2})時(?:(\d{1,2})分)?$/);

  if (jpMatch) {
    return { hour: Number(jpMatch[1]), minute: Number(jpMatch[2] || 0) };
  }

  return null;
}

function isValidClock(clock) {
  return clock && clock.hour >= 0 && clock.hour <= 23 && clock.minute >= 0 && clock.minute <= 59;
}

function atClock(base, clock) {
  const result = new Date(base.getTime());
  result.setHours(clock.hour, clock.minute, 0, 0);
  return result;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatDateTime(date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseTimeSpec(input, now = new Date()) {
  const text = normalize(input);

  // --- 相対: N分後 / N時間後 / N日後 ---
  const relative = text.match(/^(\d+)\s*(分|時間|日)後?$/);

  if (relative) {
    const amount = Number(relative[1]);

    if (amount <= 0) {
      return null;
    }

    const unitMs = { 分: 60_000, 時間: 3_600_000, 日: 86_400_000 }[relative[2]];
    const runAt = new Date(now.getTime() + amount * unitMs);
    return { kind: 'once', runAt, display: `${formatDateTime(runAt)}（${relative[1]}${relative[2]}後）` };
  }

  // --- 定期: 毎日 H:MM ---
  const daily = text.match(/^毎日\s+(.+)$/);

  if (daily) {
    const clock = parseClock(daily[1]);

    if (!isValidClock(clock)) {
      return null;
    }

    return {
      kind: 'cron',
      cron: `${clock.minute} ${clock.hour} * * *`,
      display: `毎日 ${pad(clock.hour)}:${pad(clock.minute)}`
    };
  }

  // --- 定期: 毎週X H:MM ---
  const weekly = text.match(/^毎週\s*([日月火水木金土])(?:曜日?)?\s+(.+)$/);

  if (weekly) {
    const clock = parseClock(weekly[2]);

    if (!isValidClock(clock)) {
      return null;
    }

    return {
      kind: 'cron',
      cron: `${clock.minute} ${clock.hour} * * ${DOW_MAP[weekly[1]]}`,
      display: `毎週${weekly[1]}曜 ${pad(clock.hour)}:${pad(clock.minute)}`
    };
  }

  // --- 定期: 平日 H:MM ---
  const weekdays = text.match(/^平日\s+(.+)$/);

  if (weekdays) {
    const clock = parseClock(weekdays[1]);

    if (!isValidClock(clock)) {
      return null;
    }

    return {
      kind: 'cron',
      cron: `${clock.minute} ${clock.hour} * * 1-5`,
      display: `平日 ${pad(clock.hour)}:${pad(clock.minute)}`
    };
  }

  // --- 明日 [H:MM] ---
  const tomorrow = text.match(/^明日(?:\s+(.+))?$/);

  if (tomorrow) {
    const clock = tomorrow[1]
      ? parseClock(tomorrow[1])
      : { hour: DEFAULT_MORNING_HOUR, minute: 0 };

    if (!isValidClock(clock)) {
      return null;
    }

    const base = new Date(now.getTime() + 86_400_000);
    const runAt = atClock(base, clock);
    return { kind: 'once', runAt, display: formatDateTime(runAt) };
  }

  // --- M/D H:MM ---
  const monthDay = text.match(/^(\d{1,2})\/(\d{1,2})\s+(.+)$/);

  if (monthDay) {
    const clock = parseClock(monthDay[3]);
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);

    if (!isValidClock(clock) || month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }

    const runAt = new Date(now.getFullYear(), month - 1, day, clock.hour, clock.minute, 0, 0);

    if (runAt.getMonth() !== month - 1 || runAt.getDate() !== day) {
      return null; // 6/31 のような存在しない日付
    }

    if (runAt <= now) {
      runAt.setFullYear(runAt.getFullYear() + 1); // 過去なら来年
    }

    return { kind: 'once', runAt, display: formatDateTime(runAt) };
  }

  // --- [今日] H:MM（過去なら明日） ---
  const today = text.match(/^(?:今日\s+)?(.+)$/);

  if (today) {
    const clock = parseClock(today[1]);

    if (isValidClock(clock)) {
      let runAt = atClock(now, clock);

      if (runAt <= now) {
        runAt = new Date(runAt.getTime() + 86_400_000);
      }

      return { kind: 'once', runAt, display: formatDateTime(runAt) };
    }
  }

  return null;
}

module.exports = {
  parseTimeSpec
};
