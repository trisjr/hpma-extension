/**
 * killSwitch.ts — phía content script của Kill-switch (FR-06): khi cờ dừng khẩn cấp
 * được bật trong `storage.local` (từ side panel/popup, hoặc từ chính engine sau
 * checkpoint), dừng run đang chạy ở tab này. Dừng lặp lại là vô hại (abort idempotent).
 */
import browser from 'webextension-polyfill';

import { EMERGENCY_KEY, isEmergency } from '@/shared/budget';

export default function watchKillSwitch(stop: () => void): void {
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(EMERGENCY_KEY in changes)) return;
    // Chỉ lúc bật; gỡ khoá (newValue rỗng) không dừng gì.
    if (isEmergency(changes[EMERGENCY_KEY].newValue)) stop();
  });
}
