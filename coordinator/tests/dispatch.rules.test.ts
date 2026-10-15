import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  equalTo,
  get,
  orderByChild,
  query,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { claimHandler, ClaimState } from '@/shared/jobClaim';

// SPEC-AUTO-001 §9 pha 2 / §10: vòng đời job do máy ghi, qua Rules thật và đúng handler claim của extension.

const BM = '987654321098765';
const JOB = `ext/jobs/${BM}/job1`;

let env: RulesTestEnvironment;

const machine = (
  machineId: string,
  flow: string,
  bm = BM
): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
  env.authenticatedContext(`uid-${machineId}`, { machineId, bm, flow });
const opsCtx = (): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
  env.authenticatedContext('uid-ops', { ops: true });

const seed = async (
  overrides: Record<string, unknown> = {},
  path = JOB
): Promise<void> => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await set(ref(ctx.database(), path), {
      flow: 'partner-assign',
      mode: 'dry',
      businessId: BM,
      config: {
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ADVERTISE', 'ANALYZE'],
      },
      createdAt: 1,
      createdBy: 'uid-ops',
      cancelRequested: false,
      state: { status: 'pending' },
      ...overrides,
    });
  });
};

const claim = async (
  who: ReturnType<RulesTestEnvironment['authenticatedContext']>,
  machineId: string,
  path = JOB
): Promise<boolean> => {
  const result = await runTransaction(
    ref(who.database(), `${path}/state`),
    (current) => claimHandler(machineId)(current as ClaimState)
  );
  return result.committed;
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

describe('claim không trùng (D5)', () => {
  it('hai máy cùng BM + flow cùng nhận một job: đúng một máy thắng', async () => {
    await seed();
    const results = await Promise.all([
      claim(machine('m1', 'partner-assign'), 'm1'),
      claim(machine('m2', 'partner-assign'), 'm2'),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await env.withSecurityRulesDisabled(async (ctx) => {
      const state = (await get(ref(ctx.database(), `${JOB}/state`))).val() as {
        claimedBy: string;
        status: string;
      };
      expect(state.status).toBe('claimed');
      expect(['m1', 'm2']).toContain(state.claimedBy);
    });
  });

  it('máy duyệt claim được job requests.scan, máy gán thì không', async () => {
    await seed({ flow: 'requests.scan', config: { partnerName: 'BM' } });
    await assertFails(
      set(ref(machine('m1', 'partner-assign').database(), `${JOB}/state`), {
        status: 'claimed',
        claimedBy: 'm1',
      })
    );
    expect(await claim(machine('m2', 'partner-approve'), 'm2')).toBe(true);
  });

  it('claim bị từ chối khi kill-switch theo BM bật', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `ext/killSwitch/${BM}`), true);
    });
    await assertFails(
      set(ref(machine('m1', 'partner-assign').database(), `${JOB}/state`), {
        status: 'claimed',
        claimedBy: 'm1',
        claimedAt: serverTimestamp(),
      })
    );
  });
});

