import type { Flow } from '@/content/engine/runner';
import type { RunCommand, StartReply } from '@/shared/messaging';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { localDay, WRITE_BUDGET_KEY } from '@/shared/budget';

import { storageState } from '../helpers/browserMock';
import { NOON_VN } from '../helpers/timers';

// Hai flow thật được thay bằng mock: chỉ kiểm controller chọn đúng flow theo `flow` của lệnh.
const approveFlow = vi.hoisted(() => vi.fn<Flow<never>>());
const assignFlow = vi.hoisted(() => vi.fn<Flow>());
vi.mock('@/content/flows/partnerApprove', () => ({ default: approveFlow }));
vi.mock('@/content/flows/partnerAssign', () => ({ default: assignFlow }));

type Handle = (command: RunCommand) => Promise<unknown>;

async function load(): Promise<Handle> {
  vi.resetModules();
  return (await import('@/content/engine/controller')).default;
}

const TAB_BM = '104536928206688';
const approveConfig = {
  partnerName: 'Tris BM',
  action: 'approve',
  requests: [{ requester: 'Duc TNM', account: 'AA' }],
};
const command = (overrides: Record<string, unknown> = {}): RunCommand =>
  ({
    kind: 'run.start',
    flow: 'partner-approve',
    mode: 'dry',
    businessId: TAB_BM,
    config: approveConfig,
    ...overrides,
  }) as RunCommand;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON_VN);
  approveFlow.mockReset().mockResolvedValue(undefined);
  assignFlow.mockReset().mockResolvedValue(undefined);
  window.history.pushState(
    {},
    '',
    `/latest/settings/requests?business_id=${TAB_BM}`
  );
});

describe('controller: flow partner-approve', () => {
  it('chạy flow duyệt (không phải flow Gán partner) với config đã validate', async () => {
    const handle = await load();
    const reply = (await handle(command())) as StartReply;
    expect(reply.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(approveFlow).toHaveBeenCalledTimes(1);
    expect(assignFlow).not.toHaveBeenCalled();
    const ctx = approveFlow.mock.calls[0][0] as unknown as {
      config: typeof approveConfig;
    };
    expect(ctx.config).toEqual(approveConfig);
  });

  it('config sai (không có request / thiếu tên) bị từ chối ERR_INVALID_CONFIG', async () => {
    const handle = await load();
    expect(
      await handle(command({ config: { ...approveConfig, requests: [] } }))
    ).toEqual({ ok: false, code: 'ERR_INVALID_CONFIG' });
    expect(await handle(command({ config: { requests: [] } }))).toEqual({
      ok: false,
      code: 'ERR_INVALID_CONFIG',
    });
    expect(approveFlow).not.toHaveBeenCalled();
  });

  it('thiếu hoặc sai action bị từ chối ERR_INVALID_CONFIG (không có mặc định ngầm)', async () => {
    const handle = await load();
    const noAction = { ...approveConfig, action: undefined };
    expect(await handle(command({ config: noAction }))).toEqual({
      ok: false,
      code: 'ERR_INVALID_CONFIG',
    });
    expect(
      await handle(command({ config: { ...approveConfig, action: 'reject' } }))
    ).toEqual({ ok: false, code: 'ERR_INVALID_CONFIG' });
    expect(approveFlow).not.toHaveBeenCalled();
  });

  it('Full: qua cùng cổng ngân sách như Assist, và chỉ chạy flow duyệt', async () => {
    const requests = [
      { requester: 'Duc TNM', account: 'AA' },
      { requester: 'Duc TNM', account: 'BB' },
    ];
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 19 };
    const handle = await load();
    expect(
      await handle(
        command({ mode: 'full', config: { ...approveConfig, requests } })
      )
    ).toEqual({ ok: false, code: 'ERR_BUDGET' });
    expect(approveFlow).not.toHaveBeenCalled();
  });

  it('Full của Gán partner: ngân sách tính theo số mẻ (mỗi mẻ một cú bấm Assign), không phải một lần cho cả run', async () => {
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 19 };
    const handle = await load();
    const assign = (queries: string[]) =>
      command({
        flow: 'partner-assign',
        mode: 'full',
        config: {
          partnerBmId: '1451597353550362',
          queries,
          tasks: ['ANALYZE'],
        },
      });
    // 11 TKQC = 2 mẻ: 19 + 2 > 20 → bị từ chối, không chạy flow.
    expect(
      await handle(
        assign(Array.from({ length: 11 }, (_, index) => `TK${index}`))
      )
    ).toEqual({ ok: false, code: 'ERR_BUDGET' });
    expect(assignFlow).not.toHaveBeenCalled();
    // 1 mẻ: 19 + 1 ≤ 20 → chạy.
    expect(await handle(assign(['TK1']))).toMatchObject({ ok: true });
  });

  it('config của Gán partner gửi kèm flow duyệt không được chấp nhận', async () => {
    const handle = await load();
    const reply = await handle(
      command({
        config: {
          partnerBmId: '1451597353550362',
          queries: ['x'],
          tasks: ['ANALYZE'],
        },
      })
    );
    expect(reply).toEqual({ ok: false, code: 'ERR_INVALID_CONFIG' });
  });

  it('Assist: mỗi request là một lần ghi, nên cả danh sách phải nằm gọn trong ngân sách còn lại', async () => {
    const requests = [
      { requester: 'Duc TNM', account: 'AA' },
      { requester: 'Duc TNM', account: 'BB' },
      { requester: 'Duc TNM', account: 'CC' },
    ];
    // Mặc định 20 lần ghi/ngày: còn 2 lần thì 3 request không đủ, 3 lần thì đủ.
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 18 };
    const handle = await load();
    expect(
      await handle(
        command({ mode: 'assist', config: { ...approveConfig, requests } })
      )
    ).toEqual({ ok: false, code: 'ERR_BUDGET' });
    expect(approveFlow).not.toHaveBeenCalled();
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 17 };
    expect(
      await handle(
        command({ mode: 'assist', config: { ...approveConfig, requests } })
      )
    ).toMatchObject({ ok: true });
    // Dry không ghi nên không bị cổng ngân sách chặn.
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOON_VN), used: 20 };
    const next = await load();
    expect(await next(command({ mode: 'dry' }))).toMatchObject({ ok: true });
  });

  it('BM của tab khác BM panel đã quét -> ERR_BM_CHANGED', async () => {
    const handle = await load();
    expect(await handle(command({ businessId: '999' }))).toEqual({
      ok: false,
      code: 'ERR_BM_CHANGED',
    });
  });

  it('lệnh không có `flow` vẫn đi flow Gán partner (tương thích panel cũ)', async () => {
    const handle = await load();
    const reply = await handle(
      command({
        flow: undefined,
        config: {
          partnerBmId: '1451597353550362',
          queries: ['Spa Hoa'],
          tasks: ['ANALYZE'],
        },
      })
    );
    expect((reply as StartReply).ok).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(assignFlow).toHaveBeenCalledTimes(1);
    expect(approveFlow).not.toHaveBeenCalled();
  });
});
