import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

import { EMERGENCY_KEY, isEmergency } from '@/shared/budget';
import engageKillSwitch from '@/shared/killSwitch';

export type KillSwitch = {
  // Cờ dừng khẩn cấp đang bật (do nút này hoặc do engine gặp checkpoint).
  engaged: boolean;
  // Ghi cờ không thành công: lệnh dừng chưa có hiệu lực.
  failed: boolean;
  engage: () => void;
};

export default function useKillSwitch(): KillSwitch {
  const [engaged, setEngaged] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    browser.storage.local
      .get(EMERGENCY_KEY)
      .then((stored) => setEngaged(isEmergency(stored[EMERGENCY_KEY])))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area !== 'local' || !(EMERGENCY_KEY in changes)) return;
      setEngaged(isEmergency(changes[EMERGENCY_KEY].newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const engage = useCallback((): void => {
    engageKillSwitch().then((ok) => setFailed(!ok));
  }, []);

  return { engaged, failed, engage };
}
