/**
 * dispatchLogic.ts — phần thuần của dispatcher (SPEC-AUTO-001 §4.2, §5.1–5.4): cổng trước khi claim, ánh xạ
 * mã lỗi sang hành động, kết quả job, ngưỡng sự cố N (Q4) và trần job duyệt `full` mỗi ngày (Q4/Q11).
 * Không import Firebase hay `browser` để test không cần SDK; `jobDispatcher.ts` chỉ là lớp keo bên ngoài.
 */
import type { RemoteFlow, RemoteMode } from '@/shared/remoteJob';
import type { RunState } from '@/shared/run';
import type { CurfewConfig } from '@/shared/settings';

import { isEmergency, isRateLimited } from '@/shared/budget';
import { isCurfew } from '@/shared/settings';

export type MachineStatus = 'idle' | 'busy' | 'blocked';
export type BlockedReason =
  | 'emergency'
  | 'rate-limited'
  | 'curfew'
  | 'budget'
  | 'logged-out'
  | 'checkpoint';
// `until`: epoch ms (giờ máy) hết khoá; null = không có hạn, cần người gỡ tại profile.
export type Block = { reason: BlockedReason; until: number | null };

// Ngưỡng tạm dừng BM (Q4): đạt N sự cố checkpoint/CAPTCHA/rate-limit trong 24 giờ thì máy tự chặn cục bộ.
export const INCIDENT_THRESHOLD_N = 1;
export const INCIDENT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const BUSY_BACKOFF_MS = 5 * 60 * 1000;
export const MAX_SURFACE_ATTEMPTS = 3;
// Giữ job `claimed` chờ khoá có hạn tối đa từng ấy kể từ lúc claim, quá thì `error` (§5.2 b).
export const HOLD_MAX_MS = 24 * 60 * 60 * 1000;

export type Incident = { at: number; code: string };

export function isIncidentCode(code: string | undefined): boolean {
  return code === 'ERR_CHECKPOINT' || code === 'ERR_RATE_LIMITED';
}

function recent(
  times: readonly number[],
  now: number,
  windowMs: number
): number[] {
  return times.filter((time) => now - time < windowMs && time <= now + 1000);
}

// Khoá cục bộ do chính sự cố gây ra: độc lập với `coordinator watch` (CLI, chỉ chạy khi anh bật) nên máy không
// bao giờ phụ thuộc một tiến trình bên ngoài để dừng sau sự cố (fail-closed).
export function incidentBlock(
  incidents: readonly Incident[],
  now: number,
  threshold: number = INCIDENT_THRESHOLD_N
): Block | undefined {
  const inWindow = incidents.filter(
    (item) => now - item.at < INCIDENT_WINDOW_MS && item.at <= now + 1000
  );
  if (inWindow.length < threshold) return undefined;
  const latest = inWindow.reduce((a, b) => (b.at > a.at ? b : a));
  return {
    reason: latest.code === 'ERR_RATE_LIMITED' ? 'rate-limited' : 'checkpoint',
    until: latest.at + INCIDENT_WINDOW_MS,
  };
}

export function pruneIncidents(
  incidents: readonly Incident[],
  now: number
): Incident[] {
  return incidents.filter((item) => now - item.at < INCIDENT_WINDOW_MS);
}

// Đã có đủ `cap` lần bắt đầu job full trong 24 giờ thì chặn tới khi lần cũ nhất hết hạn.
// `cap` do người dùng đặt ở Options → Remote; `undefined` = không giới hạn (mặc định).
export function fullCapBlock(
  startedAts: readonly number[],
  now: number,
  cap: number | undefined
): Block | undefined {
  if (cap === undefined) return undefined;
  const inWindow = recent(startedAts, now, INCIDENT_WINDOW_MS);
  if (inWindow.length < cap) return undefined;
  return {
    reason: 'budget',
    until: Math.min(...inWindow) + INCIDENT_WINDOW_MS,
  };
}

export type GateInput = {
  now: number;
  machine: MachineStatus;
  killGlobal: boolean;
  killBm: boolean;
  emergency: unknown;
  rateLimitedUntil: unknown;
  incidents: readonly Incident[];
  // Mốc bắt đầu các job duyệt `full` gần đây của máy này.
  fullStarts: readonly number[];
  // Trần job full mỗi 24 giờ; `undefined` = không giới hạn.
  fullCap: number | undefined;
  job: { flow: RemoteFlow; mode: RemoteMode };
};

export type Gate =
  | { open: true }
  | { open: false; why: 'busy' | 'kill' }
  | { open: false; why: 'blocked'; block: Block };

