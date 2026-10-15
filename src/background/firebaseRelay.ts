/**
 * firebaseRelay.ts — kết nối service worker với Firebase RTDB (SPEC-AUTO-001 §3, §6). Pha 1: chỉ
 * heartbeat + listen job chỉ đọc (badge + storage.session), KHÔNG claim, KHÔNG đổi trạng thái job.
 *
 * Mọi listener đăng ký ĐỒNG BỘ ở top-level (registerRelay) trước mọi `await` Firebase, nếu không event
 * đánh thức SW bị bỏ lỡ (§5.5.6). SDK chỉ khởi tạo lười, lần đầu có việc cần làm.
 * Chrome-only: bản Firefox alias `@relay` sang firebaseRelay.noop.ts (vite.config.ts, Q7).
 */
import type { RemoteJob } from '@/shared/remoteJob';
import type {
  ProbedTab,
  RemoteCommand,
  RemoteProbeReply,
  RemoteStatus,
} from '@/shared/remoteMessages';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  indexedDBLocalPersistence,
  initializeAuth,
  signInWithEmailAndPassword,
} from 'firebase/auth/web-extension';
import {
  Database,
  equalTo,
  forceWebSockets,
  getDatabase,
  onValue,
  orderByChild,
  query,
  ref,
  serverTimestamp,
  update,
} from 'firebase/database';
import browser from 'webextension-polyfill';

import { EMERGENCY_KEY, RATE_LIMIT_KEY } from '@/shared/budget';
import firebaseConfig from '@/shared/firebaseConfig';
import { getMachineId } from '@/shared/machineId';
import { isLocationReply, isRunEvent } from '@/shared/messaging';
import { parseProbeReports, PROBE_STORAGE_KEY } from '@/shared/probe';
import { isRemoteCommand } from '@/shared/remoteMessages';
import {
  PACING_KEY,
  parsePacing,
  parseRemoteSettings,
  REMOTE_KEY,
} from '@/shared/settings';

import { DISPATCH_KEY, parseMemory } from './dispatchMemory';
import createDispatcher, { Dispatcher, machinePatchOf } from './jobDispatcher';
import createJobStore from './jobStore';
import tabDriver from './jobTabs';
import {
  badgeText,
  deriveProvision,
  MachineClaims,
  pendingEnvelopesFor,
  pendingJobsFor,
  readClaims,
} from './relayLogic';

const HEARTBEAT_ALARM = 'firebase-heartbeat';
const HEARTBEAT_PERIOD_MIN = 1;
const JOBS_KEY = 'remote:jobs';
// Job đang chạy của máy này, popup đọc để hiện kèm tiến độ (khoá trùng với useActiveRemoteJob).
const ACTIVE_KEY = 'remote:active';
// Trạng thái máy (idle/busy/blocked + lý do), popup đọc (khoá trùng với useMachineBlock).
const MACHINE_KEY = 'remote:machine';
const STATUS_KEY = 'remote:status';

type Persisted = { lastHeartbeatAt?: number; lastError?: string };

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Database | undefined;
let connectedWritten = false;
let unsubscribeJobs: (() => void) | undefined;
let subscribedKey: string | undefined;
let dispatcher: Dispatcher | undefined;
let dispatcherKey: string | undefined;
let unwatchKill: (() => void) | undefined;

function sdk(): { auth: Auth; db: Database } {
  if (!app || !auth || !db) {
    app = initializeApp(firebaseConfig);
    // getAuth() mặc định dùng localStorage — không có trong SW; web-extension + IndexedDB giữ phiên qua các lần SW chết.
    auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
    // SW không có DOM: ép WebSocket để transport long-poll (JSONP, tạo thẻ script) không bao giờ được dùng.
    forceWebSockets();
    db = getDatabase(app);
  }
  return { auth, db };
}

