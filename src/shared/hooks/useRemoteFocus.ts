import { useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

// Popup ghi id job được bấm; side panel đọc rồi xoá. Dùng `storage.session` (chỉ extension page đọc được).
export const FOCUS_KEY = 'remote:focusJob';

const asId = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

export async function requestJobFocus(jobId: string): Promise<void> {
  const { session } = browser.storage;
  if (!session) return;
  await session.set({ [FOCUS_KEY]: jobId });
}

// Id job popup yêu cầu mở (nếu có) và hàm xoá yêu cầu sau khi đã xử lý. Đọc cả lúc side panel vừa mở
// lẫn khi đã mở sẵn (onChanged).
export default function useRemoteFocus(): {
  focusId: string | undefined;
  clearFocus: () => void;
} {
  const [focusId, setFocusId] = useState<string>();

  useEffect(() => {
    const { session } = browser.storage;
    if (!session) return undefined;
    session
      .get(FOCUS_KEY)
      .then((stored) => setFocusId(asId(stored[FOCUS_KEY])))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'session' && FOCUS_KEY in changes)
        setFocusId(asId(changes[FOCUS_KEY].newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  const clearFocus = useCallback(() => {
    setFocusId(undefined);
    browser.storage.session?.remove(FOCUS_KEY).catch(() => undefined);
  }, []);

  return { focusId, clearFocus };
}
