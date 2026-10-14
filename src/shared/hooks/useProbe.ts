import { useCallback, useEffect, useState } from 'react';
import type { GateStatus, ProbeReport, ProbeReports } from '@/shared/probe';
import browser from 'webextension-polyfill';

import {
  gateStatus,
  isProbeReply,
  latestReport,
  parseProbeReports,
  PROBE_STORAGE_KEY,
} from '@/shared/probe';

export type ProbeStatus = 'idle' | 'running' | 'done' | 'error';

export type ProbeController = {
  status: ProbeStatus;
  // Báo cáo mới nhất (vừa đo, hoặc đã lưu từ lần trước).
  report: ProbeReport | undefined;
  // Báo cáo mới nhất của từng màn.
  reports: ProbeReports;
  gate: GateStatus;
  // Mã lỗi của lần chạy gần nhất (khi status = error).
  errorKey: string | undefined;
  run: () => void;
};

// API nhận dạng trình duyệt chỉ có ở extension page, và không dùng user agent vì
// profile antidetect giả mạo nó.
function browserName(): ProbeReport['browser'] {
  return typeof browser.runtime.getBrowserInfo === 'function'
    ? 'firefox'
    : 'chrome';
}

export default function useProbe(
  tabId: number | undefined,
  enabled: boolean
): ProbeController {
  const [reports, setReports] = useState<ProbeReports>({});
  const [status, setStatus] = useState<ProbeStatus>('idle');
  const [errorKey, setErrorKey] = useState<string | undefined>();

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    browser.storage.local
      .get(PROBE_STORAGE_KEY)
      .then((stored) => {
        if (cancelled) return;
        const saved = parseProbeReports(stored[PROBE_STORAGE_KEY]);
        setReports((current) => ({ ...saved, ...current }));
        if (latestReport(saved)) {
          setStatus((current) => (current === 'idle' ? 'done' : current));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const run = useCallback((): void => {
    if (!enabled || status === 'running') return;
    const fail = (key: string): void => {
      setErrorKey(key);
      setStatus('error');
    };
    if (tabId === undefined) {
      fail('probe.err.unreachable');
      return;
    }
    setStatus('running');
    setErrorKey(undefined);
    browser.tabs
      .sendMessage(tabId, { kind: 'probe.run' })
      .then(async (reply: unknown) => {
        if (!isProbeReply(reply)) {
          fail('probe.err.unreachable');
          return;
        }
        if (!reply.ok) {
          fail(`probe.err.${reply.code}`);
          return;
        }
        const report: ProbeReport = { ...reply.report, browser: browserName() };
        const next: ProbeReports = { ...reports, [report.stage]: report };
        setReports(next);
        setStatus('done');
        // Lưu lỗi (hết dung lượng...) không làm mất báo cáo đang hiện.
        await browser.storage.local
          .set({ [PROBE_STORAGE_KEY]: next })
          .catch(() => {
            setErrorKey('probe.err.saveFailed');
          });
      })
      // Tab không có content script (ngoài BM, hoặc mở trước khi cài ext).
      .catch(() => fail('probe.err.unreachable'));
  }, [enabled, status, tabId, reports]);

  return {
    status,
    report: latestReport(reports),
    reports,
    gate: gateStatus(reports),
    errorKey,
    run,
  };
}
