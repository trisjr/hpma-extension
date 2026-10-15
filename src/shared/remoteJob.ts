/**
 * remoteJob.ts — job nhận từ Firebase RTDB (SPEC-AUTO-001 §4). Thuần dữ liệu, type guard viết tay
 * (cùng triết lý messaging.ts): dữ liệu từ RTDB không đáng tin nên mỗi trường được kiểm lại, và
 * `config` đi qua đúng parser mà engine dùng (D3), không có hình dáng lệnh riêng.
 */
import { parseApproveConfig, validatePartnerName } from '@/shared/approve';
import { parseRunConfig } from '@/shared/runConfig';
import { isBusinessId } from '@/shared/surfaces';

export type MachineFlow = 'partner-assign' | 'partner-approve';
export type RemoteFlow = MachineFlow | 'requests.scan';
export type RemoteMode = 'dry' | 'assist' | 'full';
export type JobStatus =
  | 'pending'
  | 'claimed'
  | 'running'
  | 'done'
  | 'error'
  | 'cancelled';

export const MACHINE_FLOWS: readonly MachineFlow[] = [
  'partner-assign',
  'partner-approve',
];

// Flow job mà mỗi loại máy được nhận (§5.1): máy duyệt phục vụ cả job quét request.
const ACCEPTED_FLOWS: Record<MachineFlow, readonly RemoteFlow[]> = {
  'partner-assign': ['partner-assign'],
  'partner-approve': ['partner-approve', 'requests.scan'],
};

// Mode job được phép chạy từ xa ở pha hiện tại (D8). Rules cưỡng chế độc lập; mở mode mới phải sửa cả hai.
export const REMOTE_ALLOWED_MODES: readonly RemoteMode[] = ['dry'];

const REMOTE_FLOWS: readonly RemoteFlow[] = [
  'partner-assign',
  'partner-approve',
  'requests.scan',
];
const REMOTE_MODES: readonly RemoteMode[] = ['dry', 'assist', 'full'];
const JOB_STATUSES: readonly JobStatus[] = [
  'pending',
  'claimed',
  'running',
  'done',
  'error',
  'cancelled',
];

export function isMachineFlow(value: unknown): value is MachineFlow {
  return MACHINE_FLOWS.some((flow) => flow === value);
}

export function acceptsFlow(machine: MachineFlow, job: RemoteFlow): boolean {
  return ACCEPTED_FLOWS[machine].includes(job);
}

export function isModeAllowed(mode: RemoteMode): boolean {
  return REMOTE_ALLOWED_MODES.includes(mode);
}

export type RemoteJob = {
  id: string;
  flow: RemoteFlow;
  mode: RemoteMode;
  businessId: string;
  // Đã qua parser của engine ở `parseRemoteJob`; giữ `unknown` vì shape phụ thuộc `flow`.
  config: unknown;
  createdAt: number;
  status: JobStatus;
  cancelRequested: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isValidConfig(flow: RemoteFlow, config: unknown): boolean {
  switch (flow) {
    case 'partner-assign':
      return parseRunConfig(config) !== undefined;
    case 'partner-approve':
      return parseApproveConfig(config) !== undefined;
    case 'requests.scan':
      return (
        isRecord(config) &&
        typeof config.partnerName === 'string' &&
        validatePartnerName(config.partnerName) === undefined
      );
    default:
      return false;
  }
}

// Một node RTDB → RemoteJob, hoặc undefined nếu sai shape. `path` BM phải khớp `businessId` của job.
export function parseRemoteJob(
  id: string,
  value: unknown,
  pathBusinessId: string
): RemoteJob | undefined {
  if (!isRecord(value) || !isRecord(value.state)) return undefined;
  const { flow, mode, businessId, config, createdAt, cancelRequested } = value;
  const { status } = value.state;
  const remoteFlow = REMOTE_FLOWS.find((candidate) => candidate === flow);
  const remoteMode = REMOTE_MODES.find((candidate) => candidate === mode);
  const jobStatus = JOB_STATUSES.find((candidate) => candidate === status);
  if (!remoteFlow || !remoteMode || !jobStatus) return undefined;
  if (!isBusinessId(businessId) || businessId !== pathBusinessId)
    return undefined;
  if (typeof createdAt !== 'number') return undefined;
  if (!isValidConfig(remoteFlow, config)) return undefined;
  return {
    id,
    flow: remoteFlow,
    mode: remoteMode,
    businessId,
    config,
    createdAt,
    status: jobStatus,
    cancelRequested: cancelRequested === true,
  };
}

export type MachineStatus = 'idle' | 'busy' | 'blocked';

// Bản ghi `ext/machines/<machineId>` (§4.1). Pha 1 chỉ có `idle`; busy/blocked thuộc dispatcher (pha 2).
export type MachineRecord = {
  flow: MachineFlow;
  businessId: string;
  status: MachineStatus;
  extensionVersion: string;
};
