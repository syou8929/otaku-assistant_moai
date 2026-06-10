/**
 * 永続スケジューラ（基盤①）。
 * - ジョブは SQLite に永続化され、再起動・デプロイを跨いで生存する
 * - one-shot（runAt）と recurring（cron）の2種
 * - プラグインは manifest.jobs でハンドラを宣言し、ctx.scheduler で予約する
 * - 起動時、期限超過の one-shot は次の tick で即実行。cron は1回だけ実行して次回へ進む
 * - ハンドラ未登録（プラグイン無効/削除）のジョブは orphaned にマークして再試行しない
 *
 * cron 形式は標準5フィールド（分 時 日 月 曜日）のサブセット:
 *   数値 / * / *\/n / カンマ列挙 / 範囲 a-b （曜日: 0=日 〜 6=土）
 * タイムゾーンはプロセスのローカル時刻（VPS の TZ 設定に従う）。
 */

const TICK_INTERVAL_MS = 30 * 1000;
const NEXT_RUN_SEARCH_LIMIT_MINUTES = 366 * 24 * 60;

function parseField(field, min, max) {
  if (field === '*') {
    return null; // ワイルドカード
  }

  const values = new Set();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^\*\/(\d+)$/);

    if (stepMatch) {
      const step = Number(stepMatch[1]);

      if (!Number.isInteger(step) || step <= 0) {
        throw new Error(`invalid cron step: ${part}`);
      }

      for (let v = min; v <= max; v += 1) {
        if ((v - min) % step === 0) {
          values.add(v);
        }
      }

      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);

    if (rangeMatch) {
      const from = Number(rangeMatch[1]);
      const to = Number(rangeMatch[2]);

      if (from < min || to > max || from > to) {
        throw new Error(`invalid cron range: ${part}`);
      }

      for (let v = from; v <= to; v += 1) {
        values.add(v);
      }

      continue;
    }

    if (!/^\d+$/.test(part)) {
      throw new Error(`invalid cron field part: ${part}`);
    }

    const value = Number(part);

    if (value < min || value > max) {
      throw new Error(`cron value out of range: ${part} (${min}-${max})`);
    }

    values.add(value);
  }

  return values;
}

function parseCron(expression) {
  const fields = String(expression).trim().split(/\s+/);

  if (fields.length !== 5) {
    throw new Error(`cron must have 5 fields: "${expression}"`);
  }

  return {
    minute: parseField(fields[0], 0, 59),
    hour: parseField(fields[1], 0, 23),
    dayOfMonth: parseField(fields[2], 1, 31),
    month: parseField(fields[3], 1, 12),
    dayOfWeek: parseField(fields[4], 0, 6)
  };
}

function matches(set, value) {
  return set === null || set.has(value);
}

/** from より後の、最初に cron にマッチする時刻を返す（分粒度） */
function nextCronRun(expression, from = new Date()) {
  const cron = parseCron(expression);
  const candidate = new Date(from.getTime());
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let i = 0; i < NEXT_RUN_SEARCH_LIMIT_MINUTES; i += 1) {
    if (
      matches(cron.minute, candidate.getMinutes()) &&
      matches(cron.hour, candidate.getHours()) &&
      matches(cron.dayOfMonth, candidate.getDate()) &&
      matches(cron.month, candidate.getMonth() + 1) &&
      matches(cron.dayOfWeek, candidate.getDay())
    ) {
      return new Date(candidate.getTime());
    }

    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`cron never matches within a year: "${expression}"`);
}

