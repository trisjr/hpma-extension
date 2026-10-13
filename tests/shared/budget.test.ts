import { describe, expect, it } from 'vitest';

import {
  budgetUsed,
  isEmergency,
  isRateLimited,
  localDay,
  nextBudget,
  parseBudget,
  RATE_LIMIT_MS,
} from '@/shared/budget';

// Ngày theo giờ máy: dựng bằng constructor local để test đúng ở mọi múi giờ.
const at = (day: number, hour: number): number =>
  new Date(2026, 2, day, hour, 0, 0).getTime();

describe('write budget', () => {
  it('localDay theo giờ máy, định dạng yyyy-mm-dd', () => {
    expect(localDay(at(4, 12))).toBe('2026-03-04');
    expect(localDay(at(4, 23))).toBe('2026-03-04');
    expect(localDay(at(5, 0))).toBe('2026-03-05');
  });

  it('parseBudget từ chối dữ liệu hỏng', () => {
    expect(parseBudget(undefined)).toBeUndefined();
    expect(parseBudget({ day: 5, used: 1 })).toBeUndefined();
    expect(parseBudget({ day: '2026-03-04', used: -1 })).toBeUndefined();
    expect(parseBudget({ day: '2026-03-04', used: Infinity })).toBeUndefined();
    expect(parseBudget({ day: '2026-03-04', used: 2.9 })).toEqual({
      day: '2026-03-04',
      used: 2,
    });
  });

  it('budgetUsed: cùng ngày thì đếm, khác ngày/hỏng/bản cũ không có day thì là 0', () => {
    const stored = { day: '2026-03-04', used: 7 };
    expect(budgetUsed(stored, at(4, 15))).toBe(7);
    expect(budgetUsed(stored, at(5, 9))).toBe(0);
    expect(budgetUsed({ used: 7 }, at(4, 15))).toBe(0);
    expect(budgetUsed('7', at(4, 15))).toBe(0);
  });

  it('nextBudget tăng 1 trong ngày và reset khi sang ngày mới', () => {
    expect(nextBudget(undefined, at(4, 9))).toEqual({
      day: '2026-03-04',
      used: 1,
    });
    expect(nextBudget({ day: '2026-03-04', used: 7 }, at(4, 9))).toEqual({
      day: '2026-03-04',
      used: 8,
    });
    expect(nextBudget({ day: '2026-03-04', used: 7 }, at(5, 9))).toEqual({
      day: '2026-03-05',
      used: 1,
    });
  });
});

describe('khoá an toàn', () => {
  it('isEmergency chỉ nhận mốc thời gian dương hữu hạn', () => {
    expect(isEmergency(1700000000000)).toBe(true);
    [0, -1, NaN, Infinity, '1', undefined, null].forEach((value) =>
      expect(isEmergency(value)).toBe(false)
    );
  });

  it('isRateLimited: còn hạn thì khoá, hết hạn hoặc đúng mốc thì mở', () => {
    const now = 1_000_000;
    expect(isRateLimited(now + RATE_LIMIT_MS, now)).toBe(true);
    expect(isRateLimited(now, now)).toBe(false);
    expect(isRateLimited(now - 1, now)).toBe(false);
    expect(isRateLimited('x', now)).toBe(false);
  });
});
