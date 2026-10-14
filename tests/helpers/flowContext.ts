import type { FlowContext } from '@/content/engine/runner';
import type { RunState, RunTarget } from '@/shared/run';
import type { RunConfig } from '@/shared/runConfig';

import { pendingSteps } from '@/shared/run';

import { configOf, pacingOf } from './fixtures';

export type FakeFlow = {
  ctx: FlowContext;
  targets: RunTarget[];
  // Chỉ số các bước đã được flow gọi qua `step`/`skipStep`.
  steps: number[];
  skipped: number[];
  controller: AbortController;
};

type Options = {
  mode?: FlowContext['mode'];
  config?: Partial<RunConfig>;
  lang?: string;
  // Bước nào chạy thân thật: mặc định tất cả; trả false để bỏ qua thân (trả undefined).
  runStep?: (index: number) => boolean;
  stepResult?: (index: number) => unknown;
  // Thay hẳn cách chạy bước (vd. dừng flow tại một mốc để kiểm tra từng đoạn).
  step?: FlowContext['step'];
  // Ghi đè các hook điều phối khác của runner.
  overrides?: Partial<FlowContext>;
};

// FlowContext đầy đủ kiểu, không có runner thật: dùng để chạy flow trên DOM giả.
export default function makeFlowContext(options: Options = {}): FakeFlow {
  const config = configOf(options.config);
  const targets: RunTarget[] = config.queries.map((query) => ({
    accountId: query,
    name: query,
    plan: 'run',
    outcome: 'queued',
  }));
  const controller = new AbortController();
  const steps: number[] = [];
  const skipped: number[] = [];
  const runStep = options.runStep ?? (() => true);
  const state = (): RunState => ({
    runId: 'run_test',
    mode: options.mode ?? 'dry',
    status: 'running',
    simulated: false,
    batch: { index: 1, total: 1 },
    auditFailed: false,
    scenario: 'done',
    startedAt: 0,
    partnerBmId: config.partnerBmId,
    tasks: config.tasks,
    targets,
    currentTarget: 0,
    steps: pendingSteps(),
    stepIndex: 1,
    sub: 0,
    disconnectDone: false,
    log: [],
  });
  const ctx: FlowContext = {
    signal: controller.signal,
    lang: options.lang ?? 'vi',
    gate: async () => undefined,
    mode: options.mode ?? 'dry',
    config,
    batchSize: 10,
    pacing: pacingOf(),
    state,
    pause: async () => undefined,
    beginBatch: () => undefined,
    step:
      options.step ??
      (async <T>(
        index: number,
        body: (handle: { acted: () => void }) => Promise<T>
      ): Promise<T> => {
        steps.push(index);
        if (!runStep(index)) {
          return options.stepResult?.(index) as T;
        }
        return body({ acted: () => undefined });
      }),
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
    markWriteStarted: () => undefined,
    ...options.overrides,
  };
  return { ctx, targets, steps, skipped, controller };
}
