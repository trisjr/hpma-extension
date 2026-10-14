/**
 * watchers.ts — theo dõi tín hiệu nguy hiểm suốt run (file 19 §6.2): đường dẫn
 * (checkpoint/đăng nhập) kiểm mỗi 500 ms, dialog/alert mới mount quét từ khoá.
 * Tín hiệu đầu tiên thắng; runner dừng run và không tự chạy lại.
 */
import type { DangerCode } from './signals';

import { isVisible } from './locator';
import { businessChanged, classifyPath, classifyText } from './signals';

const PATH_POLL_MS = 500;
const POPUP_CSS = '[role="dialog"],[role="alert"],[role="alertdialog"]';

function currentBusinessId(): string | undefined {
  return (
    new URL(window.location.href).searchParams.get('business_id') ?? undefined
  );
}

function hasLoginForm(): boolean {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="password"]')
  ).some(isVisible);
}

function popupsIn(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const own = node.matches(POPUP_CSS) ? [node] : [];
  return [...own, ...Array.from(node.querySelectorAll<HTMLElement>(POPUP_CSS))];
}

export default function startWatchers(
  onSignal: (code: DangerCode) => void
): () => void {
  // BM lúc run bắt đầu: đổi BM giữa run (điều hướng SPA) thì dừng, không chạy tiếp trên BM sai.
  const baseline = currentBusinessId();
  let fired = false;
  const fire = (code: DangerCode | undefined): void => {
    if (code === undefined || fired) return;
    fired = true;
    onSignal(code);
  };

  const check = (): void => {
    fire(classifyPath(window.location.pathname));
    if (businessChanged(baseline, currentBusinessId())) fire('ERR_BM_CHANGED');
    if (hasLoginForm()) fire('ERR_LOGGED_OUT');
  };
  const timer = window.setInterval(check, PATH_POLL_MS);
  check();

  const observer = new MutationObserver((records) => {
    records.forEach((record) =>
      record.addedNodes.forEach((node) =>
        popupsIn(node).forEach((popup) =>
          fire(classifyText(popup.textContent ?? ''))
        )
      )
    );
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.clearInterval(timer);
    observer.disconnect();
  };
}
