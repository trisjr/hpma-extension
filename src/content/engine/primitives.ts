/**
 * primitives.ts — thao tác DOM của engine (file 21 §5.3, file 17 §5). Mọi hàm
 * nhận `ActionContext` để huỷ được bằng AbortSignal (kill-switch) và để cổng
 * visibility/curfew chạy trước mỗi hành động.
 */
import { clickGapMs, keyGapMs, randomUnit } from './delay';
import EngineError from './errors';
import RunStopped, { throwIfAborted } from './stop';

export type ActionContext = {
  signal: AbortSignal;
  // `document.documentElement.lang` (chỉ dùng để sắp thứ tự thử nhãn).
  lang: string;
  // Chặn tới khi tab hiển thị; ném lỗi nếu bị curfew. Chạy trước mỗi hành động.
  gate: () => Promise<void>;
  // Gọi sau mỗi lần định vị thành công, kèm tầng thắng (tab Log cảnh báo khi tầng > 1).
  onTier?: (key: string, tier: number) => void;
};

export const STEP_TIMEOUT_MS = 15_000;

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new RunStopped());
      return;
    }
    // Listener gắn vào `local.signal` nên `local.abort()` gỡ cả hai đầu một lượt.
    const local = new AbortController();
    const timer = window.setTimeout(() => {
      local.abort();
      resolve();
    }, ms);
    signal.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        local.abort();
        reject(new RunStopped());
      },
      { once: true, signal: local.signal }
    );
  });
}

type WaitOptions = { signal: AbortSignal; timeoutMs?: number };

// MutationObserver + một nhịp poll chốt (thuộc tính đổi trong cây không observe được);
// hết hạn thì ném ERR_STEP_TIMEOUT, không poll vô hạn.
export function waitFor<T>(
  probe: () => T | undefined,
  { signal, timeoutMs = STEP_TIMEOUT_MS }: WaitOptions
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new RunStopped());
      return;
    }
    let settled = false;
    const cleanups: (() => void)[] = [];
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      cleanups.forEach((cleanup) => cleanup());
      settle();
    };
    const check = (): void => {
      if (settled) return;
      try {
        const hit = probe();
        if (hit !== undefined) finish(() => resolve(hit));
      } catch (error) {
        finish(() => reject(error));
      }
    };
    const onAbort = (): void => finish(() => reject(new RunStopped()));

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    const poll = window.setInterval(check, 400);
    const timer = window.setTimeout(() => {
      finish(() => reject(new EngineError('ERR_STEP_TIMEOUT')));
    }, timeoutMs);
    signal.addEventListener('abort', onAbort, { once: true });
    cleanups.push(
      () => observer.disconnect(),
      () => window.clearInterval(poll),
      () => window.clearTimeout(timer),
      () => signal.removeEventListener('abort', onAbort)
    );
    check();
  });
}

// Chờ tới khi điều kiện "biến mất" thoả (dialog đóng, skeleton hết).
export function waitGone(
  isPresent: () => boolean,
  options: WaitOptions
): Promise<void> {
  return waitFor(() => (isPresent() ? undefined : true), options).then(
    () => undefined
  );
}

export function isEnabled(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
    if (el.disabled) return false;
  }
  return el.closest('[aria-disabled="true"],[disabled]') === null;
}

// Hộp kiểm/công tắc: đọc trạng thái từ chính nó hoặc input/role bên trong.
export function isChecked(el: HTMLElement): boolean {
  const inner = el.matches('input,[role]')
    ? el
    : el.querySelector<HTMLElement>(
        'input[type="checkbox"],[role="checkbox"],[role="switch"],[role="radio"]'
      );
  const target = inner ?? el;
  if (target instanceof HTMLInputElement) return target.checked;
  return ['aria-checked', 'aria-pressed', 'aria-selected'].some(
    (name) => target.getAttribute(name) === 'true'
  );
}

function pointIn(el: HTMLElement): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  // Điểm ngẫu nhiên trong phần tử (không bao giờ đúng tâm), cách mép 20%.
  return {
    x: rect.left + rect.width * (0.2 + randomUnit() * 0.6),
    y: rect.top + rect.height * (0.2 + randomUnit() * 0.6),
  };
}

// Chuỗi sự kiện như người bấm thật; không cố giả mạo `isTrusted`.
// `guard` (nếu có) chạy sau mọi lần chờ, ngay trước lúc nhấn và lại ngay trước lúc nhả/`click`;
// ném lỗi ở đây thì không phát sự kiện nào nữa (dùng để đối chiếu lại trạng thái trang).
export async function click(
  el: HTMLElement,
  ctx: ActionContext,
  guard?: (phase: 'press' | 'release') => void
): Promise<void> {
  await ctx.gate();
  await waitFor(() => (el.isConnected && isEnabled(el) ? true : undefined), {
    signal: ctx.signal,
  }).catch((error) => {
    throw error instanceof EngineError
      ? new EngineError('ERR_STEP_TIMEOUT', 'disabled')
      : error;
  });
  guard?.('press');
  el.scrollIntoView({ block: 'center' });
  const { x, y } = pointIn(el);
  const pointer: ConstructorParameters<typeof PointerEvent>[1] = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
  };
  const fire = (type: string): void => {
    el.dispatchEvent(
      type.startsWith('pointer')
        ? new PointerEvent(type, {
            ...pointer,
            buttons: type === 'pointerup' ? 0 : 1,
          })
        : new MouseEvent(type, {
            ...pointer,
            buttons: type === 'mouseup' || type === 'click' ? 0 : 1,
          })
    );
  };
  fire('pointerdown');
  fire('mousedown');
  await sleep(clickGapMs(), ctx.signal);
  guard?.('release');
  el.focus({ preventScroll: true });
  fire('pointerup');
  fire('mouseup');
  fire('click');
}

function setNativeValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (!setter) throw new EngineError('ERR_TYPE_MISMATCH', 'no-setter');
  setter.call(el, value);
}

// Gõ từng ký tự qua native setter + InputEvent (controlled input của React),
// rồi đọc lại `value`: sai thì dừng, không tin là đã gõ đúng.
export async function typeText(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  ctx: ActionContext
): Promise<void> {
  await ctx.gate();
  el.focus({ preventScroll: true });
  if (el.value !== '') {
    setNativeValue(el, '');
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
      })
    );
  }
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i];
    throwIfAborted(ctx.signal);
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: char, bubbles: true })
    );
    setNativeValue(el, el.value + char);
    el.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: char,
      })
    );
    el.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
    // eslint-disable-next-line no-await-in-loop
    await sleep(keyGapMs(), ctx.signal);
  }
  el.dispatchEvent(new Event('change', { bubbles: true }));
  if (el.value !== text) throw new EngineError('ERR_TYPE_MISMATCH');
}

// Văn bản người dùng thấy được của một vùng (innerText tôn trọng ẩn/hiện).
export function visibleText(root: HTMLElement | null): string {
  return root?.innerText ?? '';
}
