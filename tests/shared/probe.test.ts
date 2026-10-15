import type { ProbeKeyResult, ProbeReport } from '@/shared/probe';
import { describe, expect, it } from 'vitest';

import {
  approveGate,
  gateStatus,
  isProbeCore,
  isProbeReply,
  isProbeReport,
  latestReport,
  parseProbeReports,
  PROBE_MAX_AGE_MS,
  PROBE_STAGES,
  rateOf,
  stageOfKey,
} from '@/shared/probe';

const key = (patch: Partial<ProbeKeyResult>): ProbeKeyResult => ({
  key: 'partners.add',
  stage: 'page',
  scope: 'main',
  measured: true,
  hits: 20,
  samples: 20,
  winTier: 1,
  missTiers: [],
  ...patch,
});

const report = (patch: Partial<ProbeReport> = {}): ProbeReport => ({
  version: 1,
  at: 1000,
  lang: 'vi-VN',
  browser: 'chrome',
  pathname: '/latest/settings/partners',
  stage: 'page',
  samples: 20,
  rate: 1,
  keys: [key({})],
  ...patch,
});

describe('stageOfKey', () => {
  it('xếp key vào màn của nó', () => {
    expect(stageOfKey('nav.partners')).toBe('page');
    expect(stageOfKey('partners.add')).toBe('page');
    expect(stageOfKey('partners.give')).toBe('menu');
    expect(stageOfKey('partner.assign')).toBe('detail');
    expect(stageOfKey('partner.assignedAssets')).toBe('detail');
  });

  it('key của trang Requests có màn riêng, không kéo hit-rate của trang Partners', () => {
    expect(stageOfKey('requests.needsReview')).toBe('requests');
    // Nút Approve chỉ có khi khung chi tiết đang mở: màn riêng với danh sách.
    expect(stageOfKey('request.approve')).toBe('request-detail');
  });

  it('chia hộp thoại theo bước của flow để key bước khác không bị tính là trượt', () => {
    expect(stageOfKey('dialog.bmId')).toBe('dialog-bm');
    expect(stageOfKey('dialog.next')).toBe('dialog-bm');
    expect(stageOfKey('dialog.assetTypeAdAccounts')).toBe('dialog-assets');
    expect(stageOfKey('dialog.assetSearch')).toBe('dialog-assets');
    [
      'dialog.accessPartial',
      'dialog.taskCampaigns',
      'dialog.taskPerformance',
      'dialog.taskCreative',
      'dialog.taskManage',
      'dialog.assign',
      'dialog.cancel',
      'dialog.close',
    ].forEach((name) => expect(stageOfKey(name)).toBe('dialog-access'));
  });
});

describe('rateOf', () => {
  it('chỉ tính key đã đo', () => {
    const keys = [
      key({ hits: 20, samples: 20 }),
      key({ hits: 10, samples: 20 }),
      key({ measured: false, hits: 0, samples: 0 }),
    ];
    expect(rateOf(keys)).toBe(0.75);
  });

  it('key dự phòng không kéo rate xuống dù trượt', () => {
    const keys = [
      key({ key: 'dialog.taskManage', hits: 20, samples: 20 }),
      key({ key: 'dialog.accessPartial', hits: 0, samples: 20 }),
      key({ key: 'dialog.cancel', hits: 0, samples: 20 }),
      key({ key: 'dialog.close', hits: 0, samples: 20 }),
    ];
    expect(rateOf(keys)).toBe(1);
  });

  it('không đo được key nào thì không có rate', () => {
    expect(
      rateOf([key({ measured: false, hits: 0, samples: 0 })])
    ).toBeUndefined();
    expect(rateOf([])).toBeUndefined();
  });
});

