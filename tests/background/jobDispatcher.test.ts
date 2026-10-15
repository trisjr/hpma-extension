import type { BridgeJob } from '@/background/chainBridge';
import type { ProbeReports } from '@/shared/probe';
import type { RemoteJob } from '@/shared/remoteJob';
import type { RunState } from '@/shared/run';
import { describe, expect, it, vi } from 'vitest';

import { DispatchMemory, EMPTY_MEMORY } from '@/background/dispatchMemory';
import createDispatcher, {
  ActiveJob,
  DispatcherDeps,
  Locks,
  MachinePatch,
  OwnJob,
  SyncOutcome,
  TabDriver,
} from '@/background/jobDispatcher';
import { parseJobEnvelope } from '@/shared/remoteJob';

const BM = '987654321098765';
const MACHINE = 'machine-1';
const T0 = Date.UTC(2025, 0, 1, 12, 0, 0);

const assignNode = {
  flow: 'partner-assign',
  mode: 'dry',
  businessId: BM,
  config: {
    partnerBmId: '1234567890123456',
    queries: ['SHOP 1'],
    tasks: ['ADVERTISE', 'ANALYZE'],
  },
  createdAt: 1,
  state: { status: 'pending' },
};

const mkJob = (id: string, node: Record<string, unknown> = {}): RemoteJob => {
  const job = parseJobEnvelope(id, { ...assignNode, ...node }, BM);
  if (!job) throw new Error('fixture job sai');
  return job;
};

const run = (patch: Record<string, unknown> = {}): RunState =>
  ({
    runId: 'run1',
    mode: 'dry',
    status: 'running',
    targets: [{ accountId: 'a', name: 'A', plan: 'run', outcome: 'done' }],
    ...patch,
  }) as unknown as RunState;

type Write = { id: string; patch: Record<string, unknown> };

// Chỉ `at` và `rate` được cổng probe đọc.
const PASSING_PROBE = {
  requests: { stage: 'requests', at: T0 - 1000, rate: 1 },
  'request-detail': { stage: 'request-detail', at: T0 - 1000, rate: 0.97 },
} as unknown as ProbeReports;

function setup(
  options: {
    owned?: OwnJob[];
    locks?: Partial<{
      emergency: unknown;
      rateLimitedUntil: unknown;
      fullCap: number;
    }>;
    memory?: Partial<DispatchMemory>;
    flow?: 'partner-assign' | 'partner-approve';
    probe?: ProbeReports;
    killUnknown?: boolean;
    createFails?: boolean;
  } = {}
) {
  const clock = { now: T0 };
  const createdJobs: { id: string; job: BridgeJob }[] = [];
  const statusAtCreate: (string | undefined)[] = [];
  const writes: Write[] = [];
  const machine: MachinePatch[] = [];
  const status = new Map<string, string>();
  let memory: DispatchMemory = { ...EMPTY_MEMORY, ...options.memory };
  const cancelCallbacks = new Map<string, (cancelRequested: boolean) => void>();
  const errors: unknown[] = [];
  const published: (string | undefined)[] = [];

  const tabs = {
    find: vi.fn<TabDriver['find']>(async () => 7),
    open: vi.fn<TabDriver['open']>(async () => 7),
    prepare: vi.fn<TabDriver['prepare']>(async () => ({ ok: true })),
    start: vi.fn<TabDriver['start']>(async () => ({ ok: true, runId: 'run1' })),
    scan: vi.fn<TabDriver['scan']>(async () => ({
      ok: true,
      businessId: BM,
      requests: [{ requester: 'R', account: 'A' }],
    })),
    stop: vi.fn<TabDriver['stop']>(async () => undefined),
    sync: vi.fn<TabDriver['sync']>(
      async (): Promise<SyncOutcome> => ({ reachable: true, run: undefined })
    ),
    clear: vi.fn<TabDriver['clear']>(async () => undefined),
    probe: vi.fn<TabDriver['probe']>(async () => true),
  };

  const deps: DispatcherDeps = {
    now: () => clock.now,
    machineId: MACHINE,
    businessId: BM,
    flow: options.flow ?? 'partner-assign',
    claim: vi.fn(async (jobId: string) => {
      if ((status.get(jobId) ?? 'pending') !== 'pending') return false;
      status.set(jobId, 'claimed');
      return true;
    }),
    writeState: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      writes.push({ id, patch });
      if (typeof patch.status === 'string') status.set(id, patch.status);
    }),
    publishActive: vi.fn(async (active: ActiveJob | undefined) => {
      published.push(active?.job.id);
    }),
    writeMachine: vi.fn(async (patch: MachinePatch) => {
      machine.push(patch);
    }),
    readOwnJobs: vi.fn(async () => options.owned ?? []),
    watchCancel: vi.fn((jobId, onChange) => {
      cancelCallbacks.set(jobId, onChange);
      return () => cancelCallbacks.delete(jobId);
    }),
    readProbe: vi.fn(
      async (): Promise<ProbeReports> => options.probe ?? PASSING_PROBE
    ),
    readLocks: vi.fn(
      async (): Promise<Locks> => ({
        emergency: undefined,
        rateLimitedUntil: undefined,
        curfew: {
          on: false,
          from: '00:00',
          to: '06:00',
          tz: 'Asia/Ho_Chi_Minh',
        },
        writesPerDay: 20,
        fullCap: undefined,
        ...options.locks,
      })
    ),
    createJob: vi.fn(async (id: string, job: BridgeJob) => {
      // Rules cần thấy job assign đã `done` rồi mới cho tạo job approve.
      statusAtCreate.push(status.get(id.replace(/^chain-|-approve$/g, '')));
      if (options.createFails) throw new Error('permission_denied');
      createdJobs.push({ id, job });
    }),
    loadMemory: vi.fn(async () => memory),
    saveMemory: vi.fn(async (next: DispatchMemory) => {
      memory = next;
    }),
    tabs,
    onError: (error: unknown) => errors.push(error),
  };
  const dispatcher = createDispatcher(deps);
  // Kill-switch chưa biết = đóng (fail-closed): mặc định giả lập snapshot đầu tiên đã về, tắt.
  if (!options.killUnknown) dispatcher.setKill({ global: false, bm: false });
  return {
    dispatcher,
    deps,
    tabs,
    writes,
    createdJobs,
    statusAtCreate,
    machine,
    status,
    clock,
    errors,
    published,
    memory: () => memory,
    cancel: (jobId: string) => cancelCallbacks.get(jobId)?.(true),
    last: (id: string) =>
      [...writes].reverse().find((entry) => entry.id === id)?.patch,
    statusOf: (id: string) => status.get(id),
  };
}

