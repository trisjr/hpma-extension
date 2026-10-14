import { useCallback, useEffect, useState } from 'react';
import type { RunScenario, RunState } from '@/shared/run';
import type { RunController } from './runController';
import browser from 'webextension-polyfill';

import {
  advance,
  confirmAssist,
  createRun,
  isRunFinished,
  isRunState,
  resyncRun,
  RUN_SCENARIOS,
  stopRun,
} from '@/shared/run';
import { DEVTEST_KEY, parseDevtest } from '@/shared/settings';

// Chỉ simulator: không có message nào tới content script/tab BM (NFR-02).
// SPEC-UI-003 §2, §8.5.
const STORAGE_KEY = 'lastRun';
const TICK_MS = 700;

// Kịch bản: `?scenario=` trên URL side panel thắng; nếu không có thì lấy công tắc
// Options › Devtest (chỉ khi devtest bật); mặc định `done` (SPEC-UI-004 §5.4).
async function readScenario(): Promise<RunScenario> {
  const value = new URLSearchParams(window.location.search).get('scenario');
  const fromQuery = RUN_SCENARIOS.find((scenario) => scenario === value);
  if (fromQuery) return fromQuery;
  const stored = await browser.storage.local
    .get(DEVTEST_KEY)
    .catch(() => ({}) as Record<string, unknown>);
  const devtest = parseDevtest(
    stored[DEVTEST_KEY],
    Date.now(),
    import.meta.env.DEV
  );
  return devtest.devtest ? devtest.simScenario : 'done';
}

// `enabled` = false: hook nằm im (không đọc/ghi storage, không timer) để engine
// thật là bên duy nhất sở hữu `lastRun`.
export default function useRunSimulator(enabled: boolean): RunController {
  const [run, setRun] = useState<RunState | undefined>();

  // Mở lại panel: chỉ khôi phục run đã kết thúc (simulator không sống qua panel).
  useEffect(() => {
    if (!enabled) return;
    browser.storage.local
      .get(STORAGE_KEY)
      .then((stored) => {
        const value: unknown = stored[STORAGE_KEY];
        if (isRunState(value) && isRunFinished(value)) {
          setRun((current) => current ?? value);
        }
      })
      .catch(() => undefined);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || run?.status !== 'running') return undefined;
    const timer = window.setTimeout(() => {
      setRun((current) => (current ? advance(current, Date.now()) : current));
    }, TICK_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || !isRunFinished(run)) return;
    browser.storage.local.set({ [STORAGE_KEY]: run }).catch(() => undefined);
  }, [enabled, run]);

  // Đọc kịch bản lúc bấm chạy (không phải lúc mount) để đổi ở Options có hiệu lực ngay.
  const start = useCallback<RunController['start']>(
    ({ mode, config, diff }) => {
      if (!enabled) return;
      readScenario().then((scenario) =>
        setRun(createRun({ mode, scenario, config, diff, now: Date.now() }))
      );
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if (!enabled) return;
    setRun((current) => (current ? stopRun(current, Date.now()) : current));
  }, [enabled]);

  const confirm = useCallback(() => {
    if (!enabled) return;
    setRun((current) =>
      current ? confirmAssist(current, Date.now()) : current
    );
  }, [enabled]);

  const resync = useCallback(() => {
    if (!enabled) return;
    setRun((current) => (current ? resyncRun(current) : current));
  }, [enabled]);

  const clear = useCallback(() => {
    if (!enabled) return;
    setRun(undefined);
    browser.storage.local.remove(STORAGE_KEY).catch(() => undefined);
  }, [enabled]);

  return {
    run,
    start,
    // Simulator chỉ mô phỏng flow Gán partner; flow duyệt cần engine thật.
    startApprove: () => undefined,
    stop,
    confirmAssist: confirm,
    resync,
    clear,
  };
}
