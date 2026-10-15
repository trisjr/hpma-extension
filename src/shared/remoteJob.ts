/**
 * remoteJob.ts — job nhận từ Firebase RTDB (SPEC-AUTO-001 §4). Thuần dữ liệu, type guard viết tay
 * (cùng triết lý messaging.ts): dữ liệu từ RTDB không đáng tin nên mỗi trường được kiểm lại, và
 * `config` đi qua đúng parser mà engine dùng (D3), không có hình dáng lệnh riêng.
 */
import { uiTaskKeys } from '@/content/flows/partnerTasks';
import {
  cleanPartnerName,
  parseApproveAllConfig,
  parseApproveConfig,
  validatePartnerName,
} from '@/shared/approve';
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

// Mode job được phép chạy từ xa, theo flow (D8, Q4). Rules cưỡng chế độc lập; mở mode mới phải sửa cả hai.
export const REMOTE_ALLOWED_MODES: Record<RemoteFlow, readonly RemoteMode[]> = {
  // Anh đã mở `full` cho cả gán partner (engine tự bấm Assign mỗi mẻ). `requests.scan` không ghi nên chỉ `dry`.
  // Dispatcher còn ép cổng probe ≥ 95% theo flow, dấu vết người duyệt và trần 3 job/ngày trước khi chạy.
  'partner-assign': ['dry', 'full'],
  'partner-approve': ['dry', 'full'],
  'requests.scan': ['dry'],
};

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

export function isModeAllowed(flow: RemoteFlow, mode: RemoteMode): boolean {
  return REMOTE_ALLOWED_MODES[flow].includes(mode);
}

// Khai chuỗi assign → approve (D12) trên job assign; chỉ ops đặt, bất biến sau khi tạo.
export type ChainDecl = {
  auto: true;
  partnerName: string;
  requesterName?: string;
  // Mode của job approve; scan của chuỗi luôn `dry`.
  mode: 'dry' | 'full';
  scanDelaysSec: number[];
  ttlSec: number;
};

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
  // Dấu vết người duyệt (chỉ job duyệt): dispatcher tự kiểm lại trước khi chạy `full`, không chỉ tin Rules.
  approval?: string;
  approvedBy?: string;
  createdBy?: string;
  scanJobId?: string;
  // Job assign có khai chuỗi: finishRun ghi `result.awaitingApproval` để coordinator đối chiếu.
  chain?: ChainDecl;
  // Job scan/approve do coordinator tạo: trỏ về job assign của chuỗi.
  chainAssignJobId?: string;
};

