import { vi } from 'vitest';

// Chạy fake timers theo từng nhịp cho tới khi promise xong. Không dùng `runAllTimers`:
// `waitFor` có interval 400 ms không bao giờ cạn.
export async function drive<T>(
  promise: Promise<T>,
  { stepMs = 100, maxMs = 3_600_000 } = {}
): Promise<T> {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    }
  );
  for (let elapsed = 0; !settled && elapsed < maxMs; elapsed += stepMs) {
    // eslint-disable-next-line no-await-in-loop
    await vi.advanceTimersByTimeAsync(stepMs);
  }
  if (!settled) throw new Error(`drive: promise chưa xong sau ${maxMs} ms`);
  return promise;
}

// 2026-03-04 12:00 giờ Việt Nam (UTC+7): ngoài curfew mặc định 00:00–06:00.
export const NOON_VN = Date.UTC(2026, 2, 4, 5, 0, 0);
// 02:00 giờ Việt Nam: trong curfew mặc định.
export const NIGHT_VN = Date.UTC(2026, 2, 3, 19, 0, 0);
