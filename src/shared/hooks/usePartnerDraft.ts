import { useCallback, useEffect, useState } from 'react';
import type {
  PartnerAssignConfig,
  PartnerAssignDraft,
  WizardStep,
} from '@/shared/partnerAssign';
import browser from 'webextension-polyfill';

import { DEFAULT_CONFIG, parseDraft } from '@/shared/partnerAssign';

// Bản nháp sống qua việc đóng side panel (SPEC-UI-002 §9.1). Chỉ chứa ID công
// khai trong BM của chính user, không có token.
const STORAGE_KEY = 'flowDraft:partner-assign';
const SAVE_DELAY_MS = 300;

export type PartnerDraftApi = {
  ready: boolean;
  config: PartnerAssignConfig;
  step: WizardStep;
  // BM của danh sách TKQC lúc chọn `accountIds` (xem PartnerAssignDraft).
  businessId: string | undefined;
  setBusinessId: (businessId: string | undefined) => void;
  setConfig: (config: PartnerAssignConfig) => void;
  setStep: (step: WizardStep) => void;
  clearDraft: () => void;
};

export default function usePartnerDraft(): PartnerDraftApi {
  const [ready, setReady] = useState(false);
  const [config, setConfig] = useState<PartnerAssignConfig>(DEFAULT_CONFIG);
  const [step, setStep] = useState<WizardStep>(1);
  const [businessId, setBusinessId] = useState<string | undefined>();

  useEffect(() => {
    browser.storage.local
      .get(STORAGE_KEY)
      .then((stored) => {
        const draft: PartnerAssignDraft | undefined = parseDraft(
          stored[STORAGE_KEY]
        );
        if (draft) {
          setConfig(draft.config);
          setStep(draft.step);
          setBusinessId(draft.businessId);
        }
      })
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return undefined;
    const timer = window.setTimeout(() => {
      browser.storage.local
        .set({ [STORAGE_KEY]: { config, step, businessId } })
        .catch(() => undefined);
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [ready, config, step, businessId]);

  const clearDraft = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    setStep(1);
    setBusinessId(undefined);
    browser.storage.local.remove(STORAGE_KEY).catch(() => undefined);
  }, []);

  return {
    ready,
    config,
    step,
    businessId,
    setBusinessId,
    setConfig,
    setStep,
    clearDraft,
  };
}
