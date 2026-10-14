import type { ProbeKeyResult, ProbeReport } from '@/shared/probe';
import { describe, expect, it } from 'vitest';

import {
  gateStatus,
  isProbeCore,
  isProbeReply,
  isProbeReport,
  latestReport,
  parseProbeReports,
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
