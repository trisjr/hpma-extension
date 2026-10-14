/**
 * requests.ts — lệnh quét chỉ-đọc `requests.read` của flow duyệt (SPEC-ENG-002): đọc danh sách
 * Needs review và trả các request cấp quyền TKQC khớp tên BM đối tác. Không bấm, không gõ gì.
 */
import type { RequestsRead, RequestsReply } from '@/shared/approve';

import { MAX_APPROVE_REQUESTS } from '@/shared/approve';
import { isBusinessId, isOnSurface } from '@/shared/surfaces';

import { isRunBusy } from './engine/controller';
import { tryResolve } from './engine/locator';
import SELECTORS from './engine/selectors';
import { readListedRequests, scanPartnerRequests } from './flows/requestList';

export default function readRequests(message: RequestsRead): RequestsReply {
  if (isRunBusy()) return { ok: false, error: 'busy' };
  const { pathname, searchParams } = new URL(window.location.href);
  const businessId = searchParams.get('business_id') ?? undefined;
  if (!isOnSurface('requests', pathname) || !isBusinessId(businessId)) {
    return { ok: false, error: 'surface' };
  }
  const lang = document.documentElement.lang ?? '';
  // Không có hàng nào và cũng không thấy tab Needs review: trang chưa nạp hoặc nhãn lạ.
  if (
    readListedRequests().length === 0 &&
    !tryResolve(SELECTORS.requestsNeedsReview, lang)
  ) {
    return { ok: false, error: 'unreadable' };
  }
  return {
    ok: true,
    businessId,
    requests: scanPartnerRequests(message.partnerName).slice(
      0,
      MAX_APPROVE_REQUESTS
    ),
  };
}
