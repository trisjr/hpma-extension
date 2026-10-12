/**
 * runConfig.ts — cấu hình run gửi tới engine (SPEC-ENG-001 §4) và phân tích ô
 * "dán tên hoặc ID TKQC". Thuần dữ liệu: dùng ở cả side panel lẫn content script,
 * nên engine không tin dữ liệu từ panel mà validate lại tại đây.
 */
import type { PartnerTask } from '@/shared/partnerAssign';

import {
  PARTNER_TASKS,
  sanitizeBmId,
  validateBmId,
} from '@/shared/partnerAssign';

export type RunConfig = {
  partnerBmId: string;
  // Tên hoặc ID TKQC user dán; engine khớp trong danh sách tài sản của wizard.
  queries: string[];
  tasks: PartnerTask[];
};

export const MAX_QUERIES = 200;
export const MAX_QUERY_LENGTH = 200;

// Bỏ ký tự vô hình/khoảng trắng thừa, gộp khoảng trắng liên tiếp.
export function cleanQuery(raw: string): string {
  return raw
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Zs}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Khoá khử trùng khớp cách engine so khớp: không phân biệt hoa/thường, các loại gạch ngang như nhau.
function dedupeKey(query: string): string {
  return query.toLowerCase().replace(/[‐-―−]/g, '-');
}

export type ParsedQueries = {
  queries: string[];
  tooLong: number;
  duplicates: number;
  overLimit: number;
};

// Mỗi dòng một mục. Mục quá dài bị loại và đếm riêng để UI cảnh báo.
export function parseQueries(text: string): ParsedQueries {
  const seen = new Set<string>();
  const queries: string[] = [];
  let tooLong = 0;
  let duplicates = 0;
  let overLimit = 0;
  text.split(/\r\n|\r|\n/).forEach((line) => {
    const query = cleanQuery(line);
    if (query === '') return;
    if (query.length > MAX_QUERY_LENGTH) {
      tooLong += 1;
      return;
    }
    const key = dedupeKey(query);
    if (seen.has(key)) {
      duplicates += 1;
      return;
    }
    if (queries.length >= MAX_QUERIES) {
      overLimit += 1;
      return;
    }
    seen.add(key);
    queries.push(query);
  });
  return { queries, tooLong, duplicates, overLimit };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Kiểm từng trường; sai bất kỳ trường nào thì từ chối cả cấu hình.
export function parseRunConfig(raw: unknown): RunConfig | undefined {
  if (!isRecord(raw)) return undefined;
  const { partnerBmId, queries, tasks } = raw;
  if (typeof partnerBmId !== 'string') return undefined;
  const bmId = sanitizeBmId(partnerBmId);
  if (validateBmId(bmId) !== undefined) return undefined;
  if (!Array.isArray(queries) || queries.length === 0) return undefined;
  if (queries.length > MAX_QUERIES) return undefined;
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < queries.length; i += 1) {
    const item: unknown = queries[i];
    if (typeof item !== 'string') return undefined;
    const query = cleanQuery(item);
    if (query.length > MAX_QUERY_LENGTH) return undefined;
    if (query !== '' && !seen.has(dedupeKey(query))) {
      seen.add(dedupeKey(query));
      cleaned.push(query);
    }
  }
  if (cleaned.length === 0) return undefined;
  if (!Array.isArray(tasks)) return undefined;
  const wanted = PARTNER_TASKS.map((item) => item.task).filter((task) =>
    tasks.includes(task)
  );
  if (wanted.length === 0 || wanted.length !== tasks.length) return undefined;
  return { partnerBmId: bmId, queries: cleaned, tasks: wanted };
}