describe('vòng đời do máy giữ job ghi (§4.2)', () => {
  it('claimed → running → done với đúng các trường dispatcher ghi', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    const state = ref(m1.database(), `${JOB}/state`);
    await assertSucceeds(
      update(state, {
        status: 'running',
        startedAt: serverTimestamp(),
        progressAt: serverTimestamp(),
        runId: 'run_1',
        runStatus: 'running',
      })
    );
    await assertSucceeds(
      update(state, {
        progressAt: serverTimestamp(),
        runStatus: 'paused',
        pauseReason: 'hidden',
      })
    );
    await assertSucceeds(
      update(state, {
        status: 'done',
        finishedAt: serverTimestamp(),
        result: {
          runId: 'run_1',
          runStatus: 'done',
          counts: { done: 1 },
        },
        error: null,
        runStatus: null,
        pauseReason: null,
      })
    );
  });

  it('chốt error có mã (ERR_JOB_INVALID) sau khi claim', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    await assertSucceeds(
      update(ref(m1.database(), `${JOB}/state`), {
        status: 'error',
        finishedAt: serverTimestamp(),
        error: { code: 'ERR_JOB_INVALID', message: 'mode' },
      })
    );
  });

  it('un-claim (về pending, bỏ claimedBy) rồi máy khác claim được', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    await assertSucceeds(
      update(ref(m1.database(), `${JOB}/state`), {
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
      })
    );
    expect(await claim(machine('m2', 'partner-assign'), 'm2')).toBe(true);
  });

  it('máy không giữ job không ghi được state của job đó', async () => {
    await seed();
    expect(await claim(machine('m1', 'partner-assign'), 'm1')).toBe(true);
    await assertFails(
      update(ref(machine('m2', 'partner-assign').database(), `${JOB}/state`), {
        status: 'done',
      })
    );
  });

  it('M4: sau khi job kết thúc, máy từng giữ nó không đưa lại về pending được', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    const state = ref(m1.database(), `${JOB}/state`);
    await assertSucceeds(
      update(state, { status: 'done', finishedAt: serverTimestamp() })
    );
    await assertFails(update(state, { status: 'pending', claimedBy: null }));
    await assertFails(update(state, { status: 'running' }));
  });

  it('M4: job đang running không bị máy giữ nó đưa về pending (D9: không tự chạy lại)', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    const state = ref(m1.database(), `${JOB}/state`);
    await assertSucceeds(update(state, { status: 'running', runId: 'r1' }));
    await assertFails(
      update(state, { status: 'pending', claimedBy: null, claimedAt: null })
    );
  });

  it('H1: janitor không reclaim job claimed đã có dispatchingAt, chỉ chốt ERR_MACHINE_LOST', async () => {
    const old = Date.now() - 3600_000;
    await seed({
      state: {
        status: 'claimed',
        claimedBy: 'm1',
        claimedAt: old,
        dispatchingAt: old,
      },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'ext/machines/m1'), {
        businessId: BM,
        flow: 'partner-assign',
        status: 'idle',
        lastHeartbeatAt: old,
      });
    });
    const db = env
      .authenticatedContext('uid-coordinator', { coordinator: true })
      .database();
    await assertFails(
      update(ref(db, `${JOB}/state`), {
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
      })
    );
    await assertSucceeds(
      update(ref(db, `${JOB}/state`), {
        status: 'error',
        error: { code: 'ERR_MACHINE_LOST' },
        finishedAt: serverTimestamp(),
      })
    );
  });

  it('M5: scanJobId của job duyệt không được chứa ký tự đường dẫn', async () => {
    await seed(
      { flow: 'requests.scan', state: { status: 'done' } },
      `ext/jobs/${BM}/scan1`
    );
    const approve = {
      flow: 'partner-approve',
      mode: 'dry',
      businessId: BM,
      config: {
        partnerName: 'BM',
        action: 'approve',
        requests: [{ requester: 'R', account: 'A' }],
      },
      approval: 'human',
      approvedBy: 'uid-ops',
      createdAt: serverTimestamp(),
      createdBy: 'uid-ops',
      cancelRequested: false,
      state: { status: 'pending' },
    };
    const db = opsCtx().database();
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/ok1`), {
        ...approve,
        scanJobId: 'scan1/state',
      })
    );
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/ok2`), { ...approve, scanJobId: 'scan1' })
    );
  });

  it('L3: killSwitch chỉ nhận boolean', async () => {
    const db = env
      .authenticatedContext('uid-coordinator', { coordinator: true })
      .database();
    await assertFails(set(ref(db, `ext/killSwitch/${BM}`), 'true'));
    await assertSucceeds(set(ref(db, `ext/killSwitch/${BM}`), true));
  });

  it('máy không sửa được trường bất biến (flow/mode/config/cancelRequested) của job mình giữ', async () => {
    await seed();
    const m1 = machine('m1', 'partner-assign');
    expect(await claim(m1, 'm1')).toBe(true);
    const db = m1.database();
    await assertFails(set(ref(db, `${JOB}/mode`), 'full'));
    await assertFails(set(ref(db, `${JOB}/flow`), 'partner-approve'));
    await assertFails(set(ref(db, `${JOB}/config/queries`), ['X']));
    await assertFails(set(ref(db, `${JOB}/cancelRequested`), true));
  });

  it('ops đặt được cancelRequested trên job đang chạy', async () => {
    await seed();
    expect(await claim(machine('m1', 'partner-assign'), 'm1')).toBe(true);
    await assertSucceeds(
      set(ref(opsCtx().database(), `${JOB}/cancelRequested`), true)
    );
  });
});

