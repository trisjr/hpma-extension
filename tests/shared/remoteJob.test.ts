import { describe, expect, it } from 'vitest';

import {
  acceptsFlow,
  isMachineFlow,
  isModeAllowed,
  isRemoteJob,
  jobDispatchIssue,
  jobPartnerName,
  parseJobEnvelope,
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

  it('allowlist mode theo flow (D8): assign và approve có full, scan chỉ dry, assist chưa mở', () => {
    expect(isModeAllowed('partner-assign', 'dry')).toBe(true);
    expect(isModeAllowed('partner-assign', 'assist')).toBe(false);
    expect(isModeAllowed('partner-assign', 'full')).toBe(true);
    expect(isModeAllowed('partner-approve', 'dry')).toBe(true);
    expect(isModeAllowed('partner-approve', 'full')).toBe(true);
    expect(isModeAllowed('partner-approve', 'assist')).toBe(false);
    expect(isModeAllowed('requests.scan', 'dry')).toBe(true);
    expect(isModeAllowed('requests.scan', 'full')).toBe(false);
  });

  it('từ chối job gán có tổ hợp quyền UI BM không biểu diễn được', () => {
    const only = {
      ...assignJob,
      config: { ...assignJob.config, tasks: ['ADVERTISE'] },
    };
    expect(parseRemoteJob('x', only, BM)).toBeUndefined();
  });

  it('vỏ job vẫn đọc được khi config sai, và nêu lý do không chạy', () => {
    const bad = { ...assignJob, config: { partnerBmId: 'abc' } };
    const envelope = parseJobEnvelope('x', bad, BM);
    expect(envelope?.id).toBe('x');
    expect(envelope && jobDispatchIssue(envelope)).toBe('config');
    const lax = parseJobEnvelope('y', { ...assignJob, mode: 'assist' }, BM);
    expect(lax && jobDispatchIssue(lax)).toBe('mode');
    const ok = parseJobEnvelope('z', assignJob, BM);
    expect(ok && jobDispatchIssue(ok)).toBeUndefined();
  });

  describe('chuỗi assign → approve (D12)', () => {
    const chain = {
      auto: true,
      partnerName: 'BM Đối Tác',
      requesterName: 'Admin 1',
      mode: 'full',
      scanDelaysSec: [120, 300],
      ttlSec: 86400,
    };
    const approveJob = {
      flow: 'partner-approve',
      mode: 'full',
      businessId: BM,
      config: {
        partnerName: 'BM Đối Tác',
        partnerBmId: '1234567890123456',
        action: 'approve',
        requests: [{ requester: 'Admin 1', account: 'SHOP A' }],
      },
      scanJobId: 'scan-1',
      approval: 'auto-match',
      approvedBy: 'coordinator',
      createdBy: 'coordinator',
      createdAt: 1760432400000,
      chain: { assignJobId: 'assign-1' },
      state: { status: 'pending' },
    };
    const issueOf = (value: unknown): string | undefined => {
      const job = parseJobEnvelope('j', value, BM);
      return job && jobDispatchIssue(job);
    };

    it('đọc chain trên job assign; chain hỏng thì coi như không có', () => {
      expect(
        parseJobEnvelope('a', { ...assignJob, chain }, BM)?.chain
      ).toMatchObject({ auto: true, partnerName: 'BM Đối Tác', mode: 'full' });
      [
        { ...chain, auto: false },
        { ...chain, partnerName: '   ' },
        { ...chain, mode: 'assist' },
        { ...chain, scanDelaysSec: ['x'] },
        { ...chain, ttlSec: 'x' },
      ].forEach((bad) =>
        expect(
          parseJobEnvelope('a', { ...assignJob, chain: bad }, BM)?.chain
        ).toBeUndefined()
      );
    });

    // TEMP(D12-bridge): gỡ khối này cùng `isBridgeApprove`.
    it('D12-bridge: approve machine-chain full do máy tạo (không scan, có partnerBmId) được chạy', () => {
      const bridge = {
        ...approveJob,
        scanJobId: undefined,
        approval: 'machine-chain',
        createdBy: 'uid-m1',
        approvedBy: 'uid-m1',
      };
      expect(issueOf(bridge)).toBeUndefined();
      // Có scan, thiếu partnerBmId, decline, approvedBy khác người tạo, hoặc do coordinator: bị từ chối.
      expect(issueOf({ ...bridge, scanJobId: 'scan-1' })).toBe('provenance');
      expect(
        issueOf({
          ...bridge,
          config: { ...approveJob.config, partnerBmId: undefined },
        })
      ).toBe('provenance');
      expect(
        issueOf({
          ...bridge,
          config: { ...approveJob.config, action: 'decline' },
        })
      ).toBe('provenance');
      expect(issueOf({ ...bridge, approvedBy: 'uid-khac' })).toBe('provenance');
      expect(
        issueOf({
          ...bridge,
          createdBy: 'coordinator',
          approvedBy: 'coordinator',
        })
      ).toBe('provenance');
      expect(issueOf({ ...bridge, chain: {} })).toBe('provenance');
      // Chỉ cho approve: assign full mang approval machine-chain vẫn bị từ chối.
      expect(
        issueOf({
          ...assignJob,
          mode: 'full',
          approval: 'machine-chain',
          createdBy: 'uid-m1',
          approvedBy: 'uid-m1',
        })
      ).toBe('provenance');
    });

    it('job approve auto-match full do coordinator tạo được chạy', () => {
      expect(issueOf(approveJob)).toBeUndefined();
      expect(parseJobEnvelope('j', approveJob, BM)?.chainAssignJobId).toBe(
        'assign-1'
      );
    });

    it('auto-match full bị từ chối khi decline, thiếu scan hoặc chain, hoặc không do coordinator', () => {
      const decline = {
        ...approveJob,
        config: { ...approveJob.config, action: 'decline' },
      };
      expect(issueOf(decline)).toBe('provenance');
      // Thiếu partnerBmId: engine chỉ so tên BM (có thể trùng), nên không chạy full (M3).
      expect(
        issueOf({
          ...approveJob,
          config: { ...approveJob.config, partnerBmId: undefined },
        })
      ).toBe('provenance');
      expect(issueOf({ ...approveJob, scanJobId: undefined })).toBe(
        'provenance'
      );
      expect(issueOf({ ...approveJob, chain: {} })).toBe('provenance');
      expect(issueOf({ ...approveJob, createdBy: 'uid-ops' })).toBe(
        'provenance'
      );
      expect(issueOf({ ...approveJob, approvedBy: 'uid-ops' })).toBe(
        'provenance'
      );
    });

    it('auto-match chỉ mở full cho approve: assign full auto-match vẫn bị từ chối', () => {
      expect(
        issueOf({
          ...assignJob,
          mode: 'full',
          approval: 'auto-match',
          approvedBy: 'coordinator',
          createdBy: 'coordinator',
        })
      ).toBe('provenance');
    });
  });

  it('isMachineFlow loại requests.scan', () => {
    expect(isMachineFlow('partner-assign')).toBe(true);
    expect(isMachineFlow('requests.scan')).toBe(false);
    expect(isMachineFlow(undefined)).toBe(false);
  });
});

describe('isRemoteJob / jobPartnerName', () => {
  it('job do parseRemoteJob trả về qua được storage (round-trip)', () => {
    const job = parseRemoteJob('job1', assignJob, BM);
    expect(isRemoteJob(JSON.parse(JSON.stringify(job)))).toBe(true);
  });

  it('từ chối dữ liệu storage sai shape hoặc config hỏng', () => {
    expect(isRemoteJob(null)).toBe(false);
    expect(isRemoteJob({ id: 'x' })).toBe(false);
    const job = parseRemoteJob('job1', assignJob, BM);
    expect(isRemoteJob({ ...job, config: { partnerBmId: 'abc' } })).toBe(false);
    expect(isRemoteJob({ ...job, flow: 'delete-all' })).toBe(false);
  });

  it('lấy tên BM đối tác của job quét/duyệt, job gán không có', () => {
    const scan = parseRemoteJob(
      's',
      {
        ...assignJob,
        flow: 'requests.scan',
        config: { partnerName: '  BM  A ' },
      },
      BM
    );
    expect(scan && jobPartnerName(scan)).toBe('BM A');
    const assign = parseRemoteJob('a', assignJob, BM);
    expect(assign && jobPartnerName(assign)).toBeUndefined();
  });
});
