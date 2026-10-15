/**
 * remoteMessages.ts — message giữa extension page (Options/popup/panel) và service worker cho kênh
 * điều khiển từ xa (SPEC-AUTO-001 §3, §6). Type guard viết tay như messaging.ts. Chỉ extension page
 * gửi được các lệnh này (SW kiểm `sender.url`); mật khẩu đi qua message một lần, không lưu.
 */
import type { MachineFlow } from '@/shared/remoteJob';

import { isMachineFlow } from '@/shared/remoteJob';

export type RemoteSignIn = {
  kind: 'remote.signIn';
  email: string;
  password: string;
};
export type RemoteSignOut = { kind: 'remote.signOut' };
export type RemoteStatusRead = { kind: 'remote.status' };
// Spike §5.5: SW có tìm được tab BM bằng `location.read` không (kiểm `sender.url` của SW ở content).
export type RemoteProbeTab = { kind: 'remote.probeTab' };

// Gỡ khoá rate-limit: xoá cờ của engine và lịch sự cố của dispatcher. Không đụng khoá khẩn cấp (checkpoint),
// chỉ Options › Devtest gỡ được khoá đó.
export type RemoteUnlockRateLimit = { kind: 'remote.unlockRateLimit' };

export type RemoteCommand =
  | RemoteSignIn
  | RemoteSignOut
  | RemoteStatusRead
  | RemoteProbeTab
  | RemoteUnlockRateLimit;

// `unprovisioned`: token chưa có claim (ops chưa cấp máy); `machine-mismatch`: claim.machineId khác
// machineId của profile này (ops gán nhầm hoặc profile bị xoá dữ liệu); `ok`: được phép ghi presence.
export type Provision =
  | 'signed-out'
  | 'unprovisioned'
  | 'machine-mismatch'
  | 'ok';

export type RemoteStatus = {
  kind: 'remote.status.reply';
  machineId: string;
  provision: Provision;
  email?: string;
  flow?: MachineFlow;
  businessId?: string;
  // Giờ máy của lần ghi heartbeat thành công gần nhất (chỉ để hiển thị; mọi quyết định dùng giờ server).
  lastHeartbeatAt?: number;
  lastError?: string;
  pendingJobs: number;
};

export type ProbedTab = {
  tabId: number;
  pathname: string;
  businessId?: string;
};
export type RemoteProbeReply = {
  kind: 'remote.probe.reply';
  tabs: ProbedTab[];
  // Có tab khớp `businessId` của máy.
  matched: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function isRemoteCommand(value: unknown): value is RemoteCommand {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case 'remote.signIn':
      return (
        typeof value.email === 'string' &&
        value.email.length > 0 &&
        value.email.length <= 254 &&
        typeof value.password === 'string' &&
        value.password.length > 0 &&
        value.password.length <= 1024
      );
    case 'remote.signOut':
    case 'remote.status':
    case 'remote.probeTab':
    case 'remote.unlockRateLimit':
      return true;
    default:
      return false;
  }
}

export function isRemoteStatus(value: unknown): value is RemoteStatus {
  return (
    isRecord(value) &&
    value.kind === 'remote.status.reply' &&
    typeof value.machineId === 'string' &&
    typeof value.provision === 'string' &&
    typeof value.pendingJobs === 'number' &&
    (value.flow === undefined || isMachineFlow(value.flow))
  );
}

export function isRemoteProbeReply(value: unknown): value is RemoteProbeReply {
  return (
    isRecord(value) &&
    value.kind === 'remote.probe.reply' &&
    Array.isArray(value.tabs) &&
    typeof value.matched === 'boolean'
  );
}
