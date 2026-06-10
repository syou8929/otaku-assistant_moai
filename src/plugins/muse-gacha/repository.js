// muse-gacha のアクセサ。db['muse-gacha'] としてマウントされる。
function createRepository(sqlite) {
  const statements = {
    upsertVideo: sqlite.prepare(`
      INSERT INTO muse_videos (video_id, genre, channel_id, channel_title, title, published_at, first_seen_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (video_id) DO UPDATE SET title = excluded.title, channel_title = excluded.channel_title
    `),
    candidates: sqlite.prepare(`
      SELECT v.* FROM muse_videos v
      WHERE v.genre = ?
        AND v.video_id NOT IN (SELECT video_id FROM muse_picks WHERE picked_at >= ?)
    `),
    genres: sqlite.prepare('SELECT genre, COUNT(*) AS count FROM muse_videos GROUP BY genre'),
    recordPick: sqlite.prepare('INSERT INTO muse_picks (video_id, picked_at) VALUES (?, ?)'),
    poolCount: sqlite.prepare('SELECT COUNT(*) AS c FROM muse_videos')
  };

  return {
    upsertVideo(video) {
      statements.upsertVideo.run(
        video.videoId,
        video.genre,
        video.channelId,
        video.channelTitle || null,
        video.title,
        video.publishedAt || null,
        new Date().toISOString()
      );
    },
    /** 既出（excludeSince 以降に pick 済み）を除いたジャンル内候補 */
    candidates(genre, excludeSince) {
      return statements.candidates.all(genre, excludeSince);
    },
    genreStats() {
      return statements.genres.all();
    },
    recordPick(videoId) {
      statements.recordPick.run(videoId, new Date().toISOString());
    },
    poolCount() {
      return statements.poolCount.get().c;
    }
  };
}

module.exports = createRepository;
