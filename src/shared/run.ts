/**
 * run.ts — hợp đồng RunState giữa UI và engine + bộ máy mô phỏng thuần
 * (SPEC-UI-003). Chưa có engine thật: `advance` là hàm thuần dùng cho simulator,
 * không gửi message nào tới content script và không chạm DOM trang BM.
 */
import type { ApproveAction } from '@/shared/approve';
import type { MessageKey } from '@/shared/i18n';
import type {
  AdAccount,
  PartnerAssignConfig,
  PartnerTask,
} from '@/shared/partnerAssign';

import { isApproveAction } from '@/shared/approve';

export const STEP_COUNT = 7;
export const WRITE_STEP = 6;
export const VERIFY_STEP = 7;

// Flow của run; vắng trong `RunState` (run cũ, simulator) nghĩa là 'partner-assign'.
export type RunFlow = 'partner-assign' | 'partner-approve';

export const STEP_TITLE_KEYS: readonly MessageKey[] = [
  'run.step.1',
  'run.step.2',
  'run.step.3',
  'run.step.4',
  'run.step.5',
  'run.step.6',
  'run.step.7',
];

// Cùng bộ 7 bước (bước 6 ghi, bước 7 verify) nhưng tiêu đề riêng cho flow duyệt request.
export const APPROVE_STEP_TITLE_KEYS: readonly MessageKey[] = [
  'approve.step.1',
  'approve.step.2',
  'approve.step.3',
  'approve.step.4',
  'approve.step.5',
  'approve.step.6',
  'approve.step.7',
];

// Bước 5–7 đổi theo quyết định user chọn (Approve hoặc Decline); bước 1–4 giống nhau.
export const DECLINE_STEP_TITLE_KEYS: readonly MessageKey[] = [
  ...APPROVE_STEP_TITLE_KEYS.slice(0, 4),
  'approve.step.5.decline',
  'approve.step.6.decline',
  'approve.step.7.decline',
];

export function isApproveRun(run: { flow?: RunFlow }): boolean {
  return run.flow === 'partner-approve';
}

export type RunMode = 'dry' | 'assist' | 'full';
export type RunPhase = 'locate' | 'act' | 'verify';
export const RUN_PHASES: readonly RunPhase[] = ['locate', 'act', 'verify'];
export type PhaseState = 'idle' | 'run' | 'done' | 'skip' | 'fail';
export type StepState =
  | 'pending'
  | 'running'
  | 'ok'
  | 'waiting'
  | 'skipped'
  | 'failed';

export type RunStep = {
  index: number;
  titleKey: MessageKey;
  state: StepState;
  phases: Record<RunPhase, PhaseState>;
  isWrite: boolean;
};

export type TargetOutcome =
  | 'queued'
  | 'running'
  | 'done'
  | 'skipped-existing'
  | 'failed'
  | 'pending-approval'
  // Đã (hoặc có thể đã) ghi nhưng không đọc lại được: không bao giờ retry.
  | 'unverified';

export type RunTarget = {
  accountId: string;
  name: string;
  // 'skip': TKQC đã đủ quyền (idempotent), engine không thao tác.
  plan: 'run' | 'skip';
  outcome: TargetOutcome;
  // Mã lỗi riêng của target (engine), vd. ERR_TARGET_NOT_FOUND.
  code?: string;
};

// Mã lỗi của engine thật (SPEC-ENG-001 §7). Simulator dùng thêm vài mã cũ.
export type EngineErrorCode =
  | 'ERR_BUSY'
  | 'ERR_INVALID_CONFIG'
  | 'ERR_UNSUPPORTED_MODE'
  | 'ERR_CURFEW'
  | 'ERR_BUDGET'
  | 'ERR_EMERGENCY'
  | 'ERR_RATE_LIMITED'
  | 'ERR_WRONG_SURFACE'
  | 'ERR_NO_BUSINESS'
  | 'ERR_SURFACE_TIMEOUT'
  | 'ERR_UNEXPECTED_DIALOG'
  | 'ERR_LOCATE_TIMEOUT'
  | 'ERR_LOCATE_AMBIGUOUS'
  | 'ERR_STEP_TIMEOUT'
  | 'ERR_TYPE_MISMATCH'
  | 'ERR_PERMISSION_MISMATCH'
  | 'ERR_EXISTING_PERMISSIONS'
  | 'ERR_TARGET_NOT_FOUND'
  | 'ERR_TARGET_AMBIGUOUS'
  | 'ERR_NO_TARGETS'
  | 'ERR_VERIFY_UNREADABLE'
  | 'ERR_CHECKPOINT'
  | 'ERR_LOGGED_OUT'
  | 'ERR_TAB_RELOADED'
  | 'ERR_BM_CHANGED'
  // Flow duyệt: không thấy cú bấm đúng quyết định đã chọn và request vẫn ở Needs review.
  | 'ERR_NOT_APPROVED'
  // Flow duyệt: nút bấm là nút ngược với quyết định đã chọn (vd. chọn Approve nhưng bấm Decline).
  // Vẫn là một lần ghi thật lên Meta nên được tính vào ngân sách và audit.
  | 'ERR_WRONG_ACTION'
  | 'ERR_INTERNAL';

