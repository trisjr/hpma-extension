import { describe, expect, it, vi } from 'vitest';

import watchKillSwitch from '@/content/engine/killSwitch';
import { EMERGENCY_KEY, RATE_LIMIT_KEY } from '@/shared/budget';
import engageKillSwitch from '@/shared/killSwitch';

import { browserMock, storageState } from '../helpers/browserMock';

describe('engageKillSwitch (panel/popup)', () => {
  it('ghi cờ dừng khẩn cấp vào storage.local', async () => {
    expect(await engageKillSwitch(1234)).toBe(true);
    expect(storageState.data[EMERGENCY_KEY]).toBe(1234);
  });

  it('trả false khi ghi lỗi để UI báo lệnh dừng chưa có hiệu lực', async () => {
    storageState.failSet = true;
    expect(await engageKillSwitch()).toBe(false);
    expect(storageState.data[EMERGENCY_KEY]).toBeUndefined();
  });
});

describe('watchKillSwitch (content script)', () => {
  it('dừng run khi cờ khẩn cấp được bật', async () => {
    const stop = vi.fn();
    watchKillSwitch(stop);
    await browserMock.storage.local.set({ [EMERGENCY_KEY]: Date.now() });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('bật lại khi cờ đã có (giá trị mới) vẫn dừng', async () => {
    storageState.data[EMERGENCY_KEY] = 1;
    const stop = vi.fn();
    watchKillSwitch(stop);
    await browserMock.storage.local.set({ [EMERGENCY_KEY]: 2 });
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('gỡ khoá không dừng gì', async () => {
    storageState.data[EMERGENCY_KEY] = 1;
    const stop = vi.fn();
    watchKillSwitch(stop);
    await browserMock.storage.local.remove(EMERGENCY_KEY);
    expect(stop).not.toHaveBeenCalled();
  });

  it('bỏ qua khoá khác và các thay đổi không liên quan', async () => {
    const stop = vi.fn();
    watchKillSwitch(stop);
    await browserMock.storage.local.set({
      [RATE_LIMIT_KEY]: Date.now() + 1000,
      lastRun: {},
    });
    expect(stop).not.toHaveBeenCalled();
  });
});
