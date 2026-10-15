/**
 * Background (service worker Chrome / background script Firefox).
 * Broker đọc TKQC: chỉ nhận token từ content script BM và chỉ GET hai edge cố định.
 */

import registerRelay from '@relay';
import browser from 'webextension-polyfill';

import { isAccountsGraph } from '@/shared/adAccounts';

import fetchAdAccounts from './adAccounts';

// Kênh điều khiển từ xa (SPEC-AUTO-001): đăng ký đồng bộ ở top-level, trước mọi await.
registerRelay();

browser.runtime.onMessage.addListener(
  (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (
      sender.id !== browser.runtime.id ||
      !sender.tab ||
      !sender.url ||
      !isAccountsGraph(message)
    )
      return undefined;
    const url = new URL(sender.url);
    if (
      url.origin !== 'https://business.facebook.com' ||
      url.searchParams.get('business_id') !== message.page.businessId
    )
      return undefined;
    return fetchAdAccounts(message);
  }
);
