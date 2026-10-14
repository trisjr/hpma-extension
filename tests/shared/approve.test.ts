import { describe, expect, it } from 'vitest';

import { createApproveRun, settle } from '@/content/engine/runState';
import {
  isRequestsRead,
  isRequestsReply,
  MAX_APPROVE_REQUESTS,
  parseApproveConfig,
  validatePartnerName,
} from '@/shared/approve';
import { rowsFromRun } from '@/shared/audit';
import { isRunCommand } from '@/shared/messaging';
import { isApproveRun, isRunState, STEP_COUNT } from '@/shared/run';
import { isOnSurface } from '@/shared/surfaces';

const request = { requester: 'Duc TNM', account: 'AA' };
const config = {
  partnerName: 'Tris BM',
  action: 'approve' as const,
  requests: [request],
};

describe('validatePartnerName / parseApproveConfig', () => {
  it('tên rỗng hoặc quá dài bị từ chối', () => {
    expect(validatePartnerName('   ')).toBe('empty');
    expect(validatePartnerName('x'.repeat(101))).toBe('tooLong');
    expect(validatePartnerName('Tris BM')).toBeUndefined();
  });

  it('chấp nhận cấu hình hợp lệ và chuẩn hoá khoảng trắng', () => {
    expect(
      parseApproveConfig({
        partnerName: '  Tris   BM ',
        action: 'decline',
        requests: [{ requester: ' Duc  TNM', account: 'AA' }],
      })
    ).toEqual({
      partnerName: 'Tris BM',
      action: 'decline',
      requests: [{ requester: 'Duc TNM', account: 'AA' }],
    });
  });

  it.each([
    ['không phải object', 'x'],
    ['thiếu tên', { action: 'approve', requests: [request] }],
    ['thiếu action', { partnerName: 'Tris BM', requests: [request] }],
    [
      'action lạ',
      { partnerName: 'Tris BM', action: 'reject', requests: [request] },
    ],
    [
      'không có request',
      { partnerName: 'Tris BM', action: 'approve', requests: [] },
    ],
    [
      'quá nhiều request',
      {
        partnerName: 'Tris BM',
        action: 'approve',
        requests: Array.from(
          { length: MAX_APPROVE_REQUESTS + 1 },
          () => request
        ),
      },
    ],
    [
      'request thiếu TKQC',
      {
        partnerName: 'Tris BM',
        action: 'approve',
        requests: [{ requester: 'Duc TNM' }],
      },
    ],
    [
      'request sai kiểu',
      {
        partnerName: 'Tris BM',
        action: 'approve',
        requests: [{ requester: 1, account: 'AA' }],
      },
    ],
  ])('từ chối cấu hình: %s', (_label, raw) => {
    expect(parseApproveConfig(raw)).toBeUndefined();
  });
});

describe('guard message', () => {
  it('requests.read cần tên BM hợp lệ', () => {
    expect(isRequestsRead({ kind: 'requests.read', partnerName: 'A' })).toBe(
      true
    );
    expect(isRequestsRead({ kind: 'requests.read', partnerName: ' ' })).toBe(
      false
    );
    expect(isRequestsRead({ kind: 'requests.read' })).toBe(false);
  });

  it('phản hồi quét phải đúng shape', () => {
    expect(
      isRequestsReply({ ok: true, businessId: '123', requests: [request] })
    ).toBe(true);
    expect(isRequestsReply({ ok: false, error: 'surface' })).toBe(true);
    expect(isRequestsReply({ ok: false, error: 'other' })).toBe(false);
    expect(
      isRequestsReply({ ok: true, businessId: 'abc', requests: [request] })
    ).toBe(false);
    expect(
      isRequestsReply({ ok: true, businessId: '123', requests: [{}] })
    ).toBe(false);
  });

  it('run.start nhận flow hợp lệ, vắng flow vẫn là Gán partner', () => {
    const base = {
      kind: 'run.start',
      requestId: 'r',
      mode: 'dry',
      businessId: '123',
      config: {},
    };
    expect(isRunCommand(base)).toBe(true);
    expect(isRunCommand({ ...base, flow: 'partner-approve' })).toBe(true);
    expect(isRunCommand({ ...base, flow: 'partner-assign' })).toBe(true);
    expect(isRunCommand({ ...base, flow: 'rename' })).toBe(false);
  });

  it('mode full chỉ hợp lệ với flow duyệt/từ chối request', () => {
    const base = {
      kind: 'run.start',
      requestId: 'r1',
      mode: 'full',
      businessId: '123',
      config: {},
    };
    expect(isRunCommand({ ...base, flow: 'partner-approve' })).toBe(true);
    expect(isRunCommand({ ...base, flow: 'partner-assign' })).toBe(false);
    expect(isRunCommand(base)).toBe(false);
  });
});

