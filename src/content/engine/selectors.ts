/**
 * selectors.ts — registry LocatorSpec theo khoá (FR-02, file 21 §5.4). Flow chỉ
 * tham chiếu khoá ở đây, không tự viết `querySelector` lẻ. Nhãn nằm ở labels.ts.
 * Chọn lựa tầng cấu trúc (`structure`) chỉ là đường lui khi nhãn trượt.
 */
import type { LocatorSpec } from './locator';

const BUTTON = 'button, [role="button"]';
const CLICKABLE =
  'button, [role="button"], [role="menuitem"], [role="option"], [role="radio"], [role="tab"], a';
const TOGGLE =
  '[role="checkbox"], [role="switch"], [role="radio"], input[type="checkbox"], input[type="radio"]';

const SELECTORS = {
  // Menu trái: nhóm "Người dùng" có thể đang gập.
  navUsers: {
    key: 'nav.users',
    css: 'a, button, [role="button"], [role="link"], [role="treeitem"], [role="menuitem"]',
    label: 'nav.users',
    scope: 'document',
  },
  navPartners: {
    key: 'nav.partners',
    css: 'a, [role="link"], [role="tab"], [role="treeitem"], [role="menuitem"]',
    label: 'nav.partners',
    attrs: [{ name: 'href', contains: '/partners' }],
    scope: 'document',
  },
  // BM có thể thiếu role=main và hiện cả nút Thêm ở header lẫn empty-state.
  partnersAdd: {
    key: 'partners.add',
    css: BUTTON,
    label: 'partners.add',
    structure:
      'div:has(input) > span > :is(button, [role="button"])[aria-haspopup="menu"]',
    scope: 'main',
  },
  partnersGive: {
    key: 'partners.give',
    css: CLICKABLE,
    label: 'partners.give',
    match: 'includes',
    scope: 'document',
  },
  bmIdInput: {
    key: 'dialog.bmId',
    css: 'input, textarea',
    label: 'dialog.bmId',
    match: 'includes',
    // Đường lui: ô nhập văn bản duy nhất trong hộp thoại.
    structure: 'input[type="text"], input:not([type]), input[type="search"]',
    scope: 'dialog',
  },
  next: {
    key: 'dialog.next',
    css: BUTTON,
    label: 'dialog.next',
    scope: 'dialog',
  },
  assetTypeAdAccounts: {
    key: 'dialog.assetTypeAdAccounts',
    // Meta cũng render loại tài sản bằng div/span không có role.
    css: `${CLICKABLE}, div, span`,
    label: 'dialog.assetTypeAdAccounts',
    scope: 'dialog',
  },
  assetSearch: {
    key: 'dialog.assetSearch',
    css: 'input',
    label: 'dialog.assetSearch',
    structure: 'input[type="text"], input[type="search"], input:not([type])',
    scope: 'dialog',
  },
  accessPartial: {
    key: 'dialog.accessPartial',
    css: TOGGLE,
    label: 'dialog.accessPartial',
    match: 'includes',
    scope: 'dialog',
  },
  taskCampaigns: {
    key: 'dialog.taskCampaigns',
    css: TOGGLE,
    label: 'dialog.taskCampaigns',
    match: 'includes',
    scope: 'dialog',
  },
  taskPerformance: {
    key: 'dialog.taskPerformance',
    css: TOGGLE,
    label: 'dialog.taskPerformance',
    match: 'includes',
    scope: 'dialog',
  },
  taskCreative: {
    key: 'dialog.taskCreative',
    css: TOGGLE,
    label: 'dialog.taskCreative',
    match: 'includes',
    scope: 'dialog',
  },
  taskManage: {
    key: 'dialog.taskManage',
    css: TOGGLE,
    label: 'dialog.taskManage',
    match: 'includes',
    scope: 'dialog',
  },
  partnerAssignedAssets: {
    key: 'partner.assignedAssets',
    css: '[role="tab"]',
    label: 'partner.assignedAssets',
    match: 'includes',
    scope: 'main',
  },
  assign: {
    key: 'dialog.assign',
    css: BUTTON,
    label: 'dialog.assign',
    scope: 'dialog',
  },
  cancel: {
    key: 'dialog.cancel',
    css: BUTTON,
    label: 'dialog.cancel',
    scope: 'dialog',
  },
  close: {
    key: 'dialog.close',
    css: BUTTON,
    label: 'dialog.close',
    scope: 'dialog',
  },
} satisfies Record<string, LocatorSpec>;

export default SELECTORS;
