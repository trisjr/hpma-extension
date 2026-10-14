/**
 * approve.ts — hợp đồng dữ liệu của flow "Confirm request cấp quyền TKQC" (SPEC-ENG-002):
 * cấu hình run, lệnh quét chỉ-đọc `requests.read` và phản hồi. Thuần dữ liệu, dùng ở cả
 * side panel lẫn content script; engine không tin dữ liệu từ panel nên validate lại ở đây.
 */
import { cleanQuery } from '@/shared/runConfig';
import { isBusinessId } from '@/shared/surfaces';

// Một request cấp quyền TKQC đang chờ duyệt, như hiện ở danh sách Needs review.
export type ApproveRequest = { requester: string; account: string };

// Quyết định user chọn cho cả lượt quét: Approve hoặc Decline mọi request trong danh sách.
export type ApproveAction = 'approve' | 'decline';
export const APPROVE_ACTIONS: readonly ApproveAction[] = ['approve', 'decline'];

export function isApproveAction(value: unknown): value is ApproveAction {
  return APPROVE_ACTIONS.some((action) => action === value);
}

export type ApproveConfig = {
  // Tên BM đối tác user nhập; engine so khớp chính xác (sau chuẩn hoá) với tên trong request.
  partnerName: string;
  // Bắt buộc: không có mặc định ngầm ở engine (Decline không đảo ngược được).
  action: ApproveAction;
  // Danh sách đã quét và user đã xem: engine không duyệt gì ngoài danh sách này.
  requests: ApproveRequest[];
};

// Định danh hiển thị của một target duyệt. Kèm số thứ tự vì hai request trùng hệt nhau là hợp lệ
// và UI dùng chuỗi này làm khoá React: phải duy nhất trong run.
export function approveTargetId(
  request: ApproveRequest,
  index: number
): string {
  return `${request.requester} · #${index + 1}`;
}

export const MAX_PARTNER_NAME_LENGTH = 100;
export const MAX_APPROVE_REQUESTS = 50;
export const MAX_FIELD_LENGTH = 200;

export type PartnerNameError = 'empty' | 'tooLong';

export function cleanPartnerName(raw: string): string {
  return cleanQuery(raw);
}

export function validatePartnerName(raw: string): PartnerNameError | undefined {
  const name = cleanPartnerName(raw);
  if (name === '') return 'empty';
  if (name.length > MAX_PARTNER_NAME_LENGTH) return 'tooLong';
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cleanField(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = cleanQuery(value);
  return text === '' || text.length > MAX_FIELD_LENGTH ? undefined : text;
}

function parseRequest(raw: unknown): ApproveRequest | undefined {
  if (!isRecord(raw)) return undefined;
  const requester = cleanField(raw.requester);
  const account = cleanField(raw.account);
  return requester && account ? { requester, account } : undefined;
}

// Kiểm từng trường; sai bất kỳ trường nào thì từ chối cả cấu hình.
export function parseApproveConfig(raw: unknown): ApproveConfig | undefined {
  if (!isRecord(raw) || typeof raw.partnerName !== 'string') return undefined;
  if (validatePartnerName(raw.partnerName) !== undefined) return undefined;
  if (!isApproveAction(raw.action)) return undefined;
  const { requests } = raw;
  if (!Array.isArray(requests) || requests.length === 0) return undefined;
  if (requests.length > MAX_APPROVE_REQUESTS) return undefined;
  const parsed: ApproveRequest[] = [];
  for (let i = 0; i < requests.length; i += 1) {
    const request = parseRequest(requests[i]);
    if (!request) return undefined;
    parsed.push(request);
  }
  return {
    partnerName: cleanPartnerName(raw.partnerName),
    action: raw.action,
    requests: parsed,
  };
}

// ---- Quét chỉ-đọc: panel → content script -----------------------------------

export type RequestsRead = { kind: 'requests.read'; partnerName: string };

export type RequestsError =
  // Tab không ở trang Requests (hoặc thiếu business_id).
  | 'surface'
  // Không đọc được danh sách Needs review (nhãn/DOM chưa nhận diện được).
  | 'unreadable'
  // Đang có run: không quét chen vào.
  | 'busy';

export type RequestsReply =
  | { ok: true; businessId: string; requests: ApproveRequest[] }
  | { ok: false; error: RequestsError };

export function isRequestsRead(value: unknown): value is RequestsRead {
  return (
    isRecord(value) &&
    value.kind === 'requests.read' &&
    typeof value.partnerName === 'string' &&
    validatePartnerName(value.partnerName) === undefined
  );
}

export function isRequestsReply(value: unknown): value is RequestsReply {
  if (!isRecord(value)) return false;
  if (value.ok === false) {
    return ['surface', 'unreadable', 'busy'].includes(String(value.error));
  }
  return (
    value.ok === true &&
    isBusinessId(value.businessId) &&
    Array.isArray(value.requests) &&
    value.requests.length <= MAX_APPROVE_REQUESTS &&
    value.requests.every((item) => parseRequest(item) !== undefined)
  );
}
