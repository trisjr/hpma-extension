/**
 * partnerTasks.ts — ánh xạ task → nhãn quyền trên UI BM (file 18 §3 bước 4; file 14 §2.1).
 * Nhãn UI cấp theo gói: "Manage campaigns" = ADVERTISE+ANALYZE, "View performance" =
 * ANALYZE (kèm Creative Hub), "Manage ad account" = MANAGE (bao mọi công tắc).
 * Gói không biểu diễn chính xác được thì từ chối thay vì cấp dư quyền.
 */
import type { PartnerTask } from '@/shared/partnerAssign';

export type TaskUiKey = 'taskManage' | 'taskCampaigns' | 'taskPerformance';

export function uiTaskKeys(tasks: PartnerTask[]): TaskUiKey[] | undefined {
  const has = (task: PartnerTask): boolean => tasks.includes(task);
  if (has('MANAGE')) {
    // Manage ad account đã bao trọn mọi quyền thấp hơn.
    return ['taskManage'];
  }
  if (has('ADVERTISE')) {
    // "Manage campaigns" luôn kèm ANALYZE: ADVERTISE riêng lẻ sẽ cấp dư quyền.
    return has('ANALYZE') ? ['taskCampaigns'] : undefined;
  }
  return has('ANALYZE') ? ['taskPerformance'] : undefined;
}
