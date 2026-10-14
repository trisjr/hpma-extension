import type { Flow } from '@/content/engine/runner';
import type { RunState } from '@/shared/run';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EngineError from '@/content/engine/errors';
import { startRun } from '@/content/engine/runner';
import RunStopped from '@/content/engine/stop';
import { LAST_RUN_KEY } from '@/content/engine/store';
import { AUDIT_PREFIX, monthKey } from '@/shared/audit';
import {
  EMERGENCY_KEY,
  localDay,
  RATE_LIMIT_KEY,
  RATE_LIMIT_MS,
  WRITE_BUDGET_KEY,
} from '@/shared/budget';

import { storageState } from '../helpers/browserMock';
import { BM_ID, configOf, pacingOf } from '../helpers/fixtures';
import { drive, NIGHT_VN, NOON_VN } from '../helpers/timers';

type Start = Partial<Parameters<typeof startRun>[0]>;

function start(flow: Flow, overrides: Start = {}) {
  const states: RunState[] = [];
  const handle = startRun({
    mode: 'dry',
    config: configOf(),
    businessId: BM_ID,
    pacing: pacingOf(),
    logDetail: 'off',
    flow,
    onState: (run) => states.push(run),
    ...overrides,
  });
  return { handle, states };
}

const auditRows = (): { result: string; target: string; mode: string }[] =>
  Object.entries(storageState.data)
    .filter(([key]) => key.startsWith(AUDIT_PREFIX))
    .flatMap(
      ([, rows]) => rows as { result: string; target: string; mode: string }[]
    );

const setHidden = (hidden: boolean): void => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (hidden ? 'hidden' : 'visible'),
  });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON_VN);
  // Guard đổi BM so URL với `businessId` của run: URL không có business_id thì tới ngưỡng sẽ dừng.
  window.history.replaceState({}, '', `/?business_id=${BM_ID}`);
});

afterEach(() => {
  Reflect.deleteProperty(document, 'visibilityState');
  document.documentElement.removeAttribute('lang');
  document.body.innerHTML = '';
  window.history.pushState({}, '', '/');
});

describe('kết thúc bình thường', () => {
  it('Dry: phát snapshot đầu ngay, chốt done, ghi audit + lastRun, KHÔNG tính ngân sách', async () => {
    const { handle, states } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
    });
    expect(states[0]).toMatchObject({ status: 'running', mode: 'dry' });
    const final = await handle.done;
    expect(final.status).toBe('done');
    expect(final.endedAt).toBe(NOON_VN);
    expect(final.pauseReason).toBeUndefined();
    expect(states[states.length - 1]).toBe(final);
    expect(auditRows()).toEqual([
      expect.objectContaining({ mode: 'dry', result: 'dry' }),
    ]);
    expect(storageState.data[LAST_RUN_KEY]).toBeDefined();
    expect(storageState.data[WRITE_BUDGET_KEY]).toBeUndefined();
  });

  it('Assist: tính đúng một lượt ghi cho cả run (không theo target)', async () => {
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'done');
        ctx.setTarget(1, 'done');
      },
      { mode: 'assist', config: configOf({ queries: ['a', 'b'] }) }
    );
    expect((await handle.done).status).toBe('done');
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOON_VN),
      used: 1,
    });
    expect(auditRows().map((row) => row.result)).toEqual(['done', 'done']);
  });

  it('Assist: không có target nào đã ghi thì không tính ngân sách', async () => {
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'failed', 'ERR_TARGET_NOT_FOUND');
      },
      { mode: 'assist' }
    );
    const final = await handle.done;
    expect(final.status).toBe('failed');
    expect(final.error).toEqual({ code: 'ERR_TARGET_NOT_FOUND', stepIndex: 4 });
    expect(storageState.data[WRITE_BUDGET_KEY]).toBeUndefined();
  });

  it('skipped-existing đổi plan thành skip và vẫn tính là run done', async () => {
    const { handle } = start(async (ctx) => {
      ctx.setTarget(0, 'skipped-existing');
    });
    const final = await handle.done;
    expect(final.status).toBe('done');
    expect(final.targets[0].plan).toBe('skip');
    expect(auditRows()[0].result).toBe('skip');
  });

  it('batch: kích thước mẻ = min(10, maxBatch của BM)', () => {
    const pacing = pacingOf();
    pacing.limits.standard.maxBatch = 3;
    const { handle } = start(async () => undefined, {
      pacing,
      config: configOf({ queries: ['1', '2', '3', '4', '5', '6', '7'] }),
    });
    expect(handle.snapshot().batch).toEqual({ index: 1, total: 3 });
  });
});

