import { useCallback, useEffect, useState } from 'react';
import type { DevtestSettings, PacingConfig } from '@/shared/settings';
import browser from 'webextension-polyfill';

import {
  DEVTEST_KEY,
  PACING_KEY,
  parseDevtest,
  parsePacing,
} from '@/shared/settings';

export type StoredSetting<T> = {
  // false tới khi đọc xong storage: UI dựng khung xương thay vì nháy giá trị mặc định.
  ready: boolean;
  value: T;
  // Ném lỗi khi storage từ chối ghi (vd. hết dung lượng) để UI báo người dùng.
  save: (next: T) => Promise<void>;
};

// `parse` phải ổn định (khai báo ở module) và luôn trả giá trị đã kẹp biên.
function useStoredSetting<T>(
  key: string,
  parse: (raw: unknown) => T
): StoredSetting<T> {
  const [value, setValue] = useState<T>(() => parse(undefined));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    browser.storage.local
      .get(key)
      .then((stored) => setValue(parse(stored[key])))
      .catch(() => undefined)
      .finally(() => setReady(true));
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && key in changes) {
        setValue(parse(changes[key].newValue));
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, [key, parse]);

  const save = useCallback(
    async (next: T) => {
      const clean = parse(next);
      await browser.storage.local.set({ [key]: clean });
      setValue(clean);
    },
    [key, parse]
  );

  return { ready, value, save };
}

export function usePacingConfig(): StoredSetting<PacingConfig> {
  return useStoredSetting(PACING_KEY, parsePacing);
}

function parseStoredDevtest(raw: unknown): DevtestSettings {
  return parseDevtest(raw, Date.now(), import.meta.env.DEV);
}

export function useDevtestSettings(): StoredSetting<DevtestSettings> {
  return useStoredSetting(DEVTEST_KEY, parseStoredDevtest);
}
