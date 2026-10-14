/**
 * runner.ts — chạy một flow trong content script (SPEC-ENG-001 §3, §5, §7–8).
 * Giữ `RunState` (nguồn sự thật, phát snapshot mỗi lần đổi), cổng curfew/visibility,
 * nhịp nghỉ, watcher nguy hiểm, và chốt kết quả + audit + ngân sách khi kết thúc.
 */
import type { AuditDetail } from '@/shared/audit';
import type {
  LogCode,
  LogLevel,
  PhaseState,
  RunError,
  RunMode,
  RunPhase,
  RunState,
  StepState,
  TargetOutcome,
} from '@/shared/run';
import type { RunConfig } from '@/shared/runConfig';
import type { PacingConfig } from '@/shared/settings';
import type { PauseKind } from './delay';
import type { ActionContext } from './primitives';
import type { DangerCode } from './signals';

import { rowsFromRun } from '@/shared/audit';
import { appendLog, finish, patchStep } from '@/shared/run';
import { isCurfew } from '@/shared/settings';

import { computeDelayMs } from './delay';
import EngineError from './errors';
import { sleep } from './primitives';
import { createEngineRun, newEngineRunId, settle } from './runState';
import RunStopped, { throwIfAborted } from './stop';
import {
  appendAudit,
  bumpWriteBudget,
  raiseEmergency,
  raiseRateLimit,
  saveLastRun,
} from './store';
import startWatchers from './watchers';

export type StepHandle = {
  // Đã định vị xong, bắt đầu thao tác (locate → act).
  acted: () => void;
};

export type FlowContext = ActionContext & {
  mode: RunMode;
  config: RunConfig;
  batchSize: number;
  pacing: PacingConfig;
  state: () => RunState;
  pause: (kind: PauseKind) => Promise<void>;
  beginBatch: (index: number, total: number, targets: number[]) => void;
  step: <T>(
    index: number,
    body: (handle: StepHandle) => Promise<T>
  ) => Promise<T>;
  skipStep: (index: number, phases: Record<RunPhase, PhaseState>) => void;
  setTarget: (index: number, outcome: TargetOutcome, code?: string) => void;
  // Assist: dừng chờ user; trả về khi user báo `assistDone` (hoặc huỷ run).
  waitForAssistDone: () => Promise<void>;
  setWaiting: (waiting: boolean) => void;
};

export type Flow = (ctx: FlowContext) => Promise<void>;

export type RunHandle = {
  stop: () => void;
  assistDone: () => void;
  snapshot: () => RunState;
  done: Promise<RunState>;
};

type StartParams = {
  mode: RunMode;
  config: RunConfig;
  // Mốc cho guard đổi BM: BM panel đã chọn (đã khớp URL lúc start).
  businessId: string;
  pacing: PacingConfig;
  logDetail: AuditDetail;
  flow: Flow;
  onState: (run: RunState) => void;
};

function toError(
  error: unknown,
  stepIndex: number,
  logDetail: AuditDetail,
  lang: string
): RunError {
  const code = error instanceof EngineError ? error.code : 'ERR_INTERNAL';
  const parts: string[] = [];
  if (error instanceof EngineError && error.detail) parts.push(error.detail);
  if (!(error instanceof EngineError) && error instanceof Error) {
    parts.push(error.name);
  }
  parts.push(`lang=${lang || '?'}`);
  return {
    code,
    stepIndex,
    ...(logDetail === 'off' ? {} : { detail: parts.join(' ') }),
  };
}

// `lastRun` nằm trong storage tới khi user bấm "Xong": ở mức log `off` không lưu tên/ID TKQC
// hay BM ID đối tác (cùng cam kết "không PII mặc định" như audit). Snapshot trong bộ nhớ giữ nguyên.
function redactForStorage(run: RunState, logDetail: AuditDetail): RunState {
  if (logDetail !== 'off') return run;
  return {
    ...run,
    partnerBmId: '',
    targets: run.targets.map((item, i) => ({
      ...item,
      accountId: `TKQC #${i + 1}`,
      name: `TKQC #${i + 1}`,
    })),
  };
}

