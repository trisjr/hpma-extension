import browser from 'webextension-polyfill';

/**
 * Mở side panel (Chrome) / sidebar (Firefox). Cả hai API đòi user gesture nên
 * hàm này đồng bộ tới lúc gọi `open` — không `await` trước đó; caller phải
 * resolve `windowId` từ trước (xem Popup).
 *
 * Chrome không có tương đương trong `webextension-polyfill` nên dùng
 * `chrome.sidePanel` có feature-detect; Firefox dùng `browser.sidebarAction`.
 */
export default function openSidePanel(windowId: number): Promise<void> {
  if (typeof chrome !== 'undefined' && chrome.sidePanel?.open) {
    return chrome.sidePanel.open({ windowId });
  }
  return browser.sidebarAction.open();
}
