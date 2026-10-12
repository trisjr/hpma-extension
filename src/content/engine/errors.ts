import type { EngineErrorCode } from '@/shared/run';

// Lỗi có mã của engine. `detail` chỉ chứa khoá locator/mốc kỹ thuật, không có
// nội dung trang (SPEC-ENG-001 §7).
export default class EngineError extends Error {
  readonly code: EngineErrorCode;

  readonly detail: string | undefined;

  constructor(code: EngineErrorCode, detail?: string) {
    super(code);
    this.name = 'EngineError';
    this.code = code;
    this.detail = detail;
  }
}
