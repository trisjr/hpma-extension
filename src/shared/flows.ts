/**
 * flows.ts — danh mục flow hiển thị ở màn Flows (PRD-001 §4.1b).
 * Tạm thời là metadata tĩnh; khi engine có `FlowDef` thật (NFR-06) thì danh
 * mục này được sinh từ đó, component không đổi.
 */

import type { Localized } from './i18n';

export type RiskTier = 'read' | 'write' | 'sensitive';

export type FlowDef = {
  id: string;
  risk: RiskTier;
  name: Localized;
  desc: Localized;
  /** Chưa qua cổng mở write (probe ≥ 95% + dry-run pass). */
  locked: boolean;
  /** Đã có màn cấu hình để điều hướng tới. */
  hasConfig: boolean;
};

/** Thứ tự nhóm cố định: rủi ro tăng dần. */
export const RISK_ORDER: readonly RiskTier[] = ['read', 'write', 'sensitive'];

export const FLOWS: readonly FlowDef[] = [
  {
    id: 'inventory',
    risk: 'read',
    name: { vi: 'Kiểm kê tài sản', en: 'Asset inventory' },
    desc: {
      vi: 'Liệt kê TKQC, pixel, người dùng trong BM',
      en: 'List ad accounts, pixels and users in the BM',
    },
    locked: false,
    hasConfig: false,
  },
  {
    id: 'account-quality',
    risk: 'read',
    name: { vi: 'Chất lượng TKQC', en: 'Ad account quality' },
    desc: {
      vi: 'Trạng thái, giới hạn chi tiêu, lý do bị hạn chế',
      en: 'Status, spend limit, restriction reasons',
    },
    locked: false,
    hasConfig: false,
  },
  {
    id: 'two-factor-report',
    risk: 'read',
    name: { vi: 'Báo cáo 2FA', en: '2FA report' },
    desc: {
      vi: 'Ai trong BM chưa bật xác thực 2 lớp',
      en: 'Who in the BM has not enabled two-factor authentication',
    },
    locked: false,
    hasConfig: false,
  },
  {
    id: 'account-rename',
    risk: 'write',
    name: { vi: 'Đổi tên TKQC', en: 'Rename ad accounts' },
    desc: {
      vi: 'Đổi tên hàng loạt theo mẫu đặt tên',
      en: 'Bulk rename by naming pattern',
    },
    locked: false,
    hasConfig: false,
  },
  {
    id: 'partner-assign',
    risk: 'sensitive',
    name: { vi: 'Gán partner vào TKQC', en: 'Assign partner to ad accounts' },
    desc: {
      vi: 'Cấp quyền TKQC cho BM đối tác',
      en: 'Grant ad account access to a partner BM',
    },
    locked: false,
    hasConfig: true,
  },
  {
    id: 'partner-remove',
    risk: 'sensitive',
    name: { vi: 'Gỡ partner', en: 'Remove partner' },
    desc: {
      vi: 'Thu hồi quyền của BM đối tác trên TKQC',
      en: 'Revoke a partner BM’s access to ad accounts',
    },
    locked: true,
    hasConfig: false,
  },
  {
    id: 'pixel-share',
    risk: 'sensitive',
    name: { vi: 'Share pixel / dataset', en: 'Share pixel / dataset' },
    desc: {
      vi: 'Chia sẻ pixel cho BM đối tác',
      en: 'Share a pixel with a partner BM',
    },
    locked: true,
    hasConfig: false,
  },
  {
    id: 'bm-users',
    risk: 'sensitive',
    name: { vi: 'Quản lý người dùng BM', en: 'Manage BM users' },
    desc: {
      vi: 'Mời, đổi vai trò, xoá người dùng',
      en: 'Invite, change roles, remove users',
    },
    locked: true,
    hasConfig: false,
  },
];

export function groupFlowsByRisk(
  flows: readonly FlowDef[]
): { risk: RiskTier; flows: FlowDef[] }[] {
  return RISK_ORDER.map((risk) => ({
    risk,
    flows: flows.filter((flow) => flow.risk === risk),
  })).filter((group) => group.flows.length > 0);
}
