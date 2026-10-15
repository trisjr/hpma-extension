/**
 * Mock gọn của `webextension-polyfill` (bản thật ném lỗi khi chạy ngoài extension).
 * Chỉ có các API mà code thật đang gọi: storage.local, runtime, permissions.
 * Được nối vào qua `vi.mock` ở tests/helpers/setup.ts và reset trước mỗi test.
 * Là singleton trên `globalThis` để `vi.resetModules()` không tách thành hai bản.
 */
import { vi } from 'vitest';

export type MessageListener = (message: unknown, sender: unknown) => unknown;
type StorageKeys = string | string[] | Record<string, unknown> | null;
type StorageChanges = Record<
  string,
  { oldValue?: unknown; newValue?: unknown }
>;
type StorageListener = (changes: StorageChanges, area: string) => void;

export const EXTENSION_ID = 'hpma-test';
export const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}/`;

function createMock() {
  // Dữ liệu và công tắc lỗi dùng chung giữa các test (đọc/ghi trực tiếp được).
  const storageState: {
    data: Record<string, unknown>;
    failGet: boolean;
    failSet: boolean;
  } = { data: {}, failGet: false, failSet: false };
  const messageListeners: MessageListener[] = [];
  // `storage.onChanged`: `set`/`remove` gọi listener như trình duyệt thật (đồng bộ, area 'local').
  const storageListeners: StorageListener[] = [];
  const emitChanges = (changes: StorageChanges): void => {
    if (Object.keys(changes).length === 0) return;
    [...storageListeners].forEach((listener) => listener(changes, 'local'));
  };

  const pickKeys = (keys: StorageKeys | undefined): string[] => {
    if (keys === null || keys === undefined) {
      return Object.keys(storageState.data);
    }
    if (typeof keys === 'string') return [keys];
    return Array.isArray(keys) ? keys : Object.keys(keys);
  };

  const get = vi.fn(
    async (keys?: StorageKeys): Promise<Record<string, unknown>> => {
      if (storageState.failGet) throw new Error('storage get failed');
      const defaults =
        typeof keys === 'object' && keys !== null && !Array.isArray(keys)
          ? keys
          : {};
      const result: Record<string, unknown> = {};
      pickKeys(keys).forEach((key) => {
        if (key in storageState.data) {
          result[key] = structuredClone(storageState.data[key]);
        } else if (key in defaults) {
          result[key] = defaults[key];
        }
      });
      return result;
    }
  );

  const set = vi.fn(async (items: Record<string, unknown>): Promise<void> => {
    if (storageState.failSet) throw new Error('storage set failed');
    const changes: StorageChanges = {};
    Object.entries(items).forEach(([key, value]) => {
      changes[key] = {
        oldValue: storageState.data[key],
        newValue: structuredClone(value),
      };
      storageState.data[key] = structuredClone(value);
    });
    emitChanges(changes);
  });

  const remove = vi.fn(async (keys: string | string[]): Promise<void> => {
    if (storageState.failSet) throw new Error('storage remove failed');
    const changes: StorageChanges = {};
    [keys].flat().forEach((key) => {
      if (key in storageState.data) {
        changes[key] = { oldValue: storageState.data[key] };
      }
      delete storageState.data[key];
    });
    emitChanges(changes);
  });
  const addStorageListener = vi.fn((listener: StorageListener): void => {
    storageListeners.push(listener);
  });
  const removeStorageListener = vi.fn((listener: StorageListener): void => {
    const index = storageListeners.indexOf(listener);
    if (index >= 0) storageListeners.splice(index, 1);
  });

  const sendMessage = vi.fn<(message: unknown) => Promise<unknown>>(
    async () => undefined
  );
  const addListener = vi.fn((listener: MessageListener): void => {
    messageListeners.push(listener);
  });
  const contains = vi.fn(async (): Promise<boolean> => true);
  // `tabs`: mặc định như tab không có content script (sendMessage trả undefined).
  const tabsSendMessage = vi.fn<
    (tabId: number, message: unknown) => Promise<unknown>
  >(async () => undefined);
  const tabsUpdate = vi.fn(async (): Promise<unknown> => undefined);
  const tabsQuery = vi.fn(async (): Promise<unknown[]> => []);
  const tabsCreate = vi.fn(async (): Promise<unknown> => ({ id: 1 }));

  const browserMock = {
    tabs: {
      sendMessage: tabsSendMessage,
      update: tabsUpdate,
      query: tabsQuery,
      create: tabsCreate,
    },
    storage: {
      local: { get, set, remove },
      onChanged: {
        addListener: addStorageListener,
        removeListener: removeStorageListener,
      },
    },
    runtime: {
      id: EXTENSION_ID,
      getURL: (path: string): string => `${EXTENSION_ORIGIN}${path}`,
      sendMessage,
      onMessage: { addListener },
    },
    permissions: { contains },
  };

  const reset = (): void => {
    storageState.data = {};
    storageState.failGet = false;
    storageState.failSet = false;
    messageListeners.length = 0;
    storageListeners.length = 0;
    [
      get,
      set,
      remove,
      sendMessage,
      addListener,
      contains,
      addStorageListener,
      removeStorageListener,
      tabsSendMessage,
      tabsUpdate,
      tabsQuery,
      tabsCreate,
    ].forEach((fn) => fn.mockClear());
    tabsSendMessage.mockImplementation(async () => undefined);
    tabsUpdate.mockImplementation(async () => undefined);
    tabsQuery.mockImplementation(async () => []);
    tabsCreate.mockImplementation(async () => ({ id: 1 }));
    sendMessage.mockImplementation(async () => undefined);
    contains.mockImplementation(async () => true);
  };

  return { storageState, messageListeners, browserMock, reset };
}

const holder = globalThis as typeof globalThis & {
  hpmaBrowserMock?: ReturnType<typeof createMock>;
};
holder.hpmaBrowserMock ??= createMock();
const mock = holder.hpmaBrowserMock;

export const { storageState, messageListeners, browserMock } = mock;
export const resetBrowserMock = mock.reset;