describe('abort / Dừng', () => {
  it('Dừng giữa chừng: status stopped, không có error, target dở không có audit', async () => {
    const { handle } = start(async (ctx) => {
      ctx.setTarget(0, 'running');
      await ctx.pause('step');
    });
    await vi.advanceTimersByTimeAsync(500);
    handle.stop();
    const final = await drive(handle.done);
    expect(final.status).toBe('stopped');
    expect(final.error).toBeUndefined();
    expect(auditRows()).toEqual([]);
    expect(storageState.data[WRITE_BUDGET_KEY]).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('flow tự ném RunStopped cũng chốt stopped', async () => {
    const { handle } = start(async () => {
      throw new RunStopped();
    });
    expect((await handle.done).status).toBe('stopped');
  });

  it('abort khi đang chờ trong gate (tab ẩn) thì dừng sạch listener', async () => {
    setHidden(true);
    const { handle } = start(async (ctx) => {
      await ctx.gate();
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.snapshot().status).toBe('paused');
    handle.stop();
    expect((await handle.done).status).toBe('stopped');
  });
});

describe('tab ẩn (visibility gate)', () => {
  it('paused/hidden khi tab ẩn, chạy tiếp khi hiện lại', async () => {
    setHidden(true);
    let reached = false;
    const { handle, states } = start(async (ctx) => {
      await ctx.gate();
      reached = true;
      ctx.setTarget(0, 'done');
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.snapshot()).toMatchObject({
      status: 'paused',
      pauseReason: 'hidden',
    });
    expect(reached).toBe(false);

    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    const final = await handle.done;
    expect(reached).toBe(true);
    expect(final.status).toBe('done');
    expect(states.some((run) => run.status === 'paused')).toBe(true);
    expect(
      states.find(
        (run) => run.status === 'running' && run.pauseReason === undefined
      )
    ).toBeDefined();
  });

  it('visibilitychange nhưng vẫn ẩn thì tiếp tục chờ', async () => {
    setHidden(true);
    const { handle } = start(async (ctx) => {
      await ctx.gate();
    });
    await vi.advanceTimersByTimeAsync(0);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.snapshot().status).toBe('paused');
    handle.stop();
    await handle.done;
  });
});

describe('curfew', () => {
  it('Assist trong khung giờ cấm: ERR_CURFEW tại hành động kế tiếp', async () => {
    vi.setSystemTime(NIGHT_VN);
    const { handle } = start(
      async (ctx) => {
        await ctx.gate();
        ctx.setTarget(0, 'done');
      },
      { mode: 'assist' }
    );
    const final = await handle.done;
    expect(final.status).toBe('failed');
    expect(final.error?.code).toBe('ERR_CURFEW');
    expect(storageState.data[WRITE_BUDGET_KEY]).toBeUndefined();
  });

  it('Dry không bị curfew chặn (không ghi)', async () => {
    vi.setSystemTime(NIGHT_VN);
    const { handle } = start(async (ctx) => {
      await ctx.gate();
      ctx.setTarget(0, 'done');
    });
    expect((await handle.done).status).toBe('done');
  });

  it('Assist ngoài khung giờ cấm chạy bình thường', async () => {
    const { handle } = start(
      async (ctx) => {
        await ctx.gate();
        ctx.setTarget(0, 'done');
      },
      { mode: 'assist' }
    );
    expect((await handle.done).status).toBe('done');
  });
});

describe('lỗi và fail-soft', () => {
  it('EngineError: giữ mã, stepIndex; detail chỉ có khi logDetail != off', async () => {
    document.documentElement.lang = 'vi';
    const flow: Flow = async (ctx) => {
      await ctx.step(3, async () => {
        throw new EngineError('ERR_LOCATE_TIMEOUT', 'partners.add');
      });
    };
    const verbose = await start(flow, { logDetail: 'basic' }).handle.done;
    expect(verbose.status).toBe('failed');
    expect(verbose.error).toEqual({
      code: 'ERR_LOCATE_TIMEOUT',
      stepIndex: 3,
      detail: 'partners.add lang=vi',
    });
    expect(verbose.steps[2]).toMatchObject({
      state: 'failed',
      phases: { locate: 'fail', act: 'idle' },
    });
    const quiet = await start(flow, { logDetail: 'off' }).handle.done;
    expect(quiet.error).toEqual({ code: 'ERR_LOCATE_TIMEOUT', stepIndex: 3 });
  });

  it('lỗi sau khi đã định vị (acted) thì pha act fail', async () => {
    const final = await start(async (ctx) => {
      await ctx.step(2, async (h) => {
        h.acted();
        throw new EngineError('ERR_STEP_TIMEOUT');
      });
    }).handle.done;
    expect(final.steps[1].phases).toEqual({
      locate: 'done',
      act: 'fail',
      verify: 'idle',
    });
  });

  it('lỗi lạ thành ERR_INTERNAL, detail chỉ lộ tên lỗi (không lộ message)', async () => {
    const final = await start(
      async () => {
        throw new TypeError('secret page content');
      },
      { logDetail: 'verbose' }
    ).handle.done;
    expect(final.error?.code).toBe('ERR_INTERNAL');
    expect(final.error?.detail).toBe('TypeError lang=?');
    expect(JSON.stringify(final)).not.toContain('secret');
  });

  it('lang do trang kiểm soát: giá trị không phải mã ngôn ngữ bị bỏ', async () => {
    document.documentElement.lang = '<img onerror=x>';
    const final = await start(
      async () => {
        throw new EngineError('ERR_INTERNAL');
      },
      { logDetail: 'basic' }
    ).handle.done;
    expect(final.error?.detail).toBe('lang=?');
  });

  it('storage ghi lỗi: run vẫn kết thúc, auditFailed = true, không ném', async () => {
    storageState.failSet = true;
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'done');
      },
      { mode: 'assist' }
    );
    const final = await handle.done;
    expect(final.status).toBe('done');
    expect(final.auditFailed).toBe(true);
    expect(handle.snapshot()).toBe(final);
  });

  it('storage đọc lỗi cũng không làm hỏng run', async () => {
    storageState.failGet = true;
    const { handle } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
    });
    const final = await handle.done;
    expect(final.status).toBe('done');
    expect(final.auditFailed).toBe(true);
  });
});