describe('run duyệt request', () => {
  const run = createApproveRun({
    mode: 'dry',
    config,
    now: 1,
    runId: 'run_abc123',
  });

  it('snapshot qua isRunState (không bị panel loại im lặng)', () => {
    expect(isApproveRun(run)).toBe(true);
    expect(isRunState(run)).toBe(true);
    expect(run.steps).toHaveLength(STEP_COUNT);
    expect(run.steps[5].titleKey).toBe('approve.step.6');
    // Dữ liệu `lastRun` cũ không có `flow` vẫn parse được.
    const legacy = { ...run, flow: undefined, partnerName: undefined };
    expect(isRunState(legacy)).toBe(true);
    expect(isApproveRun(legacy)).toBe(false);
  });

  it('audit đúng flow, và không PII ở mức log off', () => {
    const done = {
      ...run,
      targets: [{ ...run.targets[0], outcome: 'done' as const }],
    };
    const [off] = rowsFromRun(done, 'off');
    expect(off).toMatchObject({
      flow: 'partner-approve',
      target: 'Request #1 · approve',
    });
    // Mức basic chỉ có tên TKQC (như flow Gán partner): không BM đối tác, không BM ID.
    const withId = {
      ...done,
      targets: [
        {
          ...done.targets[0],
          accountId: 'Duc TNM → Tris BM · 4680448748947419 · #1',
        },
      ],
    };
    const [basic] = rowsFromRun(withId, 'basic');
    expect(basic.target).toBe('AA · approve');
    expect(JSON.stringify(basic)).not.toContain('4680448748947419');
    expect(JSON.stringify(basic)).not.toContain('Tris BM');
    const [verbose] = rowsFromRun(done, 'verbose');
    expect(verbose.target).toBe('AA → Tris BM · approve');
  });

  it('audit ghi rõ Decline, không nhầm với Approve; Full ghi mode full', () => {
    const declined = createApproveRun({
      mode: 'full',
      config: { ...config, action: 'decline' },
      now: 1,
      runId: 'run_decl',
    });
    const done = {
      ...declined,
      targets: [{ ...declined.targets[0], outcome: 'done' as const }],
    };
    const [row] = rowsFromRun(done, 'off');
    expect(row).toMatchObject({
      mode: 'full',
      result: 'done',
      target: 'Request #1 · decline',
    });
    expect(declined.steps[5].titleKey).toBe('approve.step.6.decline');
    expect(isRunState(declined)).toBe(true);
  });

  it('ERR_WRONG_ACTION: audit ghi hành động thực sự đã bấm, không phải quyết định đã chọn', () => {
    const chosen = createApproveRun({
      mode: 'assist',
      config: { ...config, action: 'decline' },
      now: 1,
      runId: 'run_wrong',
    });
    const wrong = {
      ...chosen,
      targets: [
        {
          ...chosen.targets[0],
          outcome: 'failed' as const,
          code: 'ERR_WRONG_ACTION' as const,
        },
      ],
    };
    const [row] = rowsFromRun(wrong, 'off');
    expect(row.target).toBe('Request #1 · approve (wrong-action)');
  });

  it('mỗi target có accountId riêng dù request trùng hệt nhau', () => {
    const twice = createApproveRun({
      mode: 'dry',
      config: { ...config, requests: [request, request] },
      now: 1,
      runId: 'run_dup',
    });
    expect(new Set(twice.targets.map((item) => item.accountId)).size).toBe(2);
  });

  it('settle: có request duyệt xong thì done, không có thì failed theo mã của target', () => {
    const ok = {
      ...run,
      targets: [{ ...run.targets[0], outcome: 'done' as const }],
    };
    expect(settle(ok).status).toBe('done');
    const bad = {
      ...run,
      stepIndex: 3,
      targets: [
        {
          ...run.targets[0],
          outcome: 'failed' as const,
          code: 'ERR_NOT_APPROVED',
        },
      ],
    };
    expect(settle(bad)).toEqual({
      status: 'failed',
      error: { code: 'ERR_NOT_APPROVED', stepIndex: 3 },
    });
    const unverified = {
      ...run,
      targets: [{ ...run.targets[0], outcome: 'unverified' as const }],
    };
    expect(settle(unverified).error?.code).toBe('ERR_VERIFY_UNREADABLE');
  });
});

describe('surface requests', () => {
  it('chỉ khớp trang Requests, trong khi settings khớp mọi trang cài đặt', () => {
    expect(isOnSurface('requests', '/latest/settings/requests')).toBe(true);
    expect(isOnSurface('requests', '/latest/settings/partners')).toBe(false);
    expect(isOnSurface('settings', '/latest/settings/requests')).toBe(true);
  });
});
