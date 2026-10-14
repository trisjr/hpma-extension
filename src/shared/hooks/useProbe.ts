import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProbeCommand } from '@/shared/messaging';
import type {
  GateStatus,
  ProbeReport,
  ProbeReports,
  ProbeStage,
} from '@/shared/probe';
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
  // `stage` chọn tay màn cần đo; bỏ trống thì content script tự nhận diện.
  run: (stage?: ProbeStage) => void;
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
  // Bản mới nhất của `reports` cho callback async: không đọc closure cũ (báo cáo đã lưu có
  // thể về sau lúc bấm), nếu không lần ghi kế tiếp sẽ làm mất báo cáo của các màn khác.
  const reportsRef = useRef<ProbeReports>({});
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
        reportsRef.current = { ...saved, ...reportsRef.current };
        setReports(reportsRef.current);
        if (latestReport(saved)) {
          setStatus((current) => (current === 'idle' ? 'done' : current));
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const run = useCallback(
    (stage?: ProbeStage): void => {
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
      const command: ProbeCommand = { kind: 'probe.run', stage };
      browser.tabs
        .sendMessage(tabId, command)
        .then(async (reply: unknown) => {
          if (!isProbeReply(reply)) {
            fail('probe.err.unreachable');
            return;
          }
          if (!reply.ok) {
            fail(`probe.err.${reply.code}`);
            return;
          }
          const report: ProbeReport = {
            ...reply.report,
            browser: browserName(),
          };
          const next: ProbeReports = {
            ...reportsRef.current,
            [report.stage]: report,
          };
          reportsRef.current = next;
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
    },
    [enabled, status, tabId]
  );

  return {
    status,
    report: latestReport(reports),
    reports,
    gate: gateStatus(reports),
    errorKey,
    run,
  };
}
