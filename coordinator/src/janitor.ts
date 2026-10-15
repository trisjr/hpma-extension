/**
 * janitor.ts — dọn dẹp và cứu job mồ côi (SPEC-AUTO-001 §4.4, §5.4). Phần lập kế hoạch là hàm thuần trên dữ liệu
 * RTDB đã đọc; phần thi hành đi qua `JanitorIo` để dùng chung cho `coordinator watch` (Admin SDK + override) và
 * `ops janitor` (client SDK, quyền ops). Mọi ghi vẫn phải qua Database Rules: kế hoạch chỉ đề xuất đúng những
 * chuyển trạng thái mà Rules cho phép coordinator.
 */

// TTL từ spec: job mồ côi 15 phút, máy mất heartbeat 5 phút, PII 24 giờ, job cuối 30 ngày.
export const ORPHAN_TTL_MS = 15 * 60 * 1000;
export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
export const PII_TTL_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type JanitorAction =
  // claimed → pending, bỏ claimedBy: máy chết trước khi gửi lệnh (chưa có dispatchingAt) nên an toàn (§5.4).
  | { kind: 'reclaim'; bm: string; jobId: string }
  // running → error ERR_MACHINE_LOST, KHÔNG về pending (D9: không tự chạy lại).
  | { kind: 'lost'; bm: string; jobId: string }
  // Xoá PII quá 24 giờ: `result/scan`, `result/awaitingApproval`.
  | { kind: 'scrub'; bm: string; jobId: string; fields: string[] }
  // Xoá job trạng thái cuối quá 30 ngày.
  | { kind: 'delete'; bm: string; jobId: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const TERMINAL = ['done', 'error', 'cancelled'];

export type PlanInput = {
  bm: string;
  // `ext/jobs/<bm>` như đọc từ RTDB.
  jobs: Record<string, unknown> | null;
  // machineId → lastHeartbeatAt (giờ server).
  heartbeats: Record<string, number | undefined>;
  // Giờ server (ms).
  now: number;
};

export function planJanitor({
  bm,
  jobs,
  heartbeats,
  now,
}: PlanInput): JanitorAction[] {
  if (!jobs) return [];
  const actions: JanitorAction[] = [];
  Object.entries(jobs).forEach(([jobId, node]) => {
    if (!isRecord(node) || !isRecord(node.state)) return;
    const { state } = node;
    const { status } = state;
    const claimedBy =
      typeof state.claimedBy === 'string' ? state.claimedBy : undefined;

    if (status === 'claimed' || status === 'running') {
      // Mốc cuối: progressAt, rồi startedAt/claimedAt khi chưa có tiến độ.
      const last =
        status === 'running'
          ? num(state.progressAt) ??
            num(state.startedAt) ??
            num(state.claimedAt)
          : num(state.claimedAt);
      const heartbeat = claimedBy ? heartbeats[claimedBy] : undefined;
      // Điều kiện AND: mốc cũ VÀ heartbeat của máy giữ job cũ. Máy còn tươi thì tự reconcile được.
      const orphan =
        last !== undefined &&
        now - last > ORPHAN_TTL_MS &&
        (heartbeat === undefined || now - heartbeat > HEARTBEAT_STALE_MS);
      // `claimed` mà máy đã bắt đầu gửi lệnh (dispatchingAt): run có thể đã chạm BM nên chốt lỗi, không về pending (D9).
      if (orphan)
        actions.push({
          kind:
            status === 'claimed' && state.dispatchingAt == null
              ? 'reclaim'
              : 'lost',
          bm,
          jobId,
        });
      return;
    }

    if (typeof status === 'string' && TERMINAL.includes(status)) {
      const finishedAt = num(state.finishedAt);
      if (finishedAt === undefined) return;
      if (now - finishedAt > RETENTION_MS) {
        actions.push({ kind: 'delete', bm, jobId });
        return;
      }
      const result = isRecord(state.result) ? state.result : {};
      const fields = ['scan', 'awaitingApproval'].filter(
        (field) => field in result
      );
      if (now - finishedAt > PII_TTL_MS && fields.length > 0)
        actions.push({ kind: 'scrub', bm, jobId, fields });
    }
  });
  return actions;
}

// Lớp ghi: mỗi phương thức ứng với đúng một kiểu ghi mà Rules cho phép coordinator/ops.
export type JanitorIo = {
  serverNow: () => Promise<number>;
  // Mọi BM có máy (Rules không cho đọc cả `ext/jobs`, nên lấy từ `ext/machines`).
  readMachines: () => Promise<
    Record<string, { businessId?: string; lastHeartbeatAt?: number }>
  >;
  readJobs: (bm: string) => Promise<Record<string, unknown> | null>;
  updateState: (
    bm: string,
    jobId: string,
    patch: Record<string, unknown>
  ) => Promise<void>;
  removePath: (path: string) => Promise<void>;
};

// `failed`: hành động bị Rules (hoặc mạng) từ chối; không làm dừng cả vòng, vòng sau thử lại.
export type JanitorReport = {
  bm: string;
  actions: JanitorAction[];
  failed: { action: JanitorAction; error: string }[];
};

export async function runJanitor(io: JanitorIo): Promise<JanitorReport[]> {
  const now = await io.serverNow();
  const machines = await io.readMachines();
  const heartbeats: Record<string, number | undefined> = {};
  const bms = new Set<string>();
  Object.entries(machines).forEach(([id, machine]) => {
    heartbeats[id] = num(machine.lastHeartbeatAt);
    if (typeof machine.businessId === 'string') bms.add(machine.businessId);
  });
  const reports: JanitorReport[] = [];
  const branches = [...bms];
  for (let i = 0; i < branches.length; i += 1) {
    const bm = branches[i];
    // eslint-disable-next-line no-await-in-loop
    const jobs = await io.readJobs(bm);
    const actions = planJanitor({ bm, jobs, heartbeats, now });
    const failed: JanitorReport['failed'] = [];
    for (let j = 0; j < actions.length; j += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await apply(io, actions[j]);
      } catch (error) {
        failed.push({ action: actions[j], error: String(error) });
      }
    }
    reports.push({ bm, actions, failed });
  }
  return reports;
}

async function apply(io: JanitorIo, action: JanitorAction): Promise<void> {
  const base = `ext/jobs/${action.bm}/${action.jobId}`;
  switch (action.kind) {
    case 'reclaim':
      await io.updateState(action.bm, action.jobId, {
        status: 'pending',
        claimedBy: null,
        claimedAt: null,
      });
      break;
    case 'lost':
      await io.updateState(action.bm, action.jobId, {
        status: 'error',
        error: { code: 'ERR_MACHINE_LOST' },
        finishedAt: { '.sv': 'timestamp' },
      });
      break;
    case 'scrub':
      await Promise.all(
        action.fields.map((field) =>
          io.removePath(`${base}/state/result/${field}`)
        )
      );
      break;
    default:
      await io.removePath(base);
  }
}
