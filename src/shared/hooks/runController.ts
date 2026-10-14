import type { PartnerAssignConfig } from '@/shared/partnerAssign';
import type { DiffRow, RunMode, RunState } from '@/shared/run';
import type { Surface } from '@/shared/surfaces';

// Hợp đồng chung của simulator và engine: SidePanel chọn một trong hai mà
// không phải biết bên nào đang chạy.
export type RunController = {
  run: RunState | undefined;
  start: (params: {
    mode: RunMode;
    config: PartnerAssignConfig;
    diff: DiffRow[];
    // Trang flow cần; engine thật kiểm lại ngay trước khi chạy (user có thể đã rời trang).
    surface?: Surface;
    // BM của danh sách TKQC đã chọn; thiếu thì engine thật không chạy (simulator bỏ qua).
    businessId: string | undefined;
  }) => void;
  stop: () => void;
  confirmAssist: () => void;
  resync: () => void;
  clear: () => void;
};
