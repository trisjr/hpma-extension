/**
 * jobDispatcher.ts — vòng tuần tự của service worker (SPEC-AUTO-001 §5): nhặt job `pending`, qua cổng an toàn,
 * claim, đưa tab BM tới đúng trang, gửi lệnh cho engine, báo trạng thái/kết quả, cancel, reconcile sau khi SW chết.
 *
 * Mọi phụ thuộc ngoài (RTDB, tab, storage) đi qua `DispatcherDeps` nên module này không import Firebase hay
 * `browser`: logic được test bằng bản giả. Chỉ một job chạy mỗi lúc; mọi chuyển trạng thái đều ghi lại
 * lên RTDB ngay, nên SW chết ở bất kỳ điểm nào cũng được `reconcile` nối lại hoặc chốt đúng.
 */
import type { RequestsReply } from '@/shared/approve';
import type { SurfaceResult } from '@/shared/hooks/ensureSurface';
import type { RunStartCommand, StartReply } from '@/shared/messaging';
import type { ProbeReports } from '@/shared/probe';
import type { MachineFlow, RemoteJob } from '@/shared/remoteJob';
import type { RunState } from '@/shared/run';
import type { CurfewConfig } from '@/shared/settings';
import type { Surface } from '@/shared/surfaces';
import type { Block, Gate, ReplyAction, ReplyContext } from './dispatchLogic';
import type { DispatchMemory } from './dispatchMemory';

import { parseApproveConfig } from '@/shared/approve';
import { SERVER_TIMESTAMP } from '@/shared/jobClaim';
import { approveGate, assignGate } from '@/shared/probe';
import {
  acceptsFlow,
  jobDispatchIssue,
  jobPartnerName,
} from '@/shared/remoteJob';
import { isRunActive, isRunFinished } from '@/shared/run';
import { parseRunConfig } from '@/shared/runConfig';

import {
  claimGate,
  MachineStatus,
  mapPrepareError,
  mapRunEnd,
  mapStartReply,
  MAX_SURFACE_ATTEMPTS,
  MIN_HOLD_MS,
  pruneIncidents,
} from './dispatchLogic';

const PROGRESS_THROTTLE_MS = 15_000;

export type MachineView = {
  status: MachineStatus;
  block?: Block;
  currentJobId?: string;
};

export type MachinePatch = {
  status: MachineStatus;
  blockedReason: string | null;
  blockedUntil: number | null;
  currentJobId: string | null;
};

// Job do chính máy này đang giữ (claimedBy = machineId, status claimed|running), kèm trường state cần để nối lại.
export const machinePatchOf = (view: MachineView): MachinePatch => ({
  status: view.status,
  blockedReason: view.block?.reason ?? null,
  blockedUntil: view.block?.until ?? null,
  currentJobId: view.currentJobId ?? null,
});

// `dispatching`: máy đã ghi `dispatchingAt` trước khi gửi `run.start`, nên run có thể đã chạm BM dù state chưa kịp `running`.
export type OwnJob = {
  job: RemoteJob;
  runId?: string;
  claimedAt?: number;
  dispatching?: boolean;
};

// Job đang giữ máy (claimed/running), để popup hiển thị kèm tiến độ.
export type ActiveJob = { job: RemoteJob; runId?: string };

export type SyncOutcome = { reachable: boolean; run?: RunState };

export type TabDriver = {
  // Tab BM của máy (§5.5.1); undefined nếu không có tab nào đúng BM.
  find: (businessId: string) => Promise<number | undefined>;
  // Mở tab active ở trang flow rồi đợi content script (§5.5.2); undefined nếu không tới được.
  open: (businessId: string, surface: Surface) => Promise<number | undefined>;
  prepare: (
    tabId: number,
    surface: Surface,
    businessId: string
  ) => Promise<SurfaceResult>;
  start: (
    tabId: number,
    command: RunStartCommand
  ) => Promise<StartReply | undefined>;
  scan: (
    tabId: number,
    partnerName: string
  ) => Promise<RequestsReply | undefined>;
  stop: (tabId: number, runId: string) => Promise<void>;
  sync: (tabId: number) => Promise<SyncOutcome>;
  clear: (tabId: number) => Promise<void>;
  // Có tab nào đang ở BM đích với trang đã đăng nhập (dùng để thoát `logged-out`).
  probe: (businessId: string) => Promise<boolean>;
};

