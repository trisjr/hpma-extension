import type { Flow } from '@/content/engine/runner';
import type {
  AckReply,
  RunCommand,
  StartReply,
  SyncReply,
} from '@/shared/messaging';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LAST_RUN_KEY } from '@/content/engine/store';
import {
  EMERGENCY_KEY,
  localDay,
  RATE_LIMIT_KEY,
  WRITE_BUDGET_KEY,
} from '@/shared/budget';
import { PACING_KEY } from '@/shared/settings';

import { browserMock, storageState } from '../helpers/browserMock';
import { BM_ID } from '../helpers/fixtures';
import { drive, NIGHT_VN, NOON_VN } from '../helpers/timers';

// Flow thật được thay bằng flow điều khiển được từ test.
const flow = vi.hoisted(() => vi.fn<Flow>());
vi.mock('@/content/flows/partnerAssign', () => ({ default: flow }));

type Handle = (
  command: RunCommand
) => Promise<StartReply | AckReply | SyncReply>;

// Controller giữ state ở cấp module: mỗi test nạp bản mới để không rò ERR_BUSY.
async function load(): Promise<Handle> {
  vi.resetModules();
  return (await import('@/content/engine/controller')).default;
}

const config = { partnerBmId: BM_ID, queries: ['Spa Hoa'], tasks: ['ANALYZE'] };
// BM của tab (khác BM đối tác) và BM panel đã chọn TKQC.
const TAB_BM = '1451597353550999';
const startCommand = (
  mode: 'dry' | 'assist',
  overrides: Record<string, unknown> = {},
  businessId: string = TAB_BM
): RunCommand =>
  ({
    kind: 'run.start',
    mode,
    businessId,
    config: { ...config, ...overrides },
  }) as RunCommand;

// Flow chạy tới khi bị Dừng hoặc được `release()`.
function holdFlow(): { release: () => void } {
  let release: () => void = () => undefined;
  flow.mockImplementation(
    (ctx) =>
      new Promise<void>((resolve, reject) => {
        release = () => {
          ctx.setTarget(0, 'done');
          resolve();
        };
        ctx.signal.addEventListener('abort', () => {
          // Lớp lỗi phải là bản của registry hiện tại (sau resetModules) để `instanceof` đúng.
          import('@/content/engine/stop').then(({ default: RunStopped }) =>
            reject(new RunStopped())
          );
        });
      })
  );
  return { release: () => release() };
}

const settle = async (): Promise<void> => {
  await vi.advanceTimersByTimeAsync(0);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON_VN);
  flow.mockReset();
  flow.mockImplementation(async (ctx) => {
    ctx.setTarget(0, 'done');
  });
  window.history.replaceState({}, '', `/settings?business_id=${TAB_BM}`);
});

describe('run.start: BM của panel phải khớp tab', () => {
  it('tab đã sang BM khác trước khi bấm Run -> ERR_BM_CHANGED, không chạy flow (cả Dry-run)', async () => {
    const handle = await load();
    expect(await handle(startCommand('dry', {}, '1451597353550111'))).toEqual({
      ok: false,
      code: 'ERR_BM_CHANGED',
    });
    expect(
      await handle(startCommand('assist', {}, '1451597353550111'))
    ).toEqual({ ok: false, code: 'ERR_BM_CHANGED' });
    expect(flow).not.toHaveBeenCalled();
  });

  it('URL không có business_id lúc start -> ERR_NO_BUSINESS (guard không tắt im lặng)', async () => {
    window.history.replaceState({}, '', '/settings');
    const handle = await load();
    expect(await handle(startCommand('dry'))).toEqual({
      ok: false,
      code: 'ERR_NO_BUSINESS',
    });
    expect(flow).not.toHaveBeenCalled();
  });
});

describe('run.start: validate cấu hình', () => {
  it('từ chối config sai (do panel gửi) bằng ERR_INVALID_CONFIG', async () => {
    const handle = await load();
    const bad = [
      { partnerBmId: '123' },
      { queries: [] },
      { tasks: ['DELETE_EVERYTHING'] },
      { queries: [42] },
    ];
    // eslint-disable-next-line no-restricted-syntax
    for (const override of bad) {
      // eslint-disable-next-line no-await-in-loop
      expect(await handle(startCommand('dry', override))).toEqual({
        ok: false,
        code: 'ERR_INVALID_CONFIG',
      });
    }
    expect(flow).not.toHaveBeenCalled();
  });

  it('tổ hợp quyền UI không biểu diễn được (chỉ ADVERTISE) cũng bị từ chối', async () => {
    const handle = await load();
    expect(
      await handle(startCommand('assist', { tasks: ['ADVERTISE'] }))
    ).toEqual({ ok: false, code: 'ERR_INVALID_CONFIG' });
  });
});

