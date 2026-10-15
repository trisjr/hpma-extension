import { describe, expect, it } from 'vitest';

import {
  acceptsFlow,
  isMachineFlow,
  isModeAllowed,
  parseRemoteJob,
} from '@/shared/remoteJob';

const BM = '987654321098765';

const assignJob = {
  flow: 'partner-assign',
  mode: 'dry',
  businessId: BM,
  config: {
    partnerBmId: '1234567890123456',
    queries: ['SHOP LAN 1', '1234567890'],
    tasks: ['ADVERTISE', 'ANALYZE'],
  },
  createdAt: 1760432400000,
  createdBy: 'uid-ops',
  state: { status: 'pending' },
};

describe('parseRemoteJob', () => {
  it('nhận job partner-assign hợp lệ', () => {
    const job = parseRemoteJob('job1', assignJob, BM);
    expect(job).toMatchObject({
      id: 'job1',
      flow: 'partner-assign',
      mode: 'dry',
      businessId: BM,
      status: 'pending',
      cancelRequested: false,
    });
  });

  it('nhận job requests.scan và partner-approve hợp lệ', () => {
    const scan = {
      ...assignJob,
      flow: 'requests.scan',
      config: { partnerName: 'BM ĐỐI TÁC' },
    };
    expect(parseRemoteJob('s', scan, BM)?.flow).toBe('requests.scan');
    const approve = {
      ...assignJob,
      flow: 'partner-approve',
      config: {
        partnerName: 'BM ĐỐI TÁC',
        action: 'approve',
        requests: [{ requester: 'Duc TNM', account: 'AA' }],
      },
    };
    expect(parseRemoteJob('a', approve, BM)?.flow).toBe('partner-approve');
  });

  it('từ chối businessId lệch với nhánh BM chứa job', () => {
    expect(
      parseRemoteJob('job1', assignJob, '111111111111111')
    ).toBeUndefined();
  });

  it('từ chối flow/mode lạ, thiếu state, createdAt sai kiểu', () => {
    expect(
      parseRemoteJob('j', { ...assignJob, flow: 'delete-all' }, BM)
    ).toBeUndefined();
    expect(
      parseRemoteJob('j', { ...assignJob, mode: 'turbo' }, BM)
    ).toBeUndefined();
    expect(
      parseRemoteJob('j', { ...assignJob, state: undefined }, BM)
    ).toBeUndefined();
    expect(
      parseRemoteJob('j', { ...assignJob, createdAt: 'x' }, BM)
    ).toBeUndefined();
    expect(parseRemoteJob('j', null, BM)).toBeUndefined();
  });

  it('config đi qua parser của engine: config hỏng bị từ chối', () => {
    const bad = {
      ...assignJob,
      config: { partnerBmId: 'abc', queries: [], tasks: [] },
    };
    expect(parseRemoteJob('j', bad, BM)).toBeUndefined();
    const badScan = {
      ...assignJob,
      flow: 'requests.scan',
      config: { partnerName: '  ' },
    };
    expect(parseRemoteJob('j', badScan, BM)).toBeUndefined();
  });

  it('đọc cancelRequested', () => {
    expect(
      parseRemoteJob('j', { ...assignJob, cancelRequested: true }, BM)
        ?.cancelRequested
    ).toBe(true);
  });
});

describe('flow và mode', () => {
  it('máy duyệt nhận cả requests.scan, máy gán chỉ nhận partner-assign', () => {
    expect(acceptsFlow('partner-approve', 'requests.scan')).toBe(true);
    expect(acceptsFlow('partner-approve', 'partner-approve')).toBe(true);
    expect(acceptsFlow('partner-approve', 'partner-assign')).toBe(false);
    expect(acceptsFlow('partner-assign', 'partner-assign')).toBe(true);
    expect(acceptsFlow('partner-assign', 'requests.scan')).toBe(false);
    expect(acceptsFlow('partner-assign', 'partner-approve')).toBe(false);
  });

  it('chỉ dry được phép từ xa ở pha 1–2 (D8)', () => {
    expect(isModeAllowed('dry')).toBe(true);
    expect(isModeAllowed('assist')).toBe(false);
    expect(isModeAllowed('full')).toBe(false);
  });

  it('isMachineFlow loại requests.scan', () => {
    expect(isMachineFlow('partner-assign')).toBe(true);
    expect(isMachineFlow('requests.scan')).toBe(false);
    expect(isMachineFlow(undefined)).toBe(false);
  });
});
