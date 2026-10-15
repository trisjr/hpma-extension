/**
 * ops — CLI tạo/giám sát job qua client SDK để Database Rules luôn áp dụng (SPEC-AUTO-001 §7.4, D15).
 * Đăng nhập bằng tài khoản có claim `ops` (HPMA_OPS_EMAIL mặc định ops@hpma.com, HPMA_OPS_PASSWORD).
 *
 *   pnpm ops status
 *   pnpm ops assign <bm> --file job.json
 *   pnpm ops scan <bm> --partner "TÊN BM ĐỐI TÁC"
 *   pnpm ops approve <bm> <scanJobId> [--action approve|decline] [--select 1,3-5|all] [--mode dry|full] [--yes]
 *   pnpm ops cancel <bm> <jobId>
 *   pnpm ops janitor
 *   pnpm ops kill [<bm>]      pnpm ops unkill [<bm>]
 */
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  Database,
  get,
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';

import firebaseConfig from '@/shared/firebaseConfig';

import { runJanitor } from './janitor';
import { clientIo } from './janitorIo';
import {
  buildApproveJob,
  buildAssignJob,
  buildScanJob,
  parseAssignConfig,
  parseScanPartner,
  parseSelection,
  requireBusinessId,
} from './jobs';

type ScanJobNode = {
  flow?: string;
  config?: { partnerName?: unknown };
  state?: {
    status?: string;
    result?: { scan?: { requests?: unknown } };
  };
};

// Giá trị lấy từ cờ dòng lệnh nếu có, không thì hỏi trên terminal.
async function ask(
  preset: string | undefined,
  question: string
): Promise<string> {
  if (preset !== undefined) return preset.trim();
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

const OFFLINE_AFTER_MS = 5 * 60_000;

const fail = (message: string): never => {
  console.error(`Lỗi: ${message}`);
  process.exit(1);
};

// Giờ server = giờ máy + offset do SDK đo; dùng cho mọi so sánh heartbeat (D11).
const serverNow = (db: Database): Promise<number> =>
  new Promise((resolve) => {
    const unsubscribe = onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
      unsubscribe();
      resolve(Date.now() + (snap.val() as number));
    });
  });

type Machine = {
  flow?: string;
  businessId?: string;
  status?: string;
  blockedReason?: string | null;
  currentJobId?: string | null;
  blockedUntil?: number | null;
  lastHeartbeatAt?: number;
  extensionVersion?: string;
};

async function printStatus(db: Database): Promise<void> {
  const now = await serverNow(db);
  const machines = ((await get(ref(db, 'ext/machines'))).val() ?? {}) as Record<
    string,
    Machine
  >;
  const ids = Object.keys(machines);
  if (ids.length === 0) console.log('Chưa có máy nào báo heartbeat.');
  ids.forEach((id) => {
    const m = machines[id];
    const age = m.lastHeartbeatAt ? now - m.lastHeartbeatAt : undefined;
    const presence =
      age === undefined || age > OFFLINE_AFTER_MS ? 'OFFLINE' : 'online';
    const until =
      m.blockedUntil && m.blockedReason
        ? ` tới ${new Date(m.blockedUntil).toLocaleString('vi-VN')}`
        : '';
    const blocked = m.blockedReason ? ` (${m.blockedReason}${until})` : '';
    const holding = m.currentJobId ? `  job=${m.currentJobId}` : '';
    console.log(
      [
        id,
        presence,
        m.flow,
        `bm=${m.businessId}`,
        `${m.status ?? '?'}${blocked}${holding}`,
        age === undefined
          ? 'heartbeat: —'
          : `heartbeat: ${Math.round(age / 1000)}s trước`,
        `v${m.extensionVersion ?? '?'}`,
      ].join('  ')
    );
  });
  // Đếm job theo trạng thái ở từng BM có máy (ops đọc được nhánh BM; không đọc được cả `ext/jobs`).
  const branches = [
    ...new Set(ids.map((id) => machines[id].businessId).filter(Boolean)),
  ] as string[];
  await Promise.all(
    branches.map(async (bm) => {
      const jobs = ((await get(ref(db, `ext/jobs/${bm}`))).val() ??
        {}) as Record<string, { state?: { status?: string } }>;
      const counts: Record<string, number> = {};
      Object.values(jobs).forEach((job) => {
        const status = job.state?.status ?? '?';
        counts[status] = (counts[status] ?? 0) + 1;
      });
      console.log(`BM ${bm}: ${JSON.stringify(counts)}`);
    })
  );
  const kill = (await get(ref(db, 'ext/killSwitch'))).val() as Record<
    string,
    boolean
  > | null;
  console.log(`Kill-switch: ${kill ? JSON.stringify(kill) : 'tắt'}`);
}