export type RunStatus =
  | 'running'
  | 'waiting-user'
  | 'paused'
  | 'done'
  | 'pending-approval'
  | 'failed'
  | 'stopped';

export type RunScenario = 'done' | 'pending' | 'failed' | 'disconnect';
export const RUN_SCENARIOS: readonly RunScenario[] = [
  'done',
  'pending',
  'failed',
  'disconnect',
];

// `detail` chỉ có khi Devtest logDetail ≠ off (khoá locator, ngôn ngữ trang).
export type RunError = { code: string; stepIndex: number; detail?: string };

// 'disconnect': mất tab BM (panel re-sync). 'hidden': tab BM bị ẩn, engine tự chạy tiếp.
export type PauseReason = 'disconnect' | 'hidden';

// ---- Log của run (tab Log) ------------------------------------------------

export const LOG_LIMIT = 200;
export type LogLevel = 'ok' | 'warn' | 'error';
export const LOG_LEVELS: readonly LogLevel[] = ['ok', 'warn', 'error'];
// Mỗi mã ứng với một khoá i18n `log.code.<mã>`; không bao giờ chứa chữ từ trang BM.
export type LogCode =
  | 'run.start'
  | 'run.end'
  | 'step.start'
  | 'step.ok'
  | 'step.skip'
  | 'step.wait'
  | 'step.fail'
  | 'locate.fallback';

export type RunLogEntry = {
  at: number;
  // 1..7; 0 cho chính run.
  step: number;
  phase?: RunPhase;
  level: LogLevel;
  code: LogCode;
  // Chỉ có khi logDetail ≠ off (SPEC-UI-004 §5.2).
  key?: string;
  tier?: 1 | 2 | 3 | 4;
  // Tên TKQC; chỉ khi logDetail = verbose.
  detail?: string;
};

export type RunBatch = { index: number; total: number };

export type RunState = {
  runId: string;
  mode: RunMode;
  status: RunStatus;
  // true: do simulator sinh ra (chip "Mô phỏng"); false: engine thật.
  simulated: boolean;
  pauseReason?: PauseReason;
  // Mẻ hiện tại (≤ BATCH_SIZE TKQC mỗi mẻ); simulator luôn 1/1.
  batch: RunBatch;
  // Engine không ghi được audit (storage lỗi): UI nêu rõ.
  auditFailed: boolean;
  scenario: RunScenario;
  startedAt: number;
  endedAt?: number;
  // Tuỳ chọn để `lastRun` lưu bởi bản cũ vẫn parse được; vắng = 'partner-assign'.
  flow?: RunFlow;
  // Flow duyệt: tên BM đối tác (thay cho `partnerBmId`, luôn '' ở flow duyệt).
  partnerName?: string;
  // Flow duyệt: quyết định user chọn cho cả lượt (vắng ở run cũ = 'approve').
  action?: ApproveAction;
  partnerBmId: string;
  tasks: PartnerTask[];
  targets: RunTarget[];
  currentTarget: number;
  steps: RunStep[];
  // stepIndex: bước đang xử lý (1..7); sub 0 = chưa bắt đầu, 1 = đang chạy.
  stepIndex: number;
  sub: 0 | 1;
  disconnectDone: boolean;
  error?: RunError;
  // `lastRun` lưu bởi v0.4.0 chưa có trường này: đọc bằng `runLog`, không đọc thẳng.
  log: RunLogEntry[];
};

