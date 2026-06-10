/**
 * timeline-relay の拡張点（フックポイント）。
 * 他機能のプラグインが init(ctx) で登録し、relay 本体は登録があれば呼ぶ
 * （未登録なら no-op = その機能が無効/削除済みでも relay は壊れない）。
 * timeline-relay 自体のプラグイン化（Stage C 以降）で公開APIに統合される。
 */

// question プラグイン: 新規 question スレッドへのステータスタグ適用
let threadTagApplier = null;

function registerThreadTagApplier(fn) {
  threadTagApplier = typeof fn === 'function' ? fn : null;
}

function getThreadTagApplier() {
  return threadTagApplier;
}

// anime プラグイン: relay されたメッセージのアニメ hashtag 後処理（カード投稿等）
let hashtagPostHandler = null;

function registerHashtagPostHandler(fn) {
  hashtagPostHandler = typeof fn === 'function' ? fn : null;
}

function getHashtagPostHandler() {
  return hashtagPostHandler;
}

module.exports = {
  registerThreadTagApplier,
  getThreadTagApplier,
  registerHashtagPostHandler,
  getHashtagPostHandler
};
