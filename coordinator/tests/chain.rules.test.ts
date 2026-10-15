import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, serverTimestamp, set, update } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildAssignJob, buildChain, parseAssignConfig } from '../src/jobs';

const BM = '987654321098765';
const ASSIGN = 'assign1';
const SCAN = 'chain-assign1-scan-1';
const PARTNER = 'BM Đối Tác';

const assignConfig = parseAssignConfig({
  partnerBmId: '1234567890123456',
  queries: ['SHOP A'],
  tasks: ['ANALYZE'],
});

describe('buildChain (ops assign --chain-*)', () => {
  it('chuỗi chỉ có với full, tên đối tác và người yêu cầu đều bắt buộc', () => {
    expect(() => buildChain(PARTNER, 'Admin 1', 'dry')).toThrow(/full/);
    expect(() => buildChain(undefined, 'Admin 1', 'full')).toThrow(/partner/);
    expect(() => buildChain(PARTNER, undefined, 'full')).toThrow(/requester/);
    expect(() => buildChain('   ', 'Admin 1', 'full')).toThrow();
    const chain = buildChain(`  ${PARTNER} `, 'Admin 1', 'full');
    expect(chain).toMatchObject({
      auto: true,
      partnerName: PARTNER,
      requesterName: 'Admin 1',
      mode: 'full',
    });
    expect(chain.scanDelaysSec.length).toBeGreaterThan(0);
  });
});