describe('run.start: cổng an toàn của Assist', () => {
  it('khoá khẩn cấp -> ERR_EMERGENCY', async () => {
    storageState.data[EMERGENCY_KEY] = NOON_VN - 1000;
    const handle = await load();
    expect(await handle(startCommand('assist'))).toEqual({
      ok: false,
      code: 'ERR_EMERGENCY',
    });
    expect(flow).not.toHaveBeenCalled();
  });

  it('bị Meta giới hạn tần suất còn hạn -> ERR_RATE_LIMITED', async () => {
    storageState.data[RATE_LIMIT_KEY] = NOON_VN + 60_000;
    const handle = await load();
    expect(await handle(startCommand('assist'))).toEqual({
      ok: false,
      code: 'ERR_RATE_LIMITED',
    });
  });

  it('trong khung curfew -> ERR_CURFEW', async () => {
    vi.setSystemTime(NIGHT_VN);
    storageState.data[PACING_KEY] = {
      curfew: { on: true, from: '00:00', to: '06:00', tz: 'Asia/Ho_Chi_Minh' },
    };
    const handle = await load();
    expect(await handle(startCommand('assist'))).toEqual({
      ok: false,
      code: 'ERR_CURFEW',
    });
  });

  it('hết ngân sách ghi hôm nay -> ERR_BUDGET; còn dư thì chạy', async () => {
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 20 };
    const handle = await load();
    expect(await handle(startCommand('assist'))).toEqual({
      ok: false,
      code: 'ERR_BUDGET',
    });
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 19 };
    expect(await handle(startCommand('assist'))).toMatchObject({ ok: true });
  });

  it('ngân sách của ngày hôm qua không chặn', async () => {
    storageState.data[WRITE_BUDGET_KEY] = { day: '2020-01-01', used: 999 };
    const handle = await load();
    expect(await handle(startCommand('assist'))).toMatchObject({ ok: true });
  });

  it('Dry bỏ qua mọi cổng (không ghi): khẩn cấp, rate limit, curfew, ngân sách', async () => {
    vi.setSystemTime(NIGHT_VN);
    storageState.data[EMERGENCY_KEY] = 1;
    storageState.data[RATE_LIMIT_KEY] = NIGHT_VN + 60_000;
    storageState.data[WRITE_BUDGET_KEY] = {
      day: localDay(NIGHT_VN),
      used: 999,
    };
    const handle = await load();
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
  });

  it('theo ngân sách cấu hình trong Options (writesPerDay)', async () => {
    storageState.data[PACING_KEY] = {
      limits: { standard: { writesPerDay: 2 } },
    };
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 2 };
    const handle = await load();
    expect(await handle(startCommand('assist'))).toMatchObject({
      code: 'ERR_BUDGET',
    });
  });
});

describe('một run tại một thời điểm', () => {
  it('start thứ hai khi đang chạy -> ERR_BUSY', async () => {
    holdFlow();
    const handle = await load();
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
    expect(await handle(startCommand('dry'))).toEqual({
      ok: false,
      code: 'ERR_BUSY',
    });
  });

  it('hai start đồng thời: đúng một cái được chạy', async () => {
    holdFlow();
    const handle = await load();
    const replies = await Promise.all([
      handle(startCommand('dry')),
      handle(startCommand('dry')),
    ]);
    expect(replies.filter((reply) => 'ok' in reply && reply.ok)).toHaveLength(
      1
    );
    expect(replies).toContainEqual({ ok: false, code: 'ERR_BUSY' });
    expect(flow).toHaveBeenCalledTimes(1);
  });

  it('run xong thì start được lại', async () => {
    const handle = await load();
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
    await settle();
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
  });

  it('start lỗi gate không để lại cờ starting (start sau không bị ERR_BUSY)', async () => {
    storageState.data[EMERGENCY_KEY] = 1;
    const handle = await load();
    expect(await handle(startCommand('assist'))).toMatchObject({
      code: 'ERR_EMERGENCY',
    });
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
  });
});

