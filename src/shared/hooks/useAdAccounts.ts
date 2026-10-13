import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountPage, AccountsError } from '@/shared/adAccounts';
import type { AdAccount } from '@/shared/partnerAssign';
import browser from 'webextension-polyfill';

import {
  GRAPH_ORIGIN_PATTERN,
  isAccountsReply,
  isRecord,
} from '@/shared/adAccounts';

export type AdAccountsState = {
  status: 'loading' | 'ready' | 'error';
  accounts: AdAccount[];
  total: number;
  hasMore: boolean;
  // true: dữ liệu mẫu, chưa lấy từ BM thật.
  isSample: boolean;
  businessId?: string;
  error?: AccountsError;
  refresh?: () => void;
  loadMore?: () => void;
  // Xin quyền Graph (chỉ gọi từ click handler; xong thì tải lại).
  grantAccess?: () => void;
};

// Simulator giữ dữ liệu mẫu; engine thật đọc Graph API qua content script.
const SAMPLE_ACCOUNTS: AdAccount[] = [
  { id: 'act_238100451122', name: 'HPMA – Shop Lan 01', status: 'active' },
  { id: 'act_238100451187', name: 'HPMA – Shop Lan 02', status: 'active' },
  { id: 'act_771203348810', name: 'Tenomad – Spa Hoa', status: 'active' },
  { id: 'act_771203349902', name: 'Tenomad – Nha khoa An', status: 'active' },
  {
    id: 'act_771203350014',
    name: 'Tenomad – BĐS Phú Mỹ',
    status: 'restricted',
  },
];

const SAMPLE_STATE: AdAccountsState = {
  status: 'ready',
  accounts: SAMPLE_ACCOUNTS,
  total: SAMPLE_ACCOUNTS.length,
  hasMore: false,
  isSample: true,
};

const EMPTY_STATE: AdAccountsState = {
  status: 'loading',
  accounts: [],
  total: 0,
  hasMore: false,
  isSample: false,
};

export default function useAdAccounts(
  tabId: number | undefined,
  enabled: boolean,
  sample: boolean
): AdAccountsState {
  const [state, setState] = useState<AdAccountsState>(EMPTY_STATE);
  const nextPage = useRef<AccountPage | undefined>(undefined);
  const generation = useRef(0);
  const pending = useRef(false);
  const loaded = useRef(false);

  const read = useCallback(
    async (append = false): Promise<void> => {
      if (sample || tabId === undefined || pending.current) return;
      const page = append ? nextPage.current : undefined;
      if (append && !page) return;
      const requestGeneration = generation.current;
      pending.current = true;
      setState((previous) => ({
        ...(append ? previous : EMPTY_STATE),
        status: 'loading',
        error: undefined,
      }));
      try {
        // Chưa có quyền Graph thì dừng trước khi trích token: không có quyền thì token vô dụng.
        const granted = await browser.permissions.contains({
          origins: [GRAPH_ORIGIN_PATTERN],
        });
        if (!granted) {
          if (generation.current === requestGeneration)
            setState((previous) => ({
              ...previous,
              status: 'error',
              error: 'access',
            }));
          return;
        }
        const reply: unknown = await browser.tabs.sendMessage(tabId, {
          kind: 'accounts.read',
          page,
        });
        if (generation.current !== requestGeneration) return;
        if (!isAccountsReply(reply) || !reply.ok) {
          setState((previous) => ({
            ...previous,
            status: 'error',
            error:
              isAccountsReply(reply) && !reply.ok ? reply.error : 'response',
          }));
          return;
        }
        loaded.current = true;
        nextPage.current = reply.next;
        setState((previous) => {
          const accounts = [
            ...new Map(
              [...(append ? previous.accounts : []), ...reply.accounts].map(
                (account) => [account.id, account]
              )
            ).values(),
          ];
          return {
            status: 'ready',
            accounts,
            total: accounts.length,
            hasMore: !!reply.next,
            isSample: false,
            businessId: reply.businessId,
          };
        });
      } catch {
        if (generation.current === requestGeneration)
          setState((previous) => ({
            ...previous,
            status: 'error',
            error: 'network',
          }));
      } finally {
        if (generation.current === requestGeneration) pending.current = false;
      }
    },
    [sample, tabId]
  );

  useEffect(() => {
    generation.current += 1;
    loaded.current = false;
    pending.current = false;
    nextPage.current = undefined;
    setState(EMPTY_STATE);
    return () => {
      generation.current += 1;
    };
  }, [tabId, sample]);

  useEffect(() => {
    if (enabled && tabId === undefined) {
      setState({ ...EMPTY_STATE, status: 'error', error: 'network' });
      return;
    }
    if (enabled && !loaded.current) read().catch(() => undefined);
  }, [enabled, read, tabId]);

  useEffect(() => {
    const invalidate = (): void => {
      generation.current += 1;
      pending.current = false;
      loaded.current = false;
      nextPage.current = undefined;
      setState(EMPTY_STATE);
    };
    const onScopeChanged = (
      message: unknown,
      sender: browser.Runtime.MessageSender
    ): undefined => {
      if (
        sender.id === browser.runtime.id &&
        sender.tab?.id === tabId &&
        isRecord(message) &&
        message.kind === 'accounts.changed'
      ) {
        invalidate();
        if (enabled) read().catch(() => undefined);
      }
      return undefined;
    };
    const onUpdated = (
      id: number,
      change: browser.Tabs.OnUpdatedChangeInfoType
    ): void => {
      if (id !== tabId) return;
      if (change.status === 'complete') {
        if (enabled && !loaded.current) read().catch(() => undefined);
        return;
      }
      if (!change.url && change.status !== 'loading') return;
      invalidate();
      if (enabled && change.status !== 'loading') read().catch(() => undefined);
    };
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.runtime.onMessage.addListener(onScopeChanged);
    return () => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.runtime.onMessage.removeListener(onScopeChanged);
    };
  }, [tabId, enabled, read]);

  return sample
    ? SAMPLE_STATE
    : {
        ...state,
        refresh: () => {
          read().catch(() => undefined);
        },
        loadMore: () => {
          read(true).catch(() => undefined);
        },
        // Không `await` trước `permissions.request`: Firefox mất user gesture sau await.
        grantAccess: () => {
          browser.permissions
            .request({ origins: [GRAPH_ORIGIN_PATTERN] })
            .then((granted) => {
              if (granted) read().catch(() => undefined);
              return granted;
            })
            .catch(() => undefined);
        },
      };
}
