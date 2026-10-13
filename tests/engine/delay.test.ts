import type { Rand } from '@/content/engine/delay';
import { describe, expect, it } from 'vitest';

import {
  BATCH_MIN_MS,
  clickGapMs,
  computeDelayMs,
  keyGapMs,
  logNormal,
  MICRO_MIN_MS,
  randomUnit,
} from '@/content/engine/delay';
import { parsePacing } from '@/shared/settings';

import { pacingOf } from '../helpers/fixtures';

// Nguồn ngẫu nhiên xác định (LCG) để quét nhiều giá trị mà test không flaky.
function seeded(seed: number): Rand {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

const SAMPLES = 500;

describe('randomUnit', () => {
  it('nằm trong [0, 1)', () => {
    Array.from({ length: 200 }).forEach(() => {
      const value = randomUnit();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    });
  });
});

describe('logNormal', () => {
  it('trả trung vị khi biến chuẩn bằng 0 (cos = 0)', () => {
    expect(
      logNormal(
        1200,
        0.5,
        (() => {
          const values = [0.5, 0.25];
          return () => values.shift() ?? 0.5;
        })()
      )
    ).toBeCloseTo(1200, 6);
  });

  it('không chia cho log(0) khi nguồn trả 0', () => {
    expect(Number.isFinite(logNormal(100, 0.5, () => 0))).toBe(true);
  });
});

describe('computeDelayMs', () => {
  it('step: không bao giờ ngắn hơn mức nền, dù nguồn ngẫu nhiên thế nào', () => {
    const pacing = pacingOf({ delayBaseSec: 3, jitterPct: 40 });
    const rand = seeded(1);
    const values = Array.from({ length: SAMPLES }, () =>
      computeDelayMs('step', pacing, rand)
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(3000);
    // Jitter có thật: không dồn vào đúng một giá trị.
    expect(new Set(values).size).toBeGreaterThan(SAMPLES / 2);
  });

  it('step: jitter bị cắt ở 3 lần đuôi (trần có giới hạn)', () => {
    const pacing = pacingOf({ delayBaseSec: 3, jitterPct: 40 });
    expect(computeDelayMs('step', pacing, () => 0)).toBe(3000);
    expect(computeDelayMs('step', pacing, () => 1)).toBeCloseTo(
      3000 * (1 + 0.4 * 3),
      6
    );
  });

  it('write: cộng thêm writeExtraSec vào mức nền', () => {
    const pacing = pacingOf({
      delayBaseSec: 3,
      writeExtraSec: 2,
      jitterPct: 40,
    });
    expect(computeDelayMs('write', pacing, () => 0)).toBe(5000);
    const rand = seeded(2);
    const writes = Array.from({ length: SAMPLES }, () =>
      computeDelayMs('write', pacing, rand)
    );
    expect(Math.min(...writes)).toBeGreaterThanOrEqual(5000);
  });

  it('micro: kẹp trong [300 ms, 6 s]', () => {
    const pacing = pacingOf();
    const rand = seeded(3);
    const values = Array.from({ length: SAMPLES }, () =>
      computeDelayMs('micro', pacing, rand)
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(MICRO_MIN_MS);
    expect(Math.max(...values)).toBeLessThanOrEqual(6000);
  });

  it('batch: kẹp trong [20 s, 180 s]', () => {
    const pacing = pacingOf();
    const rand = seeded(4);
    const values = Array.from({ length: SAMPLES }, () =>
      computeDelayMs('batch', pacing, rand)
    );
    expect(Math.min(...values)).toBeGreaterThanOrEqual(BATCH_MIN_MS);
    expect(Math.max(...values)).toBeLessThanOrEqual(180_000);
  });

  it('cấu hình dưới sàn bị parsePacing kẹp nên delay không thể xuống dưới 1 s', () => {
    const pacing = parsePacing({
      delayBaseSec: 0,
      jitterPct: 0,
      writeExtraSec: 0,
    });
    expect(pacing.delayBaseSec).toBe(1);
    expect(computeDelayMs('step', pacing, () => 0)).toBeGreaterThanOrEqual(
      1000
    );
    expect(computeDelayMs('write', pacing, () => 0)).toBeGreaterThanOrEqual(
      3000
    );
  });
});

describe('keyGapMs / clickGapMs', () => {
  it('khoảng cách phím trong [60, 300] ms', () => {
    const rand = seeded(5);
    const values = Array.from({ length: SAMPLES }, () => keyGapMs(rand));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...values)).toBeLessThanOrEqual(300);
  });

  it('trễ giữa các pha click trong [30, 120] ms', () => {
    expect(clickGapMs(() => 0)).toBe(30);
    expect(clickGapMs(() => 1)).toBe(120);
  });
});
