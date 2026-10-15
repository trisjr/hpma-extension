/**
 * labels.ts — nhãn UI Business Manager EN/VI là DỮ LIỆU có phiên bản (NFR-06,
 * file 17 §4.3): Meta đổi copy thì vá bảng này, không vá logic engine.
 * `verified: true` = đã chạy thực địa, locale vi (PRD §4.3, 12/10/2026; nhóm
 * `dialog.*`, `asset.alreadyAssigned`, `signal.approval` trên BM thường,
 * 14/10/2026, QA-REPORT-002); còn lại là suy luận từ Help Center, engine phải dừng nhẹ nhàng nếu trượt.
 */

export type Label = {
  vi: readonly string[];
  en: readonly string[];
  verified: boolean;
};

export type LabelKey =
  | 'nav.users'
  | 'nav.partners'
  | 'partners.add'
  | 'partners.give'
  | 'partner.exists'
  | 'dialog.bmId'
  | 'dialog.next'
  | 'dialog.assetTypeAdAccounts'
  | 'dialog.assetSearch'
  | 'dialog.accessPartial'
  | 'dialog.taskCampaigns'
  | 'dialog.taskPerformance'
  | 'dialog.taskCreative'
  | 'dialog.taskManage'
  | 'dialog.assign'
  | 'dialog.cancel'
  | 'dialog.close'
  | 'dialog.done'
  | 'asset.alreadyAssigned'
  | 'asset.selectAll'
  | 'partner.assignedAssets'
  | 'signal.approval'
  | 'requests.needsReview'
  | 'request.respond'
  | 'request.approve'
  | 'request.decline';

export const LABELS: Record<LabelKey, Label> = {
  'nav.users': {
    vi: ['Người dùng'],
    en: ['Users'],
    verified: true,
  },
  'nav.partners': {
    vi: ['Đối tác'],
    en: ['Partners'],
    verified: true,
  },
  'partners.add': {
    vi: ['Thêm'],
    en: ['Add'],
    verified: true,
  },
  'partners.give': {
    vi: [
      'Cấp cho đối tác quyền truy cập vào tài sản của bạn',
      'Cấp cho đối tác quyền truy cập',
    ],
    en: ['Give a partner access to your assets'],
    verified: true,
  },
  'dialog.bmId': {
    vi: [
      'Nhập ID đối tác kinh doanh',
      'ID trang quản lý tài sản doanh nghiệp của đối tác',
      'ID doanh nghiệp của đối tác',
    ],
    en: [
      "Partner's business portfolio ID",
      'Business portfolio ID',
      "Partner's business ID",
    ],
    verified: true,
  },
  'partner.exists': {
    vi: ['Đã có mối quan hệ kinh doanh với đối tác'],
    en: ['You already have a business relationship with this partner'],
    verified: false,
  },
  'dialog.next': {
    vi: ['Tiếp'],
    en: ['Next'],
    verified: true,
  },
  'dialog.assetTypeAdAccounts': {
    vi: ['Tài khoản quảng cáo'],
    en: ['Ad accounts'],
    verified: true,
  },
  'dialog.assetSearch': {
    vi: ['Tìm kiếm theo tên hoặc ID'],
    en: ['Search by name or ID'],
    verified: true,
  },
  'dialog.accessPartial': {
    vi: ['Quyền truy cập một phần'],
    en: ['Partial access'],
    verified: true,
  },
  'dialog.taskCampaigns': {
    vi: ['Quản lý chiến dịch'],
    en: ['Manage campaigns'],
    verified: true,
  },
  'dialog.taskPerformance': {
    vi: ['Xem hiệu quả'],
    en: ['View performance'],
    verified: true,
  },
  'dialog.taskCreative': {
    vi: ['Quản lý mẫu mô phỏng trong Creative Hub'],
    en: ['Manage Creative Hub mockups'],
    verified: true,
  },
  'dialog.taskManage': {
    vi: ['Quản lý tài khoản quảng cáo'],
    en: ['Manage ad account'],
    verified: true,
  },
  'dialog.assign': {
    vi: ['Chỉ định tài sản'],
    en: ['Assign assets'],
    verified: true,
  },
  'dialog.cancel': {
    // Bước quyền: nút phụ tên "Quay lại" (QA-REPORT-003), không khớp nhãn này; flow rơi về `dialog.close`.
    vi: ['Hủy', 'Huỷ'],
    en: ['Cancel'],
    verified: false,
  },
  'dialog.close': {
    vi: ['Đóng'],
    en: ['Close'],
    verified: true,
  },
  // Nút của dialog "Approval needed" sau khi bấm Assign (ảnh chụp 15/10/2026); `vi` chưa có báo cáo thực địa.
  'dialog.done': {
    vi: ['Xong'],
    en: ['Done'],
    verified: false,
  },
  'asset.alreadyAssigned': {
    vi: ['Đã được chỉ định', 'Đã chia sẻ'],
    en: ['Already assigned', 'Already shared'],
    verified: true,
  },
  'asset.selectAll': {
    vi: ['Chọn tất cả'],
    en: ['Select all'],
    verified: false,
  },
  'partner.assignedAssets': {
    vi: ['Tài sản bạn đã chỉ định'],
    // Probe thực địa 14/10 (QA-REPORT-003): nhãn `en` trúng tầng 1 20/20; `vi` chưa có báo cáo probe.
    en: ['Assets you assigned'],
    verified: true,
  },
  'signal.approval': {
    // Chỉ cụm nhiều từ: từ đơn như "approval" xuất hiện cả trong văn bản trợ giúp của wizard.
    vi: ['cần được phê duyệt', 'cần phê duyệt', 'cần người khác duyệt'],
    // "Approval needed … we need someone else on this business approve this request" (ảnh chụp 15/10/2026).
    en: [
      'may need to approve',
      'needs to be approved',
      'needs approval from',
      'approve this request',
    ],
    verified: true,
  },
  // Nhóm `request*`: Settings › Requests (SPEC-ENG-002). `en` theo ảnh chụp 14/10/2026;
  // `vi` là suy luận từ Help Center, cần probe trên BM tiếng Việt.
  'requests.needsReview': {
    vi: ['Cần xem xét', 'Cần xem lại'],
    en: ['Needs review'],
    verified: false,
  },
  'request.respond': {
    vi: ['Phản hồi'],
    en: ['Respond'],
    verified: false,
  },
  'request.approve': {
    vi: ['Phê duyệt', 'Duyệt'],
    en: ['Approve'],
    verified: false,
  },
  // Chỉ định vị/bấm khi user chọn quyết định Decline; luôn dùng để nhận ra cú bấm Decline (SPEC-ENG-002).
  'request.decline': {
    vi: ['Từ chối'],
    en: ['Decline'],
    verified: false,
  },
};

// Locale thật của trang lên đầu (nhanh hơn); luôn so cả hai bộ nhãn nên
// detect sai locale không làm sai kết quả (file 17 §4.2).
export function labelsOf(key: LabelKey, lang: string): string[] {
  const label = LABELS[key];
  return lang.toLowerCase().startsWith('vi')
    ? [...label.vi, ...label.en]
    : [...label.en, ...label.vi];
}
