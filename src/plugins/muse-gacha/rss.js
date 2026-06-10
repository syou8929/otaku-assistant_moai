/**
 * YouTube チャンネル RSS（キー不要: /feeds/videos.xml?channel_id=...）の取得とパース。
 * 依存追加なし（global fetch + 正規表現）。RSS は直近約15件のみ返すため、
 * 定期クロールで DB に蓄積して「深いプール」を育てる（抽選は蓄積全体から）。
 */

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const FETCH_TIMEOUT_MS = 15_000;

function decodeXmlEntities(text) {
  return String(text)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** RSS XML 文字列 → entry 配列（videoId / title / publishedAt / channelTitle） */
function parseFeed(xml) {
  const channelTitleMatch = String(xml).match(/<title>([^<]*)<\/title>/);
  const channelTitle = channelTitleMatch ? decodeXmlEntities(channelTitleMatch[1]) : null;
  const entries = [];
  const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryPattern.exec(xml))) {
    const block = match[1];
    const videoId = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = block.match(/<title>([^<]*)<\/title>/)?.[1];
    const publishedAt = block.match(/<published>([^<]+)<\/published>/)?.[1];

    if (videoId && title) {
      entries.push({
        videoId,
        title: decodeXmlEntities(title),
        publishedAt: publishedAt || null,
        channelTitle
      });
    }
  }

  return entries;
}

async function fetchChannelFeed(channelId, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(`${FEED_URL}${encodeURIComponent(channelId)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'otaku-assistant-muse-gacha/1.0' }
  });

  if (!response.ok) {
    throw new Error(`feed fetch failed for ${channelId}: HTTP ${response.status}`);
  }

  return parseFeed(await response.text());
}

module.exports = {
  parseFeed,
  fetchChannelFeed
};
