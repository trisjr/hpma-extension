/**
 * budget.ts — bộ đếm ghi/ngày (FR-06) và khoá an toàn của engine (SPEC-ENG-001
 * §7–8). Thuần dữ liệu: engine (content script) ghi, side panel/Options đọc.
 * Options không bao giờ ghi `writeBudget` (SPEC-UI-004).
 */

export const WRITE_BUDGET_KEY = 'writeBudget';
// Dừng khẩn cấp (checkpoint/đăng nhập): epoch ms lúc dừng; chỉ user mới xoá.
export const EMERGENCY_KEY = 'engine:emergencyStop';
// Bị Meta chặn tần suất: epoch ms hết hạn khoá Assist.
export const RATE_LIMIT_KEY = 'engine:rateLimitedUntil';
export const RATE_LIMIT_MS = 24 * 60 * 60 * 1000;

export type WriteBudgetValue = { day: string; used: number };

// Ngày theo giờ máy, 'yyyy-mm-dd'.
export function localDay(now: number): string {
  const date = new Date(now);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseBudget(raw: unknown): WriteBudgetValue | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { day, used } = raw as Partial<WriteBudgetValue>;
  if (typeof day !== 'string' || typeof used !== 'number') return undefined;
  if (!Number.isFinite(used) || used < 0) return undefined;
  return { day, used: Math.floor(used) };
}

// Ngày khác hôm nay (hoặc dữ liệu hỏng, kể cả bản cũ không có `day`) tính là 0.
export function budgetUsed(raw: unknown, now: number): number {
  const value = parseBudget(raw);
  return value !== undefined && value.day === localDay(now) ? value.used : 0;
}

export function nextBudget(
  raw: unknown,
  now: number,
  count = 1
): WriteBudgetValue {
  return { day: localDay(now), used: budgetUsed(raw, now) + count };
}

export function isEmergency(raw: unknown): boolean {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0;
}

export function isRateLimited(raw: unknown, now: number): boolean {
  return typeof raw === 'number' && Number.isFinite(raw) && raw > now;
}
