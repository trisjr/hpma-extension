import { beforeEach, describe, expect, it, vi } from 'vitest';

import EngineError from '@/content/engine/errors';
import {
  isChecked,
  isEnabled,
  sleep,
  typeText,
  waitFor,
  waitGone,
} from '@/content/engine/primitives';
import RunStopped from '@/content/engine/stop';

import { drive } from '../helpers/timers';

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});

const ctxOf = (controller = new AbortController()) => ({
  signal: controller.signal,
  lang: 'vi',
  gate: async () => undefined,
});

describe('sleep', () => {
  it('xong sau đúng khoảng chờ', async () => {
    const controller = new AbortController();
    let done = false;
    sleep(1000, controller.signal).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('abort giữa chừng thì ném RunStopped và huỷ timer', async () => {
    const controller = new AbortController();
    const pending = sleep(5000, controller.signal);
    const assertion = expect(pending).rejects.toBeInstanceOf(RunStopped);
    controller.abort();
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('signal đã abort từ trước thì ném ngay', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(sleep(10, controller.signal)).rejects.toBeInstanceOf(
      RunStopped
    );
  });
});

describe('waitFor / waitGone', () => {
  it('trả giá trị ngay khi probe có kết quả (poll hoặc mutation)', async () => {
    const controller = new AbortController();
    const result = waitFor(() => document.getElementById('late') ?? undefined, {
      signal: controller.signal,
    });
    setTimeout(() => {
      document.body.innerHTML = '<div id="late"></div>';
    }, 1000);
    expect((await drive(result)).id).toBe('late');
  });

  it('hết hạn thì ném ERR_STEP_TIMEOUT và dọn timer/observer', async () => {
    const controller = new AbortController();
    const result = waitFor(() => undefined, {
      signal: controller.signal,
      timeoutMs: 2000,
    });
    const assertion = expect(result).rejects.toMatchObject({
      code: 'ERR_STEP_TIMEOUT',
    });
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('abort thì ném RunStopped, lỗi của probe được chuyển tiếp', async () => {
    const controller = new AbortController();
    const result = waitFor(() => undefined, { signal: controller.signal });
    const assertion = expect(result).rejects.toBeInstanceOf(RunStopped);
    controller.abort();
    await assertion;
    await expect(
      waitFor(
        () => {
          throw new EngineError('ERR_LOCATE_TIMEOUT', 'x');
        },
        { signal: new AbortController().signal }
      )
    ).rejects.toMatchObject({ code: 'ERR_LOCATE_TIMEOUT' });
  });

  it('waitGone chờ tới khi điều kiện biến mất', async () => {
    document.body.innerHTML = '<div id="gone"></div>';
    const result = waitGone(() => document.getElementById('gone') !== null, {
      signal: new AbortController().signal,
    });
    setTimeout(() => document.getElementById('gone')?.remove(), 500);
    await expect(drive(result)).resolves.toBeUndefined();
  });
});

describe('isEnabled / isChecked', () => {
  it('isEnabled nhận ra disabled, aria-disabled và tổ tiên bị khoá', () => {
    document.body.innerHTML =
      '<button id="a" disabled></button><div aria-disabled="true"><span id="b"></span></div><button id="c"></button>';
    const get = (id: string): HTMLElement =>
      document.getElementById(id) as HTMLElement;
    expect(isEnabled(get('a'))).toBe(false);
    expect(isEnabled(get('b'))).toBe(false);
    expect(isEnabled(get('c'))).toBe(true);
  });

  it('isChecked đọc checkbox thật, ARIA, và phần tử con bên trong', () => {
    document.body.innerHTML =
      '<input id="a" type="checkbox" checked><div id="b" role="switch" aria-checked="true"></div><div id="c" role="tab" aria-selected="false"></div><label id="d"><input type="checkbox" checked>x</label><div id="e"></div>';
    const get = (id: string): HTMLElement =>
      document.getElementById(id) as HTMLElement;
    expect(isChecked(get('a'))).toBe(true);
    expect(isChecked(get('b'))).toBe(true);
    expect(isChecked(get('c'))).toBe(false);
    expect(isChecked(get('d'))).toBe(true);
    expect(isChecked(get('e'))).toBe(false);
  });
});

describe('typeText', () => {
  it('gõ từng ký tự, phát input event và thay giá trị cũ', async () => {
    document.body.innerHTML = '<input id="q" value="old">';
    const input = document.getElementById('q') as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(input.value));
    await drive(typeText(input, 'ab', ctxOf()));
    expect(input.value).toBe('ab');
    expect(seen).toEqual(['', 'a', 'ab']);
  });

  it('đọc lại không khớp (ô nhập chặn giá trị) thì ném ERR_TYPE_MISMATCH', async () => {
    document.body.innerHTML = '<input id="q">';
    const input = document.getElementById('q') as HTMLInputElement;
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
    });
    await expect(drive(typeText(input, 'ab', ctxOf()))).rejects.toMatchObject({
      code: 'ERR_TYPE_MISMATCH',
    });
  });

  it('abort giữa chừng thì dừng bằng RunStopped', async () => {
    document.body.innerHTML = '<input id="q">';
    const input = document.getElementById('q') as HTMLInputElement;
    const controller = new AbortController();
    const result = typeText(input, 'abcdef', ctxOf(controller));
    const assertion = expect(result).rejects.toBeInstanceOf(RunStopped);
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(input.value.length).toBeLessThan(6);
  });
});