const settle = async (): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
};

describe('jobDispatcher: chạy job', () => {
  it('claim, chạy, báo running rồi done khi run kết thúc; máy về idle', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    expect(ctx.tabs.start).toHaveBeenCalledTimes(1);
    expect(ctx.tabs.start.mock.calls[0][1]).toMatchObject({
      kind: 'run.start',
      flow: 'partner-assign',
      mode: 'dry',
      businessId: BM,
    });
    expect(ctx.dispatcher.view()).toMatchObject({
      status: 'busy',
      currentJobId: 'j1',
    });
    ctx.dispatcher.onRunEvent(run({ status: 'done' }), 7);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
    expect(ctx.last('j1')).toMatchObject({
      status: 'done',
      result: { runId: 'run1', runStatus: 'done' },
    });
    expect(ctx.tabs.clear).toHaveBeenCalledWith(7);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toEqual({ status: 'idle' })
    );
  });

  describe('chuỗi assign → approve (D12): result.awaitingApproval', () => {
    const pendingRun = run({
      status: 'pending-approval',
      targets: [
        { accountId: 'a', name: 'SHOP A', plan: 'run', outcome: 'done' },
        {
          accountId: 'b',
          name: 'SHOP B',
          plan: 'run',
          outcome: 'pending-approval',
        },
      ],
    });
    const chain = {
      auto: true,
      partnerName: 'BM Đối Tác',
      mode: 'full',
      scanDelaysSec: [120],
      ttlSec: 86400,
    };

    it('job có chain.auto dừng ở pending-approval: ghi E vào result', async () => {
      const ctx = setup();
      ctx.dispatcher.setPending([mkJob('c1', { chain })]);
      await vi.waitFor(() => expect(ctx.statusOf('c1')).toBe('running'));
      ctx.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(ctx.statusOf('c1')).toBe('done'));
      expect(ctx.last('c1')).toMatchObject({
        result: {
          runStatus: 'pending-approval',
          awaitingApproval: [{ accountId: 'b', name: 'SHOP B' }],
        },
      });
    });

    it('job không có chain, hoặc run không chờ duyệt: không ghi awaitingApproval', async () => {
      const ctx = setup();
      ctx.dispatcher.setPending([mkJob('n1')]);
      await vi.waitFor(() => expect(ctx.statusOf('n1')).toBe('running'));
      ctx.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(ctx.statusOf('n1')).toBe('done'));
      expect(ctx.last('n1')?.result).not.toHaveProperty('awaitingApproval');

      const chained = setup();
      chained.dispatcher.setPending([mkJob('n2', { chain })]);
      await vi.waitFor(() => expect(chained.statusOf('n2')).toBe('running'));
      chained.dispatcher.onRunEvent(run({ status: 'done' }), 7);
      await vi.waitFor(() => expect(chained.statusOf('n2')).toBe('done'));
      expect(chained.last('n2')?.result).not.toHaveProperty('awaitingApproval');
    });

    // TEMP(D12-bridge): gỡ ba test này cùng chainBridge.ts.
    it('D12-bridge: assign chờ duyệt tạo đúng một job approve sau khi chốt done', async () => {
      const ctx = setup();
      ctx.dispatcher.setPending([mkJob('c1', { chain })]);
      await vi.waitFor(() => expect(ctx.statusOf('c1')).toBe('running'));
      ctx.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(ctx.createdJobs).toHaveLength(1));
      expect(ctx.statusOf('c1')).toBe('done');
      expect(ctx.statusAtCreate).toEqual(['done']);
      expect(ctx.createdJobs[0]).toMatchObject({
        id: 'chain-c1-approve',
        job: {
          flow: 'partner-approve',
          mode: 'full',
          businessId: BM,
          approval: 'machine-chain',
          chain: { assignJobId: 'c1' },
          config: {
            partnerName: 'BM Đối Tác',
            partnerBmId: '1234567890123456',
            action: 'approve',
            approveAll: true,
          },
        },
      });
      expect(ctx.createdJobs[0].job.config).not.toHaveProperty('requests');
    });

    it('D12-bridge: máy approve nhận job approveAll, quét Needs review rồi chạy với danh sách vừa quét', async () => {
      const ctx = setup({ flow: 'partner-approve' });
      ctx.tabs.scan.mockResolvedValue({
        ok: true,
        businessId: BM,
        requests: [
          { requester: 'Ai Do', account: 'SHOP A' },
          { requester: 'Ai Khac', account: 'SHOP B' },
        ],
      });
      ctx.dispatcher.setPending([
        mkJob('chain-x-approve', {
          flow: 'partner-approve',
          mode: 'full',
          approval: 'machine-chain',
          approvedBy: 'uid-m1',
          createdBy: 'uid-m1',
          chain: { assignJobId: 'x' },
          config: {
            partnerName: 'BM Đối Tác',
            partnerBmId: '1234567890123456',
            action: 'approve',
            approveAll: true,
          },
        }),
      ]);
      await vi.waitFor(() =>
        expect(ctx.statusOf('chain-x-approve')).toBe('running')
      );
      expect(ctx.tabs.scan).toHaveBeenCalledWith(7, 'BM Đối Tác');
      expect(ctx.tabs.start.mock.calls[0][1]).toMatchObject({
        flow: 'partner-approve',
        mode: 'full',
        config: {
          partnerName: 'BM Đối Tác',
          partnerBmId: '1234567890123456',
          action: 'approve',
          requests: [
            { requester: 'Ai Do', account: 'SHOP A' },
            { requester: 'Ai Khac', account: 'SHOP B' },
          ],
        },
      });
    });

    it('D12-bridge: danh sách quét vượt ngân sách ghi/ngày bị cắt theo ngân sách, writesNeeded theo danh sách', async () => {
      const ctx = setup({
        flow: 'partner-approve',
        locks: { fullCap: undefined },
      });
      ctx.tabs.scan.mockResolvedValue({
        ok: true,
        businessId: BM,
        requests: Array.from({ length: 45 }, (_, i) => ({
          requester: `R${i}`,
          account: `A${i}`,
        })),
      });
      ctx.dispatcher.setPending([
        mkJob('chain-z-approve', {
          flow: 'partner-approve',
          mode: 'full',
          approval: 'machine-chain',
          approvedBy: 'uid-m1',
          createdBy: 'uid-m1',
          chain: { assignJobId: 'z' },
          config: {
            partnerName: 'BM Đối Tác',
            partnerBmId: '1234567890123456',
            action: 'approve',
            approveAll: true,
          },
        }),
      ]);
      await vi.waitFor(() =>
        expect(ctx.statusOf('chain-z-approve')).toBe('running')
      );
      // writesPerDay mặc định của setup là 20: chỉ 20 request đầu được gửi cho engine.
      const sent = ctx.tabs.start.mock.calls[0][1] as unknown as {
        config: { requests: unknown[] };
      };
      expect(sent.config.requests).toHaveLength(20);
    });

    it('D12-bridge: job human mang config approveAll không được mở rộng, chốt ERR_JOB_INVALID', async () => {
      const ctx = setup({ flow: 'partner-approve' });
      ctx.dispatcher.setPending([
        mkJob('h1', {
          flow: 'partner-approve',
          mode: 'dry',
          approval: 'human',
          approvedBy: 'uid-ops',
          createdBy: 'uid-ops',
          scanJobId: 'scan-1',
          config: {
            partnerName: 'BM Đối Tác',
            partnerBmId: '1234567890123456',
            action: 'approve',
            approveAll: true,
          },
        }),
      ]);
      await vi.waitFor(() => expect(ctx.statusOf('h1')).toBe('error'));
      expect(ctx.last('h1')).toMatchObject({
        error: { code: 'ERR_JOB_INVALID' },
      });
      expect(ctx.tabs.scan).not.toHaveBeenCalled();
      expect(ctx.tabs.start).not.toHaveBeenCalled();
    });

    it('D12-bridge: quét không thấy request nào của BM đối tác thì job lỗi và không chạy engine', async () => {
      const ctx = setup({ flow: 'partner-approve' });
      ctx.tabs.scan.mockResolvedValue({
        ok: true,
        businessId: BM,
        requests: [],
      });
      ctx.dispatcher.setPending([
        mkJob('chain-y-approve', {
          flow: 'partner-approve',
          mode: 'full',
          approval: 'machine-chain',
          approvedBy: 'uid-m1',
          createdBy: 'uid-m1',
          chain: { assignJobId: 'y' },
          config: {
            partnerName: 'BM Đối Tác',
            partnerBmId: '1234567890123456',
            action: 'approve',
            approveAll: true,
          },
        }),
      ]);
      await vi.waitFor(() =>
        expect(ctx.statusOf('chain-y-approve')).toBe('error')
      );
      expect(ctx.last('chain-y-approve')).toMatchObject({
        error: { code: 'ERR_TARGET_NOT_FOUND' },
      });
      expect(ctx.tabs.start).not.toHaveBeenCalled();
    });

    it('D12-bridge: không có chain.auto hoặc run không chờ duyệt thì không tạo job', async () => {
      const plain = setup();
      plain.dispatcher.setPending([mkJob('n1')]);
      await vi.waitFor(() => expect(plain.statusOf('n1')).toBe('running'));
      plain.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(plain.statusOf('n1')).toBe('done'));
      expect(plain.createdJobs).toHaveLength(0);

      const done = setup();
      done.dispatcher.setPending([mkJob('n2', { chain })]);
      await vi.waitFor(() => expect(done.statusOf('n2')).toBe('running'));
      done.dispatcher.onRunEvent(run({ status: 'done' }), 7);
      await vi.waitFor(() => expect(done.statusOf('n2')).toBe('done'));
      expect(done.createdJobs).toHaveLength(0);
    });

    it('D12-bridge: bị huỷ hoặc kill-switch đang bật thì không tạo job approve', async () => {
      const cancelled = setup();
      cancelled.dispatcher.setPending([mkJob('c1', { chain })]);
      await vi.waitFor(() => expect(cancelled.statusOf('c1')).toBe('running'));
      cancelled.cancel('c1');
      cancelled.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(cancelled.statusOf('c1')).toBe('done'));
      await settle();
      expect(cancelled.createdJobs).toHaveLength(0);

      const killed = setup();
      killed.dispatcher.setPending([mkJob('c2', { chain })]);
      await vi.waitFor(() => expect(killed.statusOf('c2')).toBe('running'));
      killed.dispatcher.setKill({ global: false, bm: true });
      killed.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(killed.statusOf('c2')).toBeDefined());
      await settle();
      expect(killed.createdJobs).toHaveLength(0);
    });

    it('D12-bridge: tạo job lỗi thì chỉ báo lỗi, job assign vẫn done và máy về idle', async () => {
      const ctx = setup({ createFails: true });
      ctx.dispatcher.setPending([mkJob('c1', { chain })]);
      await vi.waitFor(() => expect(ctx.statusOf('c1')).toBe('running'));
      ctx.dispatcher.onRunEvent(pendingRun, 7);
      await vi.waitFor(() => expect(ctx.statusOf('c1')).toBe('done'));
      await vi.waitFor(() => expect(ctx.errors).toHaveLength(1));
      await vi.waitFor(() =>
        expect(ctx.dispatcher.view()).toEqual({ status: 'idle' })
      );
    });

    it('SW chết giữa run: job nối lại qua reconcile vẫn giữ chain và ghi E', async () => {
      const ctx = setup({
        owned: [
          {
            job: mkJob('r1', { chain, state: { status: 'running' } }),
            runId: 'run1',
          },
        ],
      });
      ctx.tabs.sync.mockResolvedValue({ reachable: true, run: pendingRun });
      ctx.dispatcher.setPending([]);
      await vi.waitFor(() => expect(ctx.statusOf('r1')).toBe('done'));
      expect(ctx.last('r1')).toMatchObject({
        result: { awaitingApproval: [{ accountId: 'b', name: 'SHOP B' }] },
      });
    });
  });

  it('chỉ chạy một job mỗi lúc, job sau chờ job trước xong', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([
      mkJob('j1', { createdAt: 1 }),
      mkJob('j2', { createdAt: 2 }),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    await settle();
    expect(ctx.statusOf('j2')).toBeUndefined();
    expect(ctx.tabs.start).toHaveBeenCalledTimes(1);
    ctx.dispatcher.onRunEvent(run({ status: 'done' }), 7);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
    // Snapshot RTDB sau đó không còn j1: dispatcher nhặt j2.
    ctx.dispatcher.setPending([mkJob('j2', { createdAt: 2 })]);
    await vi.waitFor(() => expect(ctx.statusOf('j2')).toBe('running'));
  });

  it('job mode ngoài allowlist: claim rồi error ERR_JOB_INVALID, không gửi lệnh', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('bad', { mode: 'assist' })]);
    await vi.waitFor(() => expect(ctx.statusOf('bad')).toBe('error'));
    expect(ctx.last('bad')).toMatchObject({
      error: { code: 'ERR_JOB_INVALID', message: 'mode' },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
    expect(ctx.tabs.prepare).not.toHaveBeenCalled();
  });

  const approveFull = (id: string, createdAt = 1): RemoteJob =>
    mkJob(id, {
      flow: 'partner-approve',
      mode: 'full',
      createdAt,
      approval: 'human',
      approvedBy: 'uid-ops',
      createdBy: 'uid-ops',
      scanJobId: 'scan1',
      config: {
        partnerName: 'BM',
        action: 'approve',
        requests: [{ requester: 'R', account: 'A' }],
      },
    });

  it('job duyệt full chạy khi probe hai màn duyệt đạt, và gửi mode full', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.dispatcher.setPending([approveFull('f')]);
    await vi.waitFor(() => expect(ctx.statusOf('f')).toBe('running'));
    expect(ctx.tabs.start.mock.calls[0][1]).toMatchObject({
      flow: 'partner-approve',
      mode: 'full',
    });
    expect(ctx.memory().fullStarts).toHaveLength(1);
  });

  it('probe thiếu/dưới ngưỡng/hết hạn: job full bị chốt ERR_PROBE_GATE, không gửi lệnh', async () => {
    const ctx = setup({ flow: 'partner-approve', probe: {} });
    ctx.dispatcher.setPending([approveFull('f')]);
    await vi.waitFor(() => expect(ctx.statusOf('f')).toBe('error'));
    expect(ctx.last('f')).toMatchObject({
      error: {
        code: 'ERR_PROBE_GATE',
        message: 'missing:requests+request-detail',
      },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
    expect(ctx.tabs.prepare).not.toHaveBeenCalled();
  });

  const assignFull = (id: string): RemoteJob =>
    mkJob(id, {
      mode: 'full',
      approval: 'human',
      approvedBy: 'uid-ops',
      createdBy: 'uid-ops',
    });
  const ASSIGN_PROBE = {
    page: { stage: 'page', at: T0 - 1000, rate: 1 },
    menu: { stage: 'menu', at: T0 - 1000, rate: 1 },
    'dialog-bm': { stage: 'dialog-bm', at: T0 - 1000, rate: 0.97 },
    'dialog-assets': { stage: 'dialog-assets', at: T0 - 1000, rate: 1 },
    'dialog-access': { stage: 'dialog-access', at: T0 - 1000, rate: 1 },
    detail: { stage: 'detail', at: T0 - 1000, rate: 1 },
  } as unknown as ProbeReports;

  it('job gán full chạy khi probe sáu màn của flow gán đạt, tính vào trần ngày và gửi mode full', async () => {
    const ctx = setup({ probe: ASSIGN_PROBE });
    ctx.dispatcher.setPending([assignFull('af')]);
    await vi.waitFor(() => expect(ctx.statusOf('af')).toBe('running'));
    expect(ctx.tabs.start.mock.calls[0][1]).toMatchObject({
      flow: 'partner-assign',
      mode: 'full',
    });
    expect(ctx.memory().fullStarts).toHaveLength(1);
  });

  it('job gán full: probe của flow duyệt không thay được probe của flow gán (ERR_PROBE_GATE)', async () => {
    const ctx = setup(); // PASSING_PROBE chỉ có hai màn duyệt
    ctx.dispatcher.setPending([assignFull('af')]);
    await vi.waitFor(() => expect(ctx.statusOf('af')).toBe('error'));
    expect(ctx.last('af')).toMatchObject({
      error: { code: 'ERR_PROBE_GATE' },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('job duyệt dry không cần probe', async () => {
    const ctx = setup({ flow: 'partner-approve', probe: {} });
    ctx.dispatcher.setPending([
      mkJob('d', {
        flow: 'partner-approve',
        mode: 'dry',
        config: {
          partnerName: 'BM',
          action: 'approve',
          requests: [{ requester: 'R', account: 'A' }],
        },
      }),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('d')).toBe('running'));
  });

  it('trần 3 job full mỗi ngày (đã cấu hình): job thứ tư không được claim, máy blocked budget', async () => {
    const ctx = setup({
      flow: 'partner-approve',
      memory: { fullStarts: [T0 - 3000, T0 - 2000, T0 - 1000] },
      locks: { fullCap: 3 },
    });
    ctx.dispatcher.setPending([approveFull('f4')]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'budget' },
      })
    );
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });

  it('start không thành công thì không tính vào trần ngày', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.tabs.start.mockResolvedValueOnce({ ok: false, code: 'ERR_BUSY' });
    ctx.dispatcher.setPending([approveFull('f')]);
    await vi.waitFor(() => expect(ctx.statusOf('f')).toBe('pending'));
    expect(ctx.memory().fullStarts).toEqual([]);
  });

  it('job gán full không có dấu vết người duyệt bị chốt ERR_JOB_INVALID; requests.scan không có full', async () => {
    const assign = setup();
    assign.dispatcher.setPending([mkJob('a', { mode: 'full' })]);
    await vi.waitFor(() => expect(assign.statusOf('a')).toBe('error'));
    expect(assign.last('a')).toMatchObject({
      error: { code: 'ERR_JOB_INVALID', message: 'provenance' },
    });
    expect(assign.tabs.start).not.toHaveBeenCalled();
    const scan = setup({ flow: 'partner-approve' });
    scan.dispatcher.setPending([
      mkJob('s', {
        flow: 'requests.scan',
        mode: 'full',
        config: { partnerName: 'BM' },
      }),
    ]);
    await vi.waitFor(() => expect(scan.statusOf('s')).toBe('error'));
    expect(scan.tabs.scan).not.toHaveBeenCalled();
  });

  it('job config sai (ADVERTISE đơn lẻ) bị chốt ERR_JOB_INVALID trước khi gửi lệnh', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([
      mkJob('cfg', {
        config: { ...assignNode.config, tasks: ['ADVERTISE'] },
      }),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('cfg')).toBe('error'));
    expect(ctx.last('cfg')).toMatchObject({
      error: { code: 'ERR_JOB_INVALID', message: 'config' },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('job của flow khác (máy duyệt nhận assign) bị bỏ qua, không claim', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.dispatcher.setPending([mkJob('a1')]);
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });

  it('mất transaction claim thì bỏ qua và nhặt job kế tiếp', async () => {
    const ctx = setup();
    ctx.status.set('taken', 'claimed');
    ctx.dispatcher.setPending([
      mkJob('taken', { createdAt: 1 }),
      mkJob('next', { createdAt: 2 }),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('next')).toBe('running'));
    expect(ctx.statusOf('taken')).toBe('claimed');
  });
});

describe('jobDispatcher: cổng an toàn trước claim', () => {
  it('emergencyStop chặn mọi job kể cả dry, máy blocked không hạn', async () => {
    const ctx = setup({ locks: { emergency: T0 - 1 } });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'emergency', until: null },
      })
    );
    expect(ctx.deps.claim).not.toHaveBeenCalled();
    expect(ctx.machine.at(-1)).toMatchObject({
      status: 'blocked',
      blockedReason: 'emergency',
      blockedUntil: null,
    });
  });

  it('kill-switch bật thì không claim', async () => {
    const ctx = setup();
    ctx.dispatcher.setKill({ global: false, bm: true });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });

  it('kill-switch bật giữa run: dừng run, job kết thúc cancelled', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.dispatcher.setKill({ global: true, bm: false });
    await vi.waitFor(() =>
      expect(ctx.tabs.stop).toHaveBeenCalledWith(7, 'run1')
    );
    ctx.dispatcher.onRunEvent(run({ status: 'stopped' }), 7);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('cancelled'));
  });

  it('một sự cố checkpoint trong 24 giờ: máy tự chặn cục bộ, job sau không được claim', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1', { createdAt: 1 })]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.dispatcher.onRunEvent(
      run({
        status: 'failed',
        error: { code: 'ERR_CHECKPOINT', stepIndex: 2 },
      }),
      7
    );
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('error'));
    expect(ctx.memory().incidents).toHaveLength(1);
    ctx.dispatcher.setPending([mkJob('j2', { createdAt: 2 })]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'checkpoint' },
      })
    );
    expect(ctx.statusOf('j2')).toBeUndefined();
  });

  it('clearIncidents xoá lịch sự cố: máy hết blocked và nhặt job kế tiếp', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1', { createdAt: 1 })]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.dispatcher.onRunEvent(
      run({
        status: 'failed',
        error: { code: 'ERR_RATE_LIMITED', stepIndex: 2 },
      }),
      7
    );
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('error'));
    ctx.dispatcher.setPending([mkJob('j2', { createdAt: 2 })]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'rate-limited' },
      })
    );
    await ctx.dispatcher.clearIncidents();
    expect(ctx.memory().incidents).toEqual([]);
    ctx.dispatcher.setPending([mkJob('j2', { createdAt: 2 })]);
    await vi.waitFor(() => expect(ctx.statusOf('j2')).toBe('running'));
  });
});

