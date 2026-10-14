/**
 * store.ts — chỗ duy nhất của engine đọc/ghi `storage.local` (SPEC-ENG-001 §7–8):
 * khoá an toàn, bộ đếm ghi/ngày, audit append-only, lastRun. Lỗi storage không
 * làm hỏng run: ghi thất bại trả `false`, đọc thất bại coi như không có dữ liệu.
 */
import type { AuditDetail, AuditRow } from '@/shared/audit';
import type { RunState } from '@/shared/run';
import type { PacingConfig } from '@/shared/settings';
import browser from 'webextension-polyfill';

import {
  AUDIT_CURSOR_KEY,
  chunkKey,
  isAuditRow,
  parseCursor,
  planAppend,
} from '@/shared/audit';
import {
  budgetUsed,
  EMERGENCY_KEY,
  isEmergency,
  isRateLimited,
  nextBudget,
  RATE_LIMIT_KEY,
  RATE_LIMIT_MS,
  WRITE_BUDGET_KEY,
} from '@/shared/budget';
import {
  DEVTEST_KEY,
  PACING_KEY,
  parseDevtest,
  parsePacing,
} from '@/shared/settings';

export const LAST_RUN_KEY = 'lastRun';

async function read(keys: string[]): Promise<Record<string, unknown>> {
  return browser.storage.local
    .get(keys)
    .catch(() => ({}) as Record<string, unknown>);
}

// Đọc qua `parsePacing` để mức sàn an toàn giữ ngay ở lớp engine.
export async function loadPacing(): Promise<PacingConfig> {
  const stored = await read([PACING_KEY]);
  return parsePacing(stored[PACING_KEY]);
}

export async function loadLogDetail(): Promise<AuditDetail> {
  const stored = await read([DEVTEST_KEY]);
  // Tham số `isDev` chỉ đổi mặc định cờ `devtest`, không ảnh hưởng `logDetail`.
  return parseDevtest(stored[DEVTEST_KEY], Date.now(), false).logDetail;
}

export type Gates = {
  emergency: boolean;
  rateLimited: boolean;
  writesToday: number;
};

export async function loadGates(now: number): Promise<Gates> {
  const stored = await read([EMERGENCY_KEY, RATE_LIMIT_KEY, WRITE_BUDGET_KEY]);
  return {
    emergency: isEmergency(stored[EMERGENCY_KEY]),
    rateLimited: isRateLimited(stored[RATE_LIMIT_KEY], now),
    writesToday: budgetUsed(stored[WRITE_BUDGET_KEY], now),
  };
}

// Khoá chỉ do user gỡ (Options › Devtest); engine không bao giờ tự xoá.
export async function raiseEmergency(now: number): Promise<void> {
  await browser.storage.local
    .set({ [EMERGENCY_KEY]: now })
    .catch(() => undefined);
}

export async function raiseRateLimit(now: number): Promise<void> {
  await browser.storage.local
    .set({ [RATE_LIMIT_KEY]: now + RATE_LIMIT_MS })
    .catch(() => undefined);
}

export async function bumpWriteBudget(now: number, count = 1): Promise<void> {
  const stored = await read([WRITE_BUDGET_KEY]);
  await browser.storage.local
    .set({
      [WRITE_BUDGET_KEY]: nextBudget(stored[WRITE_BUDGET_KEY], now, count),
    })
    .catch(() => undefined);
}

// Nối thêm vào chunk cuối của tháng; không sửa dòng cũ. Trả false nếu ghi lỗi.
export async function appendAudit(
  rows: AuditRow[],
  now: number
): Promise<boolean> {
  if (rows.length === 0) return true;
  try {
    const stored = await browser.storage.local.get(AUDIT_CURSOR_KEY);
    const cursor = parseCursor(stored[AUDIT_CURSOR_KEY]);
    let lastChunk: AuditRow[] = [];
    if (cursor) {
      const key = chunkKey(cursor);
      const chunk = (await browser.storage.local.get(key))[key];
      lastChunk = Array.isArray(chunk) ? chunk.filter(isAuditRow) : [];
    }
    await browser.storage.local.set(planAppend(cursor, lastChunk, rows, now));
    return true;
  } catch {
    return false;
  }
}

export async function saveLastRun(run: RunState): Promise<void> {
  await browser.storage.local
    .set({ [LAST_RUN_KEY]: run })
    .catch(() => undefined);
}

export async function clearLastRun(): Promise<void> {
  await browser.storage.local.remove(LAST_RUN_KEY).catch(() => undefined);
}
