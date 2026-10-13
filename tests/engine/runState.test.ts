import type { RunState, TargetOutcome } from '@/shared/run';
import { describe, expect, it } from 'vitest';

import {
  chunkIndexes,
  createEngineRun,
  newEngineRunId,
  settle,
} from '@/content/engine/runState';

import { configOf } from '../helpers/fixtures';

function runWith(outcomes: TargetOutcome[], codes: string[] = []): RunState {
  const run = createEngineRun({
    mode: 'assist',
    config: configOf({ queries: outcomes.map((_, i) => `acc${i}`) }),
    batchSize: 10,
    now: 1,
    runId: 'run_aabbcc',
  });
  return {
    ...run,
    targets: run.targets.map((item, i) => ({
      ...item,
      outcome: outcomes[i],
      ...(codes[i] ? { code: codes[i] } : {}),
    })),
  };
}

describe('newEngineRunId', () => {
  it('có dạng run_ + 6 hex', () => {
    expect(newEngineRunId()).toMatch(/^run_[0-9a-f]{6}$/);
  });
});

describe('chunkIndexes', () => {
  it('chia thành các mẻ không vượt quá kích thước', () => {
    expect(chunkIndexes(0, 10)).toEqual([]);
    expect(chunkIndexes(3, 10)).toEqual([[0, 1, 2]]);
    expect(chunkIndexes(5, 2)).toEqual([[0, 1], [2, 3], [4]]);
    expect(chunkIndexes(10, 5)).toEqual([
      [0, 1, 2, 3, 4],
      [5, 6, 7, 8, 9],
    ]);
  });
});

describe('createEngineRun', () => {
  it('dựng run thật (không mô phỏng) với target queued và số mẻ', () => {
    const run = createEngineRun({
      mode: 'dry',
      config: configOf({ queries: ['a', 'b', 'c'] }),
      batchSize: 2,
      now: 123,
      runId: 'run_000001',
    });
    expect(run).toMatchObject({
      runId: 'run_000001',
      mode: 'dry',
      status: 'running',
      simulated: false,
      auditFailed: false,
      startedAt: 123,
      batch: { index: 1, total: 2 },
      stepIndex: 1,
      sub: 0,
    });
    expect(run.targets.map((item) => item.outcome)).toEqual([
      'queued',
      'queued',
      'queued',
    ]);
    expect(run.steps).toHaveLength(7);
  });
});

describe('settle', () => {
  it('có pending-approval thì run pending-approval, ưu tiên hơn mọi kết quả khác', () => {
    expect(settle(runWith(['done', 'pending-approval', 'failed']))).toEqual({
      status: 'pending-approval',
    });
  });

  it('có unverified (có thể đã ghi) thì run failed ERR_VERIFY_UNREADABLE', () => {
    expect(settle(runWith(['done', 'unverified']))).toEqual({
      status: 'failed',
      error: { code: 'ERR_VERIFY_UNREADABLE', stepIndex: 7 },
    });
  });

  it('không target nào tốt thì failed, lấy mã của target lỗi đầu tiên', () => {
    expect(
      settle(runWith(['failed', 'failed'], ['ERR_TARGET_NOT_FOUND']))
    ).toEqual({
      status: 'failed',
      error: { code: 'ERR_TARGET_NOT_FOUND', stepIndex: 4 },
    });
    expect(settle(runWith(['queued']))).toEqual({
      status: 'failed',
      error: { code: 'ERR_NO_TARGETS', stepIndex: 4 },
    });
  });

  it('done hoặc skipped-existing đủ để run done (kể cả lẫn target failed)', () => {
    expect(settle(runWith(['done', 'failed']))).toEqual({ status: 'done' });
    expect(settle(runWith(['skipped-existing']))).toEqual({ status: 'done' });
  });
});
