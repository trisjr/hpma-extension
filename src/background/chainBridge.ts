/**
 * chainBridge.ts — TEMP(D12-bridge): đường tạm cho chuỗi assign → approve khi chưa có coordinator (phase B).
 * Máy `partner-assign` tự tạo MỘT job `partner-approve` ngay sau khi job assign (có `chain.auto`, do ops khai)
 * dừng ở pending-approval. Đây là ngoại lệ có thời hạn của D13 ("máy extension không bao giờ tạo job").
 *
 * GỠ khi coordinator được triển khai (xem "Gỡ đường tạm D12-bridge" ở SPEC-AUTO-001 §7.3):
 *   1. xoá file này và lời gọi `bridgeApprove` ở `jobDispatcher.ts` (`finishRun`), `createJob` ở `jobStore.ts`;
 *   2. xoá `BRIDGE_APPROVAL`/`isBridgeApprove` ở `src/shared/remoteJob.ts`;
 *   3. xoá nhánh `machine-chain` ở `coordinator/database.rules.json` và test tương ứng.
 *
 * Gate là engine: chỉ duyệt request đang có thật ở Needs review khớp đủ `partnerName`, `partnerBmId` (từ config
 * assign, bất biến), requester và tên TKQC. Rules cưỡng chế `partnerName`/`partnerBmId`/mode/action và MỌI
 * `requests[i].requester` bằng `chain.requesterName` của job assign, nhưng không so được tên TKQC với
 * `awaitingApproval`: một profile admin 1 bị chiếm có thể khai tên TKQC tuỳ ý. Trần thực tế là "mọi TKQC mà
 * admin 1 xin cấp cho đúng BM đối tác" (vì chính admin 1 cũng tự gửi được request mới trên Meta).
 */
import type { JobResult } from './dispatchLogic';

import { parseApproveConfig } from '@/shared/approve';
import { BRIDGE_APPROVAL, RemoteJob } from '@/shared/remoteJob';
import { parseRunConfig } from '@/shared/runConfig';

// Cùng khoá với đường coordinator: mỗi chuỗi tối đa một job approve (`!data.exists()` ở Rules chặn tạo lần hai).
export const bridgeJobId = (assignJobId: string): string =>
  `chain-${assignJobId}-approve`;

// Phần job do store điền thêm: `createdBy`/`approvedBy` (uid đang đăng nhập), `createdAt` (server).
export type BridgeJob = {
  flow: 'partner-approve';
  mode: 'dry' | 'full';
  businessId: string;
  config: unknown;
  approval: typeof BRIDGE_APPROVAL;
  cancelRequested: false;
  chain: { assignJobId: string };
  state: { status: 'pending' };
};

export function buildBridgeApprove(
  job: RemoteJob,
  awaiting: NonNullable<JobResult['awaitingApproval']>
): BridgeJob | undefined {
  const { chain } = job;
  const assign =
    job.flow === 'partner-assign' ? parseRunConfig(job.config) : undefined;
  if (!chain?.auto || !chain.requesterName || !assign) return undefined;
  const config = parseApproveConfig({
    partnerName: chain.partnerName,
    partnerBmId: assign.partnerBmId,
    action: 'approve',
    requests: awaiting.map(({ name }) => ({
      requester: chain.requesterName,
      account: name,
    })),
  });
  if (!config) return undefined;
  return {
    flow: 'partner-approve',
    mode: chain.mode,
    businessId: job.businessId,
    config,
    approval: BRIDGE_APPROVAL,
    cancelRequested: false,
    chain: { assignJobId: job.id },
    state: { status: 'pending' },
  };
}

// Tạo job approve cho chuỗi. Lỗi (Rules từ chối, mất mạng, config không dựng được) ném ra cho caller báo cáo:
// job assign đã chốt `done` từ trước nên không bao giờ bị đổi trạng thái vì bước này.
export default async function bridgeApprove(
  job: RemoteJob,
  awaiting: JobResult['awaitingApproval'],
  createJob: ((jobId: string, job: BridgeJob) => Promise<void>) | undefined
): Promise<void> {
  if (!createJob || !awaiting || !job.chain?.auto) return;
  const built = buildBridgeApprove(job, awaiting);
  if (!built) throw new Error('D12-bridge: không dựng được job approve');
  await createJob(bridgeJobId(job.id), built);
}
