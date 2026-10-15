/**
 * Smoke test trên instance THẬT (SPEC-AUTO-001 §9 pha 0): xác nhận Auth + claim + Rules đã deploy.
 *
 *   HPMA_OPS_PASSWORD=... pnpm smoke          (email mặc định ops@hpma.com, đổi bằng HPMA_OPS_EMAIL)
 *
 * Ghi một job `requests.scan` dry vào nhánh BM thử, đọc lại, rồi xoá. Không chạm dữ liệu thật.
 */
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import {
  get,
  getDatabase,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database';

import config from './firebaseConfig';

// BM giả, không trùng BM thật nào: nhánh này chỉ dùng cho smoke test.
const SMOKE_BM = '999999999999999';

const email = process.env.HPMA_OPS_EMAIL ?? 'ops@hpma.com';
const password = process.env.HPMA_OPS_PASSWORD;

let failed = 0;
const check = (name: string, ok: boolean, detail = ''): void => {
  if (!ok) failed += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`
  );
};

const denied = async (action: Promise<unknown>): Promise<boolean> => {
  try {
    await action;
    return false;
  } catch (error) {
    return String(error).toLowerCase().includes('permission_denied');
  }
};

const main = async (): Promise<void> => {
  if (!password) {
    console.error('Thiếu biến môi trường HPMA_OPS_PASSWORD');
    process.exit(1);
  }
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getDatabase(app);

  const { user } = await signInWithEmailAndPassword(auth, email, password);
  // forceRefresh: lấy token mới để chắc chắn mang claim vừa gán.
  const token = await user.getIdTokenResult(true);
  check('token mang claim ops', token.claims.ops === true);
  check(
    'token không mang claim máy/coordinator',
    !token.claims.coordinator && !token.claims.machineId
  );

  const jobsRef = ref(db, `ext/jobs/${SMOKE_BM}`);
  const jobRef = push(jobsRef);
  const job = (mode: string): Record<string, unknown> => ({
    flow: 'requests.scan',
    mode,
    businessId: SMOKE_BM,
    config: { partnerName: 'SMOKE TEST' },
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    state: { status: 'pending' },
  });

  try {
    await set(jobRef, job('dry'));
    check('ops tạo được job dry', true);
    const snap = await get(jobRef);
    const value = snap.val() as {
      createdBy?: string;
      createdAt?: number;
    } | null;
    check('đọc lại job, createdBy = uid', value?.createdBy === user.uid);
    check(
      'createdAt là server timestamp',
      typeof value?.createdAt === 'number' && value.createdAt > 1.7e12
    );
  } catch (error) {
    check('ops tạo được job dry', false, String(error));
  }

  check(
    'mode full bị từ chối (D8)',
    await denied(set(push(jobsRef), job('full')))
  );
  check(
    'createdBy giả bị từ chối',
    await denied(
      set(push(jobsRef), { ...job('dry'), createdBy: 'someone-else' })
    )
  );
  check(
    'ghi ngoài nhánh ext bị từ chối',
    await denied(set(ref(db, 'user/smoke'), { x: 1 }))
  );
  check(
    'ops đọc được ext/machines',
    !(await denied(get(ref(db, 'ext/machines'))))
  );

  // Dọn: ops được xoá cả node job.
  try {
    await remove(jobRef);
    check('ops xoá được job thử', true);
  } catch (error) {
    check('ops xoá được job thử', false, String(error));
  }

  await deleteApp(app);
  console.log(failed === 0 ? '\nTất cả PASS' : `\n${failed} mục FAIL`);
  process.exit(failed === 0 ? 0 : 1);
};

main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(1);
});
