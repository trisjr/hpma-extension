import { useEffect, useState } from 'react';
import type { RemoteJob } from '@/shared/remoteJob';
import type { RunStatus } from '@/shared/run';
import browser from 'webextension-polyfill';

import { isRemoteJob } from '@/shared/remoteJob';
import { isRunState } from '@/shared/run';

// Khoá do service worker ghi (src/background/firebaseRelay.ts): job đang giữ máy này.
const ACTIVE_KEY = 'remote:active';
// Content script ghi run gần nhất ở đây (src/content/engine/store.ts).
const LAST_RUN_KEY = 'lastRun';

export type ActiveRemoteJob = {
  job: RemoteJob;
  // Chỉ có khi run của chính job này đã chạy và đọc được từ `lastRun`.
  progress?: { done: number; total: number; status: RunStatus };
};

type ActiveRecord = { job: RemoteJob; runId?: string };

const parseActive = (value: unknown): ActiveRecord | undefined => {
  if (typeof value !== 'object' || value === null) return undefined;
  const { job, runId } = value as { job?: unknown; runId?: unknown };
  if (!isRemoteJob(job)) return undefined;
  return { job, runId: typeof runId === 'string' ? runId : undefined };
};

// Job từ xa đang chạy trên máy này kèm tiến độ (chỉ đọc). Thiếu `storage.session` hoặc lỗi đọc thì coi như không có.
export default function useActiveRemoteJob(): ActiveRemoteJob | undefined {
  const [active, setActive] = useState<ActiveRecord>();
  const [lastRun, setLastRun] = useState<unknown>();

  useEffect(() => {
    const { session } = browser.storage;
    if (!session) return undefined;
    session
      .get(ACTIVE_KEY)
      .then((stored) => setActive(parseActive(stored[ACTIVE_KEY])))
      .catch(() => undefined);
    browser.storage.local
      .get(LAST_RUN_KEY)
      .then((stored) => setLastRun(stored[LAST_RUN_KEY]))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'session' && ACTIVE_KEY in changes)
        setActive(parseActive(changes[ACTIVE_KEY].newValue));
      if (area === 'local' && LAST_RUN_KEY in changes)
        setLastRun(changes[LAST_RUN_KEY].newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  if (!active) return undefined;
  const run =
    active.runId !== undefined &&
    isRunState(lastRun) &&
    lastRun.runId === active.runId
      ? lastRun
      : undefined;
  if (!run) return { job: active.job };
  const pending = new Set(['queued', 'running']);
  return {
    job: active.job,
    progress: {
      done: run.targets.filter((target) => !pending.has(target.outcome)).length,
      total: run.targets.length,
      status: run.status,
    },
  };
}
