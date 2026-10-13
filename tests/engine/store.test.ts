import type { AuditRow } from '@/shared/audit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  appendAudit,
  bumpWriteBudget,
  clearLastRun,
  LAST_RUN_KEY,
  loadGates,
  loadLogDetail,
  loadPacing,
  raiseEmergency,
  raiseRateLimit,
  saveLastRun,
} from '@/content/engine/store';
import {
  AUDIT_CHUNK_MAX,
  AUDIT_CURSOR_KEY,
  chunkKey,
  monthKey,
} from '@/shared/audit';
import {
  EMERGENCY_KEY,
  localDay,
  RATE_LIMIT_KEY,
  RATE_LIMIT_MS,
  WRITE_BUDGET_KEY,
} from '@/shared/budget';
import { createRun } from '@/shared/run';
import { DEVTEST_KEY, PACING_KEY } from '@/shared/settings';

import { storageState } from '../helpers/browserMock';

const NOW = new Date(2026, 2, 4, 12, 0, 0).getTime();
const row = (i: number): AuditRow => ({
  time: NOW,
  flow: 'partner-assign',
  bm: 'BM nguồn',
  target: `TKQC #${i}`,
  mode: 'assist',
  result: 'done',
  runId: 'run_aabbcc',
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('loadPacing / loadLogDetail', () => {
  it('đọc pacing qua parsePacing: giá trị dưới sàn bị kẹp', async () => {
    storageState.data[PACING_KEY] = { delayBaseSec: 0, writeExtraSec: 0 };
    const pacing = await loadPacing();
    expect(pacing.delayBaseSec).toBe(1);
    expect(pacing.writeExtraSec).toBe(2);
  });

  it('lỗi đọc storage thì dùng mặc định thay vì làm hỏng run', async () => {
    storageState.failGet = true;
    expect((await loadPacing()).delayBaseSec).toBe(3);
    expect(await loadLogDetail()).toBe('off');
  });

  it('logDetail đọc từ devtest, hết hạn 24 giờ thì về off', async () => {
    storageState.data[DEVTEST_KEY] = { logDetail: 'basic', logDetailAt: NOW };
    expect(await loadLogDetail()).toBe('basic');
    vi.setSystemTime(NOW + 25 * 3600 * 1000);
    expect(await loadLogDetail()).toBe('off');
  });
});

describe('loadGates', () => {
  it('mặc định: không khoá, 0 lượt ghi', async () => {
    expect(await loadGates(NOW)).toEqual({
      emergency: false,
      rateLimited: false,
      writesToday: 0,
    });
  });

  it('phản ánh khoá khẩn cấp, rate limit còn hạn và ngân sách hôm nay', async () => {
    storageState.data[EMERGENCY_KEY] = NOW - 1000;
    storageState.data[RATE_LIMIT_KEY] = NOW + 1000;
    storageState.data[WRITE_BUDGET_KEY] = { day: localDay(NOW), used: 5 };
    expect(await loadGates(NOW)).toEqual({
      emergency: true,
      rateLimited: true,
      writesToday: 5,
    });
  });

  it('rate limit hết hạn và ngân sách của ngày khác không còn tính', async () => {
    storageState.data[RATE_LIMIT_KEY] = NOW - 1;
    storageState.data[WRITE_BUDGET_KEY] = { day: '2020-01-01', used: 99 };
    expect(await loadGates(NOW)).toMatchObject({
      rateLimited: false,
      writesToday: 0,
    });
  });
});

describe('khoá và ngân sách (ghi)', () => {
  it('raiseEmergency ghi mốc thời gian; raiseRateLimit ghi now + 24h', async () => {
    await raiseEmergency(NOW);
    await raiseRateLimit(NOW);
    expect(storageState.data[EMERGENCY_KEY]).toBe(NOW);
    expect(storageState.data[RATE_LIMIT_KEY]).toBe(NOW + RATE_LIMIT_MS);
  });

  it('bumpWriteBudget cộng dồn trong ngày và reset sang ngày mới', async () => {
    await bumpWriteBudget(NOW);
    await bumpWriteBudget(NOW);
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(NOW),
      used: 2,
    });
    const tomorrow = NOW + 24 * 3600 * 1000;
    await bumpWriteBudget(tomorrow);
    expect(storageState.data[WRITE_BUDGET_KEY]).toEqual({
      day: localDay(tomorrow),
      used: 1,
    });
  });

  it('lỗi ghi storage không ném ra ngoài (fail-soft)', async () => {
    storageState.failSet = true;
    await expect(raiseEmergency(NOW)).resolves.toBeUndefined();
    await expect(raiseRateLimit(NOW)).resolves.toBeUndefined();
    await expect(bumpWriteBudget(NOW)).resolves.toBeUndefined();
    expect(storageState.data[EMERGENCY_KEY]).toBeUndefined();
  });
});

