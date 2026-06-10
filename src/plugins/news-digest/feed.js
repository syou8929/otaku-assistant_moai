/**
 * 汎用 RSS 2.0 / Atom フィードの取得とパース（依存追加なし）。
 * メディア RSS・Google News RSS・Reddit の .rss・Hacker News RSS を1本でカバーする。
 */

const FETCH_TIMEOUT_MS = 15_000;

function decodeXmlEntities(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function extract(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? decodeXmlEntities(match[1]) : null;
}

/** RSS2.0 の <item> と Atom の <entry> を共通形式 { title, url, publishedAt } に正規化 */
function parseFeed(xml) {
  const items = [];
  const blockPattern = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/g;
  let match;

  while ((match = blockPattern.exec(xml))) {
    const block = match[2];
    const title = extract(block, 'title');

    // RSS2.0: <link>url</link> / Atom: <link href="url"/>
    let url = extract(block, 'link');

    if (!url || !/^https?:/.test(url)) {
      const href = block.match(/<link[^>]*href="([^"]+)"/);
      url = href ? decodeXmlEntities(href[1]) : null;
    }

    const publishedAt =
      extract(block, 'pubDate') || extract(block, 'published') || extract(block, 'updated');

    if (title && url) {
      items.push({ title, url, publishedAt });
    }
  }

  return items;
}

/** URL の正規化キー（クエリ・フラグメント・末尾スラッシュを除去） */
function urlKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return String(url).toLowerCase();
  }
}

/** タイトルの正規化キー（同一ニュースの媒体違いを名寄せ） */
function titleKey(title) {
  return String(title)
    .toLowerCase()
    .replace(/[【】\[\]()（）「」『』|｜:：\-–—・,.、。!?！?？\s]+/g, '')
    .slice(0, 80);
}

async function fetchFeed(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': 'otaku-assistant-news-digest/1.0' }
  });

  if (!response.ok) {
    throw new Error(`feed fetch failed: HTTP ${response.status} for ${url}`);
  }

  return parseFeed(await response.text());
}

module.exports = {
  parseFeed,
  fetchFeed,
  urlKey,
  titleKey
};