const str = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isValidConfig(flow: RemoteFlow, config: unknown): boolean {
  switch (flow) {
    case 'partner-assign': {
      const parsed = parseRunConfig(config);
      // Engine cũng từ chối tổ hợp quyền mà UI BM không biểu diễn chính xác (vd ADVERTISE riêng lẻ).
      return parsed !== undefined && uiTaskKeys(parsed.tasks) !== undefined;
    }
    case 'partner-approve':
      return (
        parseApproveConfig(config) !== undefined ||
        parseApproveAllConfig(config) !== undefined
      );
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

const isDelay = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

// `chain` trên job assign: dữ liệu RTDB không đáng tin nên kiểm từng trường; sai dạng thì coi như không có chuỗi.
export function parseChainDecl(value: unknown): ChainDecl | undefined {
  if (!isRecord(value) || value.auto !== true) return undefined;
  const { partnerName, requesterName, mode, scanDelaysSec, ttlSec } = value;
  if (typeof partnerName !== 'string' || validatePartnerName(partnerName))
    return undefined;
  if (mode !== 'dry' && mode !== 'full') return undefined;
  if (!Array.isArray(scanDelaysSec) || !scanDelaysSec.every(isDelay))
    return undefined;
  if (!isDelay(ttlSec)) return undefined;
  if (requesterName !== undefined && typeof requesterName !== 'string')
    return undefined;
  return {
    auto: true,
    partnerName: cleanPartnerName(partnerName),
    ...(requesterName === undefined
      ? {}
      : { requesterName: cleanPartnerName(requesterName) }),
    mode,
    scanDelaysSec,
    ttlSec,
  };
}

// Vỏ job: kiểm flow/mode/BM/thời gian/trạng thái nhưng CHƯA kiểm `config`. Dispatcher dùng để claim cả job
// sai config rồi ghi `ERR_JOB_INVALID` (chỉ máy giữ job mới được ghi `state`, §5.1 bước 3).
export function parseJobEnvelope(
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
  return {
    id,
    flow: remoteFlow,
    mode: remoteMode,
    businessId,
    config,
    createdAt,
    status: jobStatus,
    cancelRequested: cancelRequested === true,
    approval: str(value.approval),
    approvedBy: str(value.approvedBy),
    createdBy: str(value.createdBy),
    scanJobId: str(value.scanJobId),
    chain: parseChainDecl(value.chain),
    chainAssignJobId: isRecord(value.chain)
      ? str(value.chain.assignJobId)
      : undefined,
  };
}

export function hasValidConfig(job: RemoteJob): boolean {
  return isValidConfig(job.flow, job.config);
}

// Một node RTDB → RemoteJob có config hợp lệ, hoặc undefined. Dùng cho danh sách hiển thị ở panel/popup.
export function parseRemoteJob(
  id: string,
  value: unknown,
  pathBusinessId: string
): RemoteJob | undefined {
  const job = parseJobEnvelope(id, value, pathBusinessId);
  return job && hasValidConfig(job) ? job : undefined;
}

export const COORDINATOR_UID = 'coordinator';

// Job approve auto-match hợp lệ: chỉ approve, do coordinator tạo, trỏ tới scan và job assign của chuỗi.
function isAutoMatchApprove(job: RemoteJob): boolean {
  if (job.flow !== 'partner-approve' || job.approval !== 'auto-match')
    return false;
  const config = parseApproveConfig(job.config);
  return (
    config?.action === 'approve' &&
    // BM ID đối tác bắt buộc: không có thì engine chỉ so tên BM, mà tên có thể trùng (M3).
    config.partnerBmId !== undefined &&
    job.scanJobId !== undefined &&
    job.chainAssignJobId !== undefined &&
    job.createdBy === COORDINATOR_UID &&
    job.approvedBy === COORDINATOR_UID
  );
}

// TEMP(D12-bridge): đường tạm khi chưa có coordinator — máy `partner-assign` tự tạo job approve ngay sau khi
// job assign (có `chain.auto`) dừng ở pending-approval. Gỡ cùng lúc với `src/background/chainBridge.ts` và nhánh
// `machine-chain` trong `coordinator/database.rules.json` khi coordinator (phase B) được triển khai.
export const BRIDGE_APPROVAL = 'machine-chain';

// Job approve của đường tạm: config `approveAll` (luôn approve, bắt buộc partnerBmId — M3), do chính máy tạo
// (createdBy = approvedBy), trỏ về job assign của chuỗi, không có scan.
function isBridgeApprove(job: RemoteJob): boolean {
  if (job.flow !== 'partner-approve' || job.approval !== BRIDGE_APPROVAL)
    return false;
  return (
    parseApproveAllConfig(job.config) !== undefined &&
    job.scanJobId === undefined &&
    job.chainAssignJobId !== undefined &&
    job.createdBy !== undefined &&
    job.createdBy !== COORDINATOR_UID &&
    job.approvedBy === job.createdBy
  );
}

// Vì sao dispatcher không được chạy job này (→ `ERR_JOB_INVALID`, không gửi lệnh, không retry).
export function jobDispatchIssue(
  job: RemoteJob
): 'mode' | 'config' | 'provenance' | undefined {
  if (!isModeAllowed(job.flow, job.mode)) return 'mode';
  // `full` ghi thật: bắt buộc do người duyệt (§8.1); job duyệt còn phải trỏ tới một lần quét (D6). Rules cũng kiểm,
  // đây là lớp thứ hai. Ngoại lệ duy nhất: job approve của chuỗi auto-match (D12) do coordinator tạo.
  if (
    job.mode === 'full' &&
    !(
      job.approval === 'human' &&
      (job.flow !== 'partner-approve' || job.scanJobId !== undefined) &&
      job.approvedBy !== undefined &&
      job.approvedBy === job.createdBy
    ) &&
    !isAutoMatchApprove(job) &&
    !isBridgeApprove(job)
  )
    return 'provenance';
  return hasValidConfig(job) ? undefined : 'config';
}

// Job đã lưu ở `storage.session` do chính SW ghi, nhưng vẫn kiểm lại trước khi panel dùng (dữ liệu qua storage là ranh giới).
export function isRemoteJob(value: unknown): value is RemoteJob {
  if (!isRecord(value)) return false;
  const { id, flow, mode, businessId, config, createdAt, status } = value;
  return (
    typeof id === 'string' &&
    REMOTE_FLOWS.some((candidate) => candidate === flow) &&
    REMOTE_MODES.some((candidate) => candidate === mode) &&
    isBusinessId(businessId) &&
    typeof createdAt === 'number' &&
    JOB_STATUSES.some((candidate) => candidate === status) &&
    typeof value.cancelRequested === 'boolean' &&
    isValidConfig(flow as RemoteFlow, config)
  );
}

// Tên BM đối tác của job duyệt/quét (để panel điền sẵn); job gán không có.
export function jobPartnerName(job: RemoteJob): string | undefined {
  if (job.flow === 'partner-approve') {
    return (parseApproveConfig(job.config) ?? parseApproveAllConfig(job.config))
      ?.partnerName;
  }
  if (job.flow === 'requests.scan' && isRecord(job.config)) {
    const name = job.config.partnerName;
    return typeof name === 'string' ? cleanPartnerName(name) : undefined;
  }
  return undefined;
}

export type MachineStatus = 'idle' | 'busy' | 'blocked';

// Bản ghi `ext/machines/<machineId>` (§4.1). Pha 1 chỉ có `idle`; busy/blocked thuộc dispatcher (pha 2).
export type MachineRecord = {
  flow: MachineFlow;
  businessId: string;
  status: MachineStatus;
  extensionVersion: string;
};
