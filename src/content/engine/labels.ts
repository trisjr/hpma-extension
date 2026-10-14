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
  | 'asset.alreadyAssigned'
  | 'asset.selectAll'
  | 'partner.assignedAssets'
  | 'signal.approval';

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
    en: ['Assets you assigned'],
    verified: false,
  },
  'signal.approval': {
    // Chỉ cụm nhiều từ: từ đơn như "approval" xuất hiện cả trong văn bản trợ giúp của wizard.
    vi: ['cần được phê duyệt', 'cần phê duyệt', 'cần người khác duyệt'],
    en: ['may need to approve', 'needs to be approved', 'needs approval from'],
    verified: true,
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