async function readPersisted(): Promise<Persisted> {
  const stored = await browser.storage.session.get(STATUS_KEY);
  const value: unknown = stored[STATUS_KEY];
  return typeof value === 'object' && value !== null
    ? (value as Persisted)
    : {};
}

async function writePersisted(patch: Persisted): Promise<void> {
  const current = await readPersisted();
  await browser.storage.session.set({ [STATUS_KEY]: { ...current, ...patch } });
}

async function readJobs(): Promise<RemoteJob[]> {
  const stored = await browser.storage.session.get(JOBS_KEY);
  const value: unknown = stored[JOBS_KEY];
  return Array.isArray(value) ? (value as RemoteJob[]) : [];
}

async function publishJobs(jobs: RemoteJob[]): Promise<void> {
  await browser.storage.session.set({ [JOBS_KEY]: jobs });
  await browser.action.setBadgeText({ text: badgeText(jobs.length) });
}

function stopListening(): void {
  unsubscribeJobs?.();
  unsubscribeJobs = undefined;
  subscribedKey = undefined;
}

function disposeDispatcher(): void {
  unwatchKill?.();
  unwatchKill = undefined;
  dispatcher = undefined;
  dispatcherKey = undefined;
  browser.storage.session
    .remove([ACTIVE_KEY, MACHINE_KEY])
    .catch(() => undefined);
}

// Khoá an toàn cục bộ do engine giữ (emergency/rate-limit) cùng cấu hình pacing: dispatcher đọc trước mỗi lần claim.
async function readLocks(): Promise<{
  emergency: unknown;
  rateLimitedUntil: unknown;
  curfew: ReturnType<typeof parsePacing>['curfew'];
  writesPerDay: number;
  fullCap: number | undefined;
}> {
  const stored = await browser.storage.local
    .get([EMERGENCY_KEY, RATE_LIMIT_KEY, PACING_KEY, REMOTE_KEY])
    .catch(() => ({}) as Record<string, unknown>);
  const pacing = parsePacing(stored[PACING_KEY]);
  return {
    fullCap: parseRemoteSettings(stored[REMOTE_KEY]).fullJobsPerDay,
    emergency: stored[EMERGENCY_KEY],
    rateLimitedUntil: stored[RATE_LIMIT_KEY],
    curfew: pacing.curfew,
    // Engine kiểm ngân sách theo hàng `standard` (controller.ts), dispatcher dùng cùng con số.
    writesPerDay: pacing.limits.standard.writesPerDay,
  };
}

// Dispatcher gắn với danh tính máy (claim): đổi máy/BM/flow thì dựng lại.
function ensureDispatcher(claims: MachineClaims): Dispatcher {
  const key = `${claims.machineId}/${claims.bm}/${claims.flow}`;
  if (dispatcher && dispatcherKey === key) return dispatcher;
  disposeDispatcher();
  const { db: database } = sdk();
  const store = createJobStore(database, claims);
  const created = createDispatcher({
    now: () => Date.now(),
    machineId: claims.machineId,
    businessId: claims.bm,
    flow: claims.flow,
    ...store,
    publishActive: async (active) => {
      if (active) await browser.storage.session.set({ [ACTIVE_KEY]: active });
      else await browser.storage.session.remove(ACTIVE_KEY);
    },
    publishMachine: async (patch) => {
      await browser.storage.session.set({ [MACHINE_KEY]: patch });
    },
    readLocks,
    readProbe: async () => {
      const stored = await browser.storage.local
        .get(PROBE_STORAGE_KEY)
        .catch(() => ({}) as Record<string, unknown>);
      return parseProbeReports(stored[PROBE_STORAGE_KEY]);
    },
    loadMemory: async () => {
      const stored = await browser.storage.local.get(DISPATCH_KEY);
      return parseMemory(stored[DISPATCH_KEY]);
    },
    saveMemory: async (memory) => {
      await browser.storage.local.set({ [DISPATCH_KEY]: memory });
    },
    tabs: tabDriver,
    onError: (error) => {
      writePersisted({ lastError: String(error) }).catch(() => undefined);
    },
  });
  // Subscription gắn theo từng dispatcher: snapshot đầu tiên luôn về đúng instance vừa dựng. Listener chết thì
  // kill-switch thành "chưa biết" (đóng), không giữ giá trị cũ.
  unwatchKill = store.watchKill(
    (flags) => created.setKill(flags),
    () => created.killLost()
  );
  dispatcher = created;
  dispatcherKey = key;
  return created;
}