describe('approveGate', () => {
  const NOW = 10_000_000_000;
  const at = (rate: number | undefined, stage: 'requests' | 'request-detail') =>
    report({ stage, rate, at: NOW - 1000 });

  it('đạt khi cả hai màn duyệt có báo cáo mới ≥ 95%', () => {
    expect(
      approveGate(
        {
          requests: at(0.95, 'requests'),
          'request-detail': at(1, 'request-detail'),
        },
        NOW
      )
    ).toEqual({ ok: true });
  });

  it('thiếu màn, dưới ngưỡng hoặc hết hạn thì không đạt và nêu rõ màn nào', () => {
    expect(approveGate({}, NOW)).toEqual({
      ok: false,
      missing: ['requests', 'request-detail'],
      below: [],
      stale: [],
    });
    expect(
      approveGate(
        {
          requests: at(0.9, 'requests'),
          'request-detail': report({
            stage: 'request-detail',
            rate: 1,
            at: NOW - PROBE_MAX_AGE_MS - 1,
          }),
        },
        NOW
      )
    ).toEqual({
      ok: false,
      missing: [],
      below: ['requests'],
      stale: ['request-detail'],
    });
  });

  it('báo cáo không có rate coi như dưới ngưỡng; màn Gán partner không ảnh hưởng', () => {
    const gate = approveGate(
      {
        requests: at(undefined, 'requests'),
        'request-detail': at(1, 'request-detail'),
        'dialog-bm': report({ stage: 'dialog-bm', rate: 0 }),
      },
      NOW
    );
    expect(gate).toMatchObject({ ok: false, below: ['requests'] });
  });
});

describe('gateStatus', () => {
  const all = (rate: number) =>
    Object.fromEntries(
      PROBE_STAGES.map((stage) => [stage, report({ stage, rate })])
    );

  it('thiếu báo cáo của một màn thì chưa đủ dữ liệu, dù rate cao', () => {
    expect(gateStatus({ page: report() })).toBe('incomplete');
    expect(gateStatus({})).toBe('incomplete');
  });

  it('đủ mọi màn: đạt khi ≥ 95%, dưới ngưỡng thì below', () => {
    expect(gateStatus(all(0.95))).toBe('pass');
    expect(gateStatus(all(0.949))).toBe('below');
  });

  it('một màn không có rate thì tính dưới ngưỡng', () => {
    expect(
      gateStatus({
        ...all(1),
        'dialog-bm': report({ stage: 'dialog-bm', rate: undefined }),
      })
    ).toBe('below');
  });
});

describe('latestReport', () => {
  it('lấy báo cáo mới nhất', () => {
    expect(
      latestReport({
        page: report({ at: 1 }),
        'dialog-access': report({ stage: 'dialog-access', at: 5 }),
      })?.stage
    ).toBe('dialog-access');
    expect(latestReport({})).toBeUndefined();
  });
});

describe('type guard', () => {
  it('isProbeReport cần browser, isProbeCore thì không', () => {
    const { browser, ...core } = report();
    expect(browser).toBe('chrome');
    expect(isProbeCore(core)).toBe(true);
    expect(isProbeReport(core)).toBe(false);
    expect(isProbeReport(report())).toBe(true);
    expect(isProbeReport({ ...report(), browser: 'safari' })).toBe(false);
  });

  it('từ chối key sai kiểu hoặc tầng lạ', () => {
    expect(isProbeCore({ ...report(), keys: [{ key: 1 }] })).toBe(false);
    expect(
      isProbeCore({ ...report(), keys: [key({ missTiers: [9 as 1] })] })
    ).toBe(false);
    expect(isProbeCore({ ...report(), stage: 'x' })).toBe(false);
  });

  it('isProbeReply', () => {
    const { browser, ...core } = report();
    expect(browser).toBe('chrome');
    expect(isProbeReply({ ok: true, report: core })).toBe(true);
    expect(isProbeReply({ ok: true, report: { version: 2 } })).toBe(false);
    expect(isProbeReply({ ok: false, code: 'ERR_BUSY' })).toBe(true);
    expect(isProbeReply({ ok: false, code: 'ERR_UNKNOWN_SCREEN' })).toBe(true);
    expect(isProbeReply({ ok: false, code: 'ERR_X' })).toBe(false);
    expect(isProbeReply(undefined)).toBe(false);
  });
});

describe('parseProbeReports', () => {
  it('bỏ mục hỏng hoặc đặt sai màn, giữ mục hợp lệ', () => {
    const parsed = parseProbeReports({
      page: report(),
      'dialog-bm': report({ stage: 'page' }),
      menu: { junk: true },
      // Báo cáo lưu từ bản cũ (stage `dialog` chung) không còn khớp màn nào: bỏ.
      dialog: report({ stage: 'page' }),
    });
    expect(Object.keys(parsed)).toEqual(['page']);
    expect(parseProbeReports(undefined)).toEqual({});
    expect(parseProbeReports('x')).toEqual({});
  });
});