const main = async (): Promise<void> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      file: { type: 'string' },
      partner: { type: 'string' },
      select: { type: 'string' },
      action: { type: 'string' },
      mode: { type: 'string' },
      yes: { type: 'boolean' },
    },
  });
  const [command, arg, arg2] = positionals;
  const password = process.env.HPMA_OPS_PASSWORD;
  if (!command)
    fail(
      'thiếu lệnh (status | assign | scan | approve | cancel | janitor | kill | unkill)'
    );
  if (!password) fail('thiếu biến môi trường HPMA_OPS_PASSWORD');

  const app = initializeApp(firebaseConfig);
  const { user } = await signInWithEmailAndPassword(
    getAuth(app),
    process.env.HPMA_OPS_EMAIL ?? 'ops@hpma.com',
    password as string
  );
  const db = getDatabase(app);
  const args = (businessId: string) => ({
    businessId,
    uid: user.uid,
    createdAt: serverTimestamp(),
  });

  switch (command) {
    case 'status':
      await printStatus(db);
      break;
    case 'assign': {
      const businessId = requireBusinessId(arg);
      if (!values.file) fail('thiếu --file job.json');
      const config = parseAssignConfig(
        JSON.parse(readFileSync(values.file as string, 'utf8'))
      );
      const jobRef = push(ref(db, `ext/jobs/${businessId}`));
      await set(jobRef, buildAssignJob(config, args(businessId)));
      console.log(
        `Đã tạo job partner-assign ${jobRef.key} (dry) ở BM ${businessId}`
      );
      break;
    }
    case 'scan': {
      const businessId = requireBusinessId(arg);
      const jobRef = push(ref(db, `ext/jobs/${businessId}`));
      await set(
        jobRef,
        buildScanJob(parseScanPartner(values.partner), args(businessId))
      );
      console.log(
        `Đã tạo job requests.scan ${jobRef.key} (dry) ở BM ${businessId}`
      );
      break;
    }
    case 'approve': {
      const businessId = requireBusinessId(arg);
      const scanJobId = arg2 ?? fail('thiếu <scanJobId>');
      const job = ((
        await get(ref(db, `ext/jobs/${businessId}/${scanJobId}`))
      ).val() ??
        fail(`không thấy job ${scanJobId} ở BM ${businessId}`)) as ScanJobNode;
      if (job.flow !== 'requests.scan' || job.state?.status !== 'done')
        fail('job này không phải requests.scan đã `done`');
      const requests = job.state?.result?.scan?.requests;
      const partnerName =
        typeof job.config?.partnerName === 'string'
          ? job.config.partnerName
          : fail('job quét không có tên BM đối tác');
      if (!Array.isArray(requests) || requests.length === 0)
        fail(
          'kết quả quét trống hoặc đã bị dọn (PII chỉ giữ 24 giờ): hãy quét lại'
        );
      const list = requests as { requester: string; account: string }[];
      console.log(`Danh sách request chờ duyệt cho "${partnerName}":`);
      list.forEach((request, index) =>
        console.log(
          `  ${String(index + 1).padStart(2)}. ${request.requester} → ${request.account}`
        )
      );
      const action = await ask(
        values.action,
        'Hành động (approve | decline): '
      );
      if (action !== 'approve' && action !== 'decline')
        fail('action phải là approve hoặc decline');
      const selection = parseSelection(
        await ask(values.select, 'Chọn request (vd 1,3-5 hoặc all): '),
        list.length
      );
      const mode = values.mode ?? 'dry';
      if (mode !== 'dry' && mode !== 'full') fail('mode phải là dry hoặc full');
      console.log(
        `\nSẽ tạo job ${action} (${mode}) cho ${selection.length} request: ${selection.map((i) => i + 1).join(', ')}`
      );
      if (
        !values.yes &&
        (await ask(undefined, 'Xác nhận đã xem danh sách? (gõ "yes"): ')) !==
          'yes'
      )
        fail('đã huỷ, không tạo job');
      const jobRef = push(ref(db, `ext/jobs/${businessId}`));
      await set(
        jobRef,
        buildApproveJob({
          scan: { partnerName, requests: list },
          selection,
          action: action as 'approve' | 'decline',
          mode: mode as 'dry' | 'full',
          scanJobId,
          args: args(businessId),
        })
      );
      console.log(
        `Đã tạo job partner-approve ${jobRef.key} (${mode}) ở BM ${businessId}`
      );
      break;
    }
    case 'cancel': {
      const businessId = requireBusinessId(arg);
      const jobId = arg2 ?? fail('thiếu <jobId>');
      const node = (
        await get(ref(db, `ext/jobs/${businessId}/${jobId}`))
      ).val() as {
        state?: { status?: string };
      } | null;
      if (!node) fail(`không thấy job ${jobId} ở BM ${businessId}`);
      await set(
        ref(db, `ext/jobs/${businessId}/${jobId}/cancelRequested`),
        true
      );
      // Job còn pending thì chưa máy nào giữ nên không máy nào ghi được `state`: tự chốt cancelled (§5.3).
      if (node?.state?.status === 'pending')
        await update(ref(db, `ext/jobs/${businessId}/${jobId}/state`), {
          status: 'cancelled',
          finishedAt: serverTimestamp(),
        });
      console.log(
        node?.state?.status === 'pending'
          ? `Đã huỷ job ${jobId} (chưa máy nào giữ)`
          : `Đã yêu cầu huỷ job ${jobId} (đang ${node?.state?.status}): máy giữ job sẽ dừng ≤ 1 bước`
      );
      break;
    }
    case 'janitor': {
      const reports = await runJanitor(clientIo(db));
      reports.forEach((report) => {
        console.log(`BM ${report.bm}: ${report.actions.length} hành động`);
        report.actions.forEach((action) =>
          console.log(`  ${action.kind} ${action.jobId}`)
        );
        report.failed.forEach((failure) =>
          console.log(
            `  THẤT BẠI ${failure.action.kind} ${failure.action.jobId}: ${failure.error}`
          )
        );
      });
      if (reports.length === 0)
        console.log('Chưa có máy nào, không có BM để dọn.');
      break;
    }
    case 'kill':
    case 'unkill': {
      const scope = arg === undefined ? 'global' : requireBusinessId(arg);
      const killRef = ref(db, `ext/killSwitch/${scope}`);
      if (command === 'kill') await set(killRef, true);
      else await remove(killRef);
      console.log(
        `Kill-switch ${scope}: ${command === 'kill' ? 'BẬT' : 'đã gỡ'}`
      );
      break;
    }
    default:
      fail(`lệnh không biết: ${command}`);
  }
  await deleteApp(app);
  process.exit(0);
};

main().catch((error: unknown) => fail(String(error)));