describe('jobDispatcher: clearIncidents giữ sự cố checkpoint', () => {
  it('sau khi gỡ rate-limit, incident checkpoint vẫn chặn job kế tiếp', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1', { createdAt: 1 })]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.dispatcher.onRunEvent(
      run({
        status: 'failed',
        error: { code: 'ERR_CHECKPOINT', stepIndex: 2 },
      }),
      7
    );
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('error'));
    await ctx.dispatcher.clearIncidents();
    expect(ctx.memory().incidents).toHaveLength(1);
    ctx.dispatcher.setPending([mkJob('j2', { createdAt: 2 })]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'checkpoint' },
      })
    );
    expect(ctx.statusOf('j2')).toBeUndefined();
  });
});

describe('jobDispatcher: lỗi khi start (§5.2)', () => {
  it('ERR_BUSY: trả job về pending và nghỉ, không nhặt lại ngay', async () => {
    const ctx = setup();
    ctx.tabs.start.mockResolvedValueOnce({ ok: false, code: 'ERR_BUSY' });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('pending'));
    expect(ctx.last('j1')).toMatchObject({ claimedBy: null, claimedAt: null });
    expect(ctx.memory().backoffUntil).toBeGreaterThan(T0);
    ctx.dispatcher.setPending([mkJob('j1')]);
    await settle();
    expect(ctx.deps.claim).toHaveBeenCalledTimes(1);
  });

  it('ERR_BM_CHANGED: điều hướng lại và start lại một lần', async () => {
    const ctx = setup();
    ctx.tabs.start.mockResolvedValueOnce({ ok: false, code: 'ERR_BM_CHANGED' });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    expect(ctx.tabs.prepare).toHaveBeenCalledTimes(2);
    expect(ctx.tabs.start).toHaveBeenCalledTimes(2);
  });

  it('ERR_BM_CHANGED hai lần liên tiếp: pending có đếm lần thử', async () => {
    const ctx = setup();
    ctx.tabs.start.mockResolvedValue({ ok: false, code: 'ERR_BM_CHANGED' });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('pending'));
    expect(ctx.memory().attempts.j1).toBe(1);
  });

  it('không có tab BM và không mở được: pending có đếm lần thử', async () => {
    const ctx = setup();
    ctx.tabs.find.mockResolvedValue(undefined);
    ctx.tabs.open.mockResolvedValue(undefined);
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('pending'));
    expect(ctx.memory().attempts.j1).toBe(1);
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('ERR_INVALID_CONFIG từ engine: error, không retry', async () => {
    const ctx = setup();
    ctx.tabs.start.mockResolvedValueOnce({
      ok: false,
      code: 'ERR_INVALID_CONFIG',
    });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('error'));
    expect(ctx.last('j1')).toMatchObject({
      error: { code: 'ERR_INVALID_CONFIG' },
    });
  });

  it('ERR_CURFEW: giữ claimed, máy blocked curfew; hết hạn thì start lại', async () => {
    const owned: OwnJob[] = [];
    const ctx = setup({ owned });
    ctx.tabs.start.mockResolvedValueOnce({ ok: false, code: 'ERR_CURFEW' });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'blocked',
        block: { reason: 'curfew' },
      })
    );
    expect(ctx.statusOf('j1')).toBe('claimed');
    expect(ctx.memory().held?.jobId).toBe('j1');
    expect(ctx.tabs.start).toHaveBeenCalledTimes(1);
    // Chưa hết hạn: tick không start lại.
    owned.push({
      job: mkJob('j1', { state: { status: 'claimed' } }),
      claimedAt: T0,
    });
    await ctx.dispatcher.tick();
    expect(ctx.tabs.start).toHaveBeenCalledTimes(1);
    // Hết hạn: start lại đúng job đang giữ, không claim lại.
    ctx.clock.now += 61_000;
    await ctx.dispatcher.tick();
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    expect(ctx.tabs.start).toHaveBeenCalledTimes(2);
    expect(ctx.deps.claim).toHaveBeenCalledTimes(1);
    expect(ctx.memory().held).toBeUndefined();
  });
});