// Pha 1: chỉ đọc. Listen đúng nhánh BM của máy (D10), job `pending`, lọc theo flow chấp nhận ở client.
function listenJobs(claims: MachineClaims): void {
  const key = `${claims.bm}/${claims.flow}`;
  if (subscribedKey === key) return;
  stopListening();
  subscribedKey = key;
  const { db: database } = sdk();
  const pending = query(
    ref(database, `ext/jobs/${claims.bm}`),
    orderByChild('state/status'),
    equalTo('pending')
  );
  unsubscribeJobs = onValue(
    pending,
    (snapshot) => {
      const raw = snapshot.val() as Record<string, unknown> | null;
      // Danh sách hiển thị (badge/panel) chỉ gồm job hợp lệ; dispatcher nhận cả job sai config để chốt ERR_JOB_INVALID.
      publishJobs(pendingJobsFor(raw, claims)).catch(() => undefined);
      dispatcher?.setPending(pendingEnvelopesFor(raw, claims));
    },
    (error) => {
      writePersisted({ lastError: error.message }).catch(() => undefined);
    }
  );
}

async function currentClaims(): Promise<{
  email?: string;
  claims?: MachineClaims;
  signedIn: boolean;
}> {
  const { auth: firebaseAuth } = sdk();
  await firebaseAuth.authStateReady();
  const user = firebaseAuth.currentUser;
  if (!user) return { signedIn: false };
  const token = await user.getIdTokenResult();
  return {
    signedIn: true,
    email: user.email ?? undefined,
    claims: readClaims(token.claims),
  };
}

// Một nhịp: kiểm danh tính → ghi heartbeat → (đảm bảo) đang listen job. Gọi từ alarm và sau khi đăng nhập.
async function tick(): Promise<void> {
  const machineId = await getMachineId();
  const { signedIn, claims } = await currentClaims();
  const provision = deriveProvision(signedIn, claims, machineId);
  if (provision !== 'ok' || !claims) {
    stopListening();
    disposeDispatcher();
    await publishJobs([]);
    return;
  }
  const { db: database } = sdk();
  const active = ensureDispatcher(claims);
  try {
    await update(ref(database, `ext/machines/${machineId}`), {
      ...(connectedWritten ? {} : { connectedAt: serverTimestamp() }),
      lastHeartbeatAt: serverTimestamp(),
      flow: claims.flow,
      businessId: claims.bm,
      // busy/blocked + lý do + job đang giữ do dispatcher quyết định (§4.1).
      ...machinePatchOf(active.view()),
      extensionVersion: browser.runtime.getManifest().version,
    });
    connectedWritten = true;
    await writePersisted({ lastHeartbeatAt: Date.now(), lastError: undefined });
  } catch (error) {
    await writePersisted({ lastError: String(error) });
  }
  listenJobs(claims);
  // Sau heartbeat: reconcile lần đầu, chốt run kết thúc bị lỡ event, thoát khoá, start lại job giữ chờ.
  await active.tick().catch((error: unknown) => {
    writePersisted({ lastError: String(error) }).catch(() => undefined);
  });
}

