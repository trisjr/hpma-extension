import { useCallback, useEffect, useState } from 'react';
import type { RemoteProbeReply, RemoteStatus } from '@/shared/remoteMessages';
import browser from 'webextension-polyfill';

import { isRemoteProbeReply, isRemoteStatus } from '@/shared/remoteMessages';

const REFRESH_MS = 10_000;

export type RemoteApi = {
  // Kênh từ xa chỉ có ở bản Chrome (quyền `alarms`, Q7).
  supported: boolean;
  loading: boolean;
  status: RemoteStatus | undefined;
  // Không liên lạc được service worker (đang khởi động hoặc bị lỗi).
  unreachable: boolean;
  busy: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  probeTab: () => Promise<RemoteProbeReply | undefined>;
  // Gỡ khoá rate-limit (engine + lịch sự cố của dispatcher); true khi service worker xác nhận.
  unlockRateLimit: () => Promise<boolean>;
};

const isSupported = (): boolean =>
  browser.runtime.getManifest().permissions?.includes('alarms') === true;

export default function useRemote(): RemoteApi {
  const supported = isSupported();
  const [status, setStatus] = useState<RemoteStatus | undefined>();
  const [unreachable, setUnreachable] = useState(false);
  const [loading, setLoading] = useState(supported);
  const [busy, setBusy] = useState(false);

  const apply = useCallback((reply: unknown): void => {
    if (isRemoteStatus(reply)) {
      setStatus(reply);
      setUnreachable(false);
    } else {
      setUnreachable(true);
    }
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const reply: unknown = await browser.runtime
      .sendMessage({ kind: 'remote.status' })
      .catch(() => undefined);
    apply(reply);
    setLoading(false);
  }, [apply]);

  useEffect(() => {
    if (!supported) return undefined;
    refresh().catch(() => undefined);
    const timer = window.setInterval(() => {
      refresh().catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [supported, refresh]);

  const run = useCallback(async (message: unknown): Promise<unknown> => {
    setBusy(true);
    try {
      return await browser.runtime.sendMessage(message).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      apply(await run({ kind: 'remote.signIn', email, password }));
    },
    [apply, run]
  );

  const signOut = useCallback(async (): Promise<void> => {
    apply(await run({ kind: 'remote.signOut' }));
  }, [apply, run]);

  const probeTab = useCallback(async (): Promise<
    RemoteProbeReply | undefined
  > => {
    const reply = await run({ kind: 'remote.probeTab' });
    return isRemoteProbeReply(reply) ? reply : undefined;
  }, [run]);

  const unlockRateLimit = useCallback(async (): Promise<boolean> => {
    const reply = await run({ kind: 'remote.unlockRateLimit' });
    apply(reply);
    return isRemoteStatus(reply);
  }, [apply, run]);

  return {
    unlockRateLimit,
    supported,
    loading,
    status,
    unreachable,
    busy,
    signIn,
    signOut,
    probeTab,
  };
}
