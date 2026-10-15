/**
 * signals.ts — nhận diện tín hiệu nguy hiểm trên UI (file 19 §6). Hàm thuần để test.
 * Danh sách từ khoá là heuristic EN+VI, cần duy trì theo thực địa (Meta A/B copy).
 */
import type { EngineErrorCode } from '@/shared/run';

import { isBusinessId } from '@/shared/surfaces';

import { normalizeText } from './text';

export type DangerCode = Extract<
  EngineErrorCode,
  'ERR_CHECKPOINT' | 'ERR_LOGGED_OUT' | 'ERR_RATE_LIMITED' | 'ERR_BM_CHANGED'
>;

// Run phải dừng khi tab chuyển sang BM khác (SPA không reload nên chỉ đổi `business_id`).
// Chỉ so khi cả hai phía là ID hợp lệ: URL tạm thời thiếu tham số không đủ để kết luận.
export function businessChanged(
  baseline: string | undefined,
  current: string | undefined
): boolean {
  return (
    isBusinessId(baseline) && isBusinessId(current) && baseline !== current
  );
}

const RATE_LIMIT_WORDS = [
  'temporarily blocked',
  "you can't use this feature right now",
  'we limit how often',
  'tạm thời bị chặn',
  'không thể sử dụng tính năng này',
  'giới hạn tần suất',
];

// Meta dùng "thử lại sau" cho cả lỗi mạng/tải tạm thời, nên riêng nó không đủ để khoá máy 24 giờ:
// chỉ tính khi đi cùng một từ nói rõ là bị chặn/giới hạn.
const WEAK_RATE_LIMIT_WORDS = ['try again later', 'thử lại sau'];
const RATE_LIMIT_QUALIFIERS = [
  'blocked',
  'limit',
  'too many',
  'chặn',
  'giới hạn',
  'quá nhiều',
];

const IDENTITY_WORDS = [
  'confirm your identity',
  'xác nhận danh tính',
  'xác minh danh tính',
  'unusual activity',
  'hoạt động bất thường',
  'captcha',
  'security check',
  'kiểm tra bảo mật',
];

const SESSION_WORDS = [
  'session expired',
  'your session has expired',
  'phiên của bạn đã hết hạn',
  'phiên đăng nhập đã hết hạn',
];

// Đường dẫn: checkpoint là tín hiệu sớm nhất vì Meta redirect trước khi render dialog.
export function classifyPath(pathname: string): DangerCode | undefined {
  const path = pathname.toLowerCase();
  if (path.includes('/checkpoint')) return 'ERR_CHECKPOINT';
  if (path.includes('/login')) return 'ERR_LOGGED_OUT';
  return undefined;
}

// Bằng chứng của một tín hiệu: từ khoá đã khớp (không chứa dữ liệu người dùng) và đoạn đầu của dialog
// (chỉ ghi khi Devtest logDetail ≠ off), để phân biệt Meta giới hạn thật với nhận diện nhầm.
export type DangerEvidence = { keyword: string; snippet?: string };
export type DangerMatch = { code: DangerCode; evidence: DangerEvidence };

const SNIPPET_MAX = 160;

// Văn bản của dialog/alert vừa xuất hiện.
export function matchText(raw: string): DangerMatch | undefined {
  const text = normalizeText(raw);
  const snippet = text.slice(0, SNIPPET_MAX);
  const found = (code: DangerCode, keyword: string): DangerMatch => ({
    code,
    evidence: { keyword, snippet },
  });
  const identity = IDENTITY_WORDS.find((word) => text.includes(word));
  if (identity) return found('ERR_CHECKPOINT', identity);
  const session = SESSION_WORDS.find((word) => text.includes(word));
  if (session) return found('ERR_LOGGED_OUT', session);
  const strong = RATE_LIMIT_WORDS.find((word) => text.includes(word));
  if (strong) return found('ERR_RATE_LIMITED', strong);
  const weak = WEAK_RATE_LIMIT_WORDS.find((word) => text.includes(word));
  const qualifier = RATE_LIMIT_QUALIFIERS.find((word) => text.includes(word));
  if (weak && qualifier)
    return found('ERR_RATE_LIMITED', `${weak}+${qualifier}`);
  return undefined;
}

export function classifyText(raw: string): DangerCode | undefined {
  return matchText(raw)?.code;
}
