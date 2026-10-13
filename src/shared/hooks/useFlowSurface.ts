import { useCallback, useEffect, useState } from 'react';
import type { Surface } from '@/shared/surfaces';
import type { SurfaceResult } from './ensureSurface';

import ensureSurface from './ensureSurface';

export type FlowSurfaceState =
  | { status: 'idle' }
  | { status: 'moving' }
  | { status: 'ready' }
  | { status: 'error'; code: Extract<SurfaceResult, { ok: false }>['code'] };

// Khi mở flow có `surface`, tự đưa tab BM tới trang đó. `enabled` tắt (simulator,
// flow không cần trang) thì đứng im ở `idle`.
export default function useFlowSurface(
  tabId: number | undefined,
  surface: Surface | undefined,
  enabled: boolean
): { state: FlowSurfaceState; retry: () => void } {
  const [state, setState] = useState<FlowSurfaceState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !surface || tabId === undefined) {
      setState({ status: 'idle' });
      return undefined;
    }
    let cancelled = false;
    setState({ status: 'moving' });
    ensureSurface(tabId, surface, () => cancelled).then((result) => {
      if (cancelled) return;
      setState(
        result.ok ? { status: 'ready' } : { status: 'error', code: result.code }
      );
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, surface, tabId, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, retry };
}
