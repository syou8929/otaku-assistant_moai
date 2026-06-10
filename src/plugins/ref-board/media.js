/**
 * リファレンス画像のローカル保存（リンク切れ耐性 = 本プラグインの核）。
 * 画像 content-type のみ・サイズ上限つき。保存先は data/ref-media/<boardId>/。
 */
const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES_DEFAULT = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 20_000;

function mediaRoot() {
  return path.resolve(process.cwd(), 'data', 'ref-media');
}

function extensionFor(contentType) {
  const map = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp'
  };
  return map[String(contentType).split(';')[0]] || null;
}

/**
 * @returns 保存した相対パス、または null（画像でない/大きすぎる/失敗）
 */
async function saveImageLocally(url, boardId, itemKey, { maxBytes = MAX_BYTES_DEFAULT, fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'otaku-assistant-ref-board/1.0' }
    });

    if (!response.ok) {
      return null;
    }

    const extension = extensionFor(response.headers.get('content-type'));

    if (!extension) {
      return null; // 画像以外は保存しない
    }

    const declaredLength = Number(response.headers.get('content-length') || 0);

    if (declaredLength > maxBytes) {
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.byteLength > maxBytes) {
      return null;
    }

    const directory = path.join(mediaRoot(), String(boardId));
    fs.mkdirSync(directory, { recursive: true });
    const filename = `${itemKey}${extension}`;
    fs.writeFileSync(path.join(directory, filename), buffer);
    return path.join('data', 'ref-media', String(boardId), filename);
  } catch {
    return null; // 保存失敗は致命でない（URL は残る）
  }
}

module.exports = {
  saveImageLocally,
  mediaRoot
};
