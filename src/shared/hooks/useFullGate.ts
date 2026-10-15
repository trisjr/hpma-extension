import { useEffect, useState } from 'react';
import type { ApproveGate } from '@/shared/probe';
import browser from 'webextension-polyfill';

import {
  approveGate,
  parseProbeReports,
  PROBE_STORAGE_KEY,
} from '@/shared/probe';

// Cổng mở chế độ Full (PRD §4.1b, Q4): báo cáo probe của hai màn duyệt request phải mới và ≥ 95%. Chưa đọc xong
// hoặc đọc lỗi thì coi như CHƯA đạt (khoá), không bao giờ mặc định mở.
const CLOSED: ApproveGate = {
  ok: false,
  missing: ['requests', 'request-detail'],
  below: [],
  stale: [],
};

export default function useFullGate(): ApproveGate {
  const [gate, setGate] = useState<ApproveGate>(CLOSED);

  useEffect(() => {
    let cancelled = false;
    const apply = (raw: unknown): void => {
      if (!cancelled) setGate(approveGate(parseProbeReports(raw), Date.now()));
    };
    browser.storage.local
      .get(PROBE_STORAGE_KEY)
      .then((stored) => apply(stored[PROBE_STORAGE_KEY]))
      .catch(() => undefined);
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (area === 'local' && PROBE_STORAGE_KEY in changes)
        apply(changes[PROBE_STORAGE_KEY].newValue);
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(onChanged);
    };
  }, []);

  return gate;
}
