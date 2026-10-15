import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, serverTimestamp, set } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  buildAssignJob,
  buildScanJob,
  parseAssignConfig,
  parseScanPartner,
  requireBusinessId,
} from '../src/jobs';

const BM = '987654321098765';

describe('kiểm tra đầu vào ops (D3: cùng parser với engine)', () => {
  it('chấp nhận config assign hợp lệ', () => {
    const config = parseAssignConfig({
      partnerBmId: '1234567890123456',
      queries: ['SHOP LAN 1', '1234567890'],
      tasks: ['ADVERTISE', 'ANALYZE'],
    });
    expect(config.queries).toHaveLength(2);
  });

  it('từ chối config hỏng, BM sai, tên BM đối tác rỗng', () => {
    expect(() =>
      parseAssignConfig({ partnerBmId: 'abc', queries: [], tasks: [] })
    ).toThrow();
    expect(() => parseAssignConfig(null)).toThrow();
    expect(() => requireBusinessId('abc')).toThrow();
    expect(() => requireBusinessId(undefined)).toThrow();
    expect(requireBusinessId(BM)).toBe(BM);
    expect(() => parseScanPartner('   ')).toThrow();
    expect(() => parseScanPartner(undefined)).toThrow();
    expect(parseScanPartner('  BM A ')).toBe('BM A');
  });
});

describe('job do ops CLI dựng ra phải qua Rules thật', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-hpma',
      database: {
        rules: readFileSync(
          new URL('../database.rules.json', import.meta.url),
          'utf8'
        ),
        host: '127.0.0.1',
        port: 9000,
      },
    });
  });
  afterAll(async () => {
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearDatabase();
  });

  const ops = (): ReturnType<RulesTestEnvironment['authenticatedContext']> =>
    env.authenticatedContext('uid-ops', { ops: true });
  const args = { businessId: BM, uid: 'uid-ops', createdAt: serverTimestamp() };

  it('job partner-assign dry được ghi', async () => {
    const job = buildAssignJob(
      parseAssignConfig({
        partnerBmId: '1234567890123456',
        queries: ['A'],
        tasks: ['ADVERTISE'],
      }),
      args
    );
    await assertSucceeds(set(ref(ops().database(), `ext/jobs/${BM}/j1`), job));
  });

  it('job requests.scan dry được ghi', async () => {
    const job = buildScanJob('BM ĐỐI TÁC', args);
    await assertSucceeds(set(ref(ops().database(), `ext/jobs/${BM}/j2`), job));
  });

  it('job ghi vào nhánh BM khác với businessId trong job bị từ chối', async () => {
    const job = buildScanJob('BM ĐỐI TÁC', args);
    await assertFails(
      set(ref(ops().database(), 'ext/jobs/111111111111111/j3'), job)
    );
  });
});