function isLogEntry(value: unknown): value is RunLogEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === 'number' &&
    typeof entry.step === 'number' &&
    typeof entry.code === 'string' &&
    LOG_LEVELS.some((level) => level === entry.level) &&
    (entry.key === undefined || typeof entry.key === 'string') &&
    (entry.detail === undefined || typeof entry.detail === 'string') &&
    (entry.tier === undefined || [1, 2, 3, 4].includes(entry.tier as number))
  );
}

// Dữ liệu lưu có thể thiếu hoặc hỏng: bỏ dòng sai shape để một dòng xấu không làm trắng panel.
export function runLog(run: RunState): RunLogEntry[] {
  return Array.isArray(run.log) ? run.log.filter(isLogEntry) : [];
}

export function appendLog(run: RunState, entry: RunLogEntry): RunState {
  return { ...run, log: [...runLog(run), entry].slice(-LOG_LIMIT) };
}

export function filterByLevel(
  entries: readonly RunLogEntry[],
  level: LogLevel | 'all'
): RunLogEntry[] {
  return level === 'all'
    ? [...entries]
    : entries.filter((entry) => entry.level === level);
}

export function countByLevel(
  entries: readonly RunLogEntry[]
): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = { ok: 0, warn: 0, error: 0 };
  entries.forEach((entry) => {
    counts[entry.level] += 1;
  });
  return counts;
}

const ACTIVE_STATUSES: readonly RunStatus[] = [
  'running',
  'waiting-user',
  'paused',
];

export function isRunActive(run: RunState | undefined): boolean {
  return run !== undefined && ACTIVE_STATUSES.includes(run.status);
}

export function isRunFinished(run: RunState | undefined): boolean {
  return run !== undefined && !ACTIVE_STATUSES.includes(run.status);
}

// ---- Diff -----------------------------------------------------------------

// 'unknown': chế độ engine, chưa đọc được partner hiện có (FR-08).
export type DiffOp = 'add' | 'change' | 'skip' | 'unknown';

export type DiffRow = {
  account: AdAccount;
  op: DiffOp;
  existing: PartnerTask[];
  adding: PartnerTask[];
};

// TODO(FR-08): "đã có partner" phải lấy từ flow đọc kiểm kê. Đến lúc đó đây là
// dữ liệu mẫu theo artboard Diff (Spa Hoa/Shop Lan 02/Nha khoa An).
const SAMPLE_EXISTING_TASKS: Record<string, PartnerTask[]> = {
  act_238100451187: ['ANALYZE'],
  act_771203349902: ['ADVERTISE', 'ANALYZE', 'MANAGE'],
};

// `engine`: accountIds là ID chọn hoặc mục nhập tay; "đã có" chưa đọc được.
export function buildDiff(
  config: PartnerAssignConfig,
  accounts: AdAccount[],
  engine = false
): DiffRow[] {
  return config.accountIds.map((id) => {
    const account = accounts.find((item) => item.id === id) ?? {
      id,
      name: id,
      status: 'active' as const,
    };
    if (engine) {
      return {
        account,
        op: 'unknown' as DiffOp,
        existing: [],
        adding: config.tasks,
      };
    }
    const existing = SAMPLE_EXISTING_TASKS[id] ?? [];
    const adding = config.tasks.filter((task) => !existing.includes(task));
    let op: DiffOp = 'change';
    if (existing.length === 0) op = 'add';
    else if (adding.length === 0) op = 'skip';
    return { account, op, existing, adding };
  });
}

// ---- Run state machine ----------------------------------------------------

