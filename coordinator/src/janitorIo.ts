/**
 * janitorIo.ts — hai bản thi hành `JanitorIo`: client SDK (đăng nhập bằng tài khoản ops, dùng cho `ops janitor`)
 * và Admin SDK với `databaseAuthVariableOverride` (coordinator, D14: Rules vẫn áp dụng như claim `coordinator`).
 */
import type { Database as AdminDatabase } from 'firebase-admin/database';
import type { JanitorIo } from './janitor';
import {
  Database,
  get,
  onValue,
  ref,
  remove,
  set,
  update,
} from 'firebase/database';

export type CoordinatorIo = JanitorIo & {
  readKillSwitch: () => Promise<Record<string, unknown> | null>;
  setBmKill: (bm: string) => Promise<void>;
};

// ---- Client SDK (ops) -------------------------------------------------------

export function clientIo(db: Database): CoordinatorIo {
  return {
    serverNow: () =>
      new Promise((resolve) => {
        const off = onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
          off();
          resolve(Date.now() + (snap.val() as number));
        });
      }),
    readMachines: async () =>
      ((await get(ref(db, 'ext/machines'))).val() ?? {}) as Awaited<
        ReturnType<JanitorIo['readMachines']>
      >,
    readJobs: async (bm) =>
      (await get(ref(db, `ext/jobs/${bm}`))).val() as Record<
        string,
        unknown
      > | null,
    updateState: (bm, jobId, patch) =>
      update(ref(db, `ext/jobs/${bm}/${jobId}/state`), patch),
    removePath: (path) => remove(ref(db, path)),
    readKillSwitch: async () =>
      (await get(ref(db, 'ext/killSwitch'))).val() as Record<
        string,
        unknown
      > | null,
    setBmKill: (bm) => set(ref(db, `ext/killSwitch/${bm}`), true),
  };
}

// ---- Admin SDK + override (coordinator) -------------------------------------

export function adminIo(db: AdminDatabase): CoordinatorIo {
  return {
    // Admin SDK không có `.info/serverTimeOffset`: dùng giờ máy (TTL tính bằng phút/giờ nên lệch giây không đáng kể).
    serverNow: async () => Date.now(),
    readMachines: async () =>
      ((await db.ref('ext/machines').get()).val() ?? {}) as Awaited<
        ReturnType<JanitorIo['readMachines']>
      >,
    readJobs: async (bm) =>
      (await db.ref(`ext/jobs/${bm}`).get()).val() as Record<
        string,
        unknown
      > | null,
    updateState: (bm, jobId, patch) =>
      db.ref(`ext/jobs/${bm}/${jobId}/state`).update(patch),
    removePath: (path) => db.ref(path).remove(),
    readKillSwitch: async () =>
      (await db.ref('ext/killSwitch').get()).val() as Record<
        string,
        unknown
      > | null,
    setBmKill: (bm) => db.ref(`ext/killSwitch/${bm}`).set(true),
  };
}
