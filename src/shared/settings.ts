/**
 * settings.ts — cấu hình Options (SPEC-UI-004): pacing, giới hạn ghi, curfew, devtest.
 * Hàm thuần, không phụ thuộc `browser`. Mọi giá trị đọc từ storage đều bị kẹp vào
 * biên an toàn (FR-06: không có đường code nào đưa delay dưới ngưỡng cho engine).
 */
import type { RunScenario } from '@/shared/run';

import { RUN_SCENARIOS } from '@/shared/run';

export const PACING_KEY = 'settings:pacing';
export const DEVTEST_KEY = 'settings:devtest';

export type CurfewTz = 'Asia/Ho_Chi_Minh' | 'Asia/Bangkok';
export const CURFEW_TZS: readonly CurfewTz[] = [
  'Asia/Ho_Chi_Minh',
  'Asia/Bangkok',
];
export const TZ_LABEL: Record<CurfewTz, string> = {
  'Asia/Ho_Chi_Minh': 'Asia/Ho_Chi_Minh (GMT+7)',
  'Asia/Bangkok': 'Asia/Bangkok (GMT+7)',
};

export type BmKind = 'new' | 'standard' | 'verified';
export const BM_KINDS: readonly BmKind[] = ['new', 'standard', 'verified'];

export type LimitRow = { writesPerDay: number; maxBatch: number };

export type CurfewConfig = {
  on: boolean;
  from: string; // 'HH:mm'
  to: string; // 'HH:mm'
  tz: CurfewTz;
};

export type PacingConfig = {
  delayBaseSec: number;
  jitterPct: number;
  writeExtraSec: number;
  curfew: CurfewConfig;
  limits: Record<BmKind, LimitRow>;
};

// Biên an toàn (cứng) và biên trên chống nhập nhầm.
export const DELAY_BASE_MIN = 3;
export const DELAY_BASE_MAX = 60;
export const JITTER_MIN = 20;
export const JITTER_MAX = 100;
export const WRITE_EXTRA_MIN = 2;
export const WRITE_EXTRA_MAX = 60;
export const WRITES_MIN = 1;
export const BATCH_MIN = 1;
export const BATCH_MAX = 10;

// Mặc định và trần lượt ghi theo loại BM (SPEC-UI-004 §3.2, Q2): giảm tự do,
// tăng tối đa tới mặc định của loại BM kế trên.
export const LIMIT_DEFAULTS: Record<BmKind, LimitRow> = {
  new: { writesPerDay: 10, maxBatch: 5 },
  standard: { writesPerDay: 20, maxBatch: 10 },
  verified: { writesPerDay: 60, maxBatch: 10 },
};
export const WRITES_MAX: Record<BmKind, number> = {
  new: 20,
  standard: 60,
  verified: 60,
};

const FALLBACK_TZ: CurfewTz = 'Asia/Ho_Chi_Minh';

// Mặc định theo múi giờ máy nếu nằm trong danh sách (Q4).
function defaultTz(): CurfewTz {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return CURFEW_TZS.find((tz) => tz === resolved) ?? FALLBACK_TZ;
}

