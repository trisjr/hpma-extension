/**
 * audit.ts — mô hình dòng audit và hàm lọc/export (SPEC-UI-004 §4, FR-07).
 * Chưa có background ghi audit: `SAMPLE_AUDIT` là dữ liệu mẫu của artboard,
 * luôn được gắn nhãn khi hiển thị/export. `AuditRow` là hợp đồng cho FR-07.
 * Không có cột "người chạy": FR-07 yêu cầu không PII (SPEC-UI-004 Q5).
 * Engine thật ghi chunk qua `planAppend`/`rowsFromRun` (SPEC-ENG-001 §8).
 */
import type { RunState, RunTarget } from '@/shared/run';

export type AuditFlow =
  | 'partner-assign'
  | 'partner-approve'
  | 'partner-remove'
  | 'rename'
  | 'inventory';
export const AUDIT_FLOWS: readonly AuditFlow[] = [
  'partner-assign',
  'partner-approve',
  'partner-remove',
  'rename',
  'inventory',
];

export type AuditMode = 'full' | 'assist' | 'dry' | 'read';
export type AuditResult = 'done' | 'pending' | 'failed' | 'skip' | 'dry';
export const AUDIT_RESULTS: readonly AuditResult[] = [
  'done',
  'pending',
  'failed',
  'skip',
  'dry',
];

export type AuditRow = {
  time: number; // epoch ms
  flow: AuditFlow;
  bm: string;
  target: string;
  mode: AuditMode;
  result: AuditResult;
  runId: string;
};

export const AUDIT_PREFIX = 'audit:';
export const PAGE_SIZE = 10;

export function isAuditRow(value: unknown): value is AuditRow {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Partial<Record<keyof AuditRow, unknown>>;
  return (
    typeof row.time === 'number' &&
    Number.isFinite(row.time) &&
    !Number.isNaN(new Date(row.time).getTime()) &&
    AUDIT_FLOWS.some((flow) => flow === row.flow) &&
    typeof row.bm === 'string' &&
    typeof row.target === 'string' &&
    (row.mode === 'full' ||
      row.mode === 'assist' ||
      row.mode === 'dry' ||
      row.mode === 'read') &&
    AUDIT_RESULTS.some((result) => result === row.result) &&
    typeof row.runId === 'string'
  );
}

const at = (day: number, hour: number, minute: number): number =>
  new Date(2026, 9, day, hour, minute).getTime();

type SampleSeed = [
  number,
  AuditFlow,
  string,
  string,
  AuditMode,
  AuditResult,
  string,
];

const SEEDS: SampleSeed[] = [
  [
    at(12, 14, 22),
    'partner-assign',
    'Agency 03',
    'Tenomad – Spa Hoa',
    'full',
    'done',
    'run_9b27e5',
  ],
  [
    at(12, 14, 21),
    'partner-assign',
    'Agency 03',
    'HPMA – Shop Lan 02',
    'full',
    'done',
    'run_9b27e5',
  ],
  [
    at(12, 14, 21),
    'partner-assign',
    'Agency 03',
    'HPMA – Shop Lan 01',
    'full',
    'done',
    'run_9b27e5',
  ],
  [
    at(12, 14, 20),
    'partner-assign',
    'Agency 03',
    'Tenomad – Nha khoa An',
    'full',
    'skip',
    'run_9b27e5',
  ],
  [
    at(12, 14, 3),
    'partner-assign',
    'Agency 03',
    '4 TKQC',
    'dry',
    'dry',
    'run_7f3a92',
  ],
  [
    at(12, 11, 40),
    'rename',
    'Agency 01',
    'Thời trang Mai 11',
    'assist',
    'done',
    'run_5c11ab',
  ],
  [
    at(12, 10, 12),
    'partner-assign',
    'Agency 01',
    '10 TKQC · mẻ 1/4',
    'full',
    'done',
    'run_3e90f1',
  ],
  [
    at(12, 9, 58),
    'partner-remove',
    'Agency 02',
    'Spa Hồng 02',
    'full',
    'pending',
    'run_2a7c44',
  ],
  [
    at(11, 17, 31),
    'rename',
    'Agency 02',
    'Spa Hồng 05',
    'assist',
    'failed',
    'run_19bd02',
  ],
  [
    at(11, 16, 5),
    'inventory',
    'Agency 03',
    'Toàn BM',
    'read',
    'done',
    'run_0f4e77',
  ],
];