// Cổng trước claim (§5.1 bước 2): dừng ở cổng đầu tiên không qua. Áp cho MỌI job kể cả dry/scan, vì engine
// bỏ qua các khoá này ở dry (D7).
export function claimGate(input: GateInput): Gate {
  if (input.machine === 'busy') return { open: false, why: 'busy' };
  if (input.killGlobal || input.killBm) return { open: false, why: 'kill' };
  if (isEmergency(input.emergency))
    return {
      open: false,
      why: 'blocked',
      block: { reason: 'emergency', until: null },
    };
  if (isRateLimited(input.rateLimitedUntil, input.now))
    return {
      open: false,
      why: 'blocked',
      block: {
        reason: 'rate-limited',
        until: input.rateLimitedUntil as number,
      },
    };
  const incident = incidentBlock(input.incidents, input.now);
  if (incident) return { open: false, why: 'blocked', block: incident };
  // Mỗi máy chỉ chạy một flow nên trần 3/ngày tính trên đúng flow của máy đó.
  if (input.job.mode === 'full') {
    const cap = fullCapBlock(input.fullStarts, input.now, input.fullCap);
    if (cap) return { open: false, why: 'blocked', block: cap };
  }
  return { open: true };
}

// ---- Thời điểm hết khoá ----------------------------------------------------

// Phút kế tiếp ngoài khung curfew (tối đa 24 giờ); curfew tắt thì chính `now`.
export function curfewEndsAt(now: number, curfew: CurfewConfig): number {
  if (!isCurfew(new Date(now), curfew)) return now;
  const minute = 60 * 1000;
  for (let step = 1; step <= 24 * 60; step += 1) {
    const at = now + step * minute;
    if (!isCurfew(new Date(at), curfew)) return at;
  }
  return now + 24 * 60 * minute;
}

// Đầu ngày (giờ máy) kế tiếp: ngân sách ghi tính theo ngày local (`budget.localDay`).
export function nextLocalMidnight(now: number): number {
  const date = new Date(now);
  date.setHours(24, 0, 0, 0);
  return date.getTime();
}

// ---- Ánh xạ StartReply / chuẩn bị tab (§5.2 a, b) ---------------------------

export type ReplyContext = {
  now: number;
  claimedAt: number;
  // Số lần job này đã bị trả về `pending` vì lỗi bề mặt/tab.
  attempts: number;
  // Đã điều hướng lại theo BM của máy một lần trong lượt dispatch này.
  renavigated: boolean;
  rateLimitedUntil?: number;
  curfew: CurfewConfig;
  writesPerDay: number;
  // Số lần ghi một job `full` cần (duyệt: số request; gán: số mẻ, cận dưới theo cỡ mẻ 10). Chỉ job ghi mới có.
  writesNeeded?: number;
};

export type ReplyAction =
  // Trả job về `pending` (un-claim), máy nghỉ `backoffMs` trước khi nhặt lại.
  | { kind: 'unclaim'; backoffMs: number; attempts: number }
  // Điều hướng lại theo `machine.businessId` rồi start lại một lần.
  | { kind: 'renavigate' }
  // Giữ `claimed`, máy `blocked`, start lại khi hết khoá.
  | { kind: 'hold'; block: Block }
  | { kind: 'error'; code: string; block?: Block };

function surfaceFailure(ctx: ReplyContext): ReplyAction {
  const attempts = ctx.attempts + 1;
  if (attempts > MAX_SURFACE_ATTEMPTS)
    return { kind: 'error', code: 'ERR_SURFACE_UNREACHABLE' };
  return { kind: 'unclaim', backoffMs: BUSY_BACKOFF_MS, attempts };
}

// Giữ tối thiểu từng này: khoá "hết hạn ngay" (vd. curfew đã tắt giữa chừng) không được gây quay vòng nóng.
export const MIN_HOLD_MS = 60 * 1000;

function holdOrExpire(
  ctx: ReplyContext,
  block: Block,
  code: string
): ReplyAction {
  if (ctx.now - ctx.claimedAt > HOLD_MAX_MS) return { kind: 'error', code };
  const until =
    block.until === null ? null : Math.max(block.until, ctx.now + MIN_HOLD_MS);
  return { kind: 'hold', block: { ...block, until } };
}

// Lỗi khi chuẩn bị tab (`ensureSurface`, tìm tab) — trước khi gửi lệnh.
export function mapPrepareError(code: string, ctx: ReplyContext): ReplyAction {
  if (code === 'ERR_BUSY')
    return {
      kind: 'unclaim',
      backoffMs: BUSY_BACKOFF_MS,
      attempts: ctx.attempts,
    };
  return surfaceFailure(ctx);
}