describe('jobDispatcher: cancel', () => {
  it('cancelRequested trong lúc chạy: gửi run.stop, job cancelled', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.cancel('j1');
    await vi.waitFor(() =>
      expect(ctx.tabs.stop).toHaveBeenCalledWith(7, 'run1')
    );
    ctx.dispatcher.onRunEvent(
      run({
        status: 'stopped',
        targets: [{ accountId: 'a', name: 'A', plan: 'run', outcome: 'done' }],
      }),
      7
    );
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('cancelled'));
    expect(ctx.last('j1')).toMatchObject({ result: { partial: true } });
  });

  it('job pending đã có cancelRequested không được claim', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1', { cancelRequested: true })]);
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });
});

describe('jobDispatcher: reconcile sau khi SW chết (§5.1 bước 0)', () => {
  it('running + run vẫn chạy: nối lại, chốt done khi run xong', async () => {
    const ctx = setup({
      owned: [
        { job: mkJob('j1', { state: { status: 'running' } }), runId: 'run1' },
      ],
    });
    ctx.tabs.sync.mockResolvedValue({ reachable: true, run: run() });
    ctx.dispatcher.setPending([]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({
        status: 'busy',
        currentJobId: 'j1',
      })
    );
    expect(ctx.tabs.start).not.toHaveBeenCalled();
    ctx.dispatcher.onRunEvent(run({ status: 'done' }), 7);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
  });

  it('running + run đã kết thúc trong lúc SW chết: chốt từ RunState', async () => {
    const ctx = setup({
      owned: [
        { job: mkJob('j1', { state: { status: 'running' } }), runId: 'run1' },
      ],
    });
    ctx.tabs.sync.mockResolvedValue({
      reachable: true,
      run: run({ status: 'done' }),
    });
    ctx.dispatcher.setPending([]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('running + không còn run (tab tải lại): error ERR_TAB_RELOADED, không chạy lại', async () => {
    const ctx = setup({
      owned: [
        { job: mkJob('j1', { state: { status: 'running' } }), runId: 'run1' },
      ],
    });
    ctx.dispatcher.setPending([]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('error'));
    expect(ctx.last('j1')).toMatchObject({
      error: { code: 'ERR_TAB_RELOADED' },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('claimed chưa có run (SW chết trước run.start): trả về pending, không dispatch trùng', async () => {
    const ctx = setup({
      owned: [{ job: mkJob('j1', { state: { status: 'claimed' } }) }],
    });
    ctx.dispatcher.setPending([]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('pending'));
    expect(ctx.memory().attempts.j1).toBe(1);
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('reconcile xong mới claim job mới', async () => {
    const ctx = setup({
      owned: [
        { job: mkJob('old', { state: { status: 'running' } }), runId: 'run1' },
      ],
    });
    ctx.tabs.sync.mockResolvedValue({ reachable: true, run: run() });
    ctx.dispatcher.setPending([mkJob('new', { createdAt: 5 })]);
    await vi.waitFor(() =>
      expect(ctx.dispatcher.view()).toMatchObject({ currentJobId: 'old' })
    );
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });
});

describe('jobDispatcher: tick (alarm)', () => {
  it('event run.state bị lỡ: tick đọc run.sync và chốt job', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.tabs.sync.mockResolvedValue({
      reachable: true,
      run: run({ status: 'done' }),
    });
    await ctx.dispatcher.tick();
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
  });

  it('tab mất liên lạc hai nhịp liên tiếp: error ERR_TAB_RELOADED', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    ctx.tabs.sync.mockResolvedValue({ reachable: false });
    await ctx.dispatcher.tick();
    expect(ctx.statusOf('j1')).toBe('running');
    await ctx.dispatcher.tick();
    expect(ctx.statusOf('j1')).toBe('error');
    expect(ctx.last('j1')).toMatchObject({
      error: { code: 'ERR_TAB_RELOADED' },
    });
  });

  it('logged-out: máy blocked tới khi thăm dò thấy tab BM đã đăng nhập', async () => {
    const ctx = setup({ memory: { loggedOut: true } });
    ctx.tabs.probe.mockResolvedValue(false);
    ctx.dispatcher.setPending([mkJob('j1')]);
    await ctx.dispatcher.tick();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
    expect(ctx.dispatcher.view()).toMatchObject({
      status: 'blocked',
      block: { reason: 'logged-out' },
    });
    ctx.tabs.probe.mockResolvedValue(true);
    await ctx.dispatcher.tick();
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
  });
});

describe('jobDispatcher: requests.scan', () => {
  const scanNode = {
    flow: 'requests.scan',
    config: { partnerName: 'BM ĐỐI TÁC' },
  };

  it('máy duyệt quét và ghi result.scan, không qua run.start', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.dispatcher.setPending([mkJob('s1', scanNode)]);
    await vi.waitFor(() => expect(ctx.statusOf('s1')).toBe('done'));
    expect(ctx.last('s1')).toMatchObject({
      result: { scan: { requests: [{ requester: 'R', account: 'A' }] } },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
    expect(ctx.tabs.scan).toHaveBeenCalledWith(7, 'BM ĐỐI TÁC');
    expect(ctx.tabs.prepare).toHaveBeenCalledWith(7, 'requests', BM);
  });

  it('tab đang có run: không quét chen, trả job về pending', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.tabs.sync.mockResolvedValue({ reachable: true, run: run() });
    ctx.dispatcher.setPending([mkJob('s1', scanNode)]);
    await vi.waitFor(() => expect(ctx.statusOf('s1')).toBe('pending'));
    expect(ctx.tabs.scan).not.toHaveBeenCalled();
  });

  it('không đọc được danh sách: error, không ghi requests rỗng', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.tabs.scan.mockResolvedValue({ ok: false, error: 'unreadable' });
    ctx.dispatcher.setPending([mkJob('s1', scanNode)]);
    await vi.waitFor(() => expect(ctx.statusOf('s1')).toBe('error'));
    expect(ctx.last('s1')).not.toHaveProperty('result');
  });
});

describe('jobDispatcher: sửa theo review bảo mật pha 2', () => {
  const approveNode = (extra: Record<string, unknown> = {}) => ({
    flow: 'partner-approve',
    mode: 'full',
    approval: 'human',
    approvedBy: 'uid-ops',
    createdBy: 'uid-ops',
    scanJobId: 'scan1',
    config: {
      partnerName: 'BM',
      action: 'approve',
      requests: [{ requester: 'R', account: 'A' }],
    },
    ...extra,
  });

  it('H1: đã ghi dấu gửi lệnh trước run.start; claimed có dấu khi reconcile thì chốt lỗi, không về pending', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    const marker = ctx.writes.findIndex(
      (entry) => entry.patch.dispatchingAt !== undefined
    );
    expect(marker).toBeGreaterThanOrEqual(0);
    expect(ctx.tabs.start).toHaveBeenCalledTimes(1);

    const lost = setup({
      owned: [
        {
          job: mkJob('j2', { state: { status: 'claimed' } }),
          dispatching: true,
        },
      ],
    });
    lost.tabs.sync.mockResolvedValue({ reachable: true, run: run() });
    lost.dispatcher.setPending([]);
    await vi.waitFor(() => expect(lost.statusOf('j2')).toBe('error'));
    expect(lost.last('j2')).toMatchObject({
      error: { code: 'ERR_STATE_UNKNOWN' },
    });
    expect(lost.tabs.stop).toHaveBeenCalledWith(7, 'run1');
    expect(lost.tabs.start).not.toHaveBeenCalled();
  });

  it('H1: start bị từ chối (ERR_BUSY) thì un-claim xoá dấu gửi lệnh', async () => {
    const ctx = setup();
    ctx.tabs.start.mockResolvedValueOnce({ ok: false, code: 'ERR_BUSY' });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('pending'));
    expect(ctx.last('j1')).toMatchObject({ dispatchingAt: null });
  });

  it('H2: kill-switch chưa biết thì không claim; có snapshot tắt thì chạy', async () => {
    const ctx = setup({ killUnknown: true });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
    ctx.dispatcher.setKill({ global: false, bm: false });
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
  });

  it('L5: listener kill-switch chết sau snapshot đầu thì máy ngừng claim (fail-closed)', async () => {
    const ctx = setup();
    ctx.dispatcher.killLost();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await settle();
    expect(ctx.deps.claim).not.toHaveBeenCalled();
  });

  it('H2: job full giữ chờ khoá, kill-switch bật rồi hết khoá: không start, chốt cancelled', async () => {
    const ctx = setup({
      flow: 'partner-approve',
      memory: {
        held: {
          jobId: 'f',
          block: { reason: 'curfew', until: T0 + 1000 },
        },
      },
      owned: [
        {
          job: mkJob('f', approveNode({ state: { status: 'claimed' } })),
          claimedAt: T0 - 5000,
        },
      ],
    });
    ctx.dispatcher.setKill({ global: false, bm: true });
    ctx.clock.now = T0 + 2000;
    await ctx.dispatcher.tick();
    await vi.waitFor(() => expect(ctx.statusOf('f')).toBe('cancelled'));
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('M2: job full thiếu dấu vết người duyệt bị chốt ERR_JOB_INVALID, không gửi lệnh', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.dispatcher.setPending([
      mkJob('f1', approveNode({ approval: undefined })),
      mkJob('f2', approveNode({ approvedBy: 'someone-else', createdAt: 2 })),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('f2')).toBe('error'));
    expect(ctx.last('f1')).toMatchObject({
      error: { code: 'ERR_JOB_INVALID', message: 'provenance' },
    });
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('M3: cancel đến trong lúc chuẩn bị tab thì không gửi run.start', async () => {
    const ctx = setup();
    ctx.tabs.prepare.mockImplementationOnce(async () => {
      ctx.cancel('j1');
      return { ok: true };
    });
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('cancelled'));
    expect(ctx.tabs.start).not.toHaveBeenCalled();
  });

  it('popup: job đang giữ máy được công bố khi claim và gỡ khi kết thúc', async () => {
    const ctx = setup();
    ctx.dispatcher.setPending([mkJob('j1')]);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('running'));
    expect(ctx.published).toContain('j1');
    ctx.dispatcher.onRunEvent(run({ status: 'done' }), 7);
    await vi.waitFor(() => expect(ctx.statusOf('j1')).toBe('done'));
    await vi.waitFor(() => expect(ctx.published.at(-1)).toBeUndefined());
  });

  it('M1: pump và tick chồng nhau chỉ reconcile một lần', async () => {
    const ctx = setup({
      owned: [{ job: mkJob('j1', { state: { status: 'claimed' } }) }],
    });
    await Promise.all([ctx.dispatcher.tick(), ctx.dispatcher.pump()]);
    expect(ctx.deps.readOwnJobs).toHaveBeenCalledTimes(1);
  });
});
