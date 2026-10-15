import type { RunState } from '@/shared/run';
import type { CurfewConfig } from '@/shared/settings';
import { describe, expect, it } from 'vitest';

import {
  claimGate,
  countTargets,
  curfewEndsAt,
  fullCapBlock,
  GateInput,
  INCIDENT_WINDOW_MS,
  incidentBlock,
  mapPrepareError,
  mapRunEnd,
  mapStartReply,
  nextLocalMidnight,
  ReplyContext,
} from '@/background/dispatchLogic';

const NOW = Date.UTC(2025, 0, 1, 12, 0, 0);
const CURFEW: CurfewConfig = {
  on: true,
  from: '00:00',
  to: '06:00',
  tz: 'Asia/Ho_Chi_Minh',
};

const gateInput = (patch: Partial<GateInput> = {}): GateInput => ({
  now: NOW,
  machine: 'idle',
  killGlobal: false,
  killBm: false,
  emergency: undefined,
  rateLimitedUntil: undefined,
  incidents: [],
  fullStarts: [],
  fullCap: undefined,
  job: { flow: 'partner-assign', mode: 'dry' },
  ...patch,
});

describe('claimGate', () => {
  it('mở khi mọi cổng qua', () => {
    expect(claimGate(gateInput())).toEqual({ open: true });
  });

  it('máy đang bận thì không claim', () => {
    expect(claimGate(gateInput({ machine: 'busy' }))).toEqual({
      open: false,
      why: 'busy',
    });
  });

  it('kill-switch global hoặc theo BM chặn, kể cả job dry', () => {
    expect(claimGate(gateInput({ killGlobal: true }))).toMatchObject({
      why: 'kill',
    });
    expect(claimGate(gateInput({ killBm: true }))).toMatchObject({
      why: 'kill',
    });
  });

  it('emergencyStop chặn mọi job kể cả dry/scan, không có hạn', () => {
    const scan = { flow: 'requests.scan' as const, mode: 'dry' as const };
    expect(claimGate(gateInput({ emergency: NOW - 1, job: scan }))).toEqual({
      open: false,
      why: 'blocked',
      block: { reason: 'emergency', until: null },
    });
  });

  it('rate-limit còn hạn chặn, hết hạn thì qua', () => {
    expect(
      claimGate(gateInput({ rateLimitedUntil: NOW + 5000 }))
    ).toMatchObject({
      block: { reason: 'rate-limited', until: NOW + 5000 },
    });
    expect(claimGate(gateInput({ rateLimitedUntil: NOW - 5000 }))).toEqual({
      open: true,
    });
  });

  it('một sự cố trong 24 giờ chặn máy cục bộ (N = 1, fail-closed)', () => {
    const gate = claimGate(
      gateInput({ incidents: [{ at: NOW - 1000, code: 'ERR_CHECKPOINT' }] })
    );
    expect(gate).toMatchObject({
      open: false,
      why: 'blocked',
      block: { reason: 'checkpoint', until: NOW - 1000 + INCIDENT_WINDOW_MS },
    });
  });

  it('sự cố cũ hơn 24 giờ không còn chặn', () => {
    expect(
      claimGate(
        gateInput({
          incidents: [
            { at: NOW - INCIDENT_WINDOW_MS - 1, code: 'ERR_CHECKPOINT' },
          ],
        })
      )
    ).toEqual({ open: true });
  });

  it('trần job duyệt full chỉ áp cho partner-approve full', () => {
    const starts = [NOW - 3000, NOW - 2000, NOW - 1000];
    const fullCap = 3;
    const approveFull = {
      flow: 'partner-approve' as const,
      mode: 'full' as const,
    };
    expect(
      claimGate(gateInput({ fullStarts: starts, fullCap, job: approveFull }))
    ).toMatchObject({ block: { reason: 'budget' } });
    expect(claimGate(gateInput({ fullStarts: starts, fullCap }))).toEqual({
      open: true,
    });
    // Không đặt trần: không bao giờ chặn.
    expect(
      claimGate(gateInput({ fullStarts: starts, job: approveFull }))
    ).toEqual({ open: true });
  });
});

describe('fullCapBlock', () => {
  it('hết hạn khi lần cũ nhất qua 24 giờ', () => {
    const oldest = NOW - 3600_000;
    const block = fullCapBlock([oldest, NOW - 2000, NOW - 1000], NOW, 3);
    expect(block?.until).toBe(oldest + INCIDENT_WINDOW_MS);
    expect(fullCapBlock([oldest, NOW - 2000], NOW, 3)).toBeUndefined();
  });
});

describe('incidentBlock', () => {
  it('rate-limit đặt khoá lý do rate-limited', () => {
    expect(
      incidentBlock([{ at: NOW - 10, code: 'ERR_RATE_LIMITED' }], NOW)?.reason
    ).toBe('rate-limited');
  });
  it('ngưỡng N lớn hơn thì cần đủ N sự cố', () => {
    const one = [{ at: NOW - 10, code: 'ERR_CHECKPOINT' }];
    expect(incidentBlock(one, NOW, 2)).toBeUndefined();
    expect(incidentBlock(one, NOW, 1)).toBeDefined();
  });
});

