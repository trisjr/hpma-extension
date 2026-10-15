import { useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

// Khoá do service worker ghi (src/background/firebaseRelay.ts): trạng thái máy của dispatcher.
const MACHINE_KEY = 'remote:machine';

export type MachineBlock = { reason: string; until: number | null };

const parseBlock = (value: unknown): MachineBlock | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { status, blockedReason, blockedUntil } = value as Record<
    string,
    unknown
  >;
  if (status !== 'blocked' || typeof blockedReason !== 'string')
    return undefined;
  return {
    reason: blockedReason,
    until: typeof blockedUntil === 'number' ? blockedUntil : null,
  };
};

// Lý do dispatcher đang khoá máy (budget/rate-limited/checkpoint/emergency/logged-out…), để popup giải thích
// vì sao job chưa chạy. Chỉ đọc; thiếu `storage.session` hoặc lỗi đọc thì coi như không bị khoá.
export default function useMachineBlock(): MachineBlock | undefined {
  const [block, setBlock] = useState<MachineBlock>();

  useEffect(() => {
    const { session } = browser.storage;
    if (!session) return undefined;
    session
      .get(MACHINE_KEY)
      .then((stored) => setBlock(parseBlock(stored[MACHINE_KEY])))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'session' && MACHINE_KEY in changes)
        setBlock(parseBlock(changes[MACHINE_KEY].newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return block;
}
