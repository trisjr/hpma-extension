/**
 * requestList.ts — đọc trang Settings › Requests cho flow duyệt (SPEC-ENG-002): danh sách
 * Needs review và khung chi tiết một request. Chỉ đọc DOM, không thao tác gì; dùng chung
 * cho lệnh quét `requests.read` và flow `partnerApprove`.
 * Chỉ nhận request đọc được là "X requests to give B access to the A ad account";
 * hàng không parse được hoặc thuộc loại khác bị bỏ qua, không bao giờ duyệt.
 */
import type { ApproveRequest } from '@/shared/approve';

import { MAX_FIELD_LENGTH } from '@/shared/approve';
import { cleanQuery } from '@/shared/runConfig';

import { labelsOf } from '../engine/labels';
import { isVisible } from '../engine/locator';
import { matchKey, normalizeText } from '../engine/text';

// `\s*` (không phải `\s+`) giữa các cụm: Meta bọc tên in đậm trong phần tử riêng nên
// `textContent` có thể mất khoảng trắng. Nhãn `en` theo ảnh 14/10/2026; `vi` là suy luận.
const LIST_PATTERNS: readonly RegExp[] = [
  /^(.+?)\s*requests\s+to\s+give\s*(.+?)\s*access\s+to\s+the\s*(.+?)\s*ad\s+account\b/i,
  /^(.+?)\s*yêu cầu cấp cho\s*(.+?)\s*quyền truy cập vào tài khoản quảng cáo\s*(.+?)\s*(?:\.|$)/i,
];

// Khung chi tiết dùng thì quá khứ ("requested to give"): phân biệt được với hàng ở danh sách
// kể cả khi chế độ chia đôi hiện cả hai.
const DETAIL_PATTERNS: readonly RegExp[] = [
  /^(.+?)\s*requested\s+to\s+give\s*(.+?)\s*access\s+to\s+the\s*(.+?)\s*ad\s+account\b/i,
  /^(.+?)\s*đã yêu cầu cấp cho\s*(.+?)\s*quyền truy cập vào tài khoản quảng cáo\s*(.+?)\s*(?:\.|$)/i,
];

const MAX_SENTENCE_LENGTH = 400;

// Tên BM và TKQC do bên ngoài đặt: nếu chúng chứa chính các cụm khoá của câu thì regex không
// thể biết ranh giới thật (vd. BM tên "Tris BM access to the A ad account and Evil"). Câu có
// một cụm khoá xuất hiện hơn một lần là mơ hồ nên bị bỏ qua, không bao giờ duyệt. Hệ quả có
// chủ đích: TKQC mà tên có chữ "ad account" cũng bị bỏ qua và phải duyệt tay.
const KEY_PHRASES: readonly RegExp[] = [
  /requests?\s+to\s+give|requested\s+to\s+give|yêu cầu cấp/gi,
  /access\s+to\s+the|quyền truy cập vào/gi,
  /\bad\s+account\b|tài khoản quảng cáo/gi,
];

const isAmbiguous = (sentence: string): boolean =>
  KEY_PHRASES.some((phrase) => (sentence.match(phrase) ?? []).length > 1);
const ID_PATTERN =
  /(?:business\s*(?:manager|portfolio)\s*id|id\s*trình\s*quản\s*lý\s*doanh\s*nghiệp|id\s*danh\s*mục\s*doanh\s*nghiệp)\s*:?\s*(\d{10,30})/i;

export type ParsedSentence = {
  requester: string;
  bmName: string;
  account: string;
};

export type ListedRequest = ParsedSentence & {
  // Phần tử chứa câu mô tả (trong cùng); engine bấm nút Respond của hàng, hoặc chính phần tử này.
  el: HTMLElement;
};

export function mainRegion(): HTMLElement {
  return document.querySelector<HTMLElement>('[role="main"]') ?? document.body;
}

export function parseSentence(
  text: string,
  patterns: readonly RegExp[]
): ParsedSentence | undefined {
  // Bỏ qua sớm các khối lớn (tổ tiên của cả danh sách) trước khi tốn công chuẩn hoá.
  if (text.length > MAX_SENTENCE_LENGTH * 2) return undefined;
  const clean = cleanQuery(text);
  if (clean === '' || clean.length > MAX_SENTENCE_LENGTH) return undefined;
  if (isAmbiguous(clean)) return undefined;
  for (let i = 0; i < patterns.length; i += 1) {
    const match = patterns[i].exec(clean);
    if (match) {
      const requester = cleanQuery(match[1]);
      const bmName = cleanQuery(match[2]);
      const account = cleanQuery(match[3]);
      if (requester && bmName && account) return { requester, bmName, account };
    }
  }
  return undefined;
}

// Phần tử trong cùng khớp mẫu: loại tổ tiên cũng khớp (chúng bắt đầu bằng cùng câu).
function sentenceElements(
  patterns: readonly RegExp[]
): { el: HTMLElement; parsed: ParsedSentence }[] {
  const found = Array.from(
    mainRegion().querySelectorAll<HTMLElement>('*')
  ).flatMap((el) => {
    if (!isVisible(el)) return [];
    const parsed = parseSentence(el.textContent ?? '', patterns);
    return parsed ? [{ el, parsed }] : [];
  });
  return found.filter(
    ({ el }) => !found.some((other) => other.el !== el && el.contains(other.el))
  );
}