describe('bản ghi máy và reconcile', () => {
  it('máy ghi được busy/blocked + lý do + job đang giữ trên bản ghi của chính nó', async () => {
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
      update(ref(db, 'ext/machines/m1'), {
        status: 'blocked',
        blockedReason: 'curfew',
        blockedUntil: Date.now() + 3600_000,
        currentJobId: 'job1',
      })
    );
  });

  it('máy không ghi được bản ghi của máy khác', async () => {
    await assertFails(
      set(ref(machine('m1', 'partner-assign').database(), 'ext/machines/m2'), {
        businessId: BM,
        flow: 'partner-assign',
        status: 'idle',
      })
    );
  });

  it('reconcile: tìm được job mình đã claim qua state/claimedBy, không thấy job của máy khác', async () => {
    await seed({ state: { status: 'claimed', claimedBy: 'm1' } });
    await seed(
      { state: { status: 'claimed', claimedBy: 'm2' } },
      `ext/jobs/${BM}/job2`
    );
    const snapshot = await assertSucceeds(
      get(
        query(
          ref(machine('m1', 'partner-assign').database(), `ext/jobs/${BM}`),
          orderByChild('state/claimedBy'),
          equalTo('m1')
        )
      )
    );
    expect(Object.keys(snapshot.val() as object)).toEqual(['job1']);
  });
});

describe('heartbeat phải là giờ server (L5)', () => {
  const record = {
    businessId: BM,
    flow: 'partner-assign',
    status: 'idle',
  };

  it('lastHeartbeatAt/connectedAt = server timestamp được ghi, giá trị tự đặt bị từ chối', async () => {
    const db = machine('m1', 'partner-assign').database();
    await assertSucceeds(
      set(ref(db, 'ext/machines/m1'), {
        ...record,
        connectedAt: serverTimestamp(),
        lastHeartbeatAt: serverTimestamp(),
      })
    );
    await assertFails(
      update(ref(db, 'ext/machines/m1'), {
        lastHeartbeatAt: Date.now() + 10 * 3600_000,
      })
    );
    await assertFails(update(ref(db, 'ext/machines/m1'), { connectedAt: 1 }));
  });

  it('cập nhật các trường khác (status/blocked) không đụng heartbeat vẫn được', async () => {
    const db = machine('m1', 'partner-assign').database();
    await assertSucceeds(
      set(ref(db, 'ext/machines/m1'), {
        ...record,
        lastHeartbeatAt: serverTimestamp(),
      })
    );
    await assertSucceeds(
      update(ref(db, 'ext/machines/m1'), {
        status: 'blocked',
        blockedReason: 'emergency',
        blockedUntil: null,
        currentJobId: null,
      })
    );
  });
});

describe('khoá mode theo Rules (D8)', () => {
  it('ops không tạo được job assist/full khi allowlist còn dry', async () => {
    const base = {
      flow: 'partner-assign',
      businessId: BM,
      config: {
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ANALYZE'],
      },
      createdAt: serverTimestamp(),
      createdBy: 'uid-ops',
      cancelRequested: false,
      state: { status: 'pending' },
    };
    const db = opsCtx().database();
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/x1`), { ...base, mode: 'assist' })
    );
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/x2`), { ...base, mode: 'full' })
    );
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/x3`), { ...base, mode: 'dry' })
    );
  });
});