export function defaultPacing(): PacingConfig {
  return {
    delayBaseSec: 3,
    jitterPct: 40,
    writeExtraSec: 2,
    curfew: { on: true, from: '00:00', to: '06:00', tz: defaultTz() },
    limits: {
      new: { ...LIMIT_DEFAULTS.new },
      standard: { ...LIMIT_DEFAULTS.standard },
      verified: { ...LIMIT_DEFAULTS.verified },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clampNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number
): number {
  return Math.round(clampNumber(value, fallback, min, max));
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function parseCurfew(raw: unknown, fallback: CurfewConfig): CurfewConfig {
  if (!isRecord(raw)) return fallback;
  const tz = CURFEW_TZS.find((item) => item === raw.tz);
  return {
    on: typeof raw.on === 'boolean' ? raw.on : fallback.on,
    from: isTime(raw.from) ? raw.from : fallback.from,
    to: isTime(raw.to) ? raw.to : fallback.to,
    tz: tz ?? fallback.tz,
  };
}

// Đọc từ storage: thiếu/hỏng → mặc định; ngoài biên → kẹp vào biên an toàn.
export function parsePacing(raw: unknown): PacingConfig {
  const base = defaultPacing();
  if (!isRecord(raw)) return base;
  const rawLimits = isRecord(raw.limits) ? raw.limits : {};
  const limits = { ...base.limits };
  BM_KINDS.forEach((kind) => {
    const row = rawLimits[kind];
    const defaults = LIMIT_DEFAULTS[kind];
    if (!isRecord(row)) return;
    limits[kind] = {
      writesPerDay: clampInt(
        row.writesPerDay,
        defaults.writesPerDay,
        WRITES_MIN,
        WRITES_MAX[kind]
      ),
      maxBatch: clampInt(row.maxBatch, defaults.maxBatch, BATCH_MIN, BATCH_MAX),
    };
  });
  return {
    delayBaseSec: clampNumber(
      raw.delayBaseSec,
      base.delayBaseSec,
      DELAY_BASE_MIN,
      DELAY_BASE_MAX
    ),
    jitterPct: clampNumber(
      raw.jitterPct,
      base.jitterPct,
      JITTER_MIN,
      JITTER_MAX
    ),
    writeExtraSec: clampNumber(
      raw.writeExtraSec,
      base.writeExtraSec,
      WRITE_EXTRA_MIN,
      WRITE_EXTRA_MAX
    ),
    curfew: parseCurfew(raw.curfew, base.curfew),
    limits,
  };
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Phút trong ngày theo múi giờ đã chọn (không phụ thuộc múi giờ máy).
function minutesInTz(now: Date, tz: CurfewTz): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string): number =>
    Number(parts.find((item) => item.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

// Khung băng nửa đêm (from > to) được xử lý; from == to coi là không có khung.
export function isCurfew(now: Date, curfew: CurfewConfig): boolean {
  if (!curfew.on) return false;
  const from = toMinutes(curfew.from);
  const to = toMinutes(curfew.to);
  if (from === to) return false;
  const minutes = minutesInTz(now, curfew.tz);
  return from < to
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to;
}

export type LogDetail = 'off' | 'basic' | 'verbose';
export const LOG_DETAILS: readonly LogDetail[] = ['off', 'basic', 'verbose'];

// logDetail tự về `off` sau 24 giờ (Q7); reset khi khởi động lại trình duyệt để sau.
export const LOG_DETAIL_TTL_MS = 24 * 60 * 60 * 1000;

export type DevtestSettings = {
  devtest: boolean;
  probeTab: boolean;
  snapshotOnMiss: boolean;
  logDetail: LogDetail;
  logDetailAt: number | undefined;
  simScenario: RunScenario;
  // true: side panel dùng simulator thay engine thật (SPEC-ENG-001 D7).
  useSimulator: boolean;
};

// Q6: mặc định tắt; chỉ bản dev bật sẵn `devtest`.
export function defaultDevtest(isDev: boolean): DevtestSettings {
  return {
    devtest: isDev,
    probeTab: false,
    snapshotOnMiss: false,
    logDetail: 'off',
    logDetailAt: undefined,
    simScenario: 'done',
    // Tắt cả ở bản dev: engine là đường chạy mặc định.
    useSimulator: false,
  };
}

export function parseDevtest(
  raw: unknown,
  now: number,
  isDev: boolean
): DevtestSettings {
  const base = defaultDevtest(isDev);
  if (!isRecord(raw)) return base;
  const bool = (value: unknown, fallback: boolean): boolean =>
    typeof value === 'boolean' ? value : fallback;
  const logDetail = LOG_DETAILS.find((item) => item === raw.logDetail) ?? 'off';
  const at =
    typeof raw.logDetailAt === 'number' && Number.isFinite(raw.logDetailAt)
      ? raw.logDetailAt
      : undefined;
  const expired =
    logDetail !== 'off' && (at === undefined || now - at > LOG_DETAIL_TTL_MS);
  return {
    devtest: bool(raw.devtest, base.devtest),
    probeTab: bool(raw.probeTab, base.probeTab),
    snapshotOnMiss: bool(raw.snapshotOnMiss, base.snapshotOnMiss),
    logDetail: expired ? 'off' : logDetail,
    logDetailAt: expired || logDetail === 'off' ? undefined : at,
    simScenario:
      RUN_SCENARIOS.find((item) => item === raw.simScenario) ??
      base.simScenario,
    useSimulator: bool(raw.useSimulator, base.useSimulator),
  };
}

// Đổi mức log: ghi mốc bật để áp TTL 24 giờ.
export function withLogDetail(
  settings: DevtestSettings,
  logDetail: LogDetail,
  now: number
): DevtestSettings {
  return {
    ...settings,
    logDetail,
    logDetailAt: logDetail === 'off' ? undefined : now,
  };
}