// `StartReply.code` của `run.start` (controller.ts:75–105).
export function mapStartReply(code: string, ctx: ReplyContext): ReplyAction {
  switch (code) {
    case 'ERR_BUSY':
      return {
        kind: 'unclaim',
        backoffMs: BUSY_BACKOFF_MS,
        attempts: ctx.attempts,
      };
    case 'ERR_BM_CHANGED':
    case 'ERR_NO_BUSINESS':
      return ctx.renavigated ? surfaceFailure(ctx) : { kind: 'renavigate' };
    case 'ERR_RATE_LIMITED':
      return holdOrExpire(
        ctx,
        {
          reason: 'rate-limited',
          until: ctx.rateLimitedUntil ?? ctx.now + HOLD_MAX_MS,
        },
        code
      );
    case 'ERR_CURFEW':
      return holdOrExpire(
        ctx,
        { reason: 'curfew', until: curfewEndsAt(ctx.now, ctx.curfew) },
        code
      );
    case 'ERR_BUDGET':
      // Job cần nhiều lần ghi hơn trần ngày thì không bao giờ vừa: chờ ngày sau cũng vô ích.
      if (ctx.writesNeeded !== undefined && ctx.writesNeeded > ctx.writesPerDay)
        return { kind: 'error', code };
      return holdOrExpire(
        ctx,
        { reason: 'budget', until: nextLocalMidnight(ctx.now) },
        code
      );
    case 'ERR_EMERGENCY':
      return {
        kind: 'error',
        code,
        block: { reason: 'emergency', until: null },
      };
    default:
      // ERR_INVALID_CONFIG, ERR_UNSUPPORTED_MODE và mọi mã lạ: lỗi từ phía người tạo job, không retry.
      return { kind: 'error', code };
  }
}

// ---- Kết quả job (§4.2, §4.4, §5.2 c) ---------------------------------------

export type JobCounts = {
  done: number;
  failed: number;
  skipped: number;
  unverified: number;
  pendingApproval: number;
  queued: number;
};

export type JobResult = {
  runId: string;
  runStatus: RunState['status'];
  counts: JobCounts;
  partial?: boolean;
  detail?: { code?: string; stepIndex?: number; lang?: string };
};

export type JobError = { code: string; message?: string; stepIndex?: number };

export type EndAction = {
  status: 'done' | 'error' | 'cancelled';
  result: JobResult;
  error?: JobError;
  // Khoá máy sau khi run kết thúc (checkpoint/đăng xuất/rate-limit).
  block?: Block;
  // Mã sự cố cần ghi vào bộ đếm N (Q4).
  incident?: string;
};

export function countTargets(run: RunState): JobCounts {
  const counts: JobCounts = {
    done: 0,
    failed: 0,
    skipped: 0,
    unverified: 0,
    pendingApproval: 0,
    queued: 0,
  };
  run.targets.forEach((target) => {
    switch (target.outcome) {
      case 'done':
        counts.done += 1;
        break;
      case 'failed':
        counts.failed += 1;
        break;
      case 'skipped-existing':
        counts.skipped += 1;
        break;
      case 'pending-approval':
        counts.pendingApproval += 1;
        break;
      case 'queued':
        counts.queued += 1;
        break;
      default:
        // `unverified` và `running` còn dở khi run dừng: không chắc đã ghi hay chưa nên không bao giờ retry.
        counts.unverified += 1;
    }
  });
  return counts;
}

function blockForRunError(
  code: string,
  rateLimitedUntil: number | undefined,
  now: number
): Block | undefined {
  if (code === 'ERR_CHECKPOINT') return { reason: 'checkpoint', until: null };
  if (code === 'ERR_LOGGED_OUT') return { reason: 'logged-out', until: null };
  if (code === 'ERR_RATE_LIMITED')
    return {
      reason: 'rate-limited',
      until: rateLimitedUntil ?? now + HOLD_MAX_MS,
    };
  return undefined;
}

// Run đã kết thúc (`isRunFinished`) → trạng thái cuối của job.
export function mapRunEnd(
  run: RunState,
  cancelRequested: boolean,
  now: number,
  rateLimitedUntil?: number
): EndAction {
  const counts = countTargets(run);
  const base: JobResult = {
    runId: run.runId,
    runStatus: run.status,
    counts,
  };
  if (run.status === 'done' || run.status === 'pending-approval')
    return { status: 'done', result: base };
  if (run.status === 'stopped') {
    const partial = counts.done + counts.failed + counts.unverified > 0;
    const result = partial ? { ...base, partial: true } : base;
    if (cancelRequested) return { status: 'cancelled', result };
    return {
      status: 'error',
      result,
      error: { code: 'ERR_STOPPED_LOCALLY' },
    };
  }
  // failed (và mọi trạng thái kết thúc lạ coi như lỗi).
  const code = run.error?.code ?? 'ERR_INTERNAL';
  return {
    status: 'error',
    // `result.detail` chỉ ghi khi logDetail ≠ off (SPEC-ENG-001 §8); mã lỗi vẫn nằm ở `error`.
    result: base,
    error: { code, stepIndex: run.error?.stepIndex },
    block: blockForRunError(code, rateLimitedUntil, now),
    incident: isIncidentCode(code) ? code : undefined,
  };
}