describe('tín hiệu nguy hiểm', () => {
  it('checkpoint: dừng run, khoá khẩn cấp', async () => {
    window.history.pushState({}, '', '/checkpoint/123');
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
      ctx.setTarget(0, 'done');
    });
    const final = await drive(handle.done);
    expect(final.status).toBe('failed');
    expect(final.error?.code).toBe('ERR_CHECKPOINT');
    expect(storageState.data[EMERGENCY_KEY]).toBe(NOON_VN);
    expect(final.targets[0].outcome).toBe('queued');
  });

  it('mất phiên: dừng run nhưng KHÔNG khoá khẩn cấp', async () => {
    window.history.pushState({}, '', '/login/');
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
    });
    const final = await drive(handle.done);
    expect(final.error?.code).toBe('ERR_LOGGED_OUT');
    expect(storageState.data[EMERGENCY_KEY]).toBeUndefined();
  });

  it('tab đổi sang BM khác giữa run: dừng ERR_BM_CHANGED, không khoá khẩn cấp', async () => {
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
    });
    window.history.replaceState({}, '', '/?business_id=1451597353550999');
    const final = await drive(handle.done);
    expect(final.status).toBe('failed');
    expect(final.error?.code).toBe('ERR_BM_CHANGED');
    expect(storageState.data[EMERGENCY_KEY]).toBeUndefined();
  });

  it('form mật khẩu hiện ra giữa run thì coi là mất phiên', async () => {
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
    });
    document.body.innerHTML = '<input type="password">';
    const final = await drive(handle.done);
    expect(final.error?.code).toBe('ERR_LOGGED_OUT');
  });

  it('dialog báo giới hạn tần suất: dừng run và khoá Assist 24 giờ', async () => {
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
    });
    setTimeout(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div role="alert">You are temporarily blocked</div>'
      );
    }, 1000);
    const final = await drive(handle.done);
    expect(final.error?.code).toBe('ERR_RATE_LIMITED');
    expect(storageState.data[RATE_LIMIT_KEY]).toBe(
      (final.endedAt ?? 0) + RATE_LIMIT_MS
    );
    expect(storageState.data[EMERGENCY_KEY]).toBeUndefined();
  });

  it('dialog bình thường không làm dừng run', async () => {
    const { handle } = start(async (ctx) => {
      await ctx.pause('step');
      ctx.setTarget(0, 'done');
    });
    setTimeout(() => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div role="dialog">Chỉ định tài sản</div>'
      );
    }, 500);
    expect((await drive(handle.done)).status).toBe('done');
  });
});

