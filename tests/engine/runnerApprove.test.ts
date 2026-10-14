import type { Flow } from '@/content/engine/runner';
import type { ApproveConfig } from '@/shared/approve';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import EngineError from '@/content/engine/errors';
import { startApproveRun } from '@/content/engine/runner';
import { LAST_RUN_KEY } from '@/content/engine/store';
import { AUDIT_PREFIX } from '@/shared/audit';
import { localDay, WRITE_BUDGET_KEY } from '@/shared/budget';

import { storageState } from '../helpers/browserMock';
import { BM_ID, pacingOf } from '../helpers/fixtures';
import { NIGHT_VN, NOON_VN } from '../helpers/timers';

const config: ApproveConfig = {
  partnerName: 'Tris BM',
  action: 'approve',
  requests: [
    { requester: 'Duc TNM', account: 'AA' },
    { requester: 'Duc TNM', account: 'BB' },
    { requester: 'Duc TNM', account: 'CC' },
  ],
};

function start(
  flow: Flow<ApproveConfig>,
  mode: 'dry' | 'assist' | 'full',
  logDetail: 'off' | 'basic' = 'off'
) {
  return startApproveRun({
    mode,
    config,
    businessId: BM_ID,
    pacing: pacingOf(),
    logDetail,
    flow,
    onState: () => undefined,
  });
}

const auditRows = (): { flow: string; target: string; result: string }[] =>
  Object.entries(storageState.data)
    .filter(([key]) => key.startsWith(AUDIT_PREFIX))
    .flatMap(
      ([, rows]) => rows as { flow: string; target: string; result: string }[]
    );

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON_VN);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('startApproveRun', () => {
  it('Assist: ngân sách ghi tính theo từng request đã ghi (không phải một lần cho cả run)', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
      ctx.setTarget(1, 'unverified');
      ctx.setTarget(2, 'failed', 'ERR_NOT_APPROVED');
    }, 'assist');
    await done;
    // done + unverified có thể đã gửi tới Meta; failed (không bấm) thì không tính.
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOON_VN),
      used: 2,
    });
  });

  it('Dry không tính ngân sách; audit đúng flow và không PII ở mức off', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
      ctx.setTarget(1, 'done');
      ctx.setTarget(2, 'done');
    }, 'dry');
    const final = await done;
    expect(final.flow).toBe('partner-approve');
    expect(storageState.data[WRITE_BUDGET_KEY]).toBeUndefined();
    expect(auditRows()).toEqual([
      expect.objectContaining({
        flow: 'partner-approve',
        target: 'Request #1 · approve',
        result: 'dry',
      }),
      expect.objectContaining({
        flow: 'partner-approve',
        target: 'Request #2 · approve',
      }),
      expect.objectContaining({
        flow: 'partner-approve',
        target: 'Request #3 · approve',
      }),
    ]);
  });

  it('lastRun lưu ở mức off không chứa BM, requester hay TKQC', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
      ctx.setTarget(1, 'done');
      ctx.setTarget(2, 'done');
      ctx.setTargetId(0, 'Duc TNM → Tris BM · 4680448748947419 · #1');
    }, 'dry');
    await done;
    const stored = JSON.stringify(storageState.data[LAST_RUN_KEY]);
    expect(stored).not.toContain('Tris BM');
    expect(stored).not.toContain('4680448748947419');
    expect(stored).not.toContain('Duc TNM');
    expect(stored).not.toContain('"AA"');
    expect(stored).toContain('Request #1');
  });

  it('audit ở mức basic chỉ có tên TKQC, không có BM ID dù flow đã gắn ID vào dòng định danh', async () => {
    const { done } = start(
      async (ctx) => {
        ctx.setTarget(0, 'done');
        ctx.setTargetId(0, 'Duc TNM → Tris BM · 4680448748947419 · #1');
        ctx.setTarget(1, 'done');
        ctx.setTarget(2, 'done');
      },
      'dry',
      'basic'
    );
    await done;
    const rows = auditRows();
    expect(rows.map((row) => row.target)).toEqual([
      'AA · approve',
      'BB · approve',
      'CC · approve',
    ]);
    expect(JSON.stringify(rows)).not.toContain('4680448748947419');
  });

  it('Assist: nút bấm ngược quyết định (ERR_WRONG_ACTION) vẫn là một lần ghi, được tính ngân sách', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'failed', 'ERR_WRONG_ACTION');
      ctx.setTarget(1, 'failed', 'ERR_NOT_APPROVED');
    }, 'assist');
    await done;
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOON_VN),
      used: 1,
    });
  });

  it('Full: tính ngân sách theo từng request như Assist, ghi mode full vào audit', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'done');
      ctx.setTarget(1, 'unverified');
      ctx.setTarget(2, 'failed', 'ERR_NOT_APPROVED');
    }, 'full');
    await done;
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOON_VN),
      used: 2,
    });
    expect(
      Object.entries(storageState.data)
        .filter(([key]) => key.startsWith(AUDIT_PREFIX))
        .flatMap(([, rows]) => rows as { mode: string }[])
        .map((row) => row.mode)
    ).toEqual(['full', 'full', 'full']);
  });

  it('Full: run dừng bất thường sau markWriteStarted thì target đang chạy thành unverified và được tính', async () => {
    const { done } = start(async (ctx) => {
      ctx.setTarget(0, 'running');
      ctx.markWriteStarted();
      throw new EngineError('ERR_UNEXPECTED_DIALOG');
    }, 'full');
    const final = await done;
    expect(final.targets[0].outcome).toBe('unverified');
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOON_VN),
      used: 1,
    });
  });

  it('Full: curfew chặn mọi hành động như Assist', async () => {
    vi.setSystemTime(NIGHT_VN);
    const { done } = start(async (ctx) => {
      await ctx.gate();
      ctx.setTarget(0, 'done');
    }, 'full');
    const final = await done;
    expect(final.error?.code).toBe('ERR_CURFEW');
  });
});