// Các request cấp quyền TKQC đang hiện ở danh sách (mọi tên BM), theo thứ tự trên trang.
export function readListedRequests(): ListedRequest[] {
  return sentenceElements(LIST_PATTERNS).map(({ el, parsed }) => ({
    el,
    ...parsed,
  }));
}

export function sameName(left: string, right: string): boolean {
  return matchKey(left) === matchKey(right);
}

export function requestKey(request: ApproveRequest): string {
  return `${matchKey(request.requester)}|${matchKey(request.account)}`;
}

// Khớp chính xác tên BM sau chuẩn hoá: "Tris BM" không khớp "Tris BM 2".
export function matchesPartner(
  listed: ListedRequest,
  partnerName: string
): boolean {
  return sameName(listed.bmName, partnerName);
}

// Quét cho panel: chỉ các request khớp tên BM; trùng hệt nhau vẫn đếm đủ để engine duyệt đúng
// số lượng đã hiện cho user. Trường quá dài bị bỏ (panel từ chối cả phản hồi nếu có), không để
// một tên dài biến thành lỗi "sai trang" gây hiểu nhầm.
export function scanPartnerRequests(partnerName: string): ApproveRequest[] {
  return readListedRequests()
    .filter(
      (listed) =>
        matchesPartner(listed, partnerName) &&
        listed.requester.length <= MAX_FIELD_LENGTH &&
        listed.account.length <= MAX_FIELD_LENGTH
    )
    .map(({ requester, account }) => ({ requester, account }));
}

// Nút Respond của đúng hàng này (không lấy nút của hàng khác): leo lên tới tổ tiên còn chứa
// duy nhất một câu mô tả. Không có thì trả undefined (engine bấm chính câu mô tả).
export function respondButtonOf(
  listed: ListedRequest,
  all: ListedRequest[],
  lang: string
): HTMLElement | undefined {
  const wanted = labelsOf('request.respond', lang).map(normalizeText);
  let node: HTMLElement | null = listed.el;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const scope: HTMLElement = node;
    if (all.filter((other) => scope.contains(other.el)).length > 1) break;
    const buttons = Array.from(
      scope.querySelectorAll<HTMLElement>('button, [role="button"]')
    ).filter(
      (el) =>
        isVisible(el) && wanted.includes(normalizeText(el.textContent ?? ''))
    );
    // Hai nút Respond trở lên trong cùng phạm vi: không biết nút nào của hàng này (có thể là hàng
    // thuộc loại khác không nằm trong `all`), nên không đoán.
    if (buttons.length > 1) break;
    if (buttons.length === 1) return buttons[0];
    node = scope.parentElement;
  }
  return undefined;
}

export type DetailRead = ParsedSentence & { bmId?: string };

const MAX_PANE_TEXT = 4000;
const ID_GLOBAL = new RegExp(ID_PATTERN.source, 'gi');

// BM ID của đúng request đang mở: tìm ở tổ tiên gần nhất của câu mô tả có chứa ID, không quét
// cả trang. Khung chứa nhiều ID khác nhau thì không biết cái nào của BM này: không đoán.
function bmIdNear(el: HTMLElement): string | undefined {
  let node: HTMLElement | null = el;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const text = cleanQuery(node.textContent ?? '');
    if (text.length > MAX_PANE_TEXT) return undefined;
    const ids = new Set(Array.from(text.matchAll(ID_GLOBAL), (m) => m[1]));
    if (ids.size === 1) return Array.from(ids)[0];
    if (ids.size > 1) return undefined;
    node = node.parentElement;
  }
  return undefined;
}

// Khung chi tiết đang mở (câu mô tả thì quá khứ + BM ID). undefined nếu chưa mở hoặc không đọc được.
export function readDetail(): DetailRead | undefined {
  const [first] = sentenceElements(DETAIL_PATTERNS);
  if (!first) return undefined;
  const bmId = bmIdNear(first.el);
  return { ...first.parsed, ...(bmId ? { bmId } : {}) };
}

// Vùng của khung chi tiết: tổ tiên gần nhất của câu mô tả có chứa nút Approve. Dùng để chỉ
// tính cú bấm Approve/Decline thuộc đúng request đang mở.
export function detailPane(lang: string): HTMLElement | undefined {
  const [first] = sentenceElements(DETAIL_PATTERNS);
  if (!first) return undefined;
  const approve = labelsOf('request.approve', lang).map(normalizeText);
  let node: HTMLElement | null = first.el;
  for (let depth = 0; node && depth < 8; depth += 1) {
    const scope: HTMLElement = node;
    const hasApprove = Array.from(
      scope.querySelectorAll<HTMLElement>('button, [role="button"]')
    ).some(
      (el) =>
        isVisible(el) && approve.includes(normalizeText(el.textContent ?? ''))
    );
    if (hasApprove) return scope;
    node = scope.parentElement;
  }
  return undefined;
}

export function detailMatches(
  detail: DetailRead | undefined,
  partnerName: string,
  request: ApproveRequest
): detail is DetailRead {
  return (
    detail !== undefined &&
    sameName(detail.bmName, partnerName) &&
    requestKey(detail) === requestKey(request)
  );
}