describe('Assist: chờ user, unverified, pending-approval', () => {
  it('setWaiting -> waiting-user; assistDone cho flow chạy tiếp', async () => {
    const { handle } = start(
      async (ctx) => {
        await ctx.step(6, async () => {
          ctx.setWaiting(true);
          await ctx.waitForAssistDone();
          ctx.setWaiting(false);
        });
        ctx.setTarget(0, 'done');
      },
      { mode: 'assist' }
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.snapshot()).toMatchObject({ status: 'waiting-user' });
    expect(handle.snapshot().steps[5].state).toBe('waiting');
    handle.assistDone();
    const final = await handle.done;
    expect(final.status).toBe('done');
    expect(final.steps[5].state).toBe('ok');
  });

  it('Dừng khi đang chờ user bấm Assign: target running -> unverified, vẫn có audit và tính ngân sách', async () => {
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'running');
        ctx.setWaiting(true);
        await ctx.waitForAssistDone();
      },
      { mode: 'assist' }
    );
    await vi.advanceTimersByTimeAsync(0);
    handle.stop();
    const final = await handle.done;
    expect(final.status).toBe('stopped');
    expect(final.targets[0].outcome).toBe('unverified');
    expect(auditRows()).toEqual([
      expect.objectContaining({ mode: 'assist', result: 'failed' }),
    ]);
    expect(storageState.data[WRITE_BUDGET_KEY]).toMatchObject({ used: 1 });
  });

  it('Dry chưa tới Assign thì Dừng không đổi target sang unverified', async () => {
    const { handle } = start(async (ctx) => {
      ctx.setTarget(0, 'running');
      await ctx.pause('step');
    });
    await vi.advanceTimersByTimeAsync(10);
    handle.stop();
    expect((await drive(handle.done)).targets[0].outcome).toBe('running');
  });

  it('pending-approval: status pending-approval và vẫn tính một lượt ghi', async () => {
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'pending-approval');
      },
      { mode: 'assist' }
    );
    const final = await handle.done;
    expect(final.status).toBe('pending-approval');
    expect(storageState.data[WRITE_BUDGET_KEY]).toMatchObject({ used: 1 });
    expect(auditRows()[0].result).toBe('pending');
  });

  it('unverified: run failed ERR_VERIFY_UNREADABLE, vẫn tính ngân sách', async () => {
    const { handle } = start(
      async (ctx) => {
        ctx.setTarget(0, 'unverified');
      },
      { mode: 'assist' }
    );
    const final = await handle.done;
    expect(final.status).toBe('failed');
    expect(final.error?.code).toBe('ERR_VERIFY_UNREADABLE');
    expect(storageState.data[WRITE_BUDGET_KEY]).toMatchObject({ used: 1 });
  });
});

