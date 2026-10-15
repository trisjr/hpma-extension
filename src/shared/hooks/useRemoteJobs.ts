import { useEffect, useState } from 'react';
import type { RemoteJob } from '@/shared/remoteJob';
import browser from 'webextension-polyfill';

import { isRemoteJob } from '@/shared/remoteJob';

// Khoá do service worker ghi (src/background/firebaseRelay.ts): job `pending` đúng flow của máy này.
const JOBS_KEY = 'remote:jobs';

function parseJobs(value: unknown): RemoteJob[] {
  return Array.isArray(value) ? value.filter(isRemoteJob) : [];
}

// Job từ xa đang chờ (chỉ đọc, SPEC-AUTO-001 pha 1). `storage.session` không có trên mọi bản
// Firefox cũ và SW cũng không ghi ở đó trên Firefox, nên thiếu/lỗi thì coi như không có job.
export default function useRemoteJobs(): RemoteJob[] {
  const [jobs, setJobs] = useState<RemoteJob[]>([]);

  useEffect(() => {
    const { session } = browser.storage;
    if (!session) return undefined;
    session
      .get(JOBS_KEY)
      .then((stored) => setJobs(parseJobs(stored[JOBS_KEY])))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'session' && JOBS_KEY in changes)
        setJobs(parseJobs(changes[JOBS_KEY].newValue));
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return jobs;
}
