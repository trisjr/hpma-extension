/**
 * halt.ts — tự dừng BM khi có sự cố (SPEC-AUTO-001 §5.3, Q4: N = 1). Máy đã tự chặn mình cục bộ (fail-closed);
 * coordinator nâng lên cấp BM để MỌI máy cùng BM dừng claim, ghi `killSwitch/<bm> = true`. Chỉ người (ops) gỡ
 * được (`ops unkill`), và coordinator không bao giờ đụng `killSwitch/global`.
 */

export type MachineRecord = {
  businessId?: string;
  status?: string;
  blockedReason?: string | null;
};

// Lý do khoá của máy tính là sự cố (checkpoint/CAPTCHA/rate-limit), khác với khoá thường (curfew, budget, ...).
const INCIDENT_REASONS = ['checkpoint', 'rate-limited'];

export function planHalts(
  machines: Record<string, MachineRecord>,
  killSwitch: Record<string, unknown> | null
): string[] {
  const kill = killSwitch ?? {};
  if (kill.global === true) return [];
  const bms = new Set<string>();
  Object.values(machines).forEach((machine) => {
    if (
      typeof machine.businessId === 'string' &&
      machine.status === 'blocked' &&
      typeof machine.blockedReason === 'string' &&
      INCIDENT_REASONS.includes(machine.blockedReason) &&
      kill[machine.businessId] !== true
    )
      bms.add(machine.businessId);
  });
  return [...bms];
}
