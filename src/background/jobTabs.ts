/**
 * jobTabs.ts — `TabDriver` thật của dispatcher (SPEC-AUTO-001 §5.5): tìm/mở tab BM, đưa tab tới trang flow,
 * gửi lệnh cho content script. Không thêm quyền nào: không có `tabs`/`host_permissions` nên SW không đọc được
 * `tab.url`; thay vào đó hỏi từng tab bằng `location.read` (tab không có content script thì lỗi và bị bỏ qua).
 * Mọi phản hồi đều đi qua type guard trước khi dùng.
 */
import type { RunStartCommand } from '@/shared/messaging';
import type { Surface } from '@/shared/surfaces';
import type { SyncOutcome, TabDriver } from './jobDispatcher';
import browser from 'webextension-polyfill';

import { isRequestsReply } from '@/shared/approve';
import ensureSurface from '@/shared/hooks/ensureSurface';
import {
  isLocationReply,
  isStartReply,
  isSyncReply,
  LocationReply,
} from '@/shared/messaging';
import { isRunActive } from '@/shared/run';
import { surfaceUrl } from '@/shared/surfaces';

const OPEN_TIMEOUT_MS = 30_000;
const OPEN_POLL_MS = 1000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

async function ask(tabId: number, message: unknown): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, message).catch(() => undefined);
}

async function locationOf(tabId: number): Promise<LocationReply | undefined> {
  const reply = await ask(tabId, { kind: 'location.read' });
  return isLocationReply(reply) ? reply : undefined;
}

type Candidate = { tabId: number; active: boolean };

async function candidates(businessId: string): Promise<Candidate[]> {
  const all = await browser.tabs.query({});
  const found: Candidate[] = [];
  await Promise.all(
    all.map(async (tab) => {
      if (tab.id === undefined) return;
      const location = await locationOf(tab.id);
      if (location?.businessId === businessId)
        found.push({ tabId: tab.id, active: tab.active });
    })
  );
  return found;
}

async function sync(tabId: number): Promise<SyncOutcome> {
  const reply = await ask(tabId, { kind: 'run.sync' });
  if (!isSyncReply(reply)) return { reachable: false };
  return { reachable: true, run: reply.run };
}

// Nhiều tab khớp → ưu tiên tab không có run đang chạy, rồi tab `active` của cửa sổ (§5.5.1).
async function find(businessId: string): Promise<number | undefined> {
  const found = await candidates(businessId);
  if (found.length <= 1) return found[0]?.tabId;
  const states = await Promise.all(
    found.map(async (candidate) => ({
      ...candidate,
      busy: await sync(candidate.tabId).then(
        (outcome) => !!outcome.run && isRunActive(outcome.run)
      ),
    }))
  );
  const ranked = [...states].sort(
    (a, b) =>
      Number(a.busy) - Number(b.busy) || Number(b.active) - Number(a.active)
  );
  return ranked[0].tabId;
}

// `active: true` là bắt buộc: tab nền là `hidden` nên runner sẽ `paused` vô hạn (§5.5.2, §8.1).
async function open(
  businessId: string,
  surface: Surface
): Promise<number | undefined> {
  const url = surfaceUrl(surface, businessId);
  if (!url) return undefined;
  const tab = await browser.tabs
    .create({ url, active: true })
    .catch(() => undefined);
  if (tab?.id === undefined) return undefined;
  const tabId = tab.id;
  const deadline = Date.now() + OPEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(OPEN_POLL_MS);
    // eslint-disable-next-line no-await-in-loop
    const location = await locationOf(tabId);
    if (location?.businessId === businessId) return tabId;
  }
  return undefined;
}

const tabDriver: TabDriver = {
  find,
  open,
  prepare: (tabId, surface, businessId) =>
    ensureSurface(tabId, surface, () => false, businessId),
  async start(tabId, command: RunStartCommand) {
    const reply = await ask(tabId, command);
    return isStartReply(reply) ? reply : undefined;
  },
  async scan(tabId, partnerName) {
    const reply = await ask(tabId, { kind: 'requests.read', partnerName });
    return isRequestsReply(reply) ? reply : undefined;
  },
  async stop(tabId, runId) {
    await ask(tabId, { kind: 'run.stop', runId });
  },
  sync,
  async clear(tabId) {
    await ask(tabId, { kind: 'run.clear' });
  },
  async probe(businessId) {
    return (await candidates(businessId)).length > 0;
  },
};

export default tabDriver;
