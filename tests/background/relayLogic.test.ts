import { describe, expect, it } from 'vitest';

import {
  badgeText,
  deriveProvision,
  pendingEnvelopesFor,
  pendingJobsFor,
  readClaims,
} from '@/background/relayLogic';

const BM = '987654321098765';
const MACHINE = '01K7Z3W3Q0ABCDEFGHJKMNPQRS';

const job = (
  overrides: Record<string, unknown> = {}
): Record<string, unknown> => ({
  flow: 'partner-assign',
  mode: 'dry',
  businessId: BM,
  config: {
    partnerBmId: '1234567890123456',
    queries: ['SHOP LAN 1'],
    tasks: ['ADVERTISE', 'ANALYZE'],
  },
  createdAt: 100,
  createdBy: 'uid-ops',
  state: { status: 'pending' },
  ...overrides,
});

describe('readClaims', () => {
  it('đọc đủ claim máy', () => {
    expect(
      readClaims({ machineId: MACHINE, bm: BM, flow: 'partner-assign' })
    ).toEqual({ machineId: MACHINE, bm: BM, flow: 'partner-assign' });
  });

  it('thiếu hoặc sai claim thì không phải máy được cấp', () => {
    expect(readClaims({})).toBeUndefined();
    expect(readClaims({ ops: true })).toBeUndefined();
    expect(
      readClaims({ machineId: MACHINE, bm: 'x', flow: 'partner-assign' })
    ).toBeUndefined();
    expect(
      readClaims({ machineId: MACHINE, bm: BM, flow: 'requests.scan' })
    ).toBeUndefined();
  });
});

describe('deriveProvision', () => {
  const claims = {
    machineId: MACHINE,
    bm: BM,
    flow: 'partner-assign' as const,
  };

  it('chưa đăng nhập, chưa cấp máy, lệch machineId, hợp lệ', () => {
    expect(deriveProvision(false, undefined, MACHINE)).toBe('signed-out');
    expect(deriveProvision(true, undefined, MACHINE)).toBe('unprovisioned');
    expect(deriveProvision(true, claims, 'KHAC')).toBe('machine-mismatch');
    expect(deriveProvision(true, claims, MACHINE)).toBe('ok');
  });
});

describe('pendingJobsFor', () => {
  const claims = {
    machineId: MACHINE,
    bm: BM,
    flow: 'partner-assign' as const,
  };

  it('chỉ giữ job pending đúng flow, chưa huỷ, cũ nhất trước', () => {
    const branch = {
      late: job({ createdAt: 300 }),
      early: job({ createdAt: 100 }),
      claimed: job({ state: { status: 'claimed' } }),
      cancelled: job({ cancelRequested: true }),
      otherFlow: job({
        flow: 'partner-approve',
        config: {
          partnerName: 'BM',
          action: 'approve',
          requests: [{ requester: 'A', account: 'B' }],
        },
      }),
      broken: { flow: 'partner-assign' },
    };
    expect(pendingJobsFor(branch, claims).map((j) => j.id)).toEqual([
      'early',
      'late',
    ]);
  });

  it('máy duyệt nhận cả requests.scan', () => {
    const approver = { ...claims, flow: 'partner-approve' as const };
    const branch = {
      scan: job({ flow: 'requests.scan', config: { partnerName: 'BM' } }),
      assign: job(),
    };
    expect(pendingJobsFor(branch, approver).map((j) => j.id)).toEqual(['scan']);
  });

  it('nhánh rỗng hoặc null', () => {
    expect(pendingJobsFor(null, claims)).toEqual([]);
    expect(pendingJobsFor({}, claims)).toEqual([]);
  });
});

describe('pendingEnvelopesFor', () => {
  const claims = {
    machineId: MACHINE,
    bm: BM,
    flow: 'partner-assign' as const,
  };

  it('giữ cả job sai config/mode để dispatcher chốt ERR_JOB_INVALID, nhưng loại shape hỏng', () => {
    const branch = {
      good: job({ createdAt: 2 }),
      badConfig: job({ createdAt: 1, config: { partnerBmId: 'abc' } }),
      assist: job({ createdAt: 3, mode: 'assist' }),
      claimed: job({ state: { status: 'claimed' } }),
      cancelled: job({ cancelRequested: true }),
      broken: { flow: 'partner-assign' },
    };
    expect(pendingEnvelopesFor(branch, claims).map((j) => j.id)).toEqual([
      'badConfig',
      'good',
      'assist',
    ]);
    // Danh sách hiển thị vẫn chỉ có job hợp lệ.
    expect(pendingJobsFor(branch, claims).map((j) => j.id)).toEqual([
      'good',
      'assist',
    ]);
  });
});

describe('badgeText', () => {
  it('rỗng khi không có job, chặn ở 99+', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(3)).toBe('3');
    expect(badgeText(150)).toBe('99+');
  });
});
