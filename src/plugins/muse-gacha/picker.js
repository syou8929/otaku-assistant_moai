/**
 * 「今日の3本」の抽選（純関数）。偶然性の設計:
 * - 3本中2本は対象ジャンル、1本は他ジャンルからの「乱入枠」（視野の外を連れてくる）
 * - 既出回避は repository 側（excludeSince 以降の pick を候補から除外）
 * - プールが浅いときは取れるだけ返す（運用初期の許容劣化）
 */

const EXCLUDE_DAYS_DEFAULT = 60;
const MAIN_COUNT = 2;

function sampleWithoutReplacement(rows, count, random = Math.random) {
  const pool = [...rows];
  const picked = [];

  while (pool.length > 0 && picked.length < count) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }

  return picked;
}

/**
 * @param repo db['muse-gacha']
 * @param genres 設定済み全ジャンル名
 * @param genre 対象ジャンル
 * @returns { picks: [{...video, isIntruder}], genre }
 */
function pickSet(repo, genres, genre, { excludeDays = EXCLUDE_DAYS_DEFAULT, random = Math.random } = {}) {
  const excludeSince = new Date(Date.now() - excludeDays * 86_400_000).toISOString();

  const main = sampleWithoutReplacement(repo.candidates(genre, excludeSince), MAIN_COUNT, random)
    .map((video) => ({ ...video, isIntruder: false }));

  const otherGenres = genres.filter((g) => g !== genre);
  let intruder = [];

  if (otherGenres.length > 0) {
    const intruderGenre = otherGenres[Math.floor(random() * otherGenres.length)];
    intruder = sampleWithoutReplacement(repo.candidates(intruderGenre, excludeSince), 1, random)
      .map((video) => ({ ...video, isIntruder: true }));
  }

  const picks = [...main, ...intruder];

  for (const pick of picks) {
    repo.recordPick(pick.video_id);
  }

  return { picks, genre };
}

function buildPickMessage({ picks, genre }) {
  if (picks.length === 0) {
    return {
      content: `🎬 「${genre}」のプールに新しい候補がありません。\`/muse crawl\` で取り込むか、プールの蓄積をお待ちください。`,
      components: []
    };
  }

  const lines = [`🎬 **今日の3本** — ジャンル: ${genre}`];

  for (const pick of picks) {
    const label = pick.isIntruder ? `🎲 乱入枠（${pick.genre}）` : pick.channel_title || pick.genre;
    lines.push(`**${pick.title}**　-# ${label}`);
    lines.push(`https://www.youtube.com/watch?v=${pick.video_id}`);
  }

  return { content: lines.join('\n') };
}

module.exports = {
  pickSet,
  buildPickMessage,
  sampleWithoutReplacement
};
