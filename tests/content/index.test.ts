import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EXTENSION_ID,
  EXTENSION_ORIGIN,
  messageListeners,
} from '../helpers/browserMock';
import { BM_ID } from '../helpers/fixtures';

// Cổng vào của content script: chỉ nhận lệnh từ extension page của chính mình.
const handleRunCommand = vi.hoisted(() => vi.fn());
vi.mock('@/content/engine/controller', () => ({ default: handleRunCommand }));

const fromPanel = {
  id: EXTENSION_ID,
  url: `${EXTENSION_ORIGIN}sidepanel.html`,
};
const fromPage = {
  id: EXTENSION_ID,
  url: 'https://business.facebook.com/latest/settings',
};
const runStop = { kind: 'run.stop', runId: 'run_aabbcc' };

let listener: (typeof messageListeners)[number];

beforeEach(async () => {
  handleRunCommand.mockReset();
  handleRunCommand.mockResolvedValue({ ok: true });
  vi.resetModules();
  await import('@/content/index');
  [listener] = messageListeners;
});

describe('content script message gate', () => {
  it('đăng ký đúng một listener', () => {
    expect(messageListeners).toHaveLength(1);
  });

  it('bỏ qua mọi thứ từ extension khác', () => {
    expect(
      listener(runStop, { ...fromPanel, id: 'other-extension' })
    ).toBeUndefined();
    expect(
      listener({ kind: 'ping' }, { id: 'other-extension' })
    ).toBeUndefined();
    expect(handleRunCommand).not.toHaveBeenCalled();
  });

  it('ping -> pong (từ bất kỳ nơi nào của chính extension)', async () => {
    expect(await listener({ kind: 'ping' }, fromPanel)).toEqual({
      kind: 'pong',
    });
  });

  it('lệnh run chỉ nhận từ extension page, không nhận từ content script (URL là trang BM)', async () => {
    expect(listener(runStop, fromPage)).toBeUndefined();
    expect(handleRunCommand).not.toHaveBeenCalled();
    expect(await listener(runStop, fromPanel)).toEqual({ ok: true });
    expect(handleRunCommand).toHaveBeenCalledWith(runStop);
  });

  it('thiếu sender.url thì không coi là extension page', () => {
    expect(listener(runStop, { id: EXTENSION_ID })).toBeUndefined();
  });

  it('lệnh sai hình dạng bị bỏ qua (type guard)', () => {
    expect(listener({ kind: 'run.stop' }, fromPanel)).toBeUndefined();
    expect(
      listener({ kind: 'run.start', mode: 'full' }, fromPanel)
    ).toBeUndefined();
    expect(listener('run.stop', fromPanel)).toBeUndefined();
    expect(listener(null, fromPanel)).toBeUndefined();
    expect(handleRunCommand).not.toHaveBeenCalled();
  });

  it('location.read trả pathname và business_id hợp lệ', async () => {
    window.history.pushState({}, '', `/latest/settings?business_id=${BM_ID}`);
    expect(await listener({ kind: 'location.read' }, fromPanel)).toEqual({
      kind: 'location.reply',
      pathname: '/latest/settings',
      businessId: BM_ID,
    });
    window.history.pushState({}, '', '/latest/settings?business_id=abc');
    expect(await listener({ kind: 'location.read' }, fromPanel)).toMatchObject({
      businessId: undefined,
    });
    expect(listener({ kind: 'location.read' }, fromPage)).toBeUndefined();
    window.history.pushState({}, '', '/');
  });
});
