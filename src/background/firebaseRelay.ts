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

import firebaseConfig from '@/shared/firebaseConfig';
import { getMachineId } from '@/shared/machineId';
import { isLocationReply } from '@/shared/messaging';
import { isRemoteCommand } from '@/shared/remoteMessages';

import {
  badgeText,
  deriveProvision,
  MachineClaims,
  pendingJobsFor,
  readClaims,
} from './relayLogic';

const HEARTBEAT_ALARM = 'firebase-heartbeat';
const HEARTBEAT_PERIOD_MIN = 1;
const JOBS_KEY = 'remote:jobs';
const STATUS_KEY = 'remote:status';

type Persisted = { lastHeartbeatAt?: number; lastError?: string };

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Database | undefined;
let connectedWritten = false;
let unsubscribeJobs: (() => void) | undefined;
let subscribedKey: string | undefined;

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
      publishJobs(pendingJobsFor(raw, claims)).catch(() => undefined);
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
    await publishJobs([]);
    return;
  }
  const { db: database } = sdk();
  try {
    await update(ref(database, `ext/machines/${machineId}`), {
      ...(connectedWritten ? {} : { connectedAt: serverTimestamp() }),
      lastHeartbeatAt: serverTimestamp(),
      flow: claims.flow,
      businessId: claims.bm,
      // Pha 1 không chạy job nên luôn rảnh; busy/blocked thuộc dispatcher (pha 2).
      status: 'idle',
      extensionVersion: browser.runtime.getManifest().version,
    });
    connectedWritten = true;
    await writePersisted({ lastHeartbeatAt: Date.now(), lastError: undefined });
  } catch (error) {
    await writePersisted({ lastError: String(error) });
  }
  listenJobs(claims);
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
  // SW vừa khởi động (cài mới, Chrome mở lại, SW thức dậy do event): bảo đảm alarm tồn tại và chạy một nhịp ngay.
  ensureAlarm().catch(() => undefined);
  tick().catch(() => undefined);
}
