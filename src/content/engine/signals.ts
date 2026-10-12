/**
 * signals.ts — nhận diện tín hiệu nguy hiểm trên UI (file 19 §6). Hàm thuần để test.
 * Danh sách từ khoá là heuristic EN+VI, cần duy trì theo thực địa (Meta A/B copy).
 */
import type { EngineErrorCode } from '@/shared/run';

import { normalizeText } from './text';

export type DangerCode = Extract<
  EngineErrorCode,
  'ERR_CHECKPOINT' | 'ERR_LOGGED_OUT' | 'ERR_RATE_LIMITED'
>;

const RATE_LIMIT_WORDS = [
  'temporarily blocked',
  "you can't use this feature right now",
  'we limit how often',
  'try again later',
  'tạm thời bị chặn',
  'không thể sử dụng tính năng này',
  'giới hạn tần suất',
  'thử lại sau',
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

// Văn bản của dialog/alert vừa xuất hiện.
export function classifyText(raw: string): DangerCode | undefined {
  const text = normalizeText(raw);
  if (IDENTITY_WORDS.some((word) => text.includes(word)))
    return 'ERR_CHECKPOINT';
  if (SESSION_WORDS.some((word) => text.includes(word)))
    return 'ERR_LOGGED_OUT';
  if (RATE_LIMIT_WORDS.some((word) => text.includes(word)))
    return 'ERR_RATE_LIMITED';
  return undefined;
}
