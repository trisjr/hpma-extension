import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cancelPendingHandler, ClaimState } from '@/shared/jobClaim';

import {
  buildApproveJob,
  buildAssignJob,
  buildScanJob,
  parseAssignConfig,
  parseScanPartner,
  parseSelection,
  requireBusinessId,
} from '../src/jobs';

const BM = '987654321098765';

describe('kiểm tra đầu vào ops (D3: cùng parser với engine)', () => {
  it('chấp nhận config assign hợp lệ', () => {
    const config = parseAssignConfig({
      partnerBmId: '1234567890123456',
      queries: ['SHOP LAN 1', '1234567890'],
      tasks: ['ADVERTISE', 'ANALYZE'],
    });
    expect(config.queries).toHaveLength(2);
  });

  it('từ chối tổ hợp quyền mà UI BM không biểu diễn được (ADVERTISE riêng lẻ)', () => {
    const base = { partnerBmId: '1234567890123456', queries: ['A'] };
    expect(() =>
      parseAssignConfig({ ...base, tasks: ['ADVERTISE'] })
    ).toThrow();
    expect(
      parseAssignConfig({ ...base, tasks: ['ADVERTISE', 'ANALYZE'] }).tasks
    ).toHaveLength(2);
    expect(parseAssignConfig({ ...base, tasks: ['ANALYZE'] }).tasks).toEqual([
      'ANALYZE',
    ]);
  });

  it('từ chối config hỏng, BM sai, tên BM đối tác rỗng', () => {
    expect(() =>
      parseAssignConfig({ partnerBmId: 'abc', queries: [], tasks: [] })
    ).toThrow();
    expect(() => parseAssignConfig(null)).toThrow();
    expect(() => requireBusinessId('abc')).toThrow();
    expect(() => requireBusinessId(undefined)).toThrow();
    expect(requireBusinessId(BM)).toBe(BM);
    expect(() => parseScanPartner('   ')).toThrow();
    expect(() => parseScanPartner(undefined)).toThrow();
    expect(parseScanPartner('  BM A ')).toBe('BM A');
  });
});

