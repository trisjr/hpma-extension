/**
 * Mock gọn của `webextension-polyfill` (bản thật ném lỗi khi chạy ngoài extension).
 * Chỉ có các API mà code thật đang gọi: storage.local, runtime, permissions.
 * Được nối vào qua `vi.mock` ở tests/helpers/setup.ts và reset trước mỗi test.
 * Là singleton trên `globalThis` để `vi.resetModules()` không tách thành hai bản.
 */
import { vi } from 'vitest';

export type MessageListener = (message: unknown, sender: unknown) => unknown;
type StorageKeys = string | string[] | Record<string, unknown> | null;

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
    Object.entries(items).forEach(([key, value]) => {
      storageState.data[key] = structuredClone(value);
    });
  });

  const remove = vi.fn(async (keys: string | string[]): Promise<void> => {
    if (storageState.failSet) throw new Error('storage remove failed');
    [keys].flat().forEach((key) => {
      delete storageState.data[key];
    });
  });

  const sendMessage = vi.fn<(message: unknown) => Promise<unknown>>(
    async () => undefined
  );
  const addListener = vi.fn((listener: MessageListener): void => {
    messageListeners.push(listener);
  });
  const contains = vi.fn(async (): Promise<boolean> => true);

  const browserMock = {
    storage: { local: { get, set, remove } },
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
    [get, set, remove, sendMessage, addListener, contains].forEach((fn) =>
      fn.mockClear()
    );
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
