/**
 * Cấp custom claims cho tài khoản Firebase Auth (SPEC-AUTO-001 §4.3, §8.2).
 * Chỉ Admin SDK gán được claim; script này chạy tay bằng service account, không nằm trong extension.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json pnpm claims --email a@b.c --role ops
 *   ... --role coordinator
 *   ... --role machine --machine-id <ULID> --bm <businessId> --flow partner-assign|partner-approve
 *
 * `setCustomUserClaims` thay toàn bộ claim cũ; user phải đăng nhập lại/refresh token để nhận claim mới.
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const FLOWS = ['partner-assign', 'partner-approve'] as const;
const ULID = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;
const BM_ID = /^\d{15,17}$/;

type Claims =
  | { ops: true }
  | { coordinator: true }
  | { machineId: string; bm: string; flow: (typeof FLOWS)[number] };

const fail = (message: string): never => {
  console.error(`Lỗi: ${message}`);
  process.exit(1);
};

const buildClaims = (values: {
  role?: string;
  'machine-id'?: string;
  bm?: string;
  flow?: string;
}): Claims => {
  if (values.role === 'ops') return { ops: true };
  // coordinator không kiêm ops (§8.2).
  if (values.role === 'coordinator') return { coordinator: true };
  if (values.role === 'machine') {
    const machineId = values['machine-id'] ?? '';
    const bm = values.bm ?? '';
    const flow = FLOWS.find((f) => f === values.flow);
    if (!ULID.test(machineId))
      return fail('--machine-id phải là ULID 26 ký tự');
    if (!BM_ID.test(bm)) return fail('--bm phải gồm 15–17 chữ số');
    if (!flow) return fail(`--flow phải là một trong: ${FLOWS.join(', ')}`);
    return { machineId, bm, flow };
  }
  return fail('--role phải là ops | coordinator | machine');
};

const main = async (): Promise<void> => {
  const { values } = parseArgs({
    options: {
      email: { type: 'string' },
      role: { type: 'string' },
      'machine-id': { type: 'string' },
      bm: { type: 'string' },
      flow: { type: 'string' },
    },
  });
  if (!values.email) fail('thiếu --email');
  const claims = buildClaims(values);

  // Credential lấy từ GOOGLE_APPLICATION_CREDENTIALS; khoá JSON nằm ngoài repo (§7.3.g).
  const auth = getAuth(initializeApp());
  const user = await auth.getUserByEmail(values.email as string);
  await auth.setCustomUserClaims(user.uid, claims);
  console.log(`Đã gán claim cho ${user.email} (${user.uid}):`, claims);
};

main().catch((error: unknown) => fail(String(error)));
