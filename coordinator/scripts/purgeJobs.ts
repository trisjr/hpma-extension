/**
 * Xoá toàn bộ job của một BM bằng Admin SDK (Rules không cho ops xoá job). Dùng để dọn dữ liệu thử.
 * Không đụng `ext/machines` hay `killSwitch`.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json pnpm purge-jobs --bm <businessId>
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

import firebaseConfig from './firebaseConfig';

const BM_ID = /^\d{15,17}$/;

const main = async (): Promise<void> => {
  const { values } = parseArgs({ options: { bm: { type: 'string' } } });
  if (!values.bm || !BM_ID.test(values.bm)) {
    console.error('Lỗi: thiếu hoặc sai --bm <businessId>');
    process.exit(1);
  }
  const app = initializeApp({ databaseURL: firebaseConfig.databaseURL });
  const jobsRef = getDatabase(app).ref(`ext/jobs/${values.bm}`);
  const snapshot = await jobsRef.get();
  const ids = Object.keys(snapshot.val() ?? {});
  await jobsRef.remove();
  console.log(
    `Đã xoá ${ids.length} job của BM ${values.bm}: ${ids.join(', ')}`
  );
  process.exit(0);
};

main().catch((error: unknown) => {
  console.error(String(error));
  process.exit(1);
});
