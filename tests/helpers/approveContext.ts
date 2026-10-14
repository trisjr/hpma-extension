import type { FlowContext } from '@/content/engine/runner';
import type { ApproveConfig } from '@/shared/approve';
import type { RunState, RunTarget } from '@/shared/run';

import { approveTargetId } from '@/shared/approve';
import { pendingSteps } from '@/shared/run';

import { pacingOf } from './fixtures';

export type FakeApproveFlow = {
  ctx: FlowContext<ApproveConfig>;
  targets: RunTarget[];
  steps: number[];
  skipped: number[];
  // Số lần flow báo sắp bấm nút ghi (Full).
  writeMarks: () => number;
};

// FlowContext đầy đủ kiểu cho flow duyệt, không có runner thật.
export default function makeApproveContext(
  config: ApproveConfig,
  options: {
    mode?: FlowContext['mode'];
    lang?: string;
    overrides?: Partial<FlowContext<ApproveConfig>>;
  } = {}
): FakeApproveFlow {
  const targets: RunTarget[] = config.requests.map((request, index) => ({
    accountId: approveTargetId(request, index),
    name: request.account,
    plan: 'run',
    outcome: 'queued',
  }));
  const steps: number[] = [];
  const skipped: number[] = [];
  let marks = 0;
  const state = (): RunState => ({
    runId: 'run_test',
    mode: options.mode ?? 'dry',
    status: 'running',
    simulated: false,
    batch: { index: 1, total: targets.length },
    auditFailed: false,
    scenario: 'done',
    startedAt: 0,
    flow: 'partner-approve',
    partnerName: config.partnerName,
    action: config.action,
    partnerBmId: '',
    tasks: [],
    targets,
    currentTarget: 0,
    steps: pendingSteps('partner-approve', config.action),
    stepIndex: 1,
    sub: 0,
    disconnectDone: false,
    log: [],
  });
  const ctx: FlowContext<ApproveConfig> = {
    signal: new AbortController().signal,
    lang: options.lang ?? 'en',
    gate: async () => undefined,
    mode: options.mode ?? 'dry',
    config,
    batchSize: 10,
    pacing: pacingOf(),
    state,
    pause: async () => undefined,
    beginBatch: () => undefined,
    step: async <T>(
      index: number,
      body: (handle: { acted: () => void }) => Promise<T>
    ): Promise<T> => {
      steps.push(index);
      return body({ acted: () => undefined });
    },
    skipStep: (index) => {
      skipped.push(index);
    },
    setTarget: (index, outcome, code) => {
      Object.assign(targets[index], { outcome });
      if (code !== undefined) Object.assign(targets[index], { code });
    },
    setTargetId: (index, accountId) => {
      Object.assign(targets[index], { accountId });
    },
    // Không bao giờ tự xong: test quyết định khi nào user "báo xong".
    waitForAssistDone: () =>
      new Promise<void>(() => {
        /* pending */
      }),
    setWaiting: () => undefined,
    markWriteStarted: () => {
      marks += 1;
    },
    ...options.overrides,
  };
  return { ctx, targets, steps, skipped, writeMarks: () => marks };
}