export const SAMPLE_AUDIT: AuditRow[] = SEEDS.map(
  ([time, flow, bm, target, mode, result, runId]) => ({
    time,
    flow,
    bm,
    target,
    mode,
    result,
    runId,
  })
);

export type AuditFilter = {
  from: string; // 'yyyy-mm-dd' hoặc rỗng
  to: string;
  flow: AuditFlow | 'all';
  result: AuditResult | 'all';
  query: string;
};

export const EMPTY_FILTER: AuditFilter = {
  from: '',
  to: '',
  flow: 'all',
  result: 'all',
  query: '',
};

export function isFilterActive(filter: AuditFilter): boolean {
  return (
    filter.from !== '' ||
    filter.to !== '' ||
    filter.flow !== 'all' ||
    filter.result !== 'all' ||
    filter.query.trim() !== ''
  );
}

// Tìm không phân biệt hoa thường và dấu.
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function startOfDay(date: string): number | undefined {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day).getTime();
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function filterAudit(rows: AuditRow[], filter: AuditFilter): AuditRow[] {
  const from = startOfDay(filter.from);
  const toStart = startOfDay(filter.to);
  const toEnd = toStart === undefined ? undefined : toStart + DAY_MS;
  const query = fold(filter.query.trim());
  return rows.filter((row) => {
    if (from !== undefined && row.time < from) return false;
    if (toEnd !== undefined && row.time >= toEnd) return false;
    if (filter.flow !== 'all' && row.flow !== filter.flow) return false;
    if (filter.result !== 'all' && row.result !== filter.result) return false;
    if (query === '') return true;
    return fold(`${row.bm} ${row.target} ${row.runId}`).includes(query);
  });
}

