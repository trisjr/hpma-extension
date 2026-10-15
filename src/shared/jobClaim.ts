/**
 * jobClaim.ts — handler của transaction claim (SPEC-AUTO-001 §4.2, D5) và giá trị server timestamp dạng
 * thuần dữ liệu. Không import Firebase: dispatcher (extension) và test Rules (coordinator, emulator) dùng chung
 * đúng một handler, nên thứ được test là thứ chạy thật.
 */

// Chính là `ServerValue.TIMESTAMP`/`serverTimestamp()` của SDK: RTDB nhận dạng `{ '.sv': 'timestamp' }`.
export const SERVER_TIMESTAMP = { '.sv': 'timestamp' } as const;

export type ClaimState = { status?: unknown; claimedBy?: unknown } | null;

// Giá trị hiện tại `null` (cache cục bộ lạnh) → trả `null`, KHÔNG abort: SDK so hash với server và gọi lại
// với giá trị thật (giả định #4, đã kiểm ở pha 0). `status !== 'pending'` → undefined (abort: máy khác đã nhặt).
// Handler huỷ job `pending` của ops CLI (cùng idiom với claim: `null` do cache lạnh thì trả `null` để SDK gọi lại với
// giá trị thật; job đã bị máy claim thì abort, máy tự dừng nhờ `cancelRequested`).
export const cancelPendingHandler = (current: ClaimState): unknown => {
  if (current === null) return null;
  if (current.status !== 'pending') return undefined;
  return { ...current, status: 'cancelled' };
};

export const claimHandler =
  (machineId: string) =>
  (current: ClaimState): unknown => {
    if (current === null) return null;
    if (current.status !== 'pending') return undefined;
    return {
      ...current,
      status: 'claimed',
      claimedBy: machineId,
      claimedAt: SERVER_TIMESTAMP,
    };
  };
