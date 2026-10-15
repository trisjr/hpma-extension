/**
 * coordinator — vòng lặp nền của SPEC-AUTO-001 (D14, pha 2): janitor (reclaim job mồ côi, xoá PII 24 giờ, xoá job
 * cuối 30 ngày) và tự dừng BM khi có sự cố (N = 1). Chạy bằng CLI trên máy anh; máy tắt thì dừng, dữ liệu không mất.
 * Khởi tạo Admin SDK với `databaseAuthVariableOverride` mang claim `coordinator`: Database Rules vẫn áp dụng, nên
 * khoá service account không cho coordinator quyền nào ngoài những gì Rules cấp cho vai trò này.
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.config/hpma/firebase-admin.json pnpm coordinator once
 *   GOOGLE_APPLICATION_CREDENTIALS=… pnpm coordinator watch [--interval 60]
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

import firebaseConfig from '../scripts/firebaseConfig';
import { planHalts } from './halt';
import { JanitorReport, runJanitor } from './janitor';
import { adminIo, CoordinatorIo } from './janitorIo';

export type RoundReport = { reports: JanitorReport[]; halted: string[] };

// Một vòng: janitor rồi tự dừng BM có máy khoá vì sự cố.
export async function runRound(io: CoordinatorIo): Promise<RoundReport> {
  const reports = await runJanitor(io);
  const halted = planHalts(await io.readMachines(), await io.readKillSwitch());
  for (let i = 0; i < halted.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await io.setBmKill(halted[i]);
  }
  return { reports, halted };
}

function log(round: RoundReport): void {
  const stamp = new Date().toISOString();
  round.reports.forEach((report) => {
    if (report.actions.length > 0)
      console.log(
        `${stamp} BM ${report.bm}: ${report.actions
          .map((action) => `${action.kind}:${action.jobId}`)
          .join(', ')}`
      );
    report.failed.forEach((failure) =>
      console.error(
        `${stamp} BM ${report.bm}: ${failure.action.kind}:${failure.action.jobId} thất bại: ${failure.error}`
      )
    );
  });
  round.halted.forEach((bm) =>
    console.log(`${stamp} BM ${bm}: bật kill-switch (máy khoá vì sự cố)`)
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const main = async (): Promise<void> => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { interval: { type: 'string' } },
  });
  const [command] = positionals;
  if (command !== 'once' && command !== 'watch') {
    console.error('Lỗi: dùng `coordinator once` hoặc `coordinator watch`');
    process.exit(1);
  }
  const app = initializeApp({
    databaseURL: firebaseConfig.databaseURL,
    databaseAuthVariableOverride: {
      uid: 'coordinator',
      token: { coordinator: true },
    },
  });
  const io = adminIo(getDatabase(app));
  if (command === 'once') {
    log(await runRound(io));
    process.exit(0);
  }
  const intervalMs = Math.max(10, Number(values.interval ?? 60)) * 1000;
  console.log(`coordinator watch: vòng lặp ${intervalMs / 1000} giây`);
  for (;;) {
    try {
      // eslint-disable-next-line no-await-in-loop
      log(await runRound(io));
    } catch (error) {
      console.error(`${new Date().toISOString()} vòng lỗi: ${String(error)}`);
    }
    // eslint-disable-next-line no-await-in-loop
    await sleep(intervalMs);
  }
};

// Chỉ chạy CLI khi được gọi trực tiếp; test import `runRound` mà không kích hoạt.
if (process.argv[1]?.endsWith('coordinator.ts')) {
  main().catch((error: unknown) => {
    console.error(String(error));
    process.exit(1);
  });
}