export function startRun(params: StartParams): RunHandle {
  const { mode, config, businessId, pacing, logDetail, flow, onState } = params;
  const abort = new AbortController();
  const { signal } = abort;
  // `lang` do trang kiểm soát: chỉ nhận dạng mã ngôn ngữ ngắn, còn lại coi như không biết.
  const rawLang = document.documentElement.lang ?? '';
  const lang = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(rawLang) ? rawLang : '';
  const batchSize = Math.min(10, pacing.limits.standard.maxBatch);
  let state = createEngineRun({
    mode,
    config,
    batchSize,
    now: Date.now(),
    runId: newEngineRunId(),
  });
  let danger: DangerCode | undefined;
  let resolveAssist: (() => void) | undefined;
  // Từ lúc Assist chờ user bấm Assign, một lần ghi có thể đã tới Meta dù run kết thúc bất thường.
  let reachedAssign = false;

  const update = (change: (run: RunState) => RunState): void => {
    state = change(state);
    onState(state);
  };

  // Mỗi lần đổi trạng thái step kèm một dòng log (nếu có `entry`) trong cùng một snapshot.
  const setStepState = (
    index: number,
    patch: { state: StepState; phases: Record<RunPhase, PhaseState> },
    entry?: { code: LogCode; level: LogLevel; phase?: RunPhase }
  ): void =>
    update((run) => {
      const next = { ...run, steps: patchStep(run, index, patch) };
      if (!entry) return next;
      const target = run.targets[run.currentTarget];
      return appendLog(next, {
        at: Date.now(),
        step: index,
        ...entry,
        // Tên TKQC chỉ vào log ở mức verbose (SPEC-UI-004 §5.2).
        ...(logDetail === 'verbose' && target ? { detail: target.name } : {}),
      });
    });

  // Cổng trước mỗi hành động: curfew (chỉ Assist, vì Dry không ghi) và tab hiển thị.
  const gate = async (): Promise<void> => {
    throwIfAborted(signal);
    if (mode === 'assist' && isCurfew(new Date(), pacing.curfew)) {
      throw new EngineError('ERR_CURFEW');
    }
    if (document.visibilityState === 'visible') return;
    update((run) => ({ ...run, status: 'paused', pauseReason: 'hidden' }));
    await new Promise<void>((resolve, reject) => {
      // Cả hai listener gắn vào `local.signal`: `local.abort()` gỡ chúng cùng lúc.
      const local = new AbortController();
      document.addEventListener(
        'visibilitychange',
        () => {
          if (document.visibilityState !== 'visible') return;
          local.abort();
          resolve();
        },
        { signal: local.signal }
      );
      signal.addEventListener(
        'abort',
        () => {
          local.abort();
          reject(new RunStopped());
        },
        { once: true, signal: local.signal }
      );
    });
    update((run) => ({ ...run, status: 'running', pauseReason: undefined }));
  };

  const ctx: FlowContext = {
    signal,
    lang,
    gate,
    onTier: (key, tier) => {
      if (tier <= 1 || tier > 4) return;
      update((run) =>
        appendLog(run, {
          at: Date.now(),
          step: run.stepIndex,
          phase: 'locate',
          level: 'warn',
          code: 'locate.fallback',
          // key/tier chỉ từ mức basic trở lên.
          ...(logDetail === 'off' ? {} : { key, tier: tier as 1 | 2 | 3 | 4 }),
        })
      );
    },
    mode,
    config,
    batchSize,
    pacing,
    state: () => state,
    pause: async (kind) => {
      await gate();
      await sleep(computeDelayMs(kind, pacing), signal);
      await gate();
    },
    beginBatch: (index, total, targets) =>
      update((run) => ({
        ...run,
        batch: { index, total },
        currentTarget: targets[0] ?? run.currentTarget,
        steps: run.steps.map((item) => ({
          ...item,
          state: 'pending',
          phases: { locate: 'idle', act: 'idle', verify: 'idle' },
        })),
        stepIndex: 1,
        sub: 0,
      })),
    step: async (index, body) => {
      setStepState(
        index,
        {
          state: 'running',
          phases: { locate: 'run', act: 'idle', verify: 'idle' },
        },
        { code: 'step.start', level: 'ok', phase: 'locate' }
      );
      update((run) => ({ ...run, stepIndex: index, sub: 1 }));
      try {
        const result = await body({
          acted: () =>
            setStepState(index, {
              state: 'running',
              phases: { locate: 'done', act: 'run', verify: 'idle' },
            }),
        });
        setStepState(
          index,
          {
            state: 'ok',
            phases: { locate: 'done', act: 'done', verify: 'done' },
          },
          { code: 'step.ok', level: 'ok' }
        );
        return result;
      } catch (error) {
        if (!(error instanceof RunStopped)) {
          const acting = state.steps[index - 1]?.phases.act === 'run';
          setStepState(
            index,
            {
              state: 'failed',
              phases: {
                locate: acting ? 'done' : 'fail',
                act: acting ? 'fail' : 'idle',
                verify: 'idle',
              },
            },
            {
              code: 'step.fail',
              level: 'error',
              phase: acting ? 'act' : 'locate',
            }
          );
        }
        throw error;
      }
    },
    skipStep: (index, phases) => {
      setStepState(
        index,
        { state: 'skipped', phases },
        { code: 'step.skip', level: 'ok' }
      );
      update((run) => ({ ...run, stepIndex: index, sub: 0 }));
    },
    setTarget: (index, outcome, code) =>
      update((run) => ({
        ...run,
        targets: run.targets.map((item, i) =>
          i === index
            ? {
                ...item,
                outcome,
                // Đã đủ quyền từ trước: tính là bỏ qua, không phải "chưa xong".
                plan: outcome === 'skipped-existing' ? 'skip' : item.plan,
                ...(code === undefined ? {} : { code }),
              }
            : item
        ),
      })),
    waitForAssistDone: () =>
      new Promise<void>((resolve, reject) => {
        const onAbort = (): void => reject(new RunStopped());
        resolveAssist = () => {
          signal.removeEventListener('abort', onAbort);
          resolveAssist = undefined;
          resolve();
        };
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    // Chờ user bấm Assign: bước ghi hiện "chờ bạn", xong thì trở lại đang chạy.
    setWaiting: (waiting) => {
      if (waiting) reachedAssign = true;
      update((run) => ({
        ...run,
        status: waiting ? 'waiting-user' : 'running',
        log: waiting
          ? appendLog(run, {
              at: Date.now(),
              step: run.stepIndex,
              level: 'warn',
              code: 'step.wait',
            }).log
          : run.log,
        steps: patchStep(run, run.stepIndex, {
          state: waiting ? 'waiting' : 'running',
          phases: waiting
            ? { locate: 'done', act: 'idle', verify: 'idle' }
            : { locate: 'done', act: 'run', verify: 'idle' },
        }),
      }));
    },
  };

  const execute = async (): Promise<RunState> => {
    const stopWatching = startWatchers(businessId, (code) => {
      danger = code;
      abort.abort();
    });
    let error: RunError | undefined;
    let stopped = false;
    try {
      await flow(ctx);
    } catch (thrown) {
      if (danger !== undefined) {
        error = { code: danger, stepIndex: state.stepIndex };
      } else if (thrown instanceof RunStopped) {
        stopped = true;
      } else {
        error = toError(thrown, state.stepIndex, logDetail, lang);
      }
    } finally {
      stopWatching();
    }

    const now = Date.now();
    let final: RunState;
    if (stopped) {
      final = finish(state, 'stopped', now);
    } else if (error) {
      final = { ...finish(state, 'failed', now), error };
    } else {
      const outcome = settle(state);
      final = { ...finish(state, outcome.status, now), error: outcome.error };
    }
    final = { ...final, pauseReason: undefined };
    if (reachedAssign) {
      // Run kết thúc bất thường (Dừng, tín hiệu nguy hiểm, quá hạn chờ, lỗi verify) sau
      // khi user có thể đã bấm Assign: target còn `running` không rõ đã ghi hay chưa.
      // Chuyển sang `unverified` để vẫn có audit, tính ngân sách và không bị đề nghị chạy lại.
      final = {
        ...final,
        targets: final.targets.map((item) =>
          item.outcome === 'running'
            ? { ...item, outcome: 'unverified' as const }
            : item
        ),
      };
    }

    // Assist đã tới bước user bấm Assign thì tính một lần ghi (đếm thừa an toàn hơn đếm thiếu):
    // `done`, `pending-approval` và `unverified` đều có thể đã gửi yêu cầu tới Meta.
    const wrote =
      mode === 'assist' &&
      final.targets.some((item) =>
        ['done', 'pending-approval', 'unverified'].includes(item.outcome)
      );
    const auditOk = await appendAudit(rowsFromRun(final, logDetail), now);
    if (!auditOk) final = { ...final, auditFailed: true };
    if (wrote) await bumpWriteBudget(now);
    // Chỉ checkpoint/danh tính mới khoá khẩn cấp; mất phiên chỉ dừng run (file 19 §6.1).
    if (danger === 'ERR_RATE_LIMITED') await raiseRateLimit(now);
    else if (danger === 'ERR_CHECKPOINT') await raiseEmergency(now);
    await saveLastRun(redactForStorage(final, logDetail));
    state = final;
    onState(final);
    return final;
  };

  // Phát snapshot đầu tiên để panel thấy run ngay khi `run.start` trả về.
  onState(state);
  const done = execute();

  return {
    stop: () => abort.abort(),
    assistDone: () => resolveAssist?.(),
    snapshot: () => state,
    done,
  };
}
