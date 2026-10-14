import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ApproveRequest,
  RequestsError,
  RequestsRead,
} from '@/shared/approve';
import browser from 'webextension-polyfill';

import { isRequestsReply } from '@/shared/approve';

import ensureSurface from './ensureSurface';

export type ScanState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | {
      status: 'ok';
      // Tên BM tại lúc quét: đổi tên sau đó thì kết quả cũ không còn dùng được.
      partnerName: string;
      businessId: string;
      requests: ApproveRequest[];
    }
  | { status: 'error'; error: RequestsError };

// Quét chỉ-đọc danh sách Needs review: đưa tab tới trang Requests (nếu chưa ở đó) rồi gửi
// `requests.read`. Không gửi gì tới tab khi `enabled` tắt (simulator, flow chưa mở).
export default function useRequestsScan(
  tabId: number | undefined,
  enabled: boolean
): {
  state: ScanState;
  scan: (partnerName: string) => void;
  reset: () => void;
} {
  const [state, setState] = useState<ScanState>({ status: 'idle' });
  // Bỏ kết quả của lần quét đã bị thay bằng lần quét mới hoặc đã huỷ.
  const generation = useRef(0);

  useEffect(
    () => () => {
      generation.current += 1;
    },
    []
  );

  const reset = useCallback(() => {
    generation.current += 1;
    setState({ status: 'idle' });
  }, []);

  const scan = useCallback(
    (partnerName: string) => {
      if (!enabled || tabId === undefined) {
        setState({ status: 'error', error: 'surface' });
        return;
      }
      generation.current += 1;
      const mine = generation.current;
      const isCurrent = (): boolean => generation.current === mine;
      setState({ status: 'scanning' });
      ensureSurface(tabId, 'requests', () => !isCurrent())
        .then((surface) => {
          if (!isCurrent()) return undefined;
          if (!surface.ok) {
            setState({
              status: 'error',
              error: surface.code === 'ERR_BUSY' ? 'busy' : 'surface',
            });
            return undefined;
          }
          const message: RequestsRead = { kind: 'requests.read', partnerName };
          return browser.tabs
            .sendMessage(tabId, message)
            .catch(() => undefined)
            .then((reply: unknown) => {
              if (!isCurrent()) return;
              if (!isRequestsReply(reply)) {
                setState({ status: 'error', error: 'surface' });
              } else if (!reply.ok) {
                setState({ status: 'error', error: reply.error });
              } else {
                setState({
                  status: 'ok',
                  partnerName,
                  businessId: reply.businessId,
                  requests: reply.requests,
                });
              }
            });
        })
        .catch(() => {
          if (isCurrent()) setState({ status: 'error', error: 'surface' });
        });
    },
    [enabled, tabId]
  );

  return { state, scan, reset };
}
