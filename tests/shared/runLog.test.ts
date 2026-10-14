import type { RunState } from '@/shared/run';
import { describe, expect, it } from 'vitest';

import {
  advance,
  appendLog,
  countByLevel,
  createRun,
  filterByLevel,
  isRunState,
  LOG_LIMIT,
  runLog,
  stopRun,
} from '@/shared/run';

const config = { partnerBmId: '123456789012345', accountIds: ['a'], tasks: [] };
const diff = [
  {
    account: { id: 'a', name: 'A', status: 'active' as const },
    op: 'add' as const,
    existing: [],
    adding: [],
  },
];

const newRun = (mode: 'dry' | 'assist' = 'dry'): RunState =>
  createRun({ mode, scenario: 'done', config, diff, now: 1 });

describe('log của run', () => {
  it('run mới có một dòng bắt đầu', () => {
    expect(runLog(newRun()).map((entry) => entry.code)).toEqual(['run.start']);
  });

  it('chỉ giữ LOG_LIMIT dòng mới nhất', () => {
    let run = newRun();
    for (let i = 0; i < LOG_LIMIT + 25; i += 1) {
      run = appendLog(run, { at: i, step: 1, level: 'ok', code: 'step.ok' });
    }
    expect(runLog(run)).toHaveLength(LOG_LIMIT);
    expect(runLog(run)[LOG_LIMIT - 1].at).toBe(LOG_LIMIT + 24);
  });

  it('lastRun của v0.4.0 không có log vẫn đọc được là rỗng', () => {
    const legacy = { ...newRun() } as Partial<RunState>;
    delete legacy.log;
    expect(isRunState(legacy)).toBe(true);
    expect(runLog(legacy as RunState)).toEqual([]);
    expect(
      appendLog(legacy as RunState, {
        at: 1,
        step: 0,
        level: 'ok',
        code: 'run.end',
      }).log
    ).toHaveLength(1);
  });

  it('bỏ dòng log sai shape thay vì để panel lỗi', () => {
    const good = { at: 1, step: 1, level: 'ok', code: 'step.ok' };
    const broken = {
      ...newRun(),
      log: [null, { level: 'bogus' }, { ...good, at: 'x' }, good],
    } as unknown as RunState;
    expect(runLog(broken)).toEqual([good]);
  });

  it('simulator ghi một dòng cho mỗi bước và dòng kết thúc', () => {
    let run = newRun();
    for (let i = 0; i < 200 && run.status === 'running'; i += 1) {
      run = advance(run, 10 + i);
    }
    expect(run.status).toBe('done');
    const codes = runLog(run).map((entry) => entry.code);
    expect(codes[0]).toBe('run.start');
    expect(codes[codes.length - 1]).toBe('run.end');
    expect(codes.filter((code) => code === 'step.start')).toHaveLength(5);
    expect(codes).toContain('step.skip');
    expect(countByLevel(runLog(run)).error).toBe(0);
  });

  it('kịch bản failed kết thúc bằng step.fail rồi run.end mức error', () => {
    let run = createRun({
      mode: 'dry',
      scenario: 'failed',
      config,
      diff,
      now: 1,
    });
    for (let i = 0; i < 200 && run.status === 'running'; i += 1) {
      run = advance(run, 10 + i);
    }
    const entries = runLog(run);
    expect(run.status).toBe('failed');
    expect(entries.slice(-2).map((entry) => [entry.code, entry.level])).toEqual(
      [
        ['step.fail', 'error'],
        ['run.end', 'error'],
      ]
    );
  });

  it('dừng run ghi run.end mức warn', () => {
    const stopped = stopRun(newRun(), 5);
    expect(runLog(stopped).pop()).toMatchObject({
      code: 'run.end',
      level: 'warn',
    });
  });

  it('lọc theo mức và đếm theo mức', () => {
    let run = newRun();
    run = appendLog(run, {
      at: 2,
      step: 3,
      level: 'warn',
      code: 'locate.fallback',
    });
    run = appendLog(run, { at: 3, step: 3, level: 'error', code: 'step.fail' });
    expect(countByLevel(runLog(run))).toEqual({ ok: 1, warn: 1, error: 1 });
    expect(filterByLevel(runLog(run), 'warn')).toHaveLength(1);
    expect(filterByLevel(runLog(run), 'all')).toHaveLength(3);
  });
});
