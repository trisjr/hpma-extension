import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

import {
  EMERGENCY_KEY,
  isEmergency,
  isRateLimited,
  RATE_LIMIT_KEY,
} from '@/shared/budget';

export type EmergencyLock = {
  // Có cờ dừng khẩn cấp hoặc khoá chặn tần suất còn hiệu lực (chặn Assist).
  locked: boolean;
  // Chỉ user mới được gỡ (Options › Devtest); engine không bao giờ tự xoá.
  unlock: () => Promise<void>;
};

function isLocked(stored: Record<string, unknown>): boolean {
  return (
    isEmergency(stored[EMERGENCY_KEY]) ||
    isRateLimited(stored[RATE_LIMIT_KEY], Date.now())
  );
}

export default function useEmergencyLock(): EmergencyLock {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    browser.storage.local
      .get([EMERGENCY_KEY, RATE_LIMIT_KEY])
      .then((stored) => setLocked(isLocked(stored)))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area !== 'local') return;
      if (!(EMERGENCY_KEY in changes) && !(RATE_LIMIT_KEY in changes)) return;
      // Đọc lại cả hai khoá: một khoá đổi không cho biết khoá kia còn hiệu lực không.
      browser.storage.local
        .get([EMERGENCY_KEY, RATE_LIMIT_KEY])
        .then((stored) => setLocked(isLocked(stored)))
        .catch(() => undefined);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const unlock = useCallback(async () => {
    await browser.storage.local.remove([EMERGENCY_KEY, RATE_LIMIT_KEY]);
    setLocked(false);
  }, []);

  return { locked, unlock };
}
