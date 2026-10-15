/**
 * jobStore.ts — phần RTDB của dispatcher (SPEC-AUTO-001 §4.2, §5): claim bằng transaction, ghi `state` của job
 * mình giữ, ghi bản ghi máy, đọc job mình đang giữ, theo dõi cancel và kill-switch. Chỉ chứa lời gọi SDK;
 * mọi quyết định nằm ở `jobDispatcher.ts`/`dispatchLogic.ts`. Rules cưỡng chế độc lập (D15): máy chỉ ghi được
 * `state` của job mình claim, và chỉ claim được job đúng flow/BM khi kill-switch tắt.
 */
import type { MachinePatch, OwnJob } from './jobDispatcher';
import type { MachineClaims } from './relayLogic';
import {
  Database,
  equalTo,
  get,
  onValue,
  orderByChild,
  query,
  ref,
  runTransaction,
  update,
} from 'firebase/database';

import { claimHandler, ClaimState } from '@/shared/jobClaim';
import { parseJobEnvelope } from '@/shared/remoteJob';

export type JobStore = {
  claim: (jobId: string) => Promise<boolean>;
  writeState: (jobId: string, patch: Record<string, unknown>) => Promise<void>;
  writeMachine: (patch: MachinePatch) => Promise<void>;
  readOwnJobs: () => Promise<OwnJob[]>;
  watchCancel: (
    jobId: string,
    onChange: (cancelRequested: boolean) => void
  ) => () => void;
  watchKill: (
    onChange: (flags: { global: boolean; bm: boolean }) => void
  ) => () => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export default function createJobStore(
  db: Database,
  claims: MachineClaims
): JobStore {
  const jobRef = (jobId: string, child = ''): ReturnType<typeof ref> =>
    ref(db, `ext/jobs/${claims.bm}/${jobId}${child}`);

  return {
    async claim(jobId) {
      const stateRef = jobRef(jobId, '/state');
      // Làm ấm cache để lần gọi đầu của transaction không phải đi qua nhánh `null` (đường lui của giả định #4).
      await get(stateRef).catch(() => undefined);
      const result = await runTransaction(stateRef, (current) =>
        claimHandler(claims.machineId)(current as ClaimState)
      );
      return result.committed;
    },

    async writeState(jobId, patch) {
      await update(jobRef(jobId, '/state'), patch);
    },

    async writeMachine(patch) {
      await update(ref(db, `ext/machines/${claims.machineId}`), patch);
    },

    // Job do chính máy này giữ: bắt cả job đã claim mà SW chết trước khi kịp ghi `currentJobId` (§5.1 bước 0).
    async readOwnJobs() {
      const snapshot = await get(
        query(
          ref(db, `ext/jobs/${claims.bm}`),
          orderByChild('state/claimedBy'),
          equalTo(claims.machineId)
        )
      );
      const branch = snapshot.val() as Record<string, unknown> | null;
      if (!branch) return [];
      const owned: OwnJob[] = [];
      Object.entries(branch).forEach(([id, value]) => {
        const job = parseJobEnvelope(id, value, claims.bm);
        if (!job || (job.status !== 'claimed' && job.status !== 'running'))
          return;
        const state =
          isRecord(value) && isRecord(value.state) ? value.state : {};
        owned.push({
          job,
          runId: typeof state.runId === 'string' ? state.runId : undefined,
          claimedAt:
            typeof state.claimedAt === 'number' ? state.claimedAt : undefined,
        });
      });
      return owned;
    },

    watchCancel(jobId, onChange) {
      return onValue(jobRef(jobId, '/cancelRequested'), (snapshot) =>
        onChange(snapshot.val() === true)
      );
    },

    watchKill(onChange) {
      return onValue(ref(db, 'ext/killSwitch'), (snapshot) => {
        const value = snapshot.val() as unknown;
        const flags = isRecord(value) ? value : {};
        onChange({
          global: flags.global === true,
          bm: flags[claims.bm] === true,
        });
      });
    },
  };
}
