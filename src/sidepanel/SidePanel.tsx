import { JSX, useCallback, useEffect, useState } from 'react';
import browser from 'webextension-polyfill';

import { isPongMessage } from '@/shared/messaging';

type ConnectionState =
  | { status: 'checking' }
  | { status: 'connected' }
  | { status: 'unreachable' };

const PING_RETRY_DELAYS_MS = [0, 300, 900];

async function pingActiveTabOnce(): Promise<ConnectionState> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id === undefined) {
    return { status: 'unreachable' };
  }
  // Tab không có content script (ngoài BM, hoặc BM mở trước khi cài/reload ext)
  // làm sendMessage reject → coi là chưa kết nối, không phải lỗi chương trình.
  const reply: unknown = await browser.tabs
    .sendMessage(tab.id, { kind: 'ping' })
    .catch(() => undefined);
  return isPongMessage(reply)
    ? { status: 'connected' }
    : { status: 'unreachable' };
}

// `tabs.onUpdated` complete có thể tới trước khi content script (nạp qua
// dynamic import ở document_idle) kịp đăng ký listener → retry ngắn.
async function pingActiveTab(attempt = 0): Promise<ConnectionState> {
  const delay = PING_RETRY_DELAYS_MS[attempt];
  if (delay > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, delay);
    });
  }
  const result = await pingActiveTabOnce();
  if (
    result.status === 'connected' ||
    attempt + 1 >= PING_RETRY_DELAYS_MS.length
  ) {
    return result;
  }
  return pingActiveTab(attempt + 1);
}

export default function SidePanel(): JSX.Element {
  const [connection, setConnection] = useState<ConnectionState>({
    status: 'checking',
  });

  const refresh = useCallback(async () => {
    setConnection(await pingActiveTab());
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
    return () => {
      browser.tabs.onActivated.removeListener(refresh);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [refresh]);

  return (
    <div id='my-ext' className='container p-4' data-theme='light'>
      <h1 className='text-lg font-bold'>HPMA Copilot</h1>
      {connection.status === 'checking' && (
        <p className='mt-2 text-sm'>Đang kiểm tra tab hiện tại…</p>
      )}
      {connection.status === 'connected' && (
        <div role='status' className='alert alert-success mt-2 text-sm'>
          Đã kết nối với tab Business Manager.
        </div>
      )}
      {connection.status === 'unreachable' && (
        <div role='status' className='alert alert-warning mt-2 text-sm'>
          Chưa kết nối. Mở tab business.facebook.com rồi tải lại tab đó (tab mở
          trước khi cài hoặc reload extension chưa có content script).
        </div>
      )}
      <button
        type='button'
        className='btn btn-outline btn-sm mt-3'
        onClick={refresh}
      >
        Kiểm tra lại
      </button>
    </div>
  );
}