export function paginate<T>(rows: T[], page: number): T[] {
  return rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

const BOM = String.fromCharCode(0xfeff);
// Ký tự công thức ở đầu ô, kể cả sau khoảng trắng/ký tự vô hình, hoặc tab/CR/LF đứng đầu.
const FORMULA_START = /^[\s\p{Zs}\p{Cf}]*[=+\-@]|^[\t\r\n]/u;
const NEEDS_QUOTE = /[",\n\r]/;

// Chống CSV-injection: ô bắt đầu bằng ký tự công thức thì thêm `'` đứng trước.
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return NEEDS_QUOTE.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CSV_HEADER = ['time', 'flow', 'bm', 'target', 'mode', 'result', 'runId'];

function fields(row: AuditRow): string[] {
  return [
    new Date(row.time).toISOString(),
    row.flow,
    row.bm,
    row.target,
    row.mode,
    row.result,
    row.runId,
  ];
}

// `sample` thêm cột đánh dấu dữ liệu mẫu để không lẫn với audit thật.
export function toCsv(rows: AuditRow[], sample: boolean): string {
  const header = sample ? [...CSV_HEADER, 'sample'] : CSV_HEADER;
  const lines = [
    header.join(','),
    ...rows.map((row) =>
      (sample ? [...fields(row), 'true'] : fields(row)).map(csvCell).join(',')
    ),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function toJsonl(rows: AuditRow[], sample: boolean): string {
  return rows
    .map((row) =>
      // Liệt kê trường tường minh: trường lạ trong storage không lọt vào file export.
      JSON.stringify({
        time: new Date(row.time).toISOString(),
        flow: row.flow,
        bm: row.bm,
        target: row.target,
        mode: row.mode,
        result: row.result,
        runId: row.runId,
        ...(sample ? { sample: true } : {}),
      })
    )
    .join('\n');
}

// ---- Ghi audit từ engine (SPEC-ENG-001 §8) -----------------------------------

export const AUDIT_CHUNK_MAX = 200;
// Con trỏ chunk đang ghi: tránh phải đọc cả storage để biết chunk cuối.
// Không có tiền tố `audit:` nên `useAuditLog` không đọc nhầm.
export const AUDIT_CURSOR_KEY = 'auditCursor';
export const SOURCE_BM_LABEL = 'BM nguồn';

export type AuditCursor = { ym: string; n: number };

export function monthKey(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function chunkKey(cursor: AuditCursor): string {
  return `${AUDIT_PREFIX}${cursor.ym}:${cursor.n}`;
}

export function parseCursor(raw: unknown): AuditCursor | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { ym, n } = raw as Partial<AuditCursor>;
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return undefined;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) return undefined;
  return { ym, n };
}

// Trả về các cặp key → giá trị cần `storage.local.set`. Chỉ nối thêm vào chunk
// cuối (cùng tháng) hoặc mở chunk mới; không bao giờ sửa dòng cũ.
export function planAppend(
  cursor: AuditCursor | undefined,
  lastChunk: AuditRow[],
  rows: AuditRow[],
  now: number
): Record<string, unknown> {
  const ym = monthKey(now);
  let n = cursor !== undefined && cursor.ym === ym ? cursor.n : 1;
  const existing = cursor !== undefined && cursor.ym === ym ? lastChunk : [];
  const merged = [...existing, ...rows];
  const writes: Record<string, unknown> = {};
  for (let start = 0; start < merged.length; start += AUDIT_CHUNK_MAX) {
    writes[chunkKey({ ym, n })] = merged.slice(start, start + AUDIT_CHUNK_MAX);
    if (start + AUDIT_CHUNK_MAX < merged.length) n += 1;
  }
  writes[AUDIT_CURSOR_KEY] = { ym, n };
  return writes;
}

// Cấp độ log chi tiết (Options › Devtest): off | basic | verbose.
export type AuditDetail = 'off' | 'basic' | 'verbose';

// Chỉ target đã có kết quả cuối mới có dòng audit; queued/running (run bị dừng) thì không.
const FINAL_OUTCOMES: readonly RunTarget['outcome'][] = [
  'done',
  'skipped-existing',
  'failed',
  'pending-approval',
  'unverified',
];

function auditResult(
  mode: RunState['mode'],
  outcome: RunTarget['outcome']
): AuditResult {
  if (outcome === 'skipped-existing') return 'skip';
  if (outcome === 'pending-approval') return 'pending';
  if (outcome === 'failed' || outcome === 'unverified') return 'failed';
  return mode === 'dry' ? 'dry' : 'done';
}

function auditTarget(
  run: RunState,
  target: RunTarget,
  index: number,
  detail: AuditDetail
): string {
  const approve = run.flow === 'partner-approve';
  // Flow duyệt luôn kèm quyết định đã chọn (không PII) để audit không nhầm Decline với Approve.
  // `ERR_WRONG_ACTION`: nút đã bấm là nút ngược quyết định, nên ghi hành động thực sự xảy ra.
  const chosen = run.action ?? 'approve';
  const done =
    target.code === 'ERR_WRONG_ACTION'
      ? `${chosen === 'approve' ? 'decline' : 'approve'} (wrong-action)`
      : chosen;
  const action = approve ? ` · ${done}` : '';
  if (detail === 'off') {
    return `${approve ? 'Request' : 'TKQC'} #${index + 1}${action}`;
  }
  if (detail === 'basic') return `${target.name}${action}`;
  return `${target.name} → ${approve ? run.partnerName ?? '' : run.partnerBmId}${action}`;
}

// Mặc định không PII: tên TKQC chỉ khi `basic`, ID partner chỉ khi `verbose`.
export function rowsFromRun(run: RunState, detail: AuditDetail): AuditRow[] {
  const time = run.endedAt ?? Date.now();
  return run.targets.flatMap((target, index) =>
    FINAL_OUTCOMES.includes(target.outcome)
      ? [
          {
            time,
            flow:
              run.flow === 'partner-approve'
                ? ('partner-approve' as const)
                : ('partner-assign' as const),
            bm: SOURCE_BM_LABEL,
            target: auditTarget(run, target, index, detail),
            mode: run.mode,
            result: auditResult(run.mode, target.outcome),
            runId: run.runId,
          },
        ]
      : []
  );
}
