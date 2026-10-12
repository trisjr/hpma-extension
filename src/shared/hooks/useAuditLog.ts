import { useEffect, useState } from 'react';
import type { AuditRow } from '@/shared/audit';
import browser from 'webextension-polyfill';

import { AUDIT_PREFIX, isAuditRow, SAMPLE_AUDIT } from '@/shared/audit';

export type AuditLogState = {
  ready: boolean;
  rows: AuditRow[];
  // true khi chưa có chunk `audit:*` thật nào → đang hiện dữ liệu mẫu (SPEC-UI-004 §4.4).
  isSample: boolean;
};

// FR-07: background ghi chunk `audit:<yyyy-mm>:<n>` (mảng AuditRow). Chưa có writer,
// hook chỉ đọc; TODO(FR-07): bỏ dữ liệu mẫu khi background ghi audit thật.
function collect(stored: Record<string, unknown>): AuditRow[] {
  return Object.entries(stored)
    .filter(([key]) => key.startsWith(AUDIT_PREFIX))
    .flatMap(([, chunk]) => (Array.isArray(chunk) ? chunk : []))
    .filter(isAuditRow)
    .sort((a, b) => b.time - a.time);
}

export default function useAuditLog(): AuditLogState {
  const [state, setState] = useState<AuditLogState>({
    ready: false,
    rows: [],
    isSample: false,
  });

  useEffect(() => {
    const load = (): void => {
      browser.storage.local
        .get(null)
        .then((stored) => {
          const rows = collect(stored);
          setState(
            rows.length > 0
              ? { ready: true, rows, isSample: false }
              : { ready: true, rows: SAMPLE_AUDIT, isSample: true }
          );
        })
        .catch(() => setState((current) => ({ ...current, ready: true })));
    };
    load();
    const onChanged = (
      changes: Record<string, browser.Storage.StorageChange>,
      area: string
    ): void => {
      if (
        area === 'local' &&
        Object.keys(changes).some((key) => key.startsWith(AUDIT_PREFIX))
      ) {
        load();
      }
    };
    browser.storage.onChanged.addListener(onChanged);
    return () => browser.storage.onChanged.removeListener(onChanged);
  }, []);

  return state;
}
