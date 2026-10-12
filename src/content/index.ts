/**
 * Content script headless (docs/050-Research/21 §3.7, §5.1): không render UI,
 * không mutate DOM trang BM. Chỉ lắng nghe message từ chính extension (side
 * panel/popup); engine + flows sẽ gắn vào đây ở M1.
 */
import type { PongMessage } from '@/shared/messaging';
import browser from 'webextension-polyfill';

import { isPingMessage } from '@/shared/messaging';

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (sender.id !== browser.runtime.id || !isPingMessage(message)) {
      return undefined;
    }
    const pong: PongMessage = { kind: 'pong' };
    return Promise.resolve(pong);
  }
);
