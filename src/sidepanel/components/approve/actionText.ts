import type { ApproveAction } from '@/shared/approve';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

// Tham số `{action}` / `{other}` của các câu chữ flow Confirm: tên nút Meta, giữ nguyên tiếng Anh.
export default function actionParams(
  lang: Lang,
  action: ApproveAction = 'approve'
): { action: string; other: string } {
  const other: ApproveAction = action === 'approve' ? 'decline' : 'approve';
  return {
    action: translate(lang, `approve.action.${action}`),
    other: translate(lang, `approve.action.${other}`),
  };
}
