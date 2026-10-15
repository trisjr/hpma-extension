import type { RemoteJob } from '@/shared/remoteJob';
import type { RunState } from '@/shared/run';
import { describe, expect, it, vi } from 'vitest';

import { DispatchMemory, EMPTY_MEMORY } from '@/background/dispatchMemory';
import createDispatcher, {
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

function setup(
  options: {
    owned?: OwnJob[];
    locks?: Partial<{ emergency: unknown; rateLimitedUntil: unknown }>;
    memory?: Partial<DispatchMemory>;
    flow?: 'partner-assign' | 'partner-approve';
  } = {}
) {
  const clock = { now: T0 };
  const writes: Write[] = [];
  const machine: MachinePatch[] = [];
  const status = new Map<string, string>();
  let memory: DispatchMemory = { ...EMPTY_MEMORY, ...options.memory };
  const cancelCallbacks = new Map<string, (cancelRequested: boolean) => void>();
  const errors: unknown[] = [];

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
    writeMachine: vi.fn(async (patch: MachinePatch) => {
      machine.push(patch);
    }),
    readOwnJobs: vi.fn(async () => options.owned ?? []),
    watchCancel: vi.fn((jobId, onChange) => {
      cancelCallbacks.set(jobId, onChange);
      return () => cancelCallbacks.delete(jobId);
    }),
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
        ...options.locks,
      })
    ),
    loadMemory: vi.fn(async () => memory),
    saveMemory: vi.fn(async (next: DispatchMemory) => {
      memory = next;
    }),
    tabs,
    onError: (error: unknown) => errors.push(error),
  };
  const dispatcher = createDispatcher(deps);
  return {
    dispatcher,
    deps,
    tabs,
    writes,
    machine,
    status,
    clock,
    errors,
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

  it('job full bị chặn khi allowlist chưa mở full', async () => {
    const ctx = setup({ flow: 'partner-approve' });
    ctx.dispatcher.setPending([
      mkJob('f', {
        flow: 'partner-approve',
        mode: 'full',
        config: {
          partnerName: 'BM',
          action: 'approve',
          requests: [{ requester: 'R', account: 'A' }],
        },
      }),
    ]);
    await vi.waitFor(() => expect(ctx.statusOf('f')).toBe('error'));
    expect(ctx.tabs.start).not.toHaveBeenCalled();
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
