/**
 * runState.ts — dựng và chốt `RunState` cho engine thật (thuần, không DOM/storage).
 * Hợp đồng `RunState` dùng chung với simulator (src/shared/run.ts).
 */
import type {
  RunError,
  RunMode,
  RunState,
  RunStatus,
  RunTarget,
} from '@/shared/run';
import type { RunConfig } from '@/shared/runConfig';

import { pendingSteps, VERIFY_STEP } from '@/shared/run';

const SELECT_STEP = 4;

export function newEngineRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return `run_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

// Chia chỉ số target thành các mẻ ≤ `size`.
export function chunkIndexes(count: number, size: number): number[][] {
  const batches: number[][] = [];
  for (let start = 0; start < count; start += size) {
    batches.push(
      Array.from({ length: Math.min(size, count - start) }, (_, i) => start + i)
    );
  }
  return batches;
}

export function createEngineRun(params: {
  mode: RunMode;
  config: RunConfig;
  batchSize: number;
  now: number;
  runId: string;
}): RunState {
  const { mode, config, batchSize, now, runId } = params;
  const targets: RunTarget[] = config.queries.map((query) => ({
    accountId: query,
    name: query,
    plan: 'run',
    outcome: 'queued',
  }));
  return {
    runId,
    mode,
    status: 'running',
    simulated: false,
    batch: { index: 1, total: chunkIndexes(targets.length, batchSize).length },
    auditFailed: false,
    scenario: 'done',
    startedAt: now,
    partnerBmId: config.partnerBmId,
    tasks: config.tasks,
    targets,
    currentTarget: 0,
    steps: pendingSteps(),
    stepIndex: 1,
    sub: 0,
    disconnectDone: false,
  };
}

// Chốt trạng thái run khi flow chạy hết mà không ném lỗi.
export function settle(run: RunState): {
  status: RunStatus;
  error?: RunError;
} {
  const { targets } = run;
  if (targets.some((item) => item.outcome === 'pending-approval')) {
    return { status: 'pending-approval' };
  }
  if (targets.some((item) => item.outcome === 'unverified')) {
    return {
      status: 'failed',
      error: { code: 'ERR_VERIFY_UNREADABLE', stepIndex: VERIFY_STEP },
    };
  }
  const good = targets.filter(
    (item) => item.outcome === 'done' || item.outcome === 'skipped-existing'
  );
  if (good.length === 0) {
    const failed = targets.find((item) => item.outcome === 'failed');
    return {
      status: 'failed',
      error: { code: failed?.code ?? 'ERR_NO_TARGETS', stepIndex: SELECT_STEP },
    };
  }
  return { status: 'done' };
}