describe('appendAudit', () => {
  const ym = monthKey(NOW);

  it('không có dòng nào thì không ghi gì và trả true', async () => {
    expect(await appendAudit([], NOW)).toBe(true);
    expect(storageState.data).toEqual({});
  });

  it('lần đầu mở chunk 1 và đặt con trỏ', async () => {
    expect(await appendAudit([row(1)], NOW)).toBe(true);
    expect(storageState.data[chunkKey({ ym, n: 1 })]).toEqual([row(1)]);
    expect(storageState.data[AUDIT_CURSOR_KEY]).toEqual({ ym, n: 1 });
  });

  it('chỉ nối thêm vào chunk cuối, không sửa dòng cũ', async () => {
    await appendAudit([row(1)], NOW);
    await appendAudit([row(2), row(3)], NOW);
    expect(storageState.data[chunkKey({ ym, n: 1 })]).toEqual([
      row(1),
      row(2),
      row(3),
    ]);
  });

  it('chunk đầy thì sang chunk mới', async () => {
    const full = Array.from({ length: AUDIT_CHUNK_MAX }, (_, i) => row(i));
    await appendAudit(full, NOW);
    await appendAudit([row(999)], NOW);
    expect(storageState.data[AUDIT_CURSOR_KEY]).toEqual({ ym, n: 2 });
    expect(storageState.data[chunkKey({ ym, n: 1 })]).toHaveLength(
      AUDIT_CHUNK_MAX
    );
    expect(storageState.data[chunkKey({ ym, n: 2 })]).toEqual([row(999)]);
  });

  it('sang tháng mới thì mở chunk 1 của tháng đó', async () => {
    await appendAudit([row(1)], NOW);
    const nextMonth = new Date(2026, 3, 2, 12).getTime();
    await appendAudit([row(2)], nextMonth);
    expect(
      storageState.data[chunkKey({ ym: monthKey(nextMonth), n: 1 })]
    ).toEqual([row(2)]);
  });

  it('bỏ qua dòng hỏng có sẵn trong chunk cuối thay vì ghi lại', async () => {
    storageState.data[AUDIT_CURSOR_KEY] = { ym, n: 1 };
    storageState.data[chunkKey({ ym, n: 1 })] = [{ junk: true }, row(1)];
    await appendAudit([row(2)], NOW);
    expect(storageState.data[chunkKey({ ym, n: 1 })]).toEqual([row(1), row(2)]);
  });

  it('lỗi storage thì trả false (run đánh dấu auditFailed), không ném', async () => {
    storageState.failSet = true;
    expect(await appendAudit([row(1)], NOW)).toBe(false);
    storageState.failSet = false;
    storageState.failGet = true;
    expect(await appendAudit([row(1)], NOW)).toBe(false);
  });
});

describe('lastRun', () => {
  const run = createRun({
    mode: 'dry',
    scenario: 'done',
    config: {
      partnerBmId: '1451597353550362',
      accountIds: [],
      tasks: ['ANALYZE'],
    },
    diff: [],
    now: NOW,
  });

  it('saveLastRun / clearLastRun', async () => {
    await saveLastRun(run);
    expect(storageState.data[LAST_RUN_KEY]).toEqual(run);
    await clearLastRun();
    expect(storageState.data[LAST_RUN_KEY]).toBeUndefined();
  });

  it('lỗi storage không ném', async () => {
    storageState.failSet = true;
    await expect(saveLastRun(run)).resolves.toBeUndefined();
    await expect(clearLastRun()).resolves.toBeUndefined();
  });
});
