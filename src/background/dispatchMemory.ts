/**
 * dispatchMemory.ts — trạng thái bền của dispatcher (storage.local, sống qua SW bị giết và Chrome mở lại).
 * Chỉ giữ những gì không suy ra lại được từ RTDB: lịch sự cố cho ngưỡng N, mốc job duyệt `full`, số lần
 * thử mỗi job, job đang giữ chờ khoá hết hạn. Thuần dữ liệu, test không cần browser.
 */
import type { Block, Incident } from './dispatchLogic';

export const DISPATCH_KEY = 'remote:dispatch';

export type DispatchMemory = {
  incidents: Incident[];
  fullStarts: number[];
  // Số lần job bị trả về `pending` vì lỗi bề mặt/tab (tối đa MAX_SURFACE_ATTEMPTS).
  attempts: Record<string, number>;
  // Job đang `claimed` mà bị khoá an toàn chặn, kèm khoá; start lại khi hết hạn.
  held?: { jobId: string; block: Block };
  // Đang bị đăng xuất khỏi BM: chỉ người đăng nhập lại mới gỡ (thăm dò theo alarm).
  loggedOut?: boolean;
  // Sau ERR_BUSY/lỗi tab: không nhặt lại job trước mốc này.
  backoffUntil?: number;
};

export const EMPTY_MEMORY: DispatchMemory = {
  incidents: [],
  fullStarts: [],
  attempts: {},
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const REASONS: readonly string[] = [
  'emergency',
  'rate-limited',
  'curfew',
  'budget',
  'logged-out',
  'checkpoint',
];

function parseBlock(raw: unknown): Block | undefined {
  if (!isRecord(raw)) return undefined;
  const { reason, until } = raw;
  if (typeof reason !== 'string' || !REASONS.includes(reason)) return undefined;
  if (until !== null && !isFiniteNumber(until)) return undefined;
  return { reason: reason as Block['reason'], until };
}

// Dữ liệu lưu có thể thiếu hoặc hỏng: trường sai shape bị bỏ, không làm hỏng cả bộ nhớ.
export function parseMemory(raw: unknown): DispatchMemory {
  if (!isRecord(raw)) return { ...EMPTY_MEMORY };
  const incidents = Array.isArray(raw.incidents)
    ? raw.incidents.filter(
        (item): item is Incident =>
          isRecord(item) &&
          isFiniteNumber(item.at) &&
          typeof item.code === 'string'
      )
    : [];
  const fullStarts = Array.isArray(raw.fullStarts)
    ? raw.fullStarts.filter(isFiniteNumber)
    : [];
  const attempts: Record<string, number> = {};
  if (isRecord(raw.attempts))
    Object.entries(raw.attempts).forEach(([jobId, count]) => {
      if (isFiniteNumber(count) && count >= 0) attempts[jobId] = count;
    });
  const held =
    isRecord(raw.held) && typeof raw.held.jobId === 'string'
      ? { jobId: raw.held.jobId, block: parseBlock(raw.held.block) }
      : undefined;
  return {
    incidents,
    fullStarts,
    attempts,
    held: held?.block ? { jobId: held.jobId, block: held.block } : undefined,
    loggedOut: raw.loggedOut === true ? true : undefined,
    backoffUntil: isFiniteNumber(raw.backoffUntil)
      ? raw.backoffUntil
      : undefined,
  };
}