describe('thời điểm hết khoá', () => {
  it('curfewEndsAt trả 06:00 giờ VN khi đang trong khung', () => {
    // 20:00Z = 03:00 giờ VN (UTC+7) → hết lúc 06:00 VN = 23:00Z.
    const inside = Date.UTC(2025, 0, 1, 20, 0, 0);
    expect(curfewEndsAt(inside, CURFEW)).toBe(Date.UTC(2025, 0, 1, 23, 0, 0));
  });
  it('ngoài khung hoặc curfew tắt thì trả chính now', () => {
    expect(curfewEndsAt(NOW, CURFEW)).toBe(NOW);
    expect(curfewEndsAt(NOW, { ...CURFEW, on: false })).toBe(NOW);
  });
  it('nextLocalMidnight là 00:00 ngày kế tiếp giờ máy', () => {
    const next = new Date(nextLocalMidnight(NOW));
    expect([next.getHours(), next.getMinutes(), next.getSeconds()]).toEqual([
      0, 0, 0,
    ]);
    expect(next.getTime()).toBeGreaterThan(NOW);
    expect(next.getTime() - NOW).toBeLessThanOrEqual(24 * 3600_000);
  });
});

const replyCtx = (patch: Partial<ReplyContext> = {}): ReplyContext => ({
  now: NOW,
  claimedAt: NOW - 1000,
  attempts: 0,
  renavigated: false,
  curfew: { ...CURFEW, on: false },
  writesPerDay: 20,
  ...patch,
});

describe('mapStartReply', () => {
  it('ERR_BUSY trả job về pending, nghỉ 5 phút', () => {
    expect(mapStartReply('ERR_BUSY', replyCtx())).toEqual({
      kind: 'unclaim',
      backoffMs: 300_000,
      attempts: 0,
    });
  });

  it('sai BM: điều hướng lại một lần, rồi un-claim, quá 3 lần thì error', () => {
    expect(mapStartReply('ERR_BM_CHANGED', replyCtx())).toEqual({
      kind: 'renavigate',
    });
    expect(
      mapStartReply('ERR_NO_BUSINESS', replyCtx({ renavigated: true }))
    ).toMatchObject({ kind: 'unclaim', attempts: 1 });
    expect(
      mapStartReply(
        'ERR_BM_CHANGED',
        replyCtx({ renavigated: true, attempts: 3 })
      )
    ).toEqual({ kind: 'error', code: 'ERR_SURFACE_UNREACHABLE' });
  });

  it('rate-limit/curfew/budget giữ claimed và chặn máy có hạn', () => {
    expect(
      mapStartReply(
        'ERR_RATE_LIMITED',
        replyCtx({ rateLimitedUntil: NOW + 90_000 })
      )
    ).toEqual({
      kind: 'hold',
      block: { reason: 'rate-limited', until: NOW + 90_000 },
    });
    const inside = Date.UTC(2025, 0, 1, 20, 0, 0);
    expect(
      mapStartReply(
        'ERR_CURFEW',
        replyCtx({ now: inside, claimedAt: inside - 1, curfew: CURFEW })
      )
    ).toEqual({
      kind: 'hold',
      block: { reason: 'curfew', until: Date.UTC(2025, 0, 1, 23, 0, 0) },
    });
    expect(mapStartReply('ERR_BUDGET', replyCtx())).toMatchObject({
      kind: 'hold',
      block: { reason: 'budget' },
    });
  });

  it('khoá hết hạn ngay vẫn được giữ tối thiểu 1 phút (không quay vòng nóng)', () => {
    expect(
      mapStartReply('ERR_RATE_LIMITED', replyCtx({ rateLimitedUntil: NOW - 5 }))
    ).toEqual({
      kind: 'hold',
      block: { reason: 'rate-limited', until: NOW + 60_000 },
    });
  });

  it('giữ quá 24 giờ kể từ lúc claim thì error', () => {
    expect(
      mapStartReply(
        'ERR_RATE_LIMITED',
        replyCtx({ claimedAt: NOW - INCIDENT_WINDOW_MS - 1 })
      )
    ).toEqual({ kind: 'error', code: 'ERR_RATE_LIMITED' });
  });

  it('job duyệt lớn hơn trần ngày thì ERR_BUDGET ngay, không chờ', () => {
    expect(mapStartReply('ERR_BUDGET', replyCtx({ writesNeeded: 21 }))).toEqual(
      { kind: 'error', code: 'ERR_BUDGET' }
    );
  });

  it('ERR_EMERGENCY là error và khoá không hạn', () => {
    expect(mapStartReply('ERR_EMERGENCY', replyCtx())).toEqual({
      kind: 'error',
      code: 'ERR_EMERGENCY',
      block: { reason: 'emergency', until: null },
    });
  });

  it('config sai hoặc mã lạ là error, không retry', () => {
    expect(mapStartReply('ERR_INVALID_CONFIG', replyCtx())).toEqual({
      kind: 'error',
      code: 'ERR_INVALID_CONFIG',
    });
    expect(mapStartReply('ERR_WHATEVER', replyCtx())).toMatchObject({
      kind: 'error',
    });
  });
});