describe('job do ops CLI dựng ra phải qua Rules thật', () => {
  let env: RulesTestEnvironment;

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

  const ops = (): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
    env.authenticatedContext('uid-ops', { ops: true });
  const args = { businessId: BM, uid: 'uid-ops', createdAt: serverTimestamp() };

  it('job partner-assign dry được ghi', async () => {
    const job = buildAssignJob(
      parseAssignConfig({
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ADVERTISE', 'ANALYZE'],
      }),
      args
    );
    await assertSucceeds(set(ref(ops().database(), `ext/jobs/${BM}/j1`), job));
  });

  it('job requests.scan dry được ghi', async () => {
    const job = buildScanJob('BM ĐỐI TÁC', args);
    await assertSucceeds(set(ref(ops().database(), `ext/jobs/${BM}/j2`), job));
  });

  it('job ghi vào nhánh BM khác với businessId trong job bị từ chối', async () => {
    const job = buildScanJob('BM ĐỐI TÁC', args);
    await assertFails(
      set(ref(ops().database(), 'ext/jobs/111111111111111/j3'), job)
    );
  });

  const SCAN = {
    partnerName: 'BM ĐỐI TÁC',
    requests: [
      { requester: 'Alice', account: 'TK 1' },
      { requester: 'Bob', account: 'TK 2' },
      { requester: 'Carol', account: 'TK 3' },
    ],
  };
  const seedScan = async (status = 'done'): Promise<void> => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `ext/jobs/${BM}/scan1`), {
        flow: 'requests.scan',
        mode: 'dry',
        businessId: BM,
        config: { partnerName: SCAN.partnerName },
        createdAt: 1,
        createdBy: 'uid-ops',
        state: { status, result: { scan: { requests: SCAN.requests } } },
      });
    });
  };
  const approve = (
    selection: number[],
    uid = 'uid-ops',
    mode: 'dry' | 'full' = 'dry'
  ) =>
    buildApproveJob({
      scan: SCAN,
      selection,
      action: 'approve',
      mode,
      scanJobId: 'scan1',
      args: { ...args, uid },
    });

  it('job approve của người (HITL) trỏ vào scan đã done được ghi', async () => {
    await seedScan();
    await assertSucceeds(
      set(ref(ops().database(), `ext/jobs/${BM}/a1`), approve([0, 2]))
    );
  });

  it('job approve bị từ chối khi scan chưa done', async () => {
    await seedScan('running');
    await assertFails(
      set(ref(ops().database(), `ext/jobs/${BM}/a1`), approve([0]))
    );
    await assertFails(
      set(
        ref(ops().database(), `ext/jobs/${BM}/a1`),
        approve([0], 'uid-ops', 'full')
      )
    );
  });

  it('mode full chỉ có ở job duyệt của người (Q4): approve full được ghi, assign/scan full và approve full không-human bị từ chối', async () => {
    await seedScan('done');
    const db = ops().database();
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/a2`), approve([0, 1], 'uid-ops', 'full'))
    );
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/a3`), {
        ...buildAssignJob(
          parseAssignConfig({
            partnerBmId: '1234567890123456',
            queries: ['A'],
            tasks: ['ANALYZE'],
          }),
          args
        ),
        mode: 'full',
      })
    );
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/a4`), {
        ...buildScanJob('BM', args),
        mode: 'full',
      })
    );
    // Không có approval: human thì không được full (đường auto-match của coordinator vẫn chỉ dry).
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/a5`), {
        ...approve([0], 'uid-ops', 'full'),
        approval: 'auto-match',
      })
    );
  });

  it('job approve với approvedBy khác người tạo bị từ chối', async () => {
    await seedScan();
    await assertFails(
      set(ref(ops().database(), `ext/jobs/${BM}/a3`), {
        ...approve([0]),
        approvedBy: 'uid-khac',
      })
    );
  });

  it('cancelPendingHandler qua transaction thật (cache lạnh): huỷ job pending, giữ nguyên job đã claim', async () => {
    const db = ops().database();
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/t1`), buildScanJob('BM ĐỐI TÁC', args))
    );
    const cancelled = await runTransaction(
      ref(db, `ext/jobs/${BM}/t1/state`),
      (state) => cancelPendingHandler(state as ClaimState)
    );
    expect(cancelled.committed).toBe(true);
    expect((cancelled.snapshot.val() as { status: string }).status).toBe(
      'cancelled'
    );

    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), `ext/jobs/${BM}/t2/state`), {
        status: 'claimed',
        claimedBy: 'm1',
      });
    });
    const kept = await runTransaction(
      ref(db, `ext/jobs/${BM}/t2/state`),
      (state) => cancelPendingHandler(state as ClaimState)
    );
    expect(kept.committed).toBe(false);
    expect((kept.snapshot.val() as { status: string }).status).toBe('claimed');
  });

  it('cancel job pending: đặt cancelRequested và chốt state cancelled', async () => {
    const db = ops().database();
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/c1`), buildScanJob('BM ĐỐI TÁC', args))
    );
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/c1/cancelRequested`), true)
    );
    await assertSucceeds(
      update(ref(db, `ext/jobs/${BM}/c1/state`), {
        status: 'cancelled',
        finishedAt: serverTimestamp(),
      })
    );
  });
});

describe('chọn request để duyệt (D6: chỉ tập con của kết quả quét)', () => {
  it('parseSelection nhận danh sách, khoảng và all', () => {
    expect(parseSelection('1,3-4', 5)).toEqual([0, 2, 3]);
    expect(parseSelection('all', 3)).toEqual([0, 1, 2]);
    expect(parseSelection(' 2 , 2 ', 3)).toEqual([1]);
  });

  it('parseSelection từ chối rỗng, ngoài phạm vi, sai cú pháp', () => {
    expect(() => parseSelection('', 3)).toThrow();
    expect(() => parseSelection('0', 3)).toThrow();
    expect(() => parseSelection('4', 3)).toThrow();
    expect(() => parseSelection('3-1', 3)).toThrow();
    expect(() => parseSelection('a', 3)).toThrow();
  });

  it('buildApproveJob chỉ lấy đúng các request đã chọn', () => {
    const job = buildApproveJob({
      scan: {
        partnerName: 'BM',
        requests: [
          { requester: 'A', account: 'T1' },
          { requester: 'B', account: 'T2' },
        ],
      },
      selection: [1],
      action: 'decline',
      mode: 'dry',
      scanJobId: 's',
      args: { businessId: BM, uid: 'u', createdAt: 1 },
    });
    expect(job.config.requests).toEqual([{ requester: 'B', account: 'T2' }]);
    expect(job).toMatchObject({
      approval: 'human',
      approvedBy: 'u',
      scanJobId: 's',
    });
  });
});
