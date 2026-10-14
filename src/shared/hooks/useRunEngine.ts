import { useCallback, useEffect, useState } from 'react';
import type { ApproveConfig } from '@/shared/approve';
import type { RunCommand, RunStartCommand } from '@/shared/messaging';
import type { PartnerAssignConfig } from '@/shared/partnerAssign';
import type { DiffRow, EngineErrorCode, RunMode, RunState } from '@/shared/run';
import type { Surface } from '@/shared/surfaces';
import type { SurfaceResult } from './ensureSurface';
import type { RunController } from './runController';
import browser from 'webextension-polyfill';

import { approveTargetId } from '@/shared/approve';
import {
  isAckReply,
  isRunEvent,
  isStartReply,
  isSyncReply,
} from '@/shared/messaging';
import {
  createRun,
  finish,
  isRunActive,
  isRunFinished,
  isRunState,
  newRunId,
  patchStep,
  pendingSteps,
  startEntry,
  stopRun,
} from '@/shared/run';
import { isBusinessId } from '@/shared/surfaces';

import ensureSurface from './ensureSurface';

// Engine thật chạy trong content script; panel chỉ là view + nguồn lệnh
// (SPEC-ENG-001 §3–4). Content script tự ghi `lastRun`, panel không ghi.
const STORAGE_KEY = 'lastRun';

// Mọi lỗi gửi (tab đóng, chưa có content script) thành `undefined`, không throw.
function send(tabId: number, command: RunCommand): Promise<unknown> {
  return browser.tabs.sendMessage(tabId, command).catch(() => undefined);
}

// Đưa tab tới trang flow cần (nếu có) rồi gửi `run.start`; mọi lỗi quy về `fail(mã)`.
function dispatchStart(
  tabId: number,
  command: RunStartCommand,
  surface: Surface | undefined,
  fail: (code: EngineErrorCode) => void
): void {
  const ensured: Promise<SurfaceResult> = surface
    ? ensureSurface(tabId, surface)
    : Promise.resolve({ ok: true });
  ensured
    .then((surfaceResult) => {
      if (!surfaceResult.ok) {
        fail(surfaceResult.code);
        return undefined;
      }
      return send(tabId, command).then((reply) => {
        if (reply === undefined) {
          fail('ERR_TAB_RELOADED');
          return;
        }
        if (!isStartReply(reply)) {
          fail('ERR_INTERNAL');
          return;
        }
        // Thành công thì snapshot đầu tiên tới qua `run.state`.
        if (!reply.ok) fail(reply.code);
      });
    })
    .catch(() => fail('ERR_INTERNAL'));
}

// Run đã kết thúc `failed` dựng cục bộ để màn Result vẫn hiện được mã lỗi khi
// lệnh start không tới nơi hoặc bị engine từ chối.
function failedRun(params: {
  mode: RunMode;
  config: PartnerAssignConfig;
  diff: DiffRow[];
  code: string;
}): RunState {
  const { mode, config, diff, code } = params;
  const now = Date.now();
  const base = createRun({ mode, scenario: 'done', config, diff, now });
  return finish(
    {
      ...base,
      simulated: false,
      targets: base.targets.map((target, index) =>
        index === 0 ? { ...target, outcome: 'failed' as const, code } : target
      ),
      steps: patchStep(base, 1, {
        state: 'failed',
        phases: { locate: 'fail', act: 'idle', verify: 'idle' },
      }),
      error: { code, stepIndex: 1 },
    },
    'failed',
    now
  );
}

// Như `failedRun` cho flow duyệt request (SPEC-ENG-002): dựng cục bộ để màn Result hiện mã lỗi.
function failedApproveRun(params: {
  mode: RunMode;
  config: ApproveConfig;
  code: string;
}): RunState {
  const { mode, config, code } = params;
  const now = Date.now();
  return finish(
    {
      runId: newRunId(),
      mode,
      status: 'running',
      simulated: false,
      batch: { index: 1, total: config.requests.length },
      auditFailed: false,
      scenario: 'done',
      startedAt: now,
      flow: 'partner-approve',
      partnerName: config.partnerName,
      partnerBmId: '',
      tasks: [],
      targets: config.requests.map((request, index) => ({
        accountId: approveTargetId(request, index),
        name: request.account,
        plan: 'run' as const,
        outcome: index === 0 ? ('failed' as const) : ('queued' as const),
        ...(index === 0 ? { code } : {}),
      })),
      currentTarget: 0,
      steps: pendingSteps('partner-approve'),
      stepIndex: 1,
      sub: 0,
      disconnectDone: false,
      error: { code, stepIndex: 1 },
      log: [startEntry(now)],
    },
    'failed',
    now
  );
}

// Content script không còn run (tab reload) trong khi panel vẫn giữ run active:
// không tự chạy tiếp, chỉ báo đã dừng.
function lostRun(run: RunState): RunState {
  return finish(
    { ...run, error: { code: 'ERR_TAB_RELOADED', stepIndex: run.stepIndex } },
    'stopped',
    Date.now()
  );
}

