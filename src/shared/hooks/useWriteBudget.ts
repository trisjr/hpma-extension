import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

import { budgetUsed, WRITE_BUDGET_KEY } from '@/shared/budget';
import { usePacingConfig } from '@/shared/hooks/useSettings';

export type WriteBudget = { used: number; limit: number };

// `used` là bộ đếm ghi/ngày thật (FR-06) do engine ghi vào storage.local dạng
// `{ day, used }`; panel chỉ đọc, ngày khác hôm nay thì tính 0.
// `limit` lấy từ Options (SPEC-UI-004 §3.2). Chưa nhận diện được loại BM nên dùng
// hàng "BM thường" (Q9); Options không bao giờ ghi `writeBudget`.
export default function useWriteBudget(): WriteBudget {
  const [used, setUsed] = useState(0);
  const { value: pacing } = usePacingConfig();

  useEffect(() => {
    browser.storage.local.get(WRITE_BUDGET_KEY).then((stored) => {
      setUsed(budgetUsed(stored[WRITE_BUDGET_KEY], Date.now()));
    });
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area !== 'local' || !(WRITE_BUDGET_KEY in changes)) return;
      setUsed(budgetUsed(changes[WRITE_BUDGET_KEY].newValue, Date.now()));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return { used, limit: pacing.limits.standard.writesPerDay };
}