describe('quyền riêng tư của lưu trữ', () => {
  const flow: Flow = async (ctx) => {
    ctx.setTarget(0, 'done');
  };

  it('logDetail off: lastRun và audit không chứa tên TKQC / BM ID đối tác; snapshot trong bộ nhớ vẫn đủ', async () => {
    const { handle } = start(flow, {
      logDetail: 'off',
      config: configOf({ queries: ['Spa Hoa'] }),
    });
    const final = await handle.done;
    const stored = storageState.data[LAST_RUN_KEY] as RunState;
    expect(stored.partnerBmId).toBe('');
    expect(stored.targets[0]).toMatchObject({
      accountId: 'TKQC #1',
      name: 'TKQC #1',
    });
    expect(JSON.stringify(storageState.data)).not.toContain('Spa Hoa');
    expect(JSON.stringify(storageState.data)).not.toContain(BM_ID);
    expect(final.targets[0].name).toBe('Spa Hoa');
    expect(final.partnerBmId).toBe(BM_ID);
  });

  it('logDetail basic: audit có tên TKQC nhưng chưa có BM ID đối tác', async () => {
    await start(flow, { logDetail: 'basic' }).handle.done;
    expect(auditRows()[0].target).toBe('Spa Hoa');
    const audits = Object.entries(storageState.data)
      .filter(([key]) => key.startsWith(AUDIT_PREFIX))
      .map(([, rows]) => JSON.stringify(rows))
      .join('');
    expect(audits).not.toContain(BM_ID);
  });

  it('audit nằm trong chunk của tháng hiện tại', async () => {
    await start(flow).handle.done;
    expect(Object.keys(storageState.data)).toContain(
      `${AUDIT_PREFIX}${monthKey(NOON_VN)}:1`
    );
  });
});

describe('step / skipStep / beginBatch', () => {
  it('step thành công: ok + locate/act/verify done; acted() chuyển pha', async () => {
    const seen: string[] = [];
    const { handle } = start(async (ctx) => {
      await ctx.step(1, async (h) => {
        seen.push(JSON.stringify(ctx.state().steps[0].phases));
        h.acted();
        seen.push(JSON.stringify(ctx.state().steps[0].phases));
      });
    });
    const final = await handle.done;
    expect(JSON.parse(seen[0])).toEqual({
      locate: 'run',
      act: 'idle',
      verify: 'idle',
    });
    expect(JSON.parse(seen[1])).toEqual({
      locate: 'done',
      act: 'run',
      verify: 'idle',
    });
    expect(final.steps[0]).toMatchObject({
      state: 'ok',
      phases: { locate: 'done', act: 'done', verify: 'done' },
    });
  });

  it('Dừng giữa bước không đánh dấu bước là failed', async () => {
    const { handle } = start(async (ctx) => {
      await ctx.step(2, () => ctx.pause('step'));
    });
    await vi.advanceTimersByTimeAsync(100);
    handle.stop();
    const final = await drive(handle.done);
    expect(final.status).toBe('stopped');
    expect(final.steps[1].state).toBe('running');
  });

  it('skipStep, beginBatch', async () => {
    const final = await start(async (ctx) => {
      await ctx.step(1, async () => undefined);
      ctx.beginBatch(2, 3, [4]);
      ctx.skipStep(7, { locate: 'skip', act: 'skip', verify: 'skip' });
      ctx.setTarget(0, 'done');
    }).handle.done;
    expect(final.batch).toEqual({ index: 2, total: 3 });
    expect(final.steps[0].state).toBe('pending');
    expect(final.steps[6]).toMatchObject({ state: 'skipped' });
  });
});
