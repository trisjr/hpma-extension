/**
 * messaging.ts — typed union cho message giữa extension pages (side panel,
 * popup) và content script (docs/050-Research/21 §5.5, SPEC-ENG-001 §4).
 * Mọi đầu nhận kiểm `sender.id` và validate shape bằng type guard viết tay.
 */
import type { AccountsRead } from '@/shared/adAccounts';
import type { ProbeStage } from '@/shared/probe';
import type { EngineErrorCode, RunMode, RunState } from '@/shared/run';
import type { RunConfig } from '@/shared/runConfig';

import { isStage } from '@/shared/probe';
import { isRunState } from '@/shared/run';
import { isBusinessId } from '@/shared/surfaces';

export type PingMessage = { kind: 'ping' };

export type PongMessage = { kind: 'pong' };

// Panel hỏi vị trí tab (không có quyền `tabs` nên không đọc được `tab.url`).
export type LocationRead = { kind: 'location.read' };
export type LocationReply = {
  kind: 'location.reply';
  pathname: string;
  businessId?: string;
};

// ---- Lệnh panel → content script -------------------------------------------

export type RunStartCommand = {
  kind: 'run.start';
  requestId: string;
  mode: RunMode;
  config: RunConfig;
};
export type RunStopCommand = { kind: 'run.stop'; runId: string };
export type RunSyncCommand = { kind: 'run.sync' };
export type RunAssistDoneCommand = { kind: 'run.assistDone'; runId: string };
// Xoá run đã kết thúc khỏi bộ nhớ content script (nút "Xong").
export type RunClearCommand = { kind: 'run.clear' };

export type RunCommand =
  | RunStartCommand
  | RunStopCommand
  | RunSyncCommand
  | RunAssistDoneCommand
  | RunClearCommand;

// Panel → content script: đo hit-rate selector trên DOM sống (chỉ đọc, FR-02).
// `stage` chọn tay màn cần đo; bỏ trống thì content script tự nhận diện.
export type ProbeCommand = { kind: 'probe.run'; stage?: ProbeStage };

export type ContentMessage =
  | PingMessage
  | LocationRead
  | RunCommand
  | ProbeCommand
  | AccountsRead;

// ---- Phản hồi / sự kiện ----------------------------------------------------

export type StartReply =
  | { ok: true; runId: string }
  | { ok: false; code: EngineErrorCode };
export type AckReply = { ok: boolean };
export type SyncReply = { kind: 'run.snapshot'; run: RunState | undefined };

// content script → panel (runtime.sendMessage); panel đóng thì reject, bỏ qua.
export type RunEvent = { kind: 'run.state'; run: RunState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function kindOf(value: unknown): unknown {
  return isRecord(value) ? value.kind : undefined;
}

export function isPingMessage(value: unknown): value is PingMessage {
  return kindOf(value) === 'ping';
}

export function isPongMessage(value: unknown): value is PongMessage {
  return kindOf(value) === 'pong';
}

export function isLocationRead(value: unknown): value is LocationRead {
  return kindOf(value) === 'location.read';
}

export function isLocationReply(value: unknown): value is LocationReply {
  return (
    isRecord(value) &&
    value.kind === 'location.reply' &&
    typeof value.pathname === 'string' &&
    (value.businessId === undefined || isBusinessId(value.businessId))
  );
}

// Chỉ kiểm vỏ lệnh; `config` của run.start vẫn phải qua `parseRunConfig`.
export function isRunCommand(value: unknown): value is RunCommand {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'run.start':
      return (
        typeof value.requestId === 'string' &&
        (value.mode === 'dry' || value.mode === 'assist') &&
        isRecord(value.config)
      );
    case 'run.stop':
    case 'run.assistDone':
      return typeof value.runId === 'string';
    case 'run.sync':
    case 'run.clear':
      return true;
    default:
      return false;
  }
}

export function isProbeCommand(value: unknown): value is ProbeCommand {
  if (kindOf(value) !== 'probe.run') return false;
  const { stage } = value as { stage?: unknown };
  return stage === undefined || isStage(stage);
}

export function isStartReply(value: unknown): value is StartReply {
  if (!isRecord(value)) return false;
  if (value.ok === true) return typeof value.runId === 'string';
  return value.ok === false && typeof value.code === 'string';
}

export function isAckReply(value: unknown): value is AckReply {
  return isRecord(value) && typeof value.ok === 'boolean';
}

export function isSyncReply(value: unknown): value is SyncReply {
  if (!isRecord(value) || value.kind !== 'run.snapshot') return false;
  return value.run === undefined || isRunState(value.run);
}

export function isRunEvent(value: unknown): value is RunEvent {
  return isRecord(value) && value.kind === 'run.state' && isRunState(value.run);
}