describe('run.stop / run.assistDone / run.sync / run.clear', () => {
  it('stop/assistDone sai runId bị từ chối', async () => {
    holdFlow();
    const handle = await load();
    await handle(startCommand('dry'));
    expect(await handle({ kind: 'run.stop', runId: 'run_nope' })).toEqual({
      ok: false,
    });
    expect(await handle({ kind: 'run.assistDone', runId: 'run_nope' })).toEqual(
      {
        ok: false,
      }
    );
  });

  it('stop đúng runId dừng run; sync trả snapshot cuối tới khi clear', async () => {
    holdFlow();
    const handle = await load();
    const started = (await handle(startCommand('dry'))) as { runId: string };
    const running = (await handle({ kind: 'run.sync' })) as SyncReply;
    expect(running.run).toMatchObject({
      runId: started.runId,
      status: 'running',
    });

    expect(await handle({ kind: 'run.stop', runId: started.runId })).toEqual({
      ok: true,
    });
    await settle();
    const after = (await handle({ kind: 'run.sync' })) as SyncReply;
    expect(after.run).toMatchObject({
      runId: started.runId,
      status: 'stopped',
    });

    expect(await handle({ kind: 'run.clear' })).toEqual({ ok: true });
    expect(await handle({ kind: 'run.sync' })).toEqual({
      kind: 'run.snapshot',
      run: undefined,
    });
  });

  it('kill-switch (stopActiveRun) dừng run đang chạy không cần runId, không có run thì vô hại', async () => {
    holdFlow();
    vi.resetModules();
    const { default: handle, stopActiveRun } = await import(
      '@/content/engine/controller'
    );
    stopActiveRun();
    await handle(startCommand('dry'));
    stopActiveRun();
    await settle();
    const after = (await handle({ kind: 'run.sync' })) as SyncReply;
    expect(after.run).toMatchObject({ status: 'stopped' });
    stopActiveRun();
  });

  it('kill-switch bấm đúng lúc run đang khởi động vẫn dừng run ngay khi nó được tạo', async () => {
    holdFlow();
    vi.resetModules();
    const { default: handle, stopActiveRun } = await import(
      '@/content/engine/controller'
    );
    const starting = handle(startCommand('dry'));
    stopActiveRun();
    await starting;
    await settle();
    const after = (await handle({ kind: 'run.sync' })) as SyncReply;
    expect(after.run).toMatchObject({ status: 'stopped' });
  });

  it('clear khi đang chạy bị từ chối; clear xong thì xoá lastRun khỏi storage', async () => {
    const { release } = holdFlow();
    const handle = await load();
    await handle(startCommand('dry'));
    expect(await handle({ kind: 'run.clear' })).toEqual({ ok: false });
    release();
    await settle();
    expect(storageState.data[LAST_RUN_KEY]).toBeDefined();
    expect(await handle({ kind: 'run.clear' })).toEqual({ ok: true });
    expect(storageState.data[LAST_RUN_KEY]).toBeUndefined();
  });

  it('assistDone đúng runId được chuyển tới flow', async () => {
    let resumed = false;
    flow.mockImplementation(async (ctx) => {
      ctx.setWaiting(true);
      await ctx.waitForAssistDone();
      resumed = true;
      ctx.setTarget(0, 'done');
    });
    const handle = await load();
    const started = (await handle(startCommand('assist'))) as { runId: string };
    await settle();
    expect(
      ((await handle({ kind: 'run.sync' })) as SyncReply).run?.status
    ).toBe('waiting-user');
    expect(
      await handle({ kind: 'run.assistDone', runId: started.runId })
    ).toEqual({ ok: true });
    await settle();
    expect(resumed).toBe(true);
    expect(
      ((await handle({ kind: 'run.sync' })) as SyncReply).run?.status
    ).toBe('done');
  });

  it('lệnh lạ thì ok:false', async () => {
    const handle = await load();
    expect(
      await handle({ kind: 'run.unknown' } as unknown as RunCommand)
    ).toEqual({ ok: false });
  });
});

describe('phát sự kiện run.state', () => {
  it('gửi snapshot tới panel qua runtime.sendMessage', async () => {
    const handle = await load();
    await handle(startCommand('dry'));
    await settle();
    const events = browserMock.runtime.sendMessage.mock.calls.map(
      ([event]) => event as { kind: string; run: { status: string } }
    );
    expect(events.every((event) => event.kind === 'run.state')).toBe(true);
    expect(events[0].run.status).toBe('running');
    expect(events[events.length - 1].run.status).toBe('done');
  });

  it('panel đóng (sendMessage reject) thì run vẫn chạy bình thường', async () => {
    browserMock.runtime.sendMessage.mockImplementation(async () => {
      throw new Error('Receiving end does not exist');
    });
    const handle = await load();
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
    await settle();
    expect(
      ((await handle({ kind: 'run.sync' })) as SyncReply).run?.status
    ).toBe('done');
  });
});

describe('flow lỗi', () => {
  it('flow ném lỗi thì run failed và controller nhận run mới được', async () => {
    flow.mockImplementation(async () => {
      throw new Error('boom');
    });
    const handle = await load();
    await handle(startCommand('dry'));
    await drive(settle());
    expect(
      ((await handle({ kind: 'run.sync' })) as SyncReply).run
    ).toMatchObject({ status: 'failed', error: { code: 'ERR_INTERNAL' } });
    flow.mockImplementation(async (ctx) => ctx.setTarget(0, 'done'));
    expect(await handle(startCommand('dry'))).toMatchObject({ ok: true });
  });
});
