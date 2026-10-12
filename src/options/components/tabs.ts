import type { MessageKey } from '@/shared/i18n';

export type OptionsTab = 'pacing' | 'audit' | 'devtest';

export const OPTIONS_TABS: readonly { id: OptionsTab; labelKey: MessageKey }[] =
  [
    { id: 'pacing', labelKey: 'opt.tab.pacing' },
    { id: 'audit', labelKey: 'opt.tab.audit' },
    { id: 'devtest', labelKey: 'opt.tab.devtest' },
  ];
