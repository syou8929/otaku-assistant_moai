const DEFAULT_PRIORITY = 100;

/**
 * 失敗ログ用に Discord イベント引数から共通識別子を best-effort で拾う。
 * イベントの形（message / reaction / interaction / member 等）は仮定せず、
 * 見つかったものだけを載せる。絶対に throw しない。
 */
function extractDispatchContext(args) {
  const first = args[0];
  const second = args[1];
  const context = {};
  const messageLike = first?.message || first;

  if (messageLike?.id) {
    context.targetId = String(messageLike.id);
  }

  if (messageLike?.channelId) {
    context.channelId = String(messageLike.channelId);
  }

  if (second?.id) {
    context.userId = String(second.id);
  }

  return context;
}

/**
 * Discord イベントごとに 1 リスナだけを張り、登録ハンドラを priority 昇順で
 * 直列 dispatch するルータ。ハンドラが true を返すと以降のハンドラを停止する
 * （既存 events/*.js の early-return セマンティクスと同じ）。
 * 各ハンドラは個別に try/catch され、1 つの失敗が他を巻き込まない。
 * onError（任意）は failure ログの後に呼ばれる運用通知用フック。throw しても無視。
 */
function createEventRouter({ logger, onError }) {
  const handlersByEvent = new Map();
  let attachedClient = null;

  function register(eventName, { name, priority, once, handle }) {
    if (!eventName || typeof eventName !== 'string') {
      throw new Error('eventRouter.register requires an event name');
    }

    if (typeof handle !== 'function') {
      throw new Error(`eventRouter.register("${eventName}") requires a handle function`);
    }

    if (!handlersByEvent.has(eventName)) {
      handlersByEvent.set(eventName, []);

      if (attachedClient) {
        attachListener(attachedClient, eventName);
      }
    }

    const entries = handlersByEvent.get(eventName);
    entries.push({
      name: name || 'anonymous',
      priority: Number.isFinite(priority) ? priority : DEFAULT_PRIORITY,
      once: once === true,
      handle
    });
    entries.sort((a, b) => a.priority - b.priority);
  }

  async function dispatch(eventName, args) {
    const entries = handlersByEvent.get(eventName) || [];
    const consumedOnce = new Set();

    for (const entry of [...entries]) {
      if (entry.once) {
        // client.once と同じく「実行に入った時点で外す」（throw しても再実行しない）
        consumedOnce.add(entry);
      }

      try {
        const handled = await entry.handle(...args);

        if (handled === true) {
          break;
        }
      } catch (error) {
        logger.error('Event handler failed', {
          event: eventName,
          handler: entry.name,
          ...extractDispatchContext(args),
          error: error.message,
          stack: error.stack
        });

        try {
          onError?.(error, { event: eventName, handler: entry.name });
        } catch {
          // 運用通知の失敗で dispatch を壊さない
        }
      }
    }

    if (consumedOnce.size > 0) {
      handlersByEvent.set(
        eventName,
        (handlersByEvent.get(eventName) || []).filter((entry) => !consumedOnce.has(entry))
      );
    }
  }

  function attachListener(client, eventName) {
    client.on(eventName, (...args) => {
      void dispatch(eventName, args);
    });
  }

  function attach(client) {
    if (attachedClient) {
      throw new Error('eventRouter is already attached to a client');
    }

    attachedClient = client;

    for (const eventName of handlersByEvent.keys()) {
      attachListener(client, eventName);
    }
  }

  function listHandlers(eventName) {
    return (handlersByEvent.get(eventName) || []).map((entry) => ({
      name: entry.name,
      priority: entry.priority
    }));
  }

  return {
    register,
    attach,
    dispatch,
    listHandlers
  };
}

module.exports = {
  createEventRouter
};
