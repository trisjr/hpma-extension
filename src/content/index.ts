/**
 * Content script headless (docs/050-Research/21 §3.7, §5.1): không render UI,
 * không mutate DOM trang BM ngoài các step của engine. Chỉ lắng nghe message từ
 * chính extension (side panel/popup) và giao lệnh cho engine (SPEC-ENG-001).
 */
import type { PongMessage } from '@/shared/messaging';
import browser from 'webextension-polyfill';

import { isPingMessage, isRunCommand } from '@/shared/messaging';

import handleRunCommand from './engine/controller';

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (sender.id !== browser.runtime.id) return undefined;
    if (isPingMessage(message)) {
      const pong: PongMessage = { kind: 'pong' };
      return Promise.resolve(pong);
    }
    // Lệnh chỉ đến từ extension page (URL của người gửi thuộc extension), không từ
    // content script (URL là trang BM). Không dựa vào `sender.tab`: Options mở trong tab cũng có.
    const fromExtensionPage =
      sender.url?.startsWith(browser.runtime.getURL('')) === true;
    if (fromExtensionPage && isRunCommand(message)) {
      return handleRunCommand(message);
    }
    return undefined;
  }
);
