import type { RunConfig } from '@/shared/runConfig';
import type { PacingConfig } from '@/shared/settings';

import { defaultPacing } from '@/shared/settings';

export const BM_ID = '1451597353550362';

// Pacing với curfew cố định theo múi giờ VN (không phụ thuộc múi giờ máy chạy test).
export function pacingOf(overrides: Partial<PacingConfig> = {}): PacingConfig {
  const base = defaultPacing();
  return {
    ...base,
    curfew: { on: true, from: '00:00', to: '06:00', tz: 'Asia/Ho_Chi_Minh' },
    ...overrides,
  };
}

export function configOf(overrides: Partial<RunConfig> = {}): RunConfig {
  return {
    partnerBmId: BM_ID,
    queries: ['Spa Hoa'],
    tasks: ['ANALYZE'],
    ...overrides,
  };
}
