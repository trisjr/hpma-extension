/**
 * pacingForm.ts — form Pacing & limit (SPEC-UI-004 §3): giữ giá trị dạng chuỗi để
 * người dùng gõ tự do, validate theo biên an toàn rồi mới đổi thành PacingConfig.
 */
import type { BmKind, CurfewConfig, PacingConfig } from '@/shared/settings';

import {
  BATCH_MAX,
  BATCH_MIN,
  BM_KINDS,
  DELAY_BASE_MAX,
  DELAY_BASE_MIN,
  JITTER_MAX,
  JITTER_MIN,
  WRITE_EXTRA_MAX,
  WRITE_EXTRA_MIN,
  WRITES_MAX,
  WRITES_MIN,
} from '@/shared/settings';

export type PacingForm = {
  delayBase: string;
  jitter: string;
  writeExtra: string;
  writes: Record<BmKind, string>;
  batch: Record<BmKind, string>;
  curfew: CurfewConfig;
};

export type FieldId =
  | 'delayBase'
  | 'jitter'
  | 'writeExtra'
  | `writes:${BmKind}`
  | `batch:${BmKind}`;

// `min` chỉ dùng cho ngưỡng an toàn của ba ô delay (thông điệp riêng).
export type FieldError = {
  kind: 'invalid' | 'min' | 'range';
  min: number;
  max: number;
};

export type FormErrors = Partial<Record<FieldId, FieldError>>;

export function toForm(config: PacingConfig): PacingForm {
  const pick = (key: 'writesPerDay' | 'maxBatch'): Record<BmKind, string> => ({
    new: String(config.limits.new[key]),
    standard: String(config.limits.standard[key]),
    verified: String(config.limits.verified[key]),
  });
  return {
    delayBase: String(config.delayBaseSec),
    jitter: String(config.jitterPct),
    writeExtra: String(config.writeExtraSec),
    writes: pick('writesPerDay'),
    batch: pick('maxBatch'),
    curfew: { ...config.curfew },
  };
}

// Chấp nhận dấu `,` và `.` làm dấu thập phân.
export function parseDecimal(raw: string): number | undefined {
  const text = raw.trim().replace(',', '.');
  if (text === '') return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

function check(
  raw: string,
  min: number,
  max: number,
  integer: boolean,
  safetyFloor: boolean
): FieldError | undefined {
  const value = parseDecimal(raw);
  if (value === undefined || (integer && !Number.isInteger(value))) {
    return { kind: 'invalid', min, max };
  }
  if (value < min) return { kind: safetyFloor ? 'min' : 'range', min, max };
  if (value > max) return { kind: 'range', min, max };
  return undefined;
}

export function validateForm(form: PacingForm): FormErrors {
  const errors: FormErrors = {};
  const set = (id: FieldId, error: FieldError | undefined): void => {
    if (error) errors[id] = error;
  };
  set(
    'delayBase',
    check(form.delayBase, DELAY_BASE_MIN, DELAY_BASE_MAX, false, true)
  );
  set('jitter', check(form.jitter, JITTER_MIN, JITTER_MAX, false, true));
  set(
    'writeExtra',
    check(form.writeExtra, WRITE_EXTRA_MIN, WRITE_EXTRA_MAX, false, true)
  );
  BM_KINDS.forEach((kind) => {
    set(
      `writes:${kind}`,
      check(form.writes[kind], WRITES_MIN, WRITES_MAX[kind], true, false)
    );
    set(
      `batch:${kind}`,
      check(form.batch[kind], BATCH_MIN, BATCH_MAX, true, false)
    );
  });
  return errors;
}

// Chỉ gọi khi validateForm không có lỗi.
export function fromForm(form: PacingForm): PacingConfig {
  const num = (raw: string): number => parseDecimal(raw) ?? 0;
  const limit = (kind: BmKind): PacingConfig['limits'][BmKind] => ({
    writesPerDay: num(form.writes[kind]),
    maxBatch: num(form.batch[kind]),
  });
  return {
    delayBaseSec: num(form.delayBase),
    jitterPct: num(form.jitter),
    writeExtraSec: num(form.writeExtra),
    curfew: { ...form.curfew },
    limits: {
      new: limit('new'),
      standard: limit('standard'),
      verified: limit('verified'),
    },
  };
}

export type Preview = {
  readLo: number;
  readHi: number;
  writeLo: number;
  writeHi: number;
};

// Khoảng cách giữa các bước theo delay nền ± jitter; bước ghi cộng thêm `writeExtra`.
export function previewPacing(form: PacingForm): Preview | undefined {
  const base = parseDecimal(form.delayBase);
  const jitter = parseDecimal(form.jitter);
  const extra = parseDecimal(form.writeExtra);
  if (base === undefined || jitter === undefined || extra === undefined) {
    return undefined;
  }
  const errors = validateForm(form);
  if (errors.delayBase || errors.jitter || errors.writeExtra) return undefined;
  const spread = (jitter / 100) * base;
  return {
    readLo: base - spread,
    readHi: base + spread,
    writeLo: base - spread + extra,
    writeHi: base + spread + extra,
  };
}
