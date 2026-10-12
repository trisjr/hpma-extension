import type { PartnerAssignConfig } from '@/shared/partnerAssign';
import type { DiffRow, RunMode, RunState } from '@/shared/run';

// Hợp đồng chung của simulator và engine: SidePanel chọn một trong hai mà
// không phải biết bên nào đang chạy.
export type RunController = {
  run: RunState | undefined;
  start: (params: {
    mode: RunMode;
    config: PartnerAssignConfig;
    diff: DiffRow[];
  }) => void;
  stop: () => void;
  confirmAssist: () => void;
  resync: () => void;
  clear: () => void;
};
