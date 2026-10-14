/**
 * controller.ts — điểm vào của engine trong content script: nhận lệnh đã qua type
 * guard từ side panel, kiểm cổng an toàn, giữ đúng MỘT run (SPEC-ENG-001 §4, §7).
 * State run nằm ở đây (không ở panel/service worker): đóng panel không mất run.
 */
import type {
  AckReply,
  RunCommand,
  RunEvent,
  RunStartCommand,
  StartReply,
  SyncReply,
} from '@/shared/messaging';
import type { EngineErrorCode, RunState } from '@/shared/run';
import browser from 'webextension-polyfill';

import { parseRunConfig } from '@/shared/runConfig';
import { isCurfew } from '@/shared/settings';

import partnerAssignFlow from '../flows/partnerAssign';
import { uiTaskKeys } from '../flows/partnerTasks';
import { RunHandle, startRun } from './runner';
import { clearLastRun, loadGates, loadLogDetail, loadPacing } from './store';

let active: RunHandle | undefined;
// Run vừa kết thúc, giữ lại để panel mở lại còn đồng bộ được (tới khi `run.clear`).
let finished: RunState | undefined;
let starting = false;

function emit(run: RunState): void {
  const event: RunEvent = { kind: 'run.state', run };
  // Panel đóng thì không có người nhận: bỏ qua.
  browser.runtime.sendMessage(event).catch(() => undefined);
}

// Probe không chạy chen vào lúc run đang khởi động hoặc đang chạy.
export function isRunBusy(): boolean {
  return active !== undefined || starting;
}

const reject = (code: EngineErrorCode): StartReply => ({ ok: false, code });

async function start(command: RunStartCommand): Promise<StartReply> {
  const config = parseRunConfig(command.config);
  if (!config || uiTaskKeys(config.tasks) === undefined) {
    return reject('ERR_INVALID_CONFIG');
  }
  if (active || starting) return reject('ERR_BUSY');
  starting = true;
  try {
    const now = Date.now();
    const [pacing, gates, logDetail] = await Promise.all([
      loadPacing(),
      loadGates(now),
      loadLogDetail(),
    ]);
    if (command.mode === 'assist') {
      if (gates.emergency) return reject('ERR_EMERGENCY');
      if (gates.rateLimited) return reject('ERR_RATE_LIMITED');
      if (isCurfew(new Date(now), pacing.curfew)) return reject('ERR_CURFEW');
      if (gates.writesToday >= pacing.limits.standard.writesPerDay) {
        return reject('ERR_BUDGET');
      }
    }
    const handle = startRun({
      mode: command.mode,
      config,
      pacing,
      logDetail,
      flow: partnerAssignFlow,
      onState: emit,
    });
    active = handle;
    finished = undefined;
    handle.done
      .then((run) => {
        finished = run;
      })
      .catch(() => undefined)
      .finally(() => {
        if (active === handle) active = undefined;
      });
    return { ok: true, runId: handle.snapshot().runId };
  } finally {
    starting = false;
  }
}

function runIdMatches(runId: string): boolean {
  return active !== undefined && active.snapshot().runId === runId;
}

export default async function handleRunCommand(
  command: RunCommand
): Promise<StartReply | AckReply | SyncReply> {
  switch (command.kind) {
    case 'run.start':
      return start(command);
    case 'run.stop':
      if (!runIdMatches(command.runId)) return { ok: false };
      active?.stop();
      return { ok: true };
    case 'run.assistDone':
      if (!runIdMatches(command.runId)) return { ok: false };
      active?.assistDone();
      return { ok: true };
    case 'run.sync':
      return {
        kind: 'run.snapshot',
        run: active ? active.snapshot() : finished,
      };
    case 'run.clear':
      if (active) return { ok: false };
      finished = undefined;
      await clearLastRun();
      return { ok: true };
    default:
      return { ok: false };
  }
}
