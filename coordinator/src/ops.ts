/**
 * ops — CLI tạo/giám sát job qua client SDK để Database Rules luôn áp dụng (SPEC-AUTO-001 §7.4, D15).
 * Đăng nhập bằng tài khoản có claim `ops` (HPMA_OPS_EMAIL mặc định ops@hpma.com, HPMA_OPS_PASSWORD).
 * Pha 1: assign, scan, status, kill, unkill. cancel/approve/janitor thuộc pha 2.
 *
 *   pnpm ops status
 *   pnpm ops assign <bm> --file job.json
 *   pnpm ops scan <bm> --partner "TÊN BM ĐỐI TÁC"
 *   pnpm ops kill [<bm>]      pnpm ops unkill [<bm>]
 */
import { readFileSync } from 'node:fs';
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
} from 'firebase/database';

import firebaseConfig from '@/shared/firebaseConfig';

import {
  buildAssignJob,
  buildScanJob,
  parseAssignConfig,
  parseScanPartner,
  requireBusinessId,
} from './jobs';

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
    const blocked = m.blockedReason ? ` (${m.blockedReason})` : '';
    console.log(
      [
        id,
        presence,
        m.flow,
        `bm=${m.businessId}`,
        `${m.status ?? '?'}${blocked}`,
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
    options: { file: { type: 'string' }, partner: { type: 'string' } },
  });
  const [command, arg] = positionals;
  const password = process.env.HPMA_OPS_PASSWORD;
  if (!command) fail('thiếu lệnh (status | assign | scan | kill | unkill)');
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
