/**
 * watchers.ts — theo dõi tín hiệu nguy hiểm suốt run (file 19 §6.2): đường dẫn
 * (checkpoint/đăng nhập) kiểm mỗi 500 ms, dialog/alert mới mount quét từ khoá.
 * Tín hiệu đầu tiên thắng; runner dừng run và không tự chạy lại.
 */
import type { DangerCode, DangerEvidence } from './signals';

import { isBusinessId } from '@/shared/surfaces';

import { isVisible } from './locator';
import { businessChanged, classifyPath, matchText } from './signals';

const PATH_POLL_MS = 500;
// URL tạm thiếu `business_id` khi SPA chuyển trang là bình thường; thiếu liên tục từng này lần
// poll (~3 giây) thì coi là đã rời BM.
export const BM_MISSING_POLLS = 6;
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
  // BM panel đã chọn: đổi BM giữa run (điều hướng SPA) thì dừng, không chạy tiếp trên BM sai.
  baseline: string,
  onSignal: (code: DangerCode, evidence?: DangerEvidence) => void
): () => void {
  let missingPolls = 0;
  let fired = false;
  const fire = (
    code: DangerCode | undefined,
    evidence?: DangerEvidence
  ): void => {
    if (code === undefined || fired) return;
    fired = true;
    if (evidence) onSignal(code, evidence);
    else onSignal(code);
  };

  const check = (): void => {
    const pathSignal = classifyPath(window.location.pathname);
    fire(pathSignal, pathSignal ? { keyword: 'path' } : undefined);
    const current = currentBusinessId();
    if (isBusinessId(current)) {
      missingPolls = 0;
      if (businessChanged(baseline, current)) fire('ERR_BM_CHANGED');
    } else {
      missingPolls += 1;
      if (missingPolls >= BM_MISSING_POLLS) fire('ERR_BM_CHANGED');
    }
    if (hasLoginForm()) fire('ERR_LOGGED_OUT', { keyword: 'login-form' });
  };
  const timer = window.setInterval(check, PATH_POLL_MS);
  check();

  const observer = new MutationObserver((records) => {
    records.forEach((record) =>
      record.addedNodes.forEach((node) =>
        popupsIn(node).forEach((popup) => {
          const match = matchText(popup.textContent ?? '');
          fire(match?.code, match?.evidence);
        })
      )
    );
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => {
    window.clearInterval(timer);
    observer.disconnect();
  };
}