export default function useRunEngine(
  tabId: number | undefined,
  enabled: boolean
): RunController {
  const [run, setRun] = useState<RunState | undefined>();

  // Khôi phục run đã kết thúc từ storage (content script ghi), không đè run đang có.
  const restoreLast = useCallback((): void => {
    browser.storage.local
      .get(STORAGE_KEY)
      .then((stored) => {
        const value: unknown = stored[STORAGE_KEY];
        if (isRunState(value) && isRunFinished(value)) {
          setRun((current) => current ?? value);
        }
      })
      .catch(() => undefined);
  }, []);

  // Đồng bộ với content script: có run thì lấy snapshot, không có mà panel đang
  // giữ run active thì run đã mất (reload tab).
  const syncFrom = useCallback(
    (id: number, isCancelled: () => boolean): void => {
      send(id, { kind: 'run.sync' }).then((reply) => {
        if (isCancelled()) return;
        if (isSyncReply(reply) && reply.run) {
          setRun(reply.run);
          return;
        }
        if (isSyncReply(reply)) {
          setRun((current) =>
            current && isRunActive(current) ? lostRun(current) : current
          );
        }
        restoreLast();
      });
    },
    [restoreLast]
  );

  useEffect(() => {
    if (!enabled) return undefined;
    if (tabId === undefined) {
      restoreLast();
      return undefined;
    }
    let cancelled = false;
    syncFrom(tabId, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [enabled, tabId, syncFrom, restoreLast]);

  useEffect(() => {
    if (!enabled || tabId === undefined) return undefined;
    // Chỉ nhận snapshot do chính content script của tab đang ghim gửi tới.
    const onMessage = (
      message: unknown,
      sender: browser.Runtime.MessageSender
    ): void => {
      if (sender.id !== browser.runtime.id) return;
      if (sender.tab?.id !== tabId) return;
      if (isRunEvent(message)) setRun(message.run);
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [enabled, tabId]);

  const start = useCallback<RunController['start']>(
    ({ mode, config, diff, surface, businessId }) => {
      if (!enabled) return;
      const fail = (code: EngineErrorCode): void =>
        setRun(failedRun({ mode, config, diff, code }));
      if (tabId === undefined) {
        fail('ERR_TAB_RELOADED');
        return;
      }
      // Không biết danh sách TKQC thuộc BM nào (chưa tải, hoặc đã bị làm mới vì tab đổi BM):
      // không gửi lệnh, nếu không guard đổi BM sẽ tắt im lặng.
      if (!isBusinessId(businessId)) {
        fail('ERR_BM_CHANGED');
        return;
      }
      // `accountIds` ở chế độ engine là các chuỗi tên/ID user dán.
      const command: RunStartCommand = {
        kind: 'run.start',
        requestId: crypto.randomUUID(),
        mode,
        businessId,
        config: {
          partnerBmId: config.partnerBmId,
          queries: config.accountIds,
          tasks: config.tasks,
        },
      };
      dispatchStart(tabId, command, surface, fail);
    },
    [enabled, tabId]
  );

  const startApprove = useCallback<RunController['startApprove']>(
    ({ mode, config, businessId }) => {
      if (!enabled) return;
      const fail = (code: EngineErrorCode): void =>
        setRun(failedApproveRun({ mode, config, code }));
      if (tabId === undefined) {
        fail('ERR_TAB_RELOADED');
        return;
      }
      // BM của lần quét: thiếu thì không gửi, nếu không guard đổi BM sẽ tắt im lặng.
      if (!isBusinessId(businessId)) {
        fail('ERR_BM_CHANGED');
        return;
      }
      const command: RunStartCommand = {
        kind: 'run.start',
        requestId: crypto.randomUUID(),
        flow: 'partner-approve',
        mode,
        businessId,
        config,
      };
      dispatchStart(tabId, command, 'requests', fail);
    },
    [enabled, tabId]
  );

  const runId = run?.runId;

  const stop = useCallback(() => {
    if (!enabled || runId === undefined) return;
    // Không có đường tới content script thì dừng cục bộ để UI không kẹt.
    const stopLocal = (): void =>
      setRun((current) =>
        current && current.runId === runId
          ? stopRun(current, Date.now())
          : current
      );
    if (tabId === undefined) {
      stopLocal();
      return;
    }
    send(tabId, { kind: 'run.stop', runId }).then((reply) => {
      if (!isAckReply(reply) || !reply.ok) stopLocal();
    });
  }, [enabled, tabId, runId]);

  const confirmAssist = useCallback(() => {
    if (!enabled || tabId === undefined || runId === undefined) return;
    send(tabId, { kind: 'run.assistDone', runId });
  }, [enabled, tabId, runId]);

  const resync = useCallback(() => {
    if (!enabled || tabId === undefined) return;
    syncFrom(tabId, () => false);
  }, [enabled, tabId, syncFrom]);

  const clear = useCallback(() => {
    if (!enabled) return;
    setRun(undefined);
    if (tabId !== undefined) send(tabId, { kind: 'run.clear' });
    browser.storage.local.remove(STORAGE_KEY).catch(() => undefined);
  }, [enabled, tabId]);

  return { run, start, startApprove, stop, confirmAssist, resync, clear };
}
