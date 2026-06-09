const { saveMessageToArchive } = require('../shared/messageArchive');
const { saveIntroProfileFromMessage } = require('../shared/introProfiles');

/**
 * 旧 execute() の直列チェーンをステップ単位の router 登録へ分解したもの。
 * 実行順は priority 昇順で旧チェーンの並びを保存する。
 * - true を返すステップ（旧 early-return）は以降のステップを停止する
 * - 例外は router が隔離・記録するため、旧ステップ内 try/catch と同じ
 *   「失敗しても次のステップへ進む」継続セマンティクスになる
 * これにより llm / anime / timeline-relay を個別にプラグインへ抽出できる。
 */
const steps = [
  {
    name: 'archive',
    priority: 100,
    handle: async (message) => {
      await saveMessageToArchive(message.client, message);
    }
  },
  {
    name: 'intro-profile',
    priority: 101,
    handle: async (message) => {
      await saveIntroProfileFromMessage(message.client, message);
    }
  }
];

module.exports = {
  steps
};