async function buildStatus(): Promise<RemoteStatus> {
  const machineId = await getMachineId();
  const { signedIn, email, claims } = await currentClaims();
  const persisted = await readPersisted();
  return {
    kind: 'remote.status.reply',
    machineId,
    provision: deriveProvision(signedIn, claims, machineId),
    email,
    flow: claims?.flow,
    businessId: claims?.bm,
    lastHeartbeatAt: persisted.lastHeartbeatAt,
    lastError: persisted.lastError,
    pendingJobs: (await readJobs()).length,
  };
}

// Spike §5.5: không có quyền `tabs` nên hỏi từng tab bằng `location.read`; tab không có content script thì lỗi và bị bỏ qua.
async function probeTabs(): Promise<RemoteProbeReply> {
  const { claims } = await currentClaims();
  const all = await browser.tabs.query({});
  const found: ProbedTab[] = [];
  await Promise.all(
    all.map(async (tab) => {
      if (tab.id === undefined) return;
      const reply: unknown = await browser.tabs
        .sendMessage(tab.id, { kind: 'location.read' })
        .catch(() => undefined);
      if (isLocationReply(reply))
        found.push({
          tabId: tab.id,
          pathname: reply.pathname,
          businessId: reply.businessId,
        });
    })
  );
  return {
    kind: 'remote.probe.reply',
    tabs: found,
    matched: found.some((tab) => tab.businessId === claims?.bm),
  };
}

async function ensureAlarm(): Promise<void> {
  const existing = await browser.alarms.get(HEARTBEAT_ALARM);
  if (!existing)
    browser.alarms.create(HEARTBEAT_ALARM, {
      periodInMinutes: HEARTBEAT_PERIOD_MIN,
    });
}

async function handleCommand(message: RemoteCommand): Promise<unknown> {
  switch (message.kind) {
    case 'remote.signIn': {
      try {
        await signInWithEmailAndPassword(
          sdk().auth,
          message.email,
          message.password
        );
        // Claim mới chỉ có trong token mới: ép làm mới để nhận claim vừa gán.
        await sdk().auth.currentUser?.getIdToken(true);
        await writePersisted({ lastError: undefined });
        await tick();
      } catch (error) {
        // Chỉ ghi mã lỗi (auth/...), không ghi email/mật khẩu.
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : 'auth/unknown';
        await writePersisted({ lastError: code });
      }
      return buildStatus();
    }
    case 'remote.signOut': {
      stopListening();
      disposeDispatcher();
      await sdk().auth.signOut();
      connectedWritten = false;
      await publishJobs([]);
      await writePersisted({
        lastHeartbeatAt: undefined,
        lastError: undefined,
      });
      return buildStatus();
    }
    case 'remote.probeTab':
      return probeTabs();
    default:
      return buildStatus();
  }
}

export default function registerRelay(): void {
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) tick().catch(() => undefined);
  });
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: browser.Runtime.MessageSender) => {
      // Chỉ extension page (Options/popup/panel), không content script: URL người gửi thuộc extension.
      if (
        sender.id !== browser.runtime.id ||
        sender.url?.startsWith(browser.runtime.getURL('')) !== true ||
        !isRemoteCommand(message)
      )
        return undefined;
      return handleCommand(message);
    }
  );
  // Sự kiện tiến độ run từ content script (đánh thức SW, nên phải đăng ký đồng bộ ở top-level, §5.5.6). Event tới
  // khi dispatcher chưa dựng thì bị bỏ: `run.sync` theo alarm là nguồn sự thật cho trạng thái cuối.
  browser.runtime.onMessage.addListener(
    (message: unknown, sender: browser.Runtime.MessageSender) => {
      if (
        sender.id !== browser.runtime.id ||
        sender.tab === undefined ||
        !isRunEvent(message)
      )
        return undefined;
      dispatcher?.onRunEvent(message.run, sender.tab.id);
      return undefined;
    }
  );
  // SW vừa khởi động (cài mới, Chrome mở lại, SW thức dậy do event): bảo đảm alarm tồn tại và chạy một nhịp ngay.
  ensureAlarm().catch(() => undefined);
  tick().catch(() => undefined);
}