function ensureSchema(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plugin TEXT NOT NULL,
      type TEXT NOT NULL,
      job_key TEXT,
      payload TEXT,
      cron TEXT,
      run_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      last_run_at TEXT,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due
      ON scheduled_jobs (status, run_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_jobs_key
      ON scheduled_jobs (plugin, job_key) WHERE job_key IS NOT NULL;
  `);
}

function createScheduler({ db, logger }) {
  const sqlite = db.sqlite;
  ensureSchema(sqlite);

  const statements = {
    insert: sqlite.prepare(`
      INSERT INTO scheduled_jobs (plugin, type, job_key, payload, cron, run_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `),
    upsertByKey: sqlite.prepare(`
      INSERT INTO scheduled_jobs (plugin, type, job_key, payload, cron, run_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
      ON CONFLICT (plugin, job_key) WHERE job_key IS NOT NULL
      DO UPDATE SET type = excluded.type, payload = excluded.payload, cron = excluded.cron,
        status = CASE WHEN scheduled_jobs.cron IS NOT excluded.cron THEN 'pending' ELSE scheduled_jobs.status END,
        run_at = CASE WHEN scheduled_jobs.cron IS NOT excluded.cron THEN excluded.run_at ELSE scheduled_jobs.run_at END
    `),
    due: sqlite.prepare(`
      SELECT * FROM scheduled_jobs
      WHERE status = 'pending' AND run_at <= ?
      ORDER BY run_at ASC
      LIMIT 20
    `),
    markStatus: sqlite.prepare(`
      UPDATE scheduled_jobs SET status = ?, last_run_at = ?, last_error = ? WHERE id = ?
    `),
    reschedule: sqlite.prepare(`
      UPDATE scheduled_jobs SET run_at = ?, status = 'pending', last_run_at = ?, last_error = NULL WHERE id = ?
    `),
    updateRunAt: sqlite.prepare(`
      UPDATE scheduled_jobs SET run_at = ?, status = 'pending' WHERE id = ?
    `),
    cancel: sqlite.prepare(`
      UPDATE scheduled_jobs SET status = 'cancelled' WHERE id = ? AND status = 'pending'
    `),
    cancelByKey: sqlite.prepare(`
      UPDATE scheduled_jobs SET status = 'cancelled' WHERE plugin = ? AND job_key = ? AND status = 'pending'
    `),
    get: sqlite.prepare('SELECT * FROM scheduled_jobs WHERE id = ?')
  };

  // plugin → type → handler
  const handlers = new Map();
  let interval = null;
  let ticking = false;

  function registerHandler(plugin, type, handle) {
    if (typeof handle !== 'function') {
      throw new Error(`scheduler handler for ${plugin}:${type} must be a function`);
    }

    if (!handlers.has(plugin)) {
      handlers.set(plugin, new Map());
    }

    if (handlers.get(plugin).has(type)) {
      throw new Error(`scheduler handler already registered: ${plugin}:${type}`);
    }

    handlers.get(plugin).set(type, handle);
  }

  function schedule({ plugin, type, payload = null, runAt }) {
    const runDate = runAt instanceof Date ? runAt : new Date(runAt);

    if (Number.isNaN(runDate.getTime())) {
      throw new Error('scheduler.schedule requires a valid runAt');
    }

    const result = statements.insert.run(
      plugin,
      type,
      null,
      payload === null ? null : JSON.stringify(payload),
      null,
      runDate.toISOString(),
      new Date().toISOString()
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * 定期ジョブ。key で冪等（起動のたびに再宣言しても重複しない）。
   * cron 文字列が変わった場合のみ run_at を再計算する。
   */
  function scheduleCron({ plugin, type, payload = null, cron, key }) {
    if (!key) {
      throw new Error('scheduler.scheduleCron requires a key (idempotency)');
    }

    const runAt = nextCronRun(cron); // 不正な cron はここで throw（登録時検証）
    statements.upsertByKey.run(
      plugin,
      type,
      key,
      payload === null ? null : JSON.stringify(payload),
      cron,
      runAt.toISOString(),
      new Date().toISOString()
    );
  }

  async function executeJob(job) {
    const handle = handlers.get(job.plugin)?.get(job.type);
    const now = new Date().toISOString();

    if (!handle) {
      // プラグイン無効/削除。再試行しない（prune 対象として残す）
      statements.markStatus.run('orphaned', now, 'no handler registered', job.id);
      logger.warn('Scheduled job orphaned (no handler)', {
        jobId: job.id,
        plugin: job.plugin,
        type: job.type
      });
      return;
    }

    statements.markStatus.run('running', now, null, job.id);

    let error = null;

    try {
      const payload = job.payload ? JSON.parse(job.payload) : null;
      await handle(payload, job);
    } catch (caught) {
      error = caught;
      logger.error('Scheduled job failed', {
        jobId: job.id,
        plugin: job.plugin,
        type: job.type,
        error: caught.message,
        stack: caught.stack
      });
    }

    const finished = new Date().toISOString();

    if (job.cron) {
      // recurring は失敗しても次回へ進む（失敗は last_error に残る）
      const next = nextCronRun(job.cron);

      if (error) {
        sqlite.transaction(() => {
          statements.markStatus.run('pending', finished, error.message, job.id);
          statements.updateRunAt.run(next.toISOString(), job.id);
        })();
      } else {
        statements.reschedule.run(next.toISOString(), finished, job.id);
      }
    } else {
      statements.markStatus.run(error ? 'error' : 'done', finished, error ? error.message : null, job.id);
    }
  }

  async function tick() {
    if (ticking) {
      return; // 前の tick が長引いている間は重ねない
    }

    ticking = true;

    try {
      const dueJobs = statements.due.all(new Date().toISOString());

      for (const job of dueJobs) {
        await executeJob(job);
      }
    } catch (error) {
      logger.error('Scheduler tick failed', { error: error.message, stack: error.stack });
    } finally {
      ticking = false;
    }
  }

  function start(intervalMs = TICK_INTERVAL_MS) {
    if (interval) {
      return;
    }

    interval = setInterval(() => {
      void tick();
    }, intervalMs);

    if (typeof interval.unref === 'function') {
      interval.unref();
    }

    logger.info('Scheduler started', { intervalMs });
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  return {
    registerHandler,
    schedule,
    scheduleCron,
    cancel: (id) => statements.cancel.run(id).changes > 0,
    cancelByKey: (plugin, key) => statements.cancelByKey.run(plugin, key).changes > 0,
    getJob: (id) => statements.get.get(id) || null,
    rescheduleAt: (id, runAt) => statements.updateRunAt.run(new Date(runAt).toISOString(), id).changes > 0,
    start,
    stop,
    tick // テスト用に公開
  };
}

module.exports = {
  createScheduler,
  nextCronRun,
  parseCron
};