export type Locks = {
  emergency: unknown;
  rateLimitedUntil: unknown;
  curfew: CurfewConfig;
  writesPerDay: number;
  // Trần job full mỗi 24 giờ (Options → Remote); undefined = không giới hạn.
  fullCap: number | undefined;
};

export type DispatcherDeps = {
  now: () => number;
  machineId: string;
  businessId: string;
  flow: MachineFlow;
  // RTDB
  claim: (jobId: string) => Promise<boolean>;
  writeState: (jobId: string, patch: Record<string, unknown>) => Promise<void>;
  writeMachine: (patch: MachinePatch) => Promise<void>;
  // Cục bộ: công bố job đang chạy cho popup (undefined = không có).
  publishActive: (active: ActiveJob | undefined) => Promise<void>;
  // Cục bộ: công bố trạng thái máy (idle/busy/blocked + lý do) để popup giải thích vì sao job chưa chạy.
  publishMachine?: (patch: MachinePatch) => Promise<void>;
  readOwnJobs: () => Promise<OwnJob[]>;
  watchCancel: (
    jobId: string,
    onChange: (cancelRequested: boolean) => void
  ) => () => void;
  // Cục bộ
  readLocks: () => Promise<Locks>;
  // Báo cáo probe đã lưu của profile này (cổng probe ≥ 95% cho job duyệt `full`, Q4).
  readProbe: () => Promise<ProbeReports>;
  loadMemory: () => Promise<DispatchMemory>;
  saveMemory: (memory: DispatchMemory) => Promise<void>;
  tabs: TabDriver;
  onError: (error: unknown) => void;
};

type Current = {
  job: RemoteJob;
  tabId?: number;
  runId?: string;
  cancelRequested: boolean;
  lastProgressAt: number;
  lastRunStatus?: string;
  unreachable: number;
  finishing?: boolean;
  unwatch?: () => void;
};

export type Dispatcher = {
  setPending: (jobs: RemoteJob[]) => void;
  setKill: (flags: { global: boolean; bm: boolean }) => void;
  killLost: () => void;
  onRunEvent: (run: RunState, tabId: number | undefined) => void;
  tick: () => Promise<void>;
  pump: () => Promise<void>;
  view: () => MachineView;
};

const surfaceOf = (flow: RemoteJob['flow']): Surface =>
  flow === 'partner-assign' ? 'settings' : 'requests';

