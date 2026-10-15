import { describe, expect, it } from 'vitest';

import {
  defaultPacing,
  isCurfew,
  LIMIT_DEFAULTS,
  LOG_DETAIL_TTL_MS,
  parseDevtest,
  parseFullCapInput,
  parsePacing,
  parseRemoteSettings,
  withLogDetail,
} from '@/shared/settings';

import { pacingOf } from '../helpers/fixtures';

// Giờ Việt Nam (UTC+7) -> Date; không phụ thuộc múi giờ máy chạy test.
const vn = (hour: number, minute = 0): Date =>
  new Date(Date.UTC(2026, 2, 4, hour - 7, minute));
const { curfew } = pacingOf();

describe('isCurfew', () => {
  it('khung mặc định 00:00-06:00: bao đầu, loại cuối', () => {
    expect(isCurfew(vn(0, 0), curfew)).toBe(true);
    expect(isCurfew(vn(2, 30), curfew)).toBe(true);
    expect(isCurfew(vn(5, 59), curfew)).toBe(true);
    expect(isCurfew(vn(6, 0), curfew)).toBe(false);
    expect(isCurfew(vn(12, 0), curfew)).toBe(false);
    expect(isCurfew(vn(23, 59), curfew)).toBe(false);
  });

  it('khung băng nửa đêm 22:00-06:00', () => {
    const wrap = { ...curfew, from: '22:00', to: '06:00' };
    expect(isCurfew(vn(22, 0), wrap)).toBe(true);
    expect(isCurfew(vn(23, 30), wrap)).toBe(true);
    expect(isCurfew(vn(3, 0), wrap)).toBe(true);
    expect(isCurfew(vn(6, 0), wrap)).toBe(false);
    expect(isCurfew(vn(21, 59), wrap)).toBe(false);
  });

  it('tắt, hoặc from == to thì không có khung', () => {
    expect(isCurfew(vn(2, 0), { ...curfew, on: false })).toBe(false);
    expect(isCurfew(vn(2, 0), { ...curfew, from: '03:00', to: '03:00' })).toBe(
      false
    );
  });

  it('tính theo múi giờ đã chọn, không theo giờ máy (UTC 19:00 = 02:00 VN)', () => {
    expect(isCurfew(new Date(Date.UTC(2026, 2, 3, 19, 0)), curfew)).toBe(true);
    expect(isCurfew(new Date(Date.UTC(2026, 2, 4, 5, 0)), curfew)).toBe(false);
  });
});

describe('parsePacing', () => {
  it('thiếu/hỏng thì về mặc định', () => {
    expect(parsePacing(undefined)).toEqual(defaultPacing());
    expect(parsePacing('x')).toEqual(defaultPacing());
    expect(parsePacing({ delayBaseSec: 'abc', jitterPct: NaN })).toMatchObject({
      delayBaseSec: 3,
      jitterPct: 40,
    });
  });

  it('kẹp mọi giá trị vào biên an toàn', () => {
    const parsed = parsePacing({
      delayBaseSec: -5,
      jitterPct: 1,
      writeExtraSec: 0,
      limits: {
        new: { writesPerDay: 999, maxBatch: 99 },
        standard: { writesPerDay: 0, maxBatch: 0 },
      },
    });
    expect(parsed.delayBaseSec).toBe(1);
    expect(parsed.jitterPct).toBe(20);
    expect(parsed.writeExtraSec).toBe(2);
    expect(parsed.limits.new).toEqual({ writesPerDay: 20, maxBatch: 10 });
    expect(parsed.limits.standard).toEqual({ writesPerDay: 1, maxBatch: 1 });
    expect(parsed.limits.verified).toEqual(LIMIT_DEFAULTS.verified);
    expect(parsePacing({ delayBaseSec: 1e9 }).delayBaseSec).toBe(60);
  });

  it('curfew sai định dạng thì giữ mặc định từng trường', () => {
    const parsed = parsePacing({
      curfew: { on: 'yes', from: '25:00', to: '07:15', tz: 'Mars/Base' },
    });
    expect(parsed.curfew.on).toBe(true);
    expect(parsed.curfew.from).toBe('00:00');
    expect(parsed.curfew.to).toBe('07:15');
    expect(['Asia/Ho_Chi_Minh', 'Asia/Bangkok']).toContain(parsed.curfew.tz);
  });
});

describe('parseDevtest / withLogDetail', () => {
  const now = 1_000_000_000_000;

  it('logDetail hết hạn sau 24 giờ thì về off', () => {
    const fresh = parseDevtest(
      { logDetail: 'basic', logDetailAt: now - 1000 },
      now,
      false
    );
    expect(fresh.logDetail).toBe('basic');
    const stale = parseDevtest(
      { logDetail: 'verbose', logDetailAt: now - LOG_DETAIL_TTL_MS - 1 },
      now,
      false
    );
    expect(stale.logDetail).toBe('off');
    expect(stale.logDetailAt).toBeUndefined();
  });

  it('logDetail khác off mà thiếu mốc bật thì coi là hết hạn', () => {
    expect(parseDevtest({ logDetail: 'basic' }, now, false).logDetail).toBe(
      'off'
    );
  });

  it('withLogDetail ghi mốc bật; off thì xoá mốc', () => {
    const base = parseDevtest(undefined, now, false);
    expect(withLogDetail(base, 'basic', now).logDetailAt).toBe(now);
    expect(
      withLogDetail(withLogDetail(base, 'basic', now), 'off', now).logDetailAt
    ).toBeUndefined();
  });
});

describe('remote settings', () => {
  it('mặc định và dữ liệu hỏng đều là không giới hạn', () => {
    expect(parseRemoteSettings(undefined).fullJobsPerDay).toBeUndefined();
    expect(
      parseRemoteSettings({ fullJobsPerDay: 0 }).fullJobsPerDay
    ).toBeUndefined();
    expect(
      parseRemoteSettings({ fullJobsPerDay: 2.5 }).fullJobsPerDay
    ).toBeUndefined();
    expect(
      parseRemoteSettings({ fullJobsPerDay: '3' }).fullJobsPerDay
    ).toBeUndefined();
    expect(parseRemoteSettings({ fullJobsPerDay: 5 }).fullJobsPerDay).toBe(5);
  });

  it('ô nhập: rỗng = không giới hạn, ngoài biên hoặc không phải số nguyên là lỗi', () => {
    expect(parseFullCapInput('  ')).toEqual({ ok: true, value: undefined });
    expect(parseFullCapInput('12')).toEqual({ ok: true, value: 12 });
    expect(parseFullCapInput('0')).toEqual({ ok: false });
    expect(parseFullCapInput('1001')).toEqual({ ok: false });
    expect(parseFullCapInput('2.5')).toEqual({ ok: false });
    expect(parseFullCapInput('abc')).toEqual({ ok: false });
  });
});
