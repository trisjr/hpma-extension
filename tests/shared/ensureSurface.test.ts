import { describe, expect, it, vi } from 'vitest';

import ensureSurface from '@/shared/hooks/ensureSurface';

import { browserMock } from '../helpers/browserMock';

type Location = { pathname: string; businessId?: string };

// Tab giả: trả `location.read` theo `where`; `tabs.update` chuyển `where` sang trang đích (như điều hướng xong).
function stubTab(where: Location): { current: () => Location } {
  const state = { where };
  browserMock.tabs.sendMessage.mockImplementation(async (_tabId, message) => {
    const { kind } = message as { kind: string };
    if (kind === 'location.read')
      return { kind: 'location.reply', ...state.where };
    if (kind === 'run.sync') return { kind: 'run.snapshot', run: undefined };
    return undefined;
  });
  browserMock.tabs.update.mockImplementation(async (...args: unknown[]) => {
    const url = new URL((args[1] as { url: string }).url);
    state.where = {
      pathname: url.pathname,
      businessId: url.searchParams.get('business_id') ?? undefined,
    };
    return undefined;
  });
  return { current: () => state.where };
}

const OLD_BM = '111111111111111';
const NEW_BM = '222222222222222';

describe('ensureSurface', () => {
  it('đã đúng trang và đúng BM thì không điều hướng', async () => {
    stubTab({ pathname: '/latest/settings/requests', businessId: NEW_BM });
    const result = await ensureSurface(1, 'requests', () => false, NEW_BM);
    expect(result).toEqual({ ok: true });
    expect(browserMock.tabs.update).not.toHaveBeenCalled();
  });

  it('đúng trang nhưng sai BM thì điều hướng sang BM đích', async () => {
    vi.useFakeTimers();
    const tab = stubTab({
      pathname: '/latest/settings/requests',
      businessId: OLD_BM,
    });
    const pending = ensureSurface(1, 'requests', () => false, NEW_BM);
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toEqual({ ok: true });
    expect(tab.current().businessId).toBe(NEW_BM);
  });

  it('không truyền businessId thì giữ BM hiện tại của tab (hành vi cũ của panel)', async () => {
    vi.useFakeTimers();
    const tab = stubTab({ pathname: '/home', businessId: OLD_BM });
    const pending = ensureSurface(1, 'settings');
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toEqual({ ok: true });
    expect(tab.current().businessId).toBe(OLD_BM);
  });

  it('tab không có business_id vẫn tới được nhờ businessId đích', async () => {
    vi.useFakeTimers();
    const tab = stubTab({ pathname: '/login' });
    const pending = ensureSurface(1, 'settings', () => false, NEW_BM);
    await vi.advanceTimersByTimeAsync(600);
    expect(await pending).toEqual({ ok: true });
    expect(tab.current().businessId).toBe(NEW_BM);
  });

  it('không truyền businessId và tab không có business_id thì ERR_NO_BUSINESS', async () => {
    stubTab({ pathname: '/login' });
    expect(await ensureSurface(1, 'settings')).toEqual({
      ok: false,
      code: 'ERR_NO_BUSINESS',
    });
  });
});