describe('mapPrepareError', () => {
  it('tab không tới được: un-claim có đếm, quá 3 lần thì error', () => {
    expect(mapPrepareError('ERR_TAB_RELOADED', replyCtx())).toMatchObject({
      kind: 'unclaim',
      attempts: 1,
    });
    expect(
      mapPrepareError('ERR_SURFACE_TIMEOUT', replyCtx({ attempts: 3 }))
    ).toEqual({ kind: 'error', code: 'ERR_SURFACE_UNREACHABLE' });
  });
  it('ERR_BUSY không tính vào số lần thử', () => {
    expect(
      mapPrepareError('ERR_BUSY', replyCtx({ attempts: 2 }))
    ).toMatchObject({ kind: 'unclaim', attempts: 2 });
  });
});

const run = (patch: Record<string, unknown>): RunState =>
  ({
    runId: 'run_1',
    mode: 'dry',
    status: 'done',
    targets: [],
    ...patch,
  }) as unknown as RunState;

const target = (outcome: string): Record<string, unknown> => ({
  accountId: 'a',
  name: 'A',
  plan: 'run',
  outcome,
});

describe('mapRunEnd', () => {
  it('done và pending-approval đều là job done', () => {
    expect(mapRunEnd(run({}), false, NOW).status).toBe('done');
    const pending = mapRunEnd(run({ status: 'pending-approval' }), false, NOW);
    expect(pending).toMatchObject({
      status: 'done',
      result: { runStatus: 'pending-approval' },
    });
  });

  it('đếm target theo outcome, running tính là unverified', () => {
    const counts = countTargets(
      run({
        targets: [
          target('done'),
          target('failed'),
          target('skipped-existing'),
          target('pending-approval'),
          target('queued'),
          target('unverified'),
          target('running'),
        ],
      })
    );
    expect(counts).toEqual({
      done: 1,
      failed: 1,
      skipped: 1,
      unverified: 2,
      pendingApproval: 1,
      queued: 1,
    });
  });

  it('stopped + cancelRequested là cancelled, partial nếu đã chạm target', () => {
    const end = mapRunEnd(
      run({ status: 'stopped', targets: [target('done'), target('queued')] }),
      true,
      NOW
    );
    expect(end).toMatchObject({
      status: 'cancelled',
      result: { partial: true },
    });
  });

  it('stopped không do cancel là ERR_STOPPED_LOCALLY', () => {
    expect(mapRunEnd(run({ status: 'stopped' }), false, NOW)).toMatchObject({
      status: 'error',
      error: { code: 'ERR_STOPPED_LOCALLY' },
    });
  });

  it('checkpoint: error, khoá không hạn và tính vào bộ đếm sự cố', () => {
    const end = mapRunEnd(
      run({
        status: 'failed',
        error: { code: 'ERR_CHECKPOINT', stepIndex: 3 },
      }),
      false,
      NOW
    );
    expect(end).toMatchObject({
      status: 'error',
      error: { code: 'ERR_CHECKPOINT', stepIndex: 3 },
      block: { reason: 'checkpoint', until: null },
      incident: 'ERR_CHECKPOINT',
    });
  });

  it('đăng xuất giữa run khoá không hạn nhưng không phải sự cố', () => {
    const end = mapRunEnd(
      run({
        status: 'failed',
        error: { code: 'ERR_LOGGED_OUT', stepIndex: 2 },
      }),
      false,
      NOW
    );
    expect(end.block).toEqual({ reason: 'logged-out', until: null });
    expect(end.incident).toBeUndefined();
  });

  it('rate-limit giữa run khoá tới hạn engine và tính vào sự cố', () => {
    const end = mapRunEnd(
      run({
        status: 'failed',
        error: { code: 'ERR_RATE_LIMITED', stepIndex: 4 },
      }),
      false,
      NOW,
      NOW + 777
    );
    expect(end.block).toEqual({ reason: 'rate-limited', until: NOW + 777 });
    expect(end.incident).toBe('ERR_RATE_LIMITED');
  });

  it('mã lỗi khác: error, máy không bị khoá', () => {
    const end = mapRunEnd(
      run({
        status: 'failed',
        error: { code: 'ERR_LOCATE_TIMEOUT', stepIndex: 5 },
      }),
      false,
      NOW
    );
    expect(end).toMatchObject({ status: 'error' });
    expect(end.block).toBeUndefined();
    expect(end.result.detail).toBeUndefined();
  });
});

describe('fullCapBlock không đặt trần', () => {
  it('undefined = không giới hạn dù đã chạy rất nhiều job full', () => {
    const starts = Array.from({ length: 50 }, (_, i) => NOW - 1000 - i);
    expect(fullCapBlock(starts, NOW, undefined)).toBeUndefined();
  });
});
