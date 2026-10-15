import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { App, deleteApp, initializeApp } from 'firebase-admin/app';
import { Database, getDatabase } from 'firebase-admin/database';
import { get, ref, set } from 'firebase/database';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { runRound } from '../src/coordinator';
import { planHalts } from '../src/halt';
import {
  HEARTBEAT_STALE_MS,
  ORPHAN_TTL_MS,
  PII_TTL_MS,
  planJanitor,
  RETENTION_MS,
} from '../src/janitor';
import { adminIo } from '../src/janitorIo';

const BM = '987654321098765';
const MIN = 60_000;

describe('planJanitor (thuần)', () => {
  const now = 10 * RETENTION_MS;
  const stale = now - HEARTBEAT_STALE_MS - 1;
  const fresh = now - 1000;
  const plan = (
    jobs: Record<string, unknown>,
    heartbeats: Record<string, number | undefined>
  ) => planJanitor({ bm: BM, jobs, heartbeats, now });
  const job = (state: Record<string, unknown>) => ({ state });

  it('reclaim claimed mồ côi: mốc claimedAt cũ VÀ heartbeat cũ', () => {
    const jobs = {
      a: job({
        status: 'claimed',
        claimedBy: 'm1',
        claimedAt: now - ORPHAN_TTL_MS - 1,
      }),
    };
    expect(plan(jobs, { m1: stale })).toEqual([
      { kind: 'reclaim', bm: BM, jobId: 'a' },
    ]);
    // Máy còn heartbeat tươi thì tự reconcile được: không đụng.
    expect(plan(jobs, { m1: fresh })).toEqual([]);
    // Chưa đủ TTL thì không đụng dù máy chết.
    expect(
      plan(
        {
          a: job({ status: 'claimed', claimedBy: 'm1', claimedAt: now - MIN }),
        },
        { m1: stale }
      )
    ).toEqual([]);
  });

  it('running mồ côi → lost, không bao giờ về pending', () => {
    const jobs = {
      r: job({
        status: 'running',
        claimedBy: 'm1',
        claimedAt: now - 3 * ORPHAN_TTL_MS,
        progressAt: now - ORPHAN_TTL_MS - 1,
      }),
    };
    expect(plan(jobs, { m1: stale })).toEqual([
      { kind: 'lost', bm: BM, jobId: 'r' },
    ]);
    expect(plan(jobs, { m1: fresh })).toEqual([]);
  });

  it('máy không có heartbeat nào coi như chết', () => {
    const jobs = {
      a: job({
        status: 'claimed',
        claimedBy: 'ghost',
        claimedAt: now - ORPHAN_TTL_MS - 1,
      }),
    };
    expect(plan(jobs, {})).toHaveLength(1);
  });

  it('scrub PII quá 24 giờ, xoá job cuối quá 30 ngày, giữ job còn mới', () => {
    const jobs = {
      pii: job({
        status: 'done',
        finishedAt: now - PII_TTL_MS - 1,
        result: { scan: { requests: [] }, awaitingApproval: [], counts: {} },
      }),
      recent: job({
        status: 'done',
        finishedAt: now - MIN,
        result: { scan: { requests: [] } },
      }),
      old: job({ status: 'error', finishedAt: now - RETENTION_MS - 1 }),
      pending: job({ status: 'pending' }),
    };
    expect(plan(jobs, {})).toEqual([
      {
        kind: 'scrub',
        bm: BM,
        jobId: 'pii',
        fields: ['scan', 'awaitingApproval'],
      },
      { kind: 'delete', bm: BM, jobId: 'old' },
    ]);
  });
});

describe('planHalts', () => {
  it('chỉ BM có máy khoá vì sự cố, chưa bật kill-switch', () => {
    const machines = {
      a: { businessId: BM, status: 'blocked', blockedReason: 'checkpoint' },
      b: {
        businessId: '111111111111111',
        status: 'blocked',
        blockedReason: 'curfew',
      },
      c: { businessId: '222222222222222', status: 'idle', blockedReason: null },
      d: {
        businessId: '333333333333333',
        status: 'blocked',
        blockedReason: 'rate-limited',
      },
    };
    expect(planHalts(machines, null).sort()).toEqual(
      [BM, '333333333333333'].sort()
    );
    expect(planHalts(machines, { [BM]: true })).toEqual(['333333333333333']);
    expect(planHalts(machines, { global: true })).toEqual([]);
  });
});

