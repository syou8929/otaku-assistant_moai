/**
 * 情報バリア（spec §12 の barrierTier）。
 * relay は Discord 権限を貫通してコンテンツをコピーする唯一の主体なので、
 * 「高 Tier ソース → 低 Tier 宛先」の中継を bot 自身が機械的に拒否する。
 *
 * - Tier はチャンネル単位またはカテゴリ単位で割り当てる（数値が大きいほど機密）
 * - 解決順: チャンネル割当 → 親（スレッドなら親チャンネル）→ カテゴリ → 既定値
 * - deny-by-default: バリア有効時、未割当ソースは defaultSourceTier（既定 9 = 最機密）、
 *   未割当宛先は defaultDestinationTier（既定 0 = 公開）として扱う。
 *   つまり割当のないペアは中継されない。割り当てて初めて流れる
 * - capability: config.plugins['timeline-relay'].barrier.enabled（既定 false = 挙動不変）
 */

class BarrierDeniedError extends Error {
  constructor(detail) {
    super(`barrier denied: ${detail}`);
    this.name = 'BarrierDeniedError';
    this.isBarrierDenied = true;
  }
}

const DEFAULT_SOURCE_TIER = 9;
const DEFAULT_DESTINATION_TIER = 0;

function getBarrierConfig(config) {
  const raw = config.plugins?.['timeline-relay']?.barrier || {};
  return {
    enabled: raw.enabled === true,
    defaultSourceTier: Number.isFinite(raw.defaultSourceTier) ? raw.defaultSourceTier : DEFAULT_SOURCE_TIER,
    defaultDestinationTier: Number.isFinite(raw.defaultDestinationTier)
      ? raw.defaultDestinationTier
      : DEFAULT_DESTINATION_TIER
  };
}

/**
 * チャンネルの Tier を解決する。割当の探索順:
 *   1. チャンネル自身の ID
 *   2. 親 ID（スレッドなら親チャンネル、通常チャンネルならカテゴリ）
 *   3. スレッドの場合のみ: 親チャンネルのカテゴリ
 * 見つからなければ null（呼び出し側が既定値を適用する）。
 */
async function resolveAssignedTier(repo, channel) {
  if (!channel) {
    return null;
  }

  const direct = repo.getTier(String(channel.id));

  if (direct !== null) {
    return direct;
  }

  const parentId = channel.parentId ? String(channel.parentId) : null;

  if (!parentId) {
    return null;
  }

  const viaParent = repo.getTier(parentId);

  if (viaParent !== null) {
    return viaParent;
  }

  // スレッド: 親チャンネルのさらに上（カテゴリ）まで辿る
  if (typeof channel.isThread === 'function' && channel.isThread()) {
    const parent =
      channel.parent || (await channel.guild?.channels?.fetch(parentId).catch(() => null));
    const categoryId = parent?.parentId ? String(parent.parentId) : null;

    if (categoryId) {
      return repo.getTier(categoryId);
    }
  }

  return null;
}

/**
 * source → destination の中継可否。
 * destinationChannel はオブジェクトでも ID 文字列でもよい（ID の場合は fetch で解決）。
 */
async function isRelayAllowed({ sourceChannel, destinationChannel, db, config, client }) {
  const barrier = getBarrierConfig(config);

  if (!barrier.enabled) {
    return { allowed: true, reason: 'barrier-disabled' };
  }

  const repo = db['timeline-relay'];

  let destination = destinationChannel;

  if (typeof destination === 'string') {
    destination = await client?.channels?.fetch(destination).catch(() => null);
  }

  const sourceTier =
    (await resolveAssignedTier(repo, sourceChannel)) ?? barrier.defaultSourceTier;
  const destinationTier =
    (await resolveAssignedTier(repo, destination)) ?? barrier.defaultDestinationTier;

  const allowed = sourceTier <= destinationTier;

  return {
    allowed,
    sourceTier,
    destinationTier,
    reason: allowed ? 'tier-ok' : 'tier-denied'
  };
}

/**
 * 送信前フィルタ用: 宛先 target 配列からバリア違反の宛先を除外する。
 * 除外時は警告ログ（漏洩未遂の可視化。通知は eventRouter の onError でなく
 * 通常ログ — 拒否は想定内の動作のため）。
 */
async function filterTargetsByBarrier(targets, { sourceChannel, db, config, client, logger, callsite }) {
  const barrier = getBarrierConfig(config);

  if (!barrier.enabled || !Array.isArray(targets) || targets.length === 0) {
    return targets;
  }

  const allowedTargets = [];

  for (const target of targets) {
    const verdict = await isRelayAllowed({
      sourceChannel,
      destinationChannel: String(target.destinationChannelId),
      db,
      config,
      client
    });

    if (verdict.allowed) {
      allowedTargets.push(target);
    } else {
      logger.warn('Barrier denied relay target', {
        callsite,
        sourceChannelId: String(sourceChannel?.id || ''),
        destinationChannelId: String(target.destinationChannelId),
        sourceTier: verdict.sourceTier,
        destinationTier: verdict.destinationTier
      });
    }
  }

  return allowedTargets;
}

/**
 * 防御的最終検査（sendRelayMessage 内）。送信前フィルタをすり抜けた
 * 違反ペアがここに到達した場合は「静かな漏洩」ではなく throw で大声で失敗する。
 */
async function assertRelayAllowed({ sourceChannel, destinationChannel, db, config, client }) {
  const verdict = await isRelayAllowed({ sourceChannel, destinationChannel, db, config, client });

  if (!verdict.allowed) {
    throw new BarrierDeniedError(
      `source=${sourceChannel?.id}(tier ${verdict.sourceTier}) -> destination=${
        typeof destinationChannel === 'string' ? destinationChannel : destinationChannel?.id
      }(tier ${verdict.destinationTier})`
    );
  }
}

module.exports = {
  BarrierDeniedError,
  getBarrierConfig,
  resolveAssignedTier,
  isRelayAllowed,
  filterTargetsByBarrier,
  assertRelayAllowed
};
