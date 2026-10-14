import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import startWatchers from '@/content/engine/watchers';

const A = '1451597353550362';
const B = '1451597353550999';

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
  it('đổi business_id sang BM khác thì báo ERR_BM_CHANGED', () => {
    const onSignal = vi.fn();
    stop = startWatchers(onSignal);
    expect(onSignal).not.toHaveBeenCalled();

    goto(`/latest/settings/partners?business_id=${B}`);
    vi.advanceTimersByTime(500);
    expect(onSignal).toHaveBeenCalledWith('ERR_BM_CHANGED');
    expect(onSignal).toHaveBeenCalledTimes(1);
  });

  it('cùng BM (chỉ đổi trang) thì không báo', () => {
    const onSignal = vi.fn();
    stop = startWatchers(onSignal);
    goto(`/latest/settings/ad_accounts?business_id=${A}`);
    vi.advanceTimersByTime(1500);
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('URL tạm thời thiếu business_id thì không báo', () => {
    const onSignal = vi.fn();
    stop = startWatchers(onSignal);
    goto('/latest/settings/partners');
    vi.advanceTimersByTime(1500);
    expect(onSignal).not.toHaveBeenCalled();
  });

  it('run bắt đầu khi URL không có business_id thì không có mốc để so', () => {
    goto('/latest/settings/partners');
    const onSignal = vi.fn();
    stop = startWatchers(onSignal);
    goto(`/latest/settings/partners?business_id=${B}`);
    vi.advanceTimersByTime(1500);
    expect(onSignal).not.toHaveBeenCalled();
  });
});
