/**
 * delay.ts — tính khoảng nghỉ giữa các hành động (file 19 §2; FR-06). Hàm thuần,
 * nhận nguồn ngẫu nhiên để test. Không có đường nào cho khoảng nghỉ giữa bước/bước
 * ghi nhỏ hơn mức delay nền (đã bị `parsePacing` kẹp ≥ sàn an toàn).
 */
import type { PacingConfig } from '@/shared/settings';

export type PauseKind = 'micro' | 'step' | 'write' | 'batch';

export type Rand = () => number;

const MAX_UINT32 = 2 ** 32;

// Nguồn `crypto` thay `Math.random` (không có chu kỳ lặp dễ đo).
export function randomUnit(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] / MAX_UINT32;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Box–Muller: log-normal quanh `median` (đuôi phải dài như thời gian phản ứng người).
export function logNormal(median: number, sigma: number, rand: Rand): number {
  const u = Math.max(rand(), Number.EPSILON);
  const v = rand();
  const normal = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return median * Math.exp(sigma * normal);
}

// Jitter chỉ kéo dài thêm (không bao giờ ngắn hơn mức nền), phân phối đuôi phải:
// nền × (1 + jitter × T), T là Exp(1) cắt cụt ở 3 theo hàm ngược của phân phối cắt cụt
// (không dồn khối lượng vào đúng một giá trị trần). Tính lại mỗi lần gọi.
const TAIL_CAP = 3;
function jittered(baseMs: number, jitterPct: number, rand: Rand): number {
  const tail = -Math.log(1 - rand() * (1 - Math.exp(-TAIL_CAP)));
  return baseMs * (1 + (jitterPct / 100) * tail);
}

export const MICRO_MIN_MS = 300;
export const BATCH_MIN_MS = 20_000;

export function computeDelayMs(
  kind: PauseKind,
  pacing: PacingConfig,
  rand: Rand = randomUnit
): number {
  if (kind === 'micro')
    return clamp(logNormal(1200, 0.5, rand), MICRO_MIN_MS, 6000);
  if (kind === 'batch') {
    return clamp(logNormal(45_000, 0.5, rand), BATCH_MIN_MS, 180_000);
  }
  const base = pacing.delayBaseSec * 1000;
  const extra = kind === 'write' ? pacing.writeExtraSec * 1000 : 0;
  return jittered(base + extra, pacing.jitterPct, rand);
}

// Khoảng cách giữa hai phím khi gõ: log-normal trung vị ~120 ms.
export function keyGapMs(rand: Rand = randomUnit): number {
  return clamp(logNormal(120, 0.4, rand), 60, 300);
}

// Trễ giữa các pha của một cú click (30–120 ms).
export function clickGapMs(rand: Rand = randomUnit): number {
  return 30 + rand() * 90;
}
