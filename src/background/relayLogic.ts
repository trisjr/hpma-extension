/**
 * relayLogic.ts — phần thuần của relay Firebase (SPEC-AUTO-001 §4.3, §5.1): quyết định máy có được
 * ghi presence không, và lọc job từ snapshot RTDB. Không import Firebase để test không cần SDK.
 */
import type { MachineFlow, RemoteJob } from '@/shared/remoteJob';
import type { Provision } from '@/shared/remoteMessages';

import { acceptsFlow, isMachineFlow, parseRemoteJob } from '@/shared/remoteJob';
import { isBusinessId } from '@/shared/surfaces';

export type MachineClaims = {
  machineId: string;
  bm: string;
  flow: MachineFlow;
};

// Danh tính do claim quyết định (D2), không do storage: claim thiếu/sai kiểu → chưa được cấp máy.
export function readClaims(
  claims: Record<string, unknown>
): MachineClaims | undefined {
  const { machineId, bm, flow } = claims;
  if (
    typeof machineId !== 'string' ||
    !isBusinessId(bm) ||
    !isMachineFlow(flow)
  )
    return undefined;
  return { machineId, bm, flow };
}

export function deriveProvision(
  signedIn: boolean,
  claims: MachineClaims | undefined,
  localMachineId: string
): Provision {
  if (!signedIn) return 'signed-out';
  if (!claims) return 'unprovisioned';
  return claims.machineId === localMachineId ? 'ok' : 'machine-mismatch';
}

// Snapshot `ext/jobs/<bm>` → job `pending` đúng flow của máy, chưa bị huỷ, cũ nhất trước.
// Job sai shape bị bỏ (không error: máy chỉ đọc ở pha 1).
export function pendingJobsFor(
  branch: Record<string, unknown> | null,
  claims: MachineClaims
): RemoteJob[] {
  if (!branch) return [];
  return Object.entries(branch)
    .map(([id, value]) => parseRemoteJob(id, value, claims.bm))
    .filter((job): job is RemoteJob => job !== undefined)
    .filter(
      (job) =>
        job.status === 'pending' &&
        !job.cancelRequested &&
        acceptsFlow(claims.flow, job.flow)
    )
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function badgeText(count: number): string {
  if (count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}