export function newRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `run_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function pendingSteps(
  flow: RunFlow = 'partner-assign',
  action: ApproveAction = 'approve'
): RunStep[] {
  let titleKeys = STEP_TITLE_KEYS;
  if (flow === 'partner-approve') {
    titleKeys =
      action === 'decline' ? DECLINE_STEP_TITLE_KEYS : APPROVE_STEP_TITLE_KEYS;
  }
  return titleKeys.map((titleKey, i) => ({
    index: i + 1,
    titleKey,
    state: 'pending',
    phases: { locate: 'idle', act: 'idle', verify: 'idle' },
    isWrite: i + 1 === WRITE_STEP,
  }));
}

export function startEntry(now: number): RunLogEntry {
  return { at: now, step: 0, level: 'ok', code: 'run.start' };
}

export function createRun(params: {
  mode: RunMode;
  scenario: RunScenario;
  config: PartnerAssignConfig;
  diff: DiffRow[];
  now: number;
}): RunState {
  const { mode, scenario, config, diff, now } = params;
  return {
    runId: newRunId(),
    mode,
    status: 'running',
    simulated: true,
    batch: { index: 1, total: 1 },
    auditFailed: false,
    scenario,
    startedAt: now,
    partnerBmId: config.partnerBmId,
    tasks: config.tasks,
    targets: diff.map((row) => ({
      accountId: row.account.id,
      name: row.account.name,
      plan: row.op === 'skip' ? 'skip' : 'run',
      outcome: 'queued',
    })),
    currentTarget: 0,
    steps: pendingSteps(),
    stepIndex: 1,
    sub: 0,
    disconnectDone: false,
    log: [startEntry(now)],
  };
}

const END_LEVEL: Partial<Record<RunStatus, LogLevel>> = {
  done: 'ok',
  'pending-approval': 'warn',
  stopped: 'warn',
  failed: 'error',
};

export function patchStep(
  run: RunState,
  index: number,
  patch: Partial<RunStep>
): RunStep[] {
  return run.steps.map((step) =>
    step.index === index ? { ...step, ...patch } : step
  );
}

export function patchTarget(
  run: RunState,
  index: number,
  outcome: TargetOutcome
): RunTarget[] {
  return run.targets.map((target, i) =>
    i === index ? { ...target, outcome } : target
  );
}

// Kịch bản "failed" làm hỏng TKQC thứ hai cần chạy (hoặc TKQC đầu nếu chỉ có một).
function failTargetIndex(run: RunState): number {
  const runnable = run.targets
    .map((target, i) => ({ target, i }))
    .filter(({ target }) => target.plan === 'run');
  return (runnable[1] ?? runnable[0])?.i ?? -1;
}

function failStepIndex(mode: RunMode): number {
  return mode !== 'dry' ? WRITE_STEP : 4;
}

export function finish(
  run: RunState,
  status: RunStatus,
  now: number
): RunState {
  return appendLog(
    { ...run, status, endedAt: now },
    { at: now, step: 0, level: END_LEVEL[status] ?? 'ok', code: 'run.end' }
  );
}

function logStep(
  run: RunState,
  now: number,
  code: LogCode,
  level: LogLevel = 'ok'
): RunState {
  return appendLog(run, {
    at: now,
    step: run.stepIndex,
    level,
    code,
  });
}

// Chuyển sang TKQC kế tiếp hoặc kết thúc run.
function nextTarget(run: RunState, now: number): RunState {
  const next = run.currentTarget + 1;
  if (next >= run.targets.length) return finish(run, 'done', now);
  return {
    ...run,
    currentTarget: next,
    steps: pendingSteps(),
    stepIndex: 1,
    sub: 0,
  };
}

function startStep(run: RunState, now: number): RunState {
  const { stepIndex, mode, currentTarget } = run;
  const target = run.targets[currentTarget];
  const running: RunStep[] = patchStep(run, stepIndex, {
    state: 'running',
    phases: { locate: 'done', act: 'run', verify: 'idle' },
  });

  if (
    run.scenario === 'disconnect' &&
    !run.disconnectDone &&
    currentTarget === 0 &&
    stepIndex === 4
  ) {
    return {
      ...run,
      status: 'paused',
      pauseReason: 'disconnect',
      disconnectDone: true,
    };
  }

  if (
    run.scenario === 'failed' &&
    currentTarget === failTargetIndex(run) &&
    stepIndex === failStepIndex(mode)
  ) {
    const code = mode !== 'dry' ? 'ERR_ACT_REJECTED' : 'ERR_LOCATE_TIMEOUT';
    return finish(
      logStep(
        {
          ...run,
          targets: patchTarget(run, currentTarget, 'failed'),
          steps: patchStep(run, stepIndex, {
            state: 'failed',
            phases: { locate: 'done', act: 'fail', verify: 'idle' },
          }),
          error: { code, stepIndex },
        },
        now,
        'step.fail',
        'error'
      ),
      'failed',
      now
    );
  }

  if (stepIndex === WRITE_STEP) {
    if (mode === 'dry') {
      // Dry-run không bao giờ thực thi bước ghi (FR-03).
      return {
        ...logStep(run, now, 'step.skip'),
        steps: patchStep(run, stepIndex, {
          state: 'skipped',
          phases: { locate: 'idle', act: 'skip', verify: 'skip' },
        }),
        stepIndex: stepIndex + 1,
        sub: 0,
        targets: patchTarget(run, currentTarget, 'running'),
      };
    }
    return {
      ...logStep(run, now, 'step.wait', 'warn'),
      status: 'waiting-user',
      steps: patchStep(run, stepIndex, {
        state: 'waiting',
        phases: { locate: 'done', act: 'idle', verify: 'idle' },
      }),
    };
  }

  if (stepIndex === VERIFY_STEP && mode === 'dry') {
    const closed: RunState = {
      ...logStep(run, now, 'step.skip'),
      steps: patchStep(run, stepIndex, {
        state: 'skipped',
        phases: { locate: 'skip', act: 'skip', verify: 'skip' },
      }),
      targets: patchTarget(run, currentTarget, 'done'),
    };
    return nextTarget(closed, now);
  }

  return {
    ...logStep(run, now, 'step.start'),
    steps: running,
    sub: 1,
    targets:
      target.outcome === 'queued'
        ? patchTarget(run, currentTarget, 'running')
        : run.targets,
  };
}

function completeStep(run: RunState, now: number): RunState {
  const done: RunState = {
    ...logStep(run, now, 'step.ok'),
    steps: patchStep(run, run.stepIndex, {
      state: 'ok',
      phases: { locate: 'done', act: 'done', verify: 'done' },
    }),
  };
  if (run.stepIndex >= VERIFY_STEP) {
    return nextTarget(
      { ...done, targets: patchTarget(done, run.currentTarget, 'done') },
      now
    );
  }
  return { ...done, stepIndex: run.stepIndex + 1, sub: 0 };
}

// Một nhịp của simulator. Chỉ có tác dụng khi status = 'running'.
export function advance(run: RunState, now: number): RunState {
  if (run.status !== 'running') return run;
  const target = run.targets[run.currentTarget];
  if (target.plan === 'skip') {
    return nextTarget(
      {
        ...run,
        targets: patchTarget(run, run.currentTarget, 'skipped-existing'),
      },
      now
    );
  }
  return run.sub === 0 ? startStep(run, now) : completeStep(run, now);
}

// User xác nhận đã tự bấm Assign trong tab BM (Assist).
export function confirmAssist(run: RunState, now: number): RunState {
  if (run.status !== 'waiting-user') return run;
  const confirmed: RunState = {
    ...run,
    status: 'running',
    steps: patchStep(run, WRITE_STEP, {
      state: 'ok',
      phases: { locate: 'done', act: 'done', verify: 'done' },
    }),
    stepIndex: VERIFY_STEP,
    sub: 0,
  };
  if (run.scenario === 'pending') {
    // BM yêu cầu admin thứ 2 duyệt: không replay, kết thúc ngay (FR-04).
    return finish(
      {
        ...confirmed,
        targets: patchTarget(confirmed, run.currentTarget, 'pending-approval'),
      },
      'pending-approval',
      now
    );
  }
  return confirmed;
}

export function resyncRun(run: RunState): RunState {
  return run.status === 'paused' ? { ...run, status: 'running' } : run;
}

export function stopRun(run: RunState, now: number): RunState {
  if (!isRunActive(run)) return run;
  return finish(run, 'stopped', now);
}

export function isRunState(value: unknown): value is RunState {
  if (typeof value !== 'object' || value === null) return false;
  const run = value as Partial<RunState>;
  return (
    typeof run.runId === 'string' &&
    typeof run.status === 'string' &&
    (run.mode === 'dry' || run.mode === 'assist' || run.mode === 'full') &&
    Array.isArray(run.targets) &&
    Array.isArray(run.steps) &&
    Array.isArray(run.tasks) &&
    (run.flow === undefined ||
      run.flow === 'partner-assign' ||
      run.flow === 'partner-approve') &&
    (run.partnerName === undefined || typeof run.partnerName === 'string') &&
    (run.action === undefined || isApproveAction(run.action)) &&
    typeof run.startedAt === 'number'
  );
}