describe('Rules cho chuỗi assign → approve (D12)', () => {
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
  const coordinator = (): ReturnType<
    RulesTestEnvironment['authenticatedContext']
  > => env.authenticatedContext('coordinator', { coordinator: true });
  const opsArgs = {
    businessId: BM,
    uid: 'uid-ops',
    createdAt: serverTimestamp(),
  };
  const chain = buildChain(PARTNER, 'Admin 1', 'full');

  // Job assign đã xong, dừng ở pending-approval, ops khai chain (như sau khi máy admin 1 chạy xong).
  const seed = async (
    over: {
      runStatus?: string;
      chainMode?: 'dry' | 'full';
      scan?: string;
      finishedAt?: number;
    } = {}
  ): Promise<void> => {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.database();
      await set(ref(db, `ext/jobs/${BM}/${ASSIGN}`), {
        flow: 'partner-assign',
        mode: 'full',
        businessId: BM,
        config: assignConfig,
        chain: { ...chain, mode: over.chainMode ?? 'full' },
        createdBy: 'uid-ops',
        approval: 'human',
        approvedBy: 'uid-ops',
        createdAt: 1,
        state: {
          status: 'done',
          claimedBy: 'm1',
          finishedAt: over.finishedAt ?? Date.now(),
          result: { runStatus: over.runStatus ?? 'pending-approval' },
        },
      });
      await set(ref(db, `ext/jobs/${BM}/${SCAN}`), {
        flow: 'requests.scan',
        mode: 'dry',
        businessId: BM,
        config: { partnerName: PARTNER },
        chain: { assignJobId: ASSIGN },
        createdBy: 'coordinator',
        createdAt: 1,
        state: { status: over.scan ?? 'done' },
      });
    });
  };

  const scanJob = (mode: 'dry' | 'full' = 'dry'): Record<string, unknown> => ({
    flow: 'requests.scan',
    mode,
    businessId: BM,
    config: { partnerName: PARTNER },
    chain: { assignJobId: ASSIGN },
    createdAt: serverTimestamp(),
    createdBy: 'coordinator',
    cancelRequested: false,
    state: { status: 'pending' },
  });
  const approveJob = (
    over: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    flow: 'partner-approve',
    mode: 'full',
    businessId: BM,
    config: {
      partnerName: PARTNER,
      partnerBmId: assignConfig.partnerBmId,
      action: 'approve',
      requests: [{ requester: 'Admin 1', account: 'SHOP A' }],
    },
    scanJobId: SCAN,
    approval: 'auto-match',
    approvedBy: 'coordinator',
    chain: { assignJobId: ASSIGN },
    createdAt: serverTimestamp(),
    createdBy: 'coordinator',
    cancelRequested: false,
    state: { status: 'pending' },
    ...over,
  });

  it('ops khai chain trên assign full; dry, thiếu requesterName hoặc coordinator tạo thì bị từ chối', async () => {
    const db = ops().database();
    await assertSucceeds(
      set(
        ref(db, `ext/jobs/${BM}/c1`),
        buildAssignJob(assignConfig, opsArgs, 'full', chain)
      )
    );
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/c2`), {
        ...buildAssignJob(assignConfig, opsArgs, 'dry'),
        chain,
      })
    );
    const { requesterName: _drop, ...noRequester } = chain;
    await assertFails(
      set(
        ref(db, `ext/jobs/${BM}/c3`),
        buildAssignJob(assignConfig, opsArgs, 'full', noRequester as never)
      )
    );
    await assertFails(
      set(ref(coordinator().database(), `ext/jobs/${BM}/c4`), {
        ...buildAssignJob(
          assignConfig,
          { ...opsArgs, uid: 'coordinator' },
          'full',
          chain
        ),
      })
    );
  });

  it('coordinator tạo scan dry kể cả khi chain.mode là full; scan full bị từ chối', async () => {
    await seed({ scan: 'running' });
    const db = coordinator().database();
    await assertSucceeds(
      set(ref(db, `ext/jobs/${BM}/chain-assign1-scan-2`), scanJob())
    );
    await assertFails(
      set(ref(db, `ext/jobs/${BM}/chain-assign1-scan-3`), scanJob('full'))
    );
  });

  it('coordinator tạo approve full auto-match khi chain.mode full và job assign chờ duyệt', async () => {
    await seed();
    await assertSucceeds(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
  });

  it('approve full bị từ chối khi chain.mode là dry, khi assign không chờ duyệt, hoặc action decline', async () => {
    await seed({ chainMode: 'dry' });
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
    // dry khớp chain.mode dry thì được.
    await assertSucceeds(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob({ mode: 'dry' })
      )
    );
    await env.clearDatabase();
    await seed({ runStatus: 'done' });
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
    await env.clearDatabase();
    await seed();
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob({
          config: {
            partnerName: PARTNER,
            partnerBmId: assignConfig.partnerBmId,
            action: 'decline',
            requests: [{ requester: 'Admin 1', account: 'SHOP A' }],
          },
        })
      )
    );
  });

  it('approve auto-match phải mang partnerBmId đúng bằng BM ID của job assign (M3)', async () => {
    await seed();
    const config = approveJob().config as Record<string, unknown>;
    const { partnerBmId: _drop, ...noBmId } = config;
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob({ config: noBmId })
      )
    );
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob({ config: { ...config, partnerBmId: '9999999999999' } })
      )
    );
    await assertSucceeds(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
  });

  it('khoá job bị pin theo chuỗi, assignJobId không chèn được path, chỉ một approve cho mỗi chuỗi', async () => {
    await seed();
    const db = coordinator().database();
    // Hai approve cho cùng một chuỗi: khoá lạ bị từ chối.
    await assertFails(set(ref(db, `ext/jobs/${BM}/approve-2`), approveJob()));
    // assignJobId mang dấu "/" trỏ vào node lồng: bị từ chối.
    await assertFails(
      set(
        ref(db, `ext/jobs/${BM}/chain-${ASSIGN}/state/x-approve`),
        approveJob({ chain: { assignJobId: `${ASSIGN}/state` } })
      )
    );
    await assertFails(
      set(
        ref(db, `ext/jobs/${BM}/chain-x-approve`),
        approveJob({ chain: { assignJobId: `${ASSIGN}/state/fake` } })
      )
    );
    // Scan cũng phải đúng khoá của chuỗi.
    await assertFails(set(ref(db, `ext/jobs/${BM}/scan-free`), scanJob()));
  });

  it('approve phải trỏ tới scan của chính chuỗi, và chuỗi quá ttlSec thì bị từ chối', async () => {
    await seed();
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `ext/jobs/${BM}/${SCAN}/chain`), {
        assignJobId: 'assign-khac',
      });
    });
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
    await env.clearDatabase();
    await seed({ finishedAt: Date.now() - (chain.ttlSec + 60) * 1000 });
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
  });

  it('máy đang giữ job ghi được state done kèm result.awaitingApproval (rule (b) cascade)', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `ext/jobs/${BM}/${ASSIGN}`), {
        flow: 'partner-assign',
        mode: 'full',
        businessId: BM,
        config: assignConfig,
        chain,
        createdBy: 'uid-ops',
        createdAt: 1,
        state: { status: 'running', claimedBy: 'm1' },
      });
    });
    const machine = env.authenticatedContext('uid-m1', {
      machineId: 'm1',
      bm: BM,
      flow: 'partner-assign',
    });
    await assertSucceeds(
      update(ref(machine.database(), `ext/jobs/${BM}/${ASSIGN}/state`), {
        status: 'done',
        finishedAt: serverTimestamp(),
        result: {
          runStatus: 'pending-approval',
          awaitingApproval: [{ accountId: '1', name: 'SHOP A' }],
        },
      })
    );
  });

  it('chỉ coordinator được tạo approve full auto-match; ops và coordinator không ghi đè job đã có', async () => {
    await seed();
    await assertFails(
      set(
        ref(ops().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob({ createdBy: 'uid-ops', approvedBy: 'uid-ops' })
      )
    );
    await assertSucceeds(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
    await assertFails(
      set(
        ref(coordinator().database(), `ext/jobs/${BM}/chain-assign1-approve`),
        approveJob()
      )
    );
  });

  // TEMP(D12-bridge): máy partner-assign tự tạo approve của chuỗi. Gỡ khối này cùng nhánh rules `machine-chain`.
  describe('đường tạm D12-bridge (máy assign tạo approve)', () => {
    const machine = (
      id = 'm1',
      flow = 'partner-assign',
      bm = BM
    ): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
      env.authenticatedContext(`uid-${id}`, { machineId: id, bm, flow });
    const bridge = (
      uid = 'uid-m1',
      over: Record<string, unknown> = {}
    ): Record<string, unknown> => {
      const { scanJobId: _s, ...rest } = approveJob();
      return {
        ...rest,
        approval: 'machine-chain',
        approvedBy: uid,
        createdBy: uid,
        ...over,
      };
    };
    const KEY = `ext/jobs/${BM}/chain-assign1-approve`;

    it('máy đã giữ job assign tạo được approve; lần hai và khoá lạ bị từ chối', async () => {
      await seed();
      const db = machine().database();
      await assertSucceeds(set(ref(db, KEY), bridge()));
      await assertFails(set(ref(db, KEY), bridge()));
      await assertFails(set(ref(db, `ext/jobs/${BM}/approve-2`), bridge()));
    });

    it('máy khác, máy flow approve hoặc máy BM khác bị từ chối', async () => {
      await seed();
      await assertFails(
        set(ref(machine('m2').database(), KEY), bridge('uid-m2'))
      );
      await assertFails(
        set(
          ref(machine('m1', 'partner-approve').database(), KEY),
          bridge('uid-m1')
        )
      );
      await assertFails(
        set(
          ref(
            machine('m1', 'partner-assign', '111111111111111').database(),
            KEY
          ),
          bridge('uid-m1')
        )
      );
    });

    it('bị từ chối khi assign chưa chờ duyệt hoặc chuỗi quá ttl', async () => {
      await seed({ runStatus: 'done' });
      await assertFails(set(ref(machine().database(), KEY), bridge()));
      await env.clearDatabase();
      await seed({ finishedAt: Date.now() - (chain.ttlSec + 60) * 1000 });
      await assertFails(set(ref(machine().database(), KEY), bridge()));
    });

    it('partnerBmId, partnerName, mode, action phải khớp job assign; scanJobId không được có', async () => {
      await seed();
      const db = machine().database();
      const config = approveJob().config as Record<string, unknown>;
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', {
            config: { ...config, partnerBmId: '9999999999999' },
          })
        )
      );
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', { config: { ...config, partnerName: 'BM Khac' } })
        )
      );
      await assertFails(set(ref(db, KEY), bridge('uid-m1', { mode: 'dry' })));
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', { config: { ...config, action: 'decline' } })
        )
      );
      await assertFails(
        set(ref(db, KEY), bridge('uid-m1', { scanJobId: SCAN }))
      );
    });

    it('mọi requester phải bằng chain.requesterName của job assign (kể cả mục thứ hai)', async () => {
      await seed();
      const db = machine().database();
      const config = approveJob().config as Record<string, unknown>;
      const other = { requester: 'Another Employee', account: 'SHOP A' };
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', { config: { ...config, requests: [other] } })
        )
      );
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', {
            config: {
              ...config,
              requests: [{ requester: 'Admin 1', account: 'A' }, other],
            },
          })
        )
      );
      await assertSucceeds(
        set(
          ref(db, KEY),
          bridge('uid-m1', {
            config: {
              ...config,
              requests: [
                { requester: 'Admin 1', account: 'A' },
                { requester: 'Admin 1', account: 'B' },
              ],
            },
          })
        )
      );
    });

    it('bị từ chối khi job assign đã bị yêu cầu huỷ hoặc kill-switch đang bật', async () => {
      await seed();
      await env.withSecurityRulesDisabled(async (context) => {
        await set(
          ref(context.database(), `ext/jobs/${BM}/${ASSIGN}/cancelRequested`),
          true
        );
      });
      await assertFails(set(ref(machine().database(), KEY), bridge()));
      await env.clearDatabase();
      await seed();
      await env.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), `ext/killSwitch/${BM}`), true);
      });
      await assertFails(set(ref(machine().database(), KEY), bridge()));
    });

    it('máy giữ job không ghi được finishedAt tuỳ ý để kéo dài ttl', async () => {
      await env.withSecurityRulesDisabled(async (context) => {
        await set(ref(context.database(), `ext/jobs/${BM}/${ASSIGN}`), {
          flow: 'partner-assign',
          mode: 'full',
          businessId: BM,
          config: assignConfig,
          chain,
          createdBy: 'uid-ops',
          createdAt: 1,
          state: { status: 'running', claimedBy: 'm1' },
        });
      });
      const stateRef = ref(
        machine().database(),
        `ext/jobs/${BM}/${ASSIGN}/state`
      );
      await assertFails(update(stateRef, { status: 'done', finishedAt: 9e15 }));
      await assertSucceeds(
        update(stateRef, { status: 'done', finishedAt: serverTimestamp() })
      );
    });

    it('máy chỉ tạo được approve machine-chain: không assign, scan, human hay auto-match', async () => {
      await seed();
      const db = machine().database();
      await assertFails(
        set(ref(db, `ext/jobs/${BM}/chain-assign1-scan-9`), {
          ...scanJob(),
          createdBy: 'uid-m1',
        })
      );
      await assertFails(
        set(ref(db, `ext/jobs/${BM}/x1`), {
          ...buildAssignJob(assignConfig, { ...opsArgs, uid: 'uid-m1' }, 'dry'),
        })
      );
      await assertFails(
        set(ref(db, KEY), bridge('uid-m1', { approval: 'auto-match' }))
      );
      await assertFails(
        set(
          ref(db, KEY),
          bridge('uid-m1', { approval: 'human', scanJobId: SCAN })
        )
      );
    });

    it('ops và coordinator không dùng được approval machine-chain', async () => {
      await seed();
      await assertFails(
        set(
          ref(ops().database(), KEY),
          bridge('uid-ops', { approvedBy: 'uid-ops' })
        )
      );
      await assertFails(
        set(
          ref(coordinator().database(), KEY),
          bridge('coordinator', { approvedBy: 'coordinator' })
        )
      );
    });
  });

  it('coordinator không tạo được assign, kể cả dry mang approval auto-match', async () => {
    await seed();
    await assertFails(
      set(ref(coordinator().database(), `ext/jobs/${BM}/sneaky`), {
        ...buildAssignJob(
          assignConfig,
          { ...opsArgs, uid: 'coordinator' },
          'dry'
        ),
        approval: 'auto-match',
        chain: { assignJobId: ASSIGN },
      })
    );
  });
});
