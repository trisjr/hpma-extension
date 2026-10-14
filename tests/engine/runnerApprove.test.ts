import type { Flow } from '@/content/engine/runner';
import type { ApproveConfig } from '@/shared/approve';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startApproveRun } from '@/content/engine/runner';
import { LAST_RUN_KEY } from '@/content/engine/store';
import { AUDIT_PREFIX } from '@/shared/audit';
import { localDay, WRITE_BUDGET_KEY } from '@/shared/budget';

import { storageState } from '../helpers/browserMock';
import { BM_ID, pacingOf } from '../helpers/fixtures';
import { NOON_VN } from '../helpers/timers';

const config: ApproveConfig = {
  partnerName: 'Tris BM',
  requests: [
    { requester: 'Duc TNM', account: 'AA' },
    { requester: 'Duc TNM', account: 'BB' },
    { requester: 'Duc TNM', account: 'CC' },
  ],
};

function start(
  flow: Flow<ApproveConfig>,
  mode: 'dry' | 'assist',
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
        target: 'Request #1',
        result: 'dry',
      }),
      expect.objectContaining({
        flow: 'partner-approve',
        target: 'Request #2',
      }),
      expect.objectContaining({
        flow: 'partner-approve',
        target: 'Request #3',
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
    expect(rows.map((row) => row.target)).toEqual(['AA', 'BB', 'CC']);
    expect(JSON.stringify(rows)).not.toContain('4680448748947419');
  });
});
