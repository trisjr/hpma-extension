import { useCallback, useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';

import { isPongMessage } from '@/shared/messaging';

export type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected' }
  | { status: 'unreachable' };

type Probe = { state: ConnectionState; tabId?: number };

const PING_RETRY_DELAYS_MS = [0, 300, 900];

// Tab không có content script (ngoài BM, hoặc BM mở trước khi cài/reload ext)
// làm sendMessage reject → coi là chưa kết nối, không phải lỗi chương trình.
async function pingTab(tabId: number): Promise<boolean> {
  const reply: unknown = await browser.tabs
    .sendMessage(tabId, { kind: 'ping' })
    .catch(() => undefined);
  return isPongMessage(reply);
}

// Ưu tiên tab BM đã ghim: đổi sang tab khác thì vẫn connected. Tab ghim mất
// (đóng, điều hướng khỏi BM) thì rơi về tab đang active và ghim lại nếu ping được.
async function probeOnce(pinnedId: number | undefined): Promise<Probe> {
  if (pinnedId !== undefined && (await pingTab(pinnedId))) {
    return { state: { status: 'connected' }, tabId: pinnedId };
  }
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id !== undefined && (await pingTab(tab.id))) {
    return { state: { status: 'connected' }, tabId: tab.id };
  }
  return { state: { status: 'unreachable' } };
}

// `tabs.onUpdated` complete có thể tới trước khi content script (nạp qua
// dynamic import ở document_idle) kịp đăng ký listener → retry ngắn.
async function probe(
  pinnedId: number | undefined,
  attempt = 0
): Promise<Probe> {
  const delay = PING_RETRY_DELAYS_MS[attempt];
  if (delay > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  const result = await probeOnce(pinnedId);
  if (
    result.state.status === 'connected' ||
    attempt + 1 >= PING_RETRY_DELAYS_MS.length
  ) {
    return result;
  }
  return probe(pinnedId, attempt + 1);
}

export default function useConnection(): {
  connection: ConnectionState;
  // Tab BM đang ghim: engine gửi lệnh và nhận sự kiện theo id này.
  tabId: number | undefined;
  refresh: () => Promise<void>;
} {
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'checking',
  });
  const [tabId, setTabId] = useState<number | undefined>(undefined);
  const pinnedRef = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    seqRef.current += 1;
    const seq = seqRef.current;
    const result = await probe(pinnedRef.current);
    // Bỏ kết quả cũ nếu đã có lần kiểm tra mới hơn.
    if (seq !== seqRef.current) return;
    pinnedRef.current = result.tabId;
    setConnection(result.state);
    setTabId(result.tabId);
  }, []);

  useEffect(() => {
    refresh();
    const onUpdated = (
      _tabId: number,
      changeInfo: browser.Tabs.OnUpdatedChangeInfoType
    ): void => {
      if (changeInfo.status === 'complete') refresh();
    };
    browser.tabs.onActivated.addListener(refresh);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(refresh);
    return () => {
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(refresh);
    };
  }, [refresh]);

  return { connection, tabId, refresh };
}