describe('coordinator trên RTDB emulator (Admin SDK + override, Rules vẫn áp dụng)', () => {
  let env: RulesTestEnvironment;
  let app: App;
  let admin: Database;

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
    // `firebase emulators:exec` đặt FIREBASE_DATABASE_EMULATOR_HOST: Admin SDK tự trỏ vào emulator.
    app = initializeApp(
      {
        // Namespace của emulator = tên project (rules-unit-testing seed vào `demo-hpma`).
        databaseURL: 'https://demo-hpma.firebaseio.com',
        databaseAuthVariableOverride: {
          uid: 'coordinator',
          token: { coordinator: true },
        },
      },
      'janitor-test'
    );
    admin = getDatabase(app);
  });
  afterAll(async () => {
    await deleteApp(app);
    await env.cleanup();
  });
  beforeEach(async () => {
    await env.clearDatabase();
  });

  const seed = async (path: string, value: unknown): Promise<void> => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), path), value);
    });
  };
  const read = async (path: string): Promise<unknown> => {
    let value: unknown;
    await env.withSecurityRulesDisabled(async (ctx) => {
      value = (await get(ref(ctx.database(), path))).val();
    });
    return value;
  };
  const node = (state: Record<string, unknown>): Record<string, unknown> => ({
    flow: 'partner-assign',
    mode: 'dry',
    businessId: BM,
    config: {},
    createdAt: 1,
    createdBy: 'uid-ops',
    state,
  });
  const machine = (
    heartbeatAgo: number,
    extra: Record<string, unknown> = {}
  ) => ({
    businessId: BM,
    flow: 'partner-assign',
    status: 'idle',
    lastHeartbeatAt: Date.now() - heartbeatAgo,
    ...extra,
  });

  it('reclaim claimed mồ côi về pending và bỏ claimedBy', async () => {
    await seed('ext/machines/m1', machine(HEARTBEAT_STALE_MS + MIN));
    await seed(
      `ext/jobs/${BM}/j1`,
      node({
        status: 'claimed',
        claimedBy: 'm1',
        claimedAt: Date.now() - ORPHAN_TTL_MS - MIN,
      })
    );
    const round = await runRound(adminIo(admin));
    expect(round.reports[0].failed).toEqual([]);
    expect(await read(`ext/jobs/${BM}/j1/state`)).toEqual({
      status: 'pending',
    });
  });

  it('running mồ côi thành ERR_MACHINE_LOST, không về pending', async () => {
    await seed('ext/machines/m1', machine(HEARTBEAT_STALE_MS + MIN));
    await seed(
      `ext/jobs/${BM}/j1`,
      node({
        status: 'running',
        claimedBy: 'm1',
        claimedAt: Date.now() - 3 * ORPHAN_TTL_MS,
        progressAt: Date.now() - ORPHAN_TTL_MS - MIN,
      })
    );
    const round = await runRound(adminIo(admin));
    expect(round.reports[0].failed).toEqual([]);
    expect(await read(`ext/jobs/${BM}/j1/state`)).toMatchObject({
      status: 'error',
      claimedBy: 'm1',
      error: { code: 'ERR_MACHINE_LOST' },
    });
  });

  it('máy còn heartbeat tươi thì job không bị đụng', async () => {
    await seed('ext/machines/m1', machine(1000));
    await seed(
      `ext/jobs/${BM}/j1`,
      node({
        status: 'running',
        claimedBy: 'm1',
        claimedAt: Date.now() - 3 * ORPHAN_TTL_MS,
        progressAt: Date.now() - ORPHAN_TTL_MS - MIN,
      })
    );
    await runRound(adminIo(admin));
    expect(await read(`ext/jobs/${BM}/j1/state/status`)).toBe('running');
  });

  it('xoá PII quá 24 giờ và job cuối quá 30 ngày; giữ phần còn lại', async () => {
    await seed('ext/machines/m1', machine(1000));
    await seed(
      `ext/jobs/${BM}/pii`,
      node({
        status: 'done',
        finishedAt: Date.now() - PII_TTL_MS - MIN,
        result: {
          scan: { requests: [{ requester: 'R', account: 'A' }] },
          counts: { done: 1 },
        },
      })
    );
    await seed(
      `ext/jobs/${BM}/old`,
      node({ status: 'error', finishedAt: Date.now() - RETENTION_MS - MIN })
    );
    const round = await runRound(adminIo(admin));
    expect(round.reports[0].failed).toEqual([]);
    expect(await read(`ext/jobs/${BM}/pii/state/result`)).toEqual({
      counts: { done: 1 },
    });
    expect(await read(`ext/jobs/${BM}/old`)).toBeNull();
  });

  it('máy khoá vì checkpoint: coordinator bật killSwitch của BM đó', async () => {
    await seed(
      'ext/machines/m1',
      machine(1000, { status: 'blocked', blockedReason: 'checkpoint' })
    );
    const round = await runRound(adminIo(admin));
    expect(round.halted).toEqual([BM]);
    expect(await read(`ext/killSwitch/${BM}`)).toBe(true);
  });

  it('coordinator không ghi được killSwitch/global và không gỡ được kill-switch (override bị Rules cản)', async () => {
    await expect(
      admin.ref('ext/killSwitch/global').set(true)
    ).rejects.toThrow();
    await seed(`ext/killSwitch/${BM}`, true);
    await expect(
      admin.ref(`ext/killSwitch/${BM}`).set(false)
    ).rejects.toThrow();
    expect(await read(`ext/killSwitch/${BM}`)).toBe(true);
  });

  it('máy không ghi được killSwitch (chỉ ops/coordinator)', async () => {
    const machineCtx = env.authenticatedContext('uid-m1', {
      machineId: 'm1',
      bm: BM,
      flow: 'partner-assign',
    });
    await assertFails(
      set(ref(machineCtx.database(), `ext/killSwitch/${BM}`), true)
    );
  });
});