export default function createDispatcher(deps: DispatcherDeps): Dispatcher {
  let pending: RemoteJob[] = [];
  let kill = { global: false, bm: false };
  // Chưa nhận snapshot kill-switch đầu tiên thì coi là đóng: không claim/start (fail-closed).
  let killKnown = false;
  let current: Current | undefined;
  let memory: DispatchMemory | undefined;
  let reconciled = false;
  let reconciling: Promise<void> | undefined;
  let pumping = false;
  let again = false;
  let lastGateBlock: Block | undefined;
  let view: MachineView = { status: 'idle' };
  let lastWritten = '';
  let lastActive = '';

  const guard = (work: Promise<unknown>): void => {
    work.catch(deps.onError);
  };

  // `Current` là bản ghi đổi dần theo vòng đời job; sửa qua một chỗ này để thấy rõ mọi điểm đổi.
  const patchCurrent = (cur: Current, patch: Partial<Current>): void => {
    Object.assign(cur, patch);
  };

  async function mem(): Promise<DispatchMemory> {
    if (!memory) memory = await deps.loadMemory();
    return memory;
  }

  async function persist(
    patch: (m: DispatchMemory) => DispatchMemory
  ): Promise<DispatchMemory> {
    const next = patch(await mem());
    memory = next;
    await deps.saveMemory(next);
    return next;
  }

  // Công bố job đang giữ máy cho popup; chỉ ghi khi id/runId đổi.
  function syncActive(): void {
    const key = current ? `${current.job.id}/${current.runId ?? ''}` : '';
    if (key === lastActive) return;
    lastActive = key;
    guard(
      deps.publishActive(
        current ? { job: current.job, runId: current.runId } : undefined
      )
    );
  }

  // Ghi máy lên RTDB khi view đổi (idle/busy/blocked + lý do + job đang giữ).
  async function setView(next: MachineView): Promise<void> {
    view = next;
    syncActive();
    const patch = machinePatchOf(next);
    const key = JSON.stringify(patch);
    if (key === lastWritten) return;
    // Công bố cục bộ trước khi ghi RTDB: ghi RTDB có thể treo khi mất mạng, popup vẫn phải thấy lý do khoá.
    if (deps.publishMachine) guard(deps.publishMachine(patch));
    lastWritten = key;
    await deps.writeMachine(patch).catch((error: unknown) => {
      lastWritten = '';
      deps.onError(error);
    });
  }

  function idleView(): MachineView {
    const held = memory?.held;
    if (held)
      return { status: 'blocked', block: held.block, currentJobId: held.jobId };
    if (memory?.loggedOut)
      return {
        status: 'blocked',
        block: { reason: 'logged-out', until: null },
      };
    if (lastGateBlock) return { status: 'blocked', block: lastGateBlock };
    return { status: 'idle' };
  }

  async function release(): Promise<void> {
    current?.unwatch?.();
    current = undefined;
    await setView(idleView());
  }

  // ---- Báo job lỗi / kết thúc ----------------------------------------------

  async function failJob(
    job: RemoteJob,
    code: string,
    message?: string
  ): Promise<void> {
    await deps.writeState(job.id, {
      status: 'error',
      finishedAt: SERVER_TIMESTAMP,
      error: { code, ...(message ? { message } : {}) },
    });
  }

  // Chốt `cancelled` cho job chưa chạm BM rồi nhả máy.
  async function cancelJob(job: RemoteJob): Promise<void> {
    await deps.writeState(job.id, {
      status: 'cancelled',
      finishedAt: SERVER_TIMESTAMP,
    });
    await persist((m) => ({
      ...m,
      held: m.held?.jobId === job.id ? undefined : m.held,
    }));
    await release();
  }

  async function unclaim(
    job: RemoteJob,
    attempts: number,
    backoffMs: number
  ): Promise<void> {
    await deps.writeState(job.id, {
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      dispatchingAt: null,
    });
    await persist((m) => ({
      ...m,
      attempts: { ...m.attempts, [job.id]: attempts },
      held: m.held?.jobId === job.id ? undefined : m.held,
      backoffUntil: deps.now() + backoffMs,
    }));
  }

  async function finishRun(cur: Current, run: RunState): Promise<void> {
    if (current !== cur || cur.finishing) return;
    patchCurrent(cur, { finishing: true });
    const locks = await deps.readLocks();
    const limitedUntil =
      typeof locks.rateLimitedUntil === 'number'
        ? locks.rateLimitedUntil
        : undefined;
    const now = deps.now();
    const end = mapRunEnd(
      run,
      cur.cancelRequested || kill.global || kill.bm,
      now,
      limitedUntil
    );
    // Giải phóng trước khi ghi: sự kiện/tick đến trùng không chốt job hai lần.
    current = undefined;
    cur.unwatch?.();
    await deps.writeState(cur.job.id, {
      status: end.status,
      finishedAt: SERVER_TIMESTAMP,
      result: end.result,
      error: end.error ?? null,
      runStatus: null,
      pauseReason: null,
    });
    if (cur.tabId !== undefined)
      await deps.tabs.clear(cur.tabId).catch(() => undefined);
    await persist((m) => ({
      ...m,
      incidents: end.incident
        ? [...pruneIncidents(m.incidents, now), { at: now, code: end.incident }]
        : m.incidents,
      loggedOut: end.block?.reason === 'logged-out' ? true : m.loggedOut,
    }));
    lastGateBlock = undefined;
    await setView(idleView());
  }

  // Job `claimed` chưa chạm BM: xử lý theo ReplyAction (§5.2).
  async function applyAction(
    job: RemoteJob,
    action: ReplyAction
  ): Promise<'retry' | 'settled'> {
    switch (action.kind) {
      case 'renavigate':
        return 'retry';
      case 'unclaim':
        await unclaim(job, action.attempts, action.backoffMs);
        await release();
        return 'settled';
      case 'hold':
        // Engine đã từ chối start nên run chưa chạm BM: bỏ dấu "đang gửi lệnh" để reclaim còn hợp lệ.
        await deps.writeState(job.id, { dispatchingAt: null });
        await persist((m) => ({
          ...m,
          held: { jobId: job.id, block: action.block },
        }));
        current?.unwatch?.();
        current = undefined;
        await setView(idleView());
        return 'settled';
      default:
        await failJob(job, action.code);
        if (action.code === 'ERR_EMERGENCY') lastGateBlock = action.block;
        await persist((m) => ({
          ...m,
          held: m.held?.jobId === job.id ? undefined : m.held,
        }));
        await release();
        return 'settled';
    }
  }

  async function replyContext(
    job: RemoteJob,
    claimedAt: number,
    renavigated: boolean
  ): Promise<ReplyContext> {
    const [locks, m] = await Promise.all([deps.readLocks(), mem()]);
    let writesNeeded: number | undefined;
    if (job.flow === 'partner-approve')
      writesNeeded = parseApproveConfig(job.config)?.requests.length;
    else if (job.flow === 'partner-assign' && job.mode === 'full') {
      const queries = parseRunConfig(job.config)?.queries.length;
      writesNeeded =
        queries === undefined ? undefined : Math.ceil(queries / 10);
    }
    return {
      now: deps.now(),
      claimedAt,
      attempts: m.attempts[job.id] ?? 0,
      renavigated,
      rateLimitedUntil:
        typeof locks.rateLimitedUntil === 'number'
          ? locks.rateLimitedUntil
          : undefined,
      curfew: locks.curfew,
      writesPerDay: locks.writesPerDay,
      writesNeeded,
    };
  }

  function startCommand(job: RemoteJob): RunStartCommand | undefined {
    const config =
      job.flow === 'partner-approve'
        ? parseApproveConfig(job.config)
        : parseRunConfig(job.config);
    if (!config || job.flow === 'requests.scan') return undefined;
    return {
      kind: 'run.start',
      requestId: `remote-${job.id}`,
      flow: job.flow,
      mode: job.mode,
      config,
      businessId: job.businessId,
    };
  }

  function watch(cur: Current): void {
    const unwatch = deps.watchCancel(cur.job.id, (requested) => {
      if (!requested || current !== cur || cur.cancelRequested) return;
      patchCurrent(cur, { cancelRequested: true });
      if (cur.tabId !== undefined && cur.runId)
        guard(deps.tabs.stop(cur.tabId, cur.runId));
    });
    patchCurrent(cur, { unwatch });
  }

  async function runScan(cur: Current, ctx: ReplyContext): Promise<void> {
    const { job, tabId } = cur;
    const partner = jobPartnerName(job);
    if (tabId === undefined || partner === undefined) {
      await failJob(job, 'ERR_JOB_INVALID', 'config');
      await release();
      return;
    }
    const { run } = await deps.tabs.sync(tabId);
    if (run && isRunActive(run)) {
      await applyAction(job, mapStartReply('ERR_BUSY', ctx));
      return;
    }
    const reply = await deps.tabs.scan(tabId, partner);
    if (!reply) {
      await applyAction(job, mapPrepareError('ERR_TAB_RELOADED', ctx));
      return;
    }
    if (!reply.ok) {
      if (reply.error === 'busy')
        await applyAction(job, mapStartReply('ERR_BUSY', ctx));
      else {
        await failJob(job, 'ERR_SCAN_FAILED', reply.error);
        await release();
      }
      return;
    }
    // Kết quả rỗng chỉ hợp lệ khi tab đã xác nhận đúng trang Requests (reply.ok); lỗi đọc đã thành error ở trên.
    await deps.writeState(job.id, {
      status: 'done',
      finishedAt: SERVER_TIMESTAMP,
      result: { scan: { requests: reply.requests } },
      error: null,
    });
    await release();
  }

  async function beginRunning(cur: Current, runId: string): Promise<void> {
    patchCurrent(cur, {
      runId,
      lastProgressAt: deps.now(),
      lastRunStatus: 'running',
    });
    syncActive();
    await deps.writeState(cur.job.id, {
      status: 'running',
      startedAt: SERVER_TIMESTAMP,
      progressAt: SERVER_TIMESTAMP,
      runId,
      runStatus: 'running',
    });
    await persist((m) => ({
      ...m,
      held: m.held?.jobId === cur.job.id ? undefined : m.held,
    }));
    // Cancel/kill đến trong lúc đang start: dừng ngay khi run đã có.
    if (cur.cancelRequested || kill.global || kill.bm) {
      patchCurrent(cur, { cancelRequested: true });
      if (cur.tabId !== undefined) await deps.tabs.stop(cur.tabId, runId);
    }
  }

  // `ownsMachine`: job này chính là job đang giữ máy (kiểm lại trước khi start) nên không tính là "busy".
  async function gateFor(job: RemoteJob, ownsMachine = false): Promise<Gate> {
    const [locks, m] = await Promise.all([deps.readLocks(), mem()]);
    return claimGate({
      now: deps.now(),
      machine: current && !ownsMachine ? 'busy' : 'idle',
      killGlobal: kill.global,
      killBm: kill.bm,
      emergency: locks.emergency,
      rateLimitedUntil: locks.rateLimitedUntil,
      incidents: m.incidents,
      fullStarts: m.fullStarts,
      fullCap: locks.fullCap,
      job: { flow: job.flow, mode: job.mode },
    });
  }

  // Job đã được claim (hoặc đang giữ chờ khoá): đưa tab tới trang, gửi lệnh, ghi `running`.
  // `renavigated`: đã điều hướng lại theo BM của máy một lần (engine báo sai BM) — chỉ thử lại đúng một lần.
  async function dispatch(
    cur: Current,
    claimedAt: number,
    renavigated = false
  ): Promise<void> {
    const { job } = cur;
    const issue = jobDispatchIssue(job);
    if (issue || !acceptsFlow(deps.flow, job.flow)) {
      await failJob(job, 'ERR_JOB_INVALID', issue ?? 'flow');
      await release();
      return;
    }
    if (job.cancelRequested) {
      await cancelJob(job);
      return;
    }
    // Job `full` ghi thật lên Meta: chỉ chạy khi selector các màn của flow đó vừa được đo và đạt ≥ 95% (Q4).
    if (job.mode === 'full') {
      const check = job.flow === 'partner-assign' ? assignGate : approveGate;
      const gate = check(await deps.readProbe(), deps.now());
      if (!gate.ok) {
        const detail = (['missing', 'below', 'stale'] as const)
          .filter((kind) => gate[kind].length > 0)
          .map((kind) => `${kind}:${gate[kind].join('+')}`)
          .join(' ');
        await failJob(job, 'ERR_PROBE_GATE', detail);
        await release();
        return;
      }
    }
    const surface = surfaceOf(job.flow);
    const tabId =
      (await deps.tabs.find(job.businessId)) ??
      (await deps.tabs.open(job.businessId, surface));
    const ctx = await replyContext(job, claimedAt, renavigated);
    if (tabId === undefined) {
      await applyAction(job, mapPrepareError('ERR_TAB_RELOADED', ctx));
      return;
    }
    patchCurrent(cur, { tabId });
    const prepared = await deps.tabs.prepare(tabId, surface, job.businessId);
    if (!prepared.ok) {
      await applyAction(job, mapPrepareError(prepared.code, ctx));
      return;
    }
    if (job.flow === 'requests.scan') {
      await runScan(cur, ctx);
      return;
    }
    const command = startCommand(job);
    if (!command) {
      await failJob(job, 'ERR_JOB_INVALID', 'config');
      await release();
      return;
    }
    // Cổng cuối ngay trước khi chạm BM: cancel/kill/khoá đến trong lúc chuẩn bị tab, hoặc job giữ chờ khoá vừa
    // được resume, đều phải bị chặn tại đây (mọi đường tới `run.start` đi qua điểm này).
    if (cur.cancelRequested || kill.global || kill.bm || !killKnown) {
      await cancelJob(job);
      return;
    }
    const last = await gateFor(job, true);
    if (!last.open) {
      const block = last.why === 'blocked' ? last.block : undefined;
      if (!block) {
        await cancelJob(job);
        return;
      }
      await applyAction(
        job,
        block.reason === 'emergency'
          ? { kind: 'error', code: 'ERR_EMERGENCY', block }
          : {
              kind: 'hold',
              block: {
                ...block,
                until:
                  block.until === null
                    ? null
                    : Math.max(block.until, deps.now() + MIN_HOLD_MS),
              },
            }
      );
      return;
    }
    // Ghi dấu "đang gửi lệnh" TRƯỚC run.start (D9): từ đây job không bao giờ được trả về `pending`, vì run có thể
    // đã chạm BM dù lần ghi `running` chưa tới server.
    await deps.writeState(job.id, { dispatchingAt: SERVER_TIMESTAMP });
    // Đếm vào trần ngày TRƯỚC khi gửi lệnh: SW chết giữa chừng vẫn không làm hụt đếm.
    const countsFull = job.mode === 'full';
    if (countsFull)
      await persist((m) => ({
        ...m,
        fullStarts: [...m.fullStarts, deps.now()],
      }));
    const reply = await deps.tabs.start(tabId, command);
    if (reply?.ok) {
      await beginRunning(cur, reply.runId);
      return;
    }
    if (countsFull)
      await persist((m) => ({ ...m, fullStarts: m.fullStarts.slice(0, -1) }));
    const action = mapStartReply(reply ? reply.code : 'ERR_TAB_RELOADED', ctx);
    const outcome = await applyAction(job, action);
    if (outcome === 'retry') await dispatch(cur, claimedAt, true);
  }

  // ---- Reconcile sau khi SW khởi động/wake (§5.1 bước 0) -------------------

  async function reconcileOne(own: OwnJob): Promise<void> {
    const { job } = own;
    const m = await mem();
    if (m.held?.jobId === job.id) return;
    const tabId = await deps.tabs.find(job.businessId);
    const synced: SyncOutcome =
      tabId === undefined ? { reachable: false } : await deps.tabs.sync(tabId);
    const cur: Current = {
      job,
      tabId,
      runId: own.runId,
      cancelRequested: job.cancelRequested,
      lastProgressAt: deps.now(),
      unreachable: 0,
    };
    if (job.status === 'running') {
      const { run } = synced;
      current = cur;
      if (run && run.runId === own.runId) {
        if (isRunFinished(run)) {
          await finishRun(cur, run);
          return;
        }
        watch(cur);
        await setView({ status: 'busy', currentJobId: job.id });
        return;
      }
      // Run đã mất (tab tải lại): không tự chạy lại (D9).
      current = undefined;
      await failJob(job, 'ERR_TAB_RELOADED');
      await setView(idleView());
      return;
    }
    // Đã ghi dấu "đang gửi lệnh" mà chưa thấy `running`: run có thể đã chạm BM, không tự chạy lại và không biết
    // kết quả (D9). Dừng run còn sống (nếu thấy) rồi chốt lỗi, không bao giờ về `pending`.
    if (own.dispatching) {
      if (tabId !== undefined && synced.run && isRunActive(synced.run))
        await deps.tabs.stop(tabId, synced.run.runId).catch(() => undefined);
      await failJob(job, 'ERR_STATE_UNKNOWN');
      return;
    }
    // Bị huỷ khi đang `claimed` (chưa chạm BM): chốt `cancelled`, không start.
    if (job.cancelRequested) {
      await deps.writeState(job.id, {
        status: 'cancelled',
        finishedAt: SERVER_TIMESTAMP,
      });
      return;
    }
    // `claimed` chưa có run (SW chết trước run.start): trả về pending, tính vào số lần thử.
    const attempts = (m.attempts[job.id] ?? 0) + 1;
    if (attempts > MAX_SURFACE_ATTEMPTS) {
      await failJob(job, 'ERR_SURFACE_UNREACHABLE');
      return;
    }
    await unclaim(job, attempts, 0);
  }

  async function reconcile(): Promise<void> {
    const owned = await deps.readOwnJobs();
    for (let i = 0; i < owned.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await reconcileOne(owned[i]);
    }
    reconciled = true;
  }

  // Một lần reconcile duy nhất cho mọi người gọi (pump và tick có thể chồng nhau): hai lần chạy song song
  // có thể trả về `pending` một job vừa được claim lại.
  async function ensureReconciled(): Promise<void> {
    if (reconciled) return;
    reconciling ??= reconcile().finally(() => {
      reconciling = undefined;
    });
    await reconciling;
  }

  // Job đang giữ chờ khoá hết hạn: start lại khi đến hạn (§5.1 "Thoát blocked").
  async function resumeHeld(): Promise<void> {
    const m = await mem();
    if (!m.held || current) return;
    const { held } = m;
    if (held.block.until !== null && deps.now() < held.block.until) return;
    const owned = (await deps.readOwnJobs()).find(
      (own) => own.job.id === held.jobId
    );
    if (!owned) {
      await persist((next) => ({ ...next, held: undefined }));
      await setView(idleView());
      return;
    }
    await persist((next) => ({ ...next, held: undefined }));
    current = {
      job: owned.job,
      cancelRequested: owned.job.cancelRequested,
      lastProgressAt: deps.now(),
      unreachable: 0,
    };
    watch(current);
    await setView({ status: 'busy', currentJobId: owned.job.id });
    await dispatch(current, owned.claimedAt ?? deps.now());
  }

  // ---- Vòng nhặt job -------------------------------------------------------

  async function pumpOnce(): Promise<void> {
    await ensureReconciled();
    if (current || !killKnown) return;
    const m = await mem();
    if (m.held) {
      await resumeHeld();
      return;
    }
    if (m.loggedOut) {
      await setView(idleView());
      return;
    }
    if (m.backoffUntil && deps.now() < m.backoffUntil) return;
    const job = [...pending]
      .filter(
        (candidate) =>
          acceptsFlow(deps.flow, candidate.flow) && !candidate.cancelRequested
      )
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    if (!job) {
      lastGateBlock = undefined;
      await setView(idleView());
      return;
    }
    const gate = await gateFor(job);
    if (!gate.open) {
      lastGateBlock = gate.why === 'blocked' ? gate.block : undefined;
      await setView(idleView());
      return;
    }
    lastGateBlock = undefined;
    const won = await deps.claim(job.id);
    pending = pending.filter((candidate) => candidate.id !== job.id);
    if (!won) {
      again = true;
      return;
    }
    const claimedAt = deps.now();
    const cur: Current = {
      job,
      cancelRequested: false,
      lastProgressAt: claimedAt,
      unreachable: 0,
    };
    current = cur;
    watch(cur);
    await setView({ status: 'busy', currentJobId: job.id });
    await dispatch(cur, claimedAt);
    again = true;
  }

  async function pump(): Promise<void> {
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    try {
      do {
        again = false;
        // eslint-disable-next-line no-await-in-loop
        await pumpOnce();
      } while (again);
    } catch (error) {
      deps.onError(error);
    } finally {
      pumping = false;
    }
  }

  // ---- Sự kiện từ ngoài ----------------------------------------------------

  function onRunEvent(run: RunState, tabId: number | undefined): void {
    const cur = current;
    if (!cur || cur.runId !== run.runId) return;
    if (cur.tabId !== undefined && tabId !== undefined && cur.tabId !== tabId)
      return;
    if (isRunFinished(run)) {
      guard(finishRun(cur, run).then(() => pump()));
      return;
    }
    const now = deps.now();
    if (
      run.status === cur.lastRunStatus &&
      now - cur.lastProgressAt < PROGRESS_THROTTLE_MS
    )
      return;
    cur.lastProgressAt = now;
    cur.lastRunStatus = run.status;
    guard(
      deps.writeState(cur.job.id, {
        progressAt: SERVER_TIMESTAMP,
        runStatus: run.status,
        pauseReason: run.pauseReason ?? null,
      })
    );
  }

  // Listener kill-switch bị huỷ (token hết hạn, permission): không còn biết trạng thái thật, coi là đóng.
  function killLost(): void {
    killKnown = false;
  }

  function setKill(flags: { global: boolean; bm: boolean }): void {
    kill = flags;
    killKnown = true;
    const cur = current;
    if ((flags.global || flags.bm) && cur && !cur.cancelRequested) {
      cur.cancelRequested = true;
      if (cur.tabId !== undefined && cur.runId)
        guard(deps.tabs.stop(cur.tabId, cur.runId));
    }
    guard(pump());
  }

  function setPending(jobs: RemoteJob[]): void {
    pending = jobs;
    guard(pump());
  }

  // Alarm 1 phút: nguồn sự thật cho run kết thúc khi event bị lỡ, thoát `logged-out`, start lại job giữ chờ.
  async function tick(): Promise<void> {
    await ensureReconciled();
    const cur = current;
    if (cur && cur.tabId !== undefined && cur.runId) {
      const synced = await deps.tabs.sync(cur.tabId);
      if (!synced.reachable) {
        cur.unreachable += 1;
      } else if (synced.run && synced.run.runId === cur.runId) {
        cur.unreachable = 0;
        if (isRunFinished(synced.run)) await finishRun(cur, synced.run);
      } else {
        // Tab còn nhưng run đã mất (tải lại trang): D9, không tự chạy lại.
        current = undefined;
        cur.unwatch?.();
        await failJob(cur.job, 'ERR_TAB_RELOADED');
        await setView(idleView());
      }
      if (current === cur && cur.unreachable >= 2) {
        current = undefined;
        cur.unwatch?.();
        await failJob(cur.job, 'ERR_TAB_RELOADED');
        await setView(idleView());
      }
    }
    const m = await mem();
    if (m.loggedOut && (await deps.tabs.probe(deps.businessId))) {
      await persist((next) => ({ ...next, loggedOut: undefined }));
      await setView(idleView());
    }
    await pump();
  }

  return {
    setPending,
    setKill,
    killLost,
    onRunEvent,
    tick,
    pump,
    view: () => view,
  };
}
