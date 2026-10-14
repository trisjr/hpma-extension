/**
 * probe.ts — hợp đồng báo cáo probe P0 (FR-02) giữa content script và side panel.
 * Thuần: không DOM, không storage. Báo cáo không chứa cookie, token, tên hay ID
 * (chỉ khoá selector, ngôn ngữ trang và đường dẫn không có query).
 */

export const PROBE_SAMPLES = 20;
export const PROBE_SAMPLE_GAP_MS = 250;
// Ngưỡng cổng ghi (PRD G2). Không có cờ nào hạ được ngưỡng này.
export const PROBE_PASS_RATE = 0.95;
export const PROBE_STORAGE_KEY = 'lastProbe';

// Màn hình mà một key thuộc về: probe chỉ đo key của màn đang thấy.
export type ProbeStage = 'page' | 'menu' | 'dialog' | 'detail';
export const PROBE_STAGES: readonly ProbeStage[] = [
  'page',
  'menu',
  'dialog',
  'detail',
];

export type ProbeScope = 'document' | 'main' | 'dialog';
export type ProbeTier = 1 | 2 | 3 | 4;

export type ProbeKeyResult = {
  key: string;
  stage: ProbeStage;
  scope: ProbeScope;
  // false: key thuộc màn khác, hoặc vùng tìm chưa có trên trang.
  measured: boolean;
  hits: number;
  samples: number;
  // Tầng thắng nhiều lần nhất; các tầng áp dụng được nhưng thấp hơn tầng thắng là `missTiers`.
  winTier?: ProbeTier;
  missTiers: ProbeTier[];
};

// Phần do content script đo. `browser` do panel thêm (API nhận dạng trình duyệt chỉ có
// ở extension page, và không dùng user agent vì profile antidetect giả mạo nó).
export type ProbeCore = {
  version: 1;
  at: number;
  lang: string;
  // Chỉ pathname, không có business_id.
  pathname: string;
  stage: ProbeStage;
  samples: number;
  // Hit-rate (0..1) trên các key đã đo; undefined khi không đo được key nào.
  rate?: number;
  keys: ProbeKeyResult[];
};

export type ProbeReport = ProbeCore & { browser: 'chrome' | 'firefox' };

export type ProbeReports = Partial<Record<ProbeStage, ProbeReport>>;

export type ProbeErrorCode = 'ERR_BUSY' | 'ERR_INTERNAL';
export type ProbeReply =
  | { ok: true; report: ProbeCore }
  | { ok: false; code: ProbeErrorCode };

// Quy ước key → màn hình. `partner.*` (trang chi tiết partner) chưa có bộ nhận diện
// màn, nên không bao giờ được đo: cổng vẫn đóng (PRD §4.3 điểm 4).
export function stageOfKey(key: string): ProbeStage {
  if (key.startsWith('dialog.')) return 'dialog';
  if (key === 'partners.give') return 'menu';
  if (key.startsWith('partner.')) return 'detail';
  return 'page';
}

export function rateOf(keys: readonly ProbeKeyResult[]): number | undefined {
  const measured = keys.filter((item) => item.measured);
  const samples = measured.reduce((sum, item) => sum + item.samples, 0);
  if (samples === 0) return undefined;
  return measured.reduce((sum, item) => sum + item.hits, 0) / samples;
}

export type GateStatus = 'incomplete' | 'below' | 'pass';

// Cổng chỉ mở khi MỌI màn đều có báo cáo đạt ngưỡng; thiếu một màn là "chưa đủ dữ liệu".
export function gateStatus(reports: ProbeReports): GateStatus {
  if (PROBE_STAGES.some((stage) => reports[stage] === undefined)) {
    return 'incomplete';
  }
  const below = PROBE_STAGES.some(
    (stage) => (reports[stage]?.rate ?? 0) < PROBE_PASS_RATE
  );
  return below ? 'below' : 'pass';
}

export function latestReport(reports: ProbeReports): ProbeReport | undefined {
  return Object.values(reports).reduce<ProbeReport | undefined>(
    (best, item) => (!best || item.at > best.at ? item : best),
    undefined
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStage(value: unknown): value is ProbeStage {
  return PROBE_STAGES.some((stage) => stage === value);
}

function isTier(value: unknown): value is ProbeTier {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

function isKeyResult(value: unknown): value is ProbeKeyResult {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    isStage(value.stage) &&
    (value.scope === 'document' ||
      value.scope === 'main' ||
      value.scope === 'dialog') &&
    typeof value.measured === 'boolean' &&
    typeof value.hits === 'number' &&
    typeof value.samples === 'number' &&
    (value.winTier === undefined || isTier(value.winTier)) &&
    Array.isArray(value.missTiers) &&
    value.missTiers.every(isTier)
  );
}

export function isProbeCore(value: unknown): value is ProbeCore {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.at === 'number' &&
    typeof value.lang === 'string' &&
    typeof value.pathname === 'string' &&
    isStage(value.stage) &&
    typeof value.samples === 'number' &&
    (value.rate === undefined || typeof value.rate === 'number') &&
    Array.isArray(value.keys) &&
    value.keys.every(isKeyResult)
  );
}

export function isProbeReport(value: unknown): value is ProbeReport {
  return (
    isProbeCore(value) &&
    (value as { browser?: unknown }).browser !== undefined &&
    ((value as { browser?: unknown }).browser === 'chrome' ||
      (value as { browser?: unknown }).browser === 'firefox')
  );
}

// Giá trị lưu có thể hỏng hoặc từ bản cũ: bỏ mục không hợp lệ thay vì ném lỗi.
export function parseProbeReports(raw: unknown): ProbeReports {
  if (!isRecord(raw)) return {};
  const reports: ProbeReports = {};
  PROBE_STAGES.forEach((stage) => {
    const item = raw[stage];
    if (isProbeReport(item) && item.stage === stage) reports[stage] = item;
  });
  return reports;
}

export function isProbeReply(value: unknown): value is ProbeReply {
  if (!isRecord(value)) return false;
  if (value.ok === true) return isProbeCore(value.report);
  return (
    value.ok === false &&
    (value.code === 'ERR_BUSY' || value.code === 'ERR_INTERNAL')
  );
}
