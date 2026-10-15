import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  get,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

// Pha 0 (SPEC-AUTO-001 §9): khoá giả định #2 (.validate node cha) và #4 (transaction claim cache lạnh),
// cộng một bộ smoke của §8.2. Bộ rules đầy đủ làm ở pha 2.

const BM = '987654321098765';
const OTHER_BM = '111111111111111';
const JOB = `ext/jobs/${BM}/job1`;

let env: RulesTestEnvironment;

const machine = (
  machineId: string,
  flow: string,
  bm = BM
): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
  env.authenticatedContext(`uid-${machineId}`, { machineId, bm, flow });

const seedJob = async (
  overrides: Record<string, unknown> = {},
  jobPath = JOB
): Promise<void> => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), jobPath), {
      flow: 'partner-assign',
      mode: 'dry',
      businessId: BM,
      config: {
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ADVERTISE'],
      },
      createdAt: 1,
      createdBy: 'uid-ops',
      state: { status: 'pending' },
      ...overrides,
    });
  });
};

type State = { status: string; claimedBy?: string } | null;

// Handler đúng như §4.2: giá trị hiện tại null (cache lạnh) → trả null, không abort.
const claimHandler =
  (machineId: string) =>
  (cur: State): unknown => {
    if (cur === null) return null;
    if (cur.status !== 'pending') return undefined;
    return {
      ...cur,
      status: 'claimed',
      claimedBy: machineId,
      claimedAt: serverTimestamp(),
    };
  };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-hpma',
    database: {
      rules: readFileSync(
        new URL('../database.rules.json', import.meta.url),
        'utf8'
      ),
      host: '127.0.0.1',
      port: 9000,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
});

describe('nền tảng (§8.2, giả định #2)', () => {
  it('ghi vào state của job đã tồn tại không bị .validate của $jobId chặn', async () => {
    await seedJob();
    const db = machine('m1', 'partner-assign').database();
    await assertSucceeds(
      set(ref(db, `${JOB}/state`), {
        status: 'claimed',
        claimedBy: 'm1',
        claimedAt: serverTimestamp(),
      })
    );
  });

  it('update() một trường heartbeat của machines/<id> vẫn qua .validate', async () => {
    const db = machine('m1', 'partner-assign').database();
    await assertSucceeds(
      set(ref(db, 'ext/machines/m1'), {
        businessId: BM,
        flow: 'partner-assign',
        status: 'idle',
        lastHeartbeatAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      update(ref(db, 'ext/machines/m1'), { lastHeartbeatAt: serverTimestamp() })
    );
  });
});

describe('claim bằng transaction (D5, giả định #4)', () => {
  it('cache lạnh: lần gọi đầu với null được gọi lại với giá trị thật, không permission_denied', async () => {
    await seedJob();
    const db = machine('m1', 'partner-assign').database();
    const result = await assertSucceeds(
      runTransaction(ref(db, `${JOB}/state`), claimHandler('m1'))
    );
    if (!result.committed) throw new Error('transaction không commit');
    if ((result.snapshot.val() as State)?.claimedBy !== 'm1')
      throw new Error('claimedBy sai');
  });

  it('máy thứ hai không commit được khi job đã bị claim', async () => {
    await seedJob();
    await assertSucceeds(
      runTransaction(
        ref(machine('m1', 'partner-assign').database(), `${JOB}/state`),
        claimHandler('m1')
      )
    );
    const second = await runTransaction(
      ref(machine('m2', 'partner-assign').database(), `${JOB}/state`),
      claimHandler('m2')
    );
    if (second.committed) throw new Error('máy thứ hai không được commit');
  });
});

describe('smoke §8.2', () => {
  it('máy không đọc/claim được job của BM khác', async () => {
    await seedJob({ businessId: OTHER_BM }, `ext/jobs/${OTHER_BM}/job2`);
    const db = machine('m1', 'partner-assign').database();
    await assertFails(
      set(ref(db, `ext/jobs/${OTHER_BM}/job2/state`), {
        status: 'claimed',
        claimedBy: 'm1',
      })
    );
  });

  it('máy partner-assign không claim được job partner-approve', async () => {
    await seedJob({ flow: 'partner-approve' });
    const db = machine('m1', 'partner-assign').database();
    await assertFails(
      set(ref(db, `${JOB}/state`), { status: 'claimed', claimedBy: 'm1' })
    );
  });

  it('claim bị từ chối khi killSwitch/global bật', async () => {
    await seedJob();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'ext/killSwitch/global'), true);
    });
    const db = machine('m1', 'partner-assign').database();
    await assertFails(
      set(ref(db, `${JOB}/state`), { status: 'claimed', claimedBy: 'm1' })
    );
  });

  it('máy không tạo được job', async () => {
    const db = machine('m1', 'partner-assign').database();
    await assertFails(set(ref(db, `${JOB}`), { flow: 'partner-assign' }));
  });

  it('ops tạo job mode dry được, mode full bị từ chối (D8)', async () => {
    const db = env.authenticatedContext('uid-ops', { ops: true }).database();
    const job = (mode: string): Record<string, unknown> => ({
      flow: 'partner-assign',
      mode,
      businessId: BM,
      config: {
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ADVERTISE'],
      },
      createdAt: serverTimestamp(),
      createdBy: 'uid-ops',
      state: { status: 'pending' },
    });
    await assertSucceeds(set(ref(db, `ext/jobs/${BM}/okJob`), job('dry')));
    await assertFails(set(ref(db, `ext/jobs/${BM}/fullJob`), job('full')));
  });

  it('tài khoản Auth không có claim ext không đọc được gì', async () => {
    await seedJob();
    const db = env.authenticatedContext('stranger').database();
    await assertFails(set(ref(db, `${JOB}/state/status`), 'claimed'));
    await assertFails(get(ref(db, `ext/jobs/${BM}`)));
    await assertFails(get(ref(db, 'ext/machines')));
    await assertFails(get(ref(db, 'ext/killSwitch')));
  });
});
