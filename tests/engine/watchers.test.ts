import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import startWatchers, { BM_MISSING_POLLS } from '@/content/engine/watchers';

const A = '1451597353550362';
const B = '1451597353550999';
const POLL = 500;

function goto(url: string): void {
  window.history.replaceState({}, '', url);
}

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  goto(`/latest/settings/partners?business_id=${A}`);
});

afterEach(() => {
  stop?.();
  stop = undefined;
  goto('/');
});

describe('startWatchers: đổi BM giữa run', () => {
  it('đổi business_id sang BM khác thì báo ERR_BM_CHANGED ngay ở lần poll kế', () => {
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    expect(onSignal).not.toHaveBeenCalled();

    goto(`/latest/settings/partners?business_id=${B}`);
    vi.advanceTimersByTime(POLL);
    expect(onSignal).toHaveBeenCalledWith('ERR_BM_CHANGED');
    expect(onSignal).toHaveBeenCalledTimes(1);
  });

  it('cùng BM (chỉ đổi trang) thì không báo', () => {
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    goto(`/latest/settings/ad_accounts?business_id=${A}`);
    vi.advanceTimersByTime(BM_MISSING_POLLS * POLL * 2);
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('mốc là BM panel đã chọn, không phải URL lúc watcher khởi động (M1)', () => {
    goto(`/latest/settings/partners?business_id=${B}`);
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    expect(onSignal).toHaveBeenCalledWith('ERR_BM_CHANGED');
  });

  it('URL tạm thiếu business_id rồi có lại trước ngưỡng thì không báo (L1)', () => {
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    goto('/latest/settings/partners');
    vi.advanceTimersByTime(POLL * (BM_MISSING_POLLS - 1));
    goto(`/latest/settings/partners?business_id=${A}`);
    vi.advanceTimersByTime(POLL * BM_MISSING_POLLS * 2);
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('thiếu business_id liên tục tới ngưỡng thì báo ERR_BM_CHANGED (L1)', () => {
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    goto('/latest/settings/partners');
    vi.advanceTimersByTime(POLL * (BM_MISSING_POLLS - 1));
    expect(onSignal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(POLL);
    expect(onSignal).toHaveBeenCalledWith('ERR_BM_CHANGED');
    expect(onSignal).toHaveBeenCalledTimes(1);
  });

  it('business_id sai định dạng cũng tính là thiếu', () => {
    const onSignal = vi.fn();
    stop = startWatchers(A, onSignal);
    goto('/latest/settings/partners?business_id=abc');
    vi.advanceTimersByTime(POLL * BM_MISSING_POLLS);
    expect(onSignal).toHaveBeenCalledWith('ERR_BM_CHANGED');
  });
});
