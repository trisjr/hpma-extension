/**
 * killSwitch.ts — nút Kill-switch của side panel và popup (FR-06, DES-001).
 * Bật = ghi cờ dừng khẩn cấp `EMERGENCY_KEY` vào `storage.local`: không cần
 * `runId`/`tabId`/quyền mới, mọi tab BM đều nhận qua `storage.onChanged` và dừng run
 * đang chạy; cờ còn lại nên Assist bị `ERR_EMERGENCY` cho tới khi user gỡ ở Options › Devtest.
 */
import browser from 'webextension-polyfill';

import { EMERGENCY_KEY } from '@/shared/budget';

// Trả false khi ghi lỗi để UI báo cho user biết lệnh dừng KHÔNG có hiệu lực.
export default async function engageKillSwitch(
  now: number = Date.now()
): Promise<boolean> {
  try {
    await browser.storage.local.set({ [EMERGENCY_KEY]: now });
    return true;
  } catch {
    return false;
  }
}
