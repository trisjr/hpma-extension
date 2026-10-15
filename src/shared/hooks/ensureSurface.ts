import type { LocationReply } from '@/shared/messaging';
import type { EngineErrorCode } from '@/shared/run';
import type { Surface } from '@/shared/surfaces';
import browser from 'webextension-polyfill';

import { isLocationReply, isSyncReply } from '@/shared/messaging';
import { isRunActive } from '@/shared/run';
import { isOnSurface, surfaceUrl } from '@/shared/surfaces';

export type SurfaceResult =
  | { ok: true }
  | {
      ok: false;
      code: Extract<
        EngineErrorCode,
        | 'ERR_BUSY'
        | 'ERR_NO_BUSINESS'
        | 'ERR_SURFACE_TIMEOUT'
        | 'ERR_TAB_RELOADED'
      >;
    };

const POLL_MS = 500;
const NAVIGATE_TIMEOUT_MS = 20_000;

async function readLocation(tabId: number): Promise<LocationReply | undefined> {
  const reply: unknown = await browser.tabs
    .sendMessage(tabId, { kind: 'location.read' })
    .catch(() => undefined);
  return isLocationReply(reply) ? reply : undefined;
}

async function hasActiveRun(tabId: number): Promise<boolean> {
  const reply: unknown = await browser.tabs
    .sendMessage(tabId, { kind: 'run.sync' })
    .catch(() => undefined);
  return isSyncReply(reply) && !!reply.run && isRunActive(reply.run);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

// Đưa tab về trang flow cần. Chỉ điều hướng khi không có run đang chạy và đã biết
// business_id; sau khi tải lại phải thấy content script trả lời đúng trang và đúng BM
// (không chỉ `status: complete`, vì content script nạp muộn hơn và FB có thể redirect).
// `businessId` (tuỳ chọn): BM đích; panel không truyền nên giữ BM hiện tại của tab. Dispatcher luôn truyền BM của máy
// để tab đang ở BM khác/trang không có business_id vẫn được đưa về đúng BM (SPEC-AUTO-001 §5.5.3).
export default async function ensureSurface(
  tabId: number,
  surface: Surface,
  isCancelled: () => boolean = () => false,
  businessId: string | undefined = undefined
): Promise<SurfaceResult> {
  const before = await readLocation(tabId);
  if (!before) return { ok: false, code: 'ERR_TAB_RELOADED' };
  const targetBm = businessId ?? before.businessId;
  if (
    isOnSurface(surface, before.pathname) &&
    (businessId === undefined || before.businessId === businessId)
  )
    return { ok: true };
  if (await hasActiveRun(tabId)) return { ok: false, code: 'ERR_BUSY' };
  const url = surfaceUrl(surface, targetBm);
  if (!url) return { ok: false, code: 'ERR_NO_BUSINESS' };
  try {
    await browser.tabs.update(tabId, { url });
  } catch {
    return { ok: false, code: 'ERR_TAB_RELOADED' };
  }
  const deadline = Date.now() + NAVIGATE_TIMEOUT_MS;
  while (Date.now() < deadline && !isCancelled()) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(POLL_MS);
    // eslint-disable-next-line no-await-in-loop
    const now = await readLocation(tabId);
    if (
      now &&
      now.businessId === targetBm &&
      isOnSurface(surface, now.pathname)
    ) {
      return { ok: true };
    }
  }
  return { ok: false, code: 'ERR_SURFACE_TIMEOUT' };
}
