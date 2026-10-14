import { useCallback, useEffect, useState } from 'react';
import type { ApproveAction } from '@/shared/approve';
import browser from 'webextension-polyfill';

import { MAX_PARTNER_NAME_LENGTH } from '@/shared/approve';

// Bản nháp của flow duyệt chỉ có tên BM đối tác user đã nhập (không có token hay ID nhạy cảm);
// danh sách request không lưu vì phải quét lại mỗi lần.
const STORAGE_KEY = 'flowDraft:partner-approve';
const SAVE_DELAY_MS = 300;

export type ApproveDraftApi = {
  ready: boolean;
  partnerName: string;
  setPartnerName: (name: string) => void;
  // Quyết định Approve/Decline chỉ giữ trong bộ nhớ panel, không lưu storage: Decline không đảo
  // ngược được nên mỗi lần mở panel mới phải chọn lại (mặc định Approve).
  action: ApproveAction;
  setAction: (action: ApproveAction) => void;
  clearDraft: () => void;
};

function parseStored(value: unknown): string {
  return typeof value === 'string' && value.length <= MAX_PARTNER_NAME_LENGTH
    ? value
    : '';
}

export default function useApproveDraft(): ApproveDraftApi {
  const [ready, setReady] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [action, setAction] = useState<ApproveAction>('approve');

  useEffect(() => {
    browser.storage.local
      .get(STORAGE_KEY)
      .then((stored) => setPartnerName(parseStored(stored[STORAGE_KEY])))
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => {
      browser.storage.local
        .set({ [STORAGE_KEY]: partnerName })
        .catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, partnerName]);

  const clearDraft = useCallback(() => {
    setPartnerName('');
    setAction('approve');
    browser.storage.local.remove(STORAGE_KEY).catch(() => undefined);
  }, []);

  return { ready, partnerName, setPartnerName, action, setAction, clearDraft };
}
