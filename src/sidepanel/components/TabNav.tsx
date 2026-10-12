import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

export type PanelTab = 'flows' | 'run' | 'log' | 'probe';

const TABS: readonly { id: PanelTab; label: string }[] = [
  { id: 'flows', label: 'Flows' },
  { id: 'run', label: 'Run' },
  { id: 'log', label: 'Log' },
  { id: 'probe', label: 'Probe' },
];

type TabNavProps = {
  lang: Lang;
  current: PanelTab;
  onChange: (tab: PanelTab) => void;
};

export default function TabNav({
  lang,
  current,
  onChange,
}: TabNavProps): JSX.Element {
  return (
    <nav
      aria-label={translate(lang, 'nav.label')}
      className='border-base-content/12 flex border-t px-2'
    >
      {TABS.map((tab) => {
        const isCurrent = tab.id === current;
        return (
          <a
            key={tab.id}
            href={`#${tab.id}`}
            aria-current={isCurrent ? 'page' : undefined}
            onClick={(event) => {
              event.preventDefault();
              onChange(tab.id);
            }}
            className={`flex h-[42px] flex-1 items-center justify-center border-b-2 text-[13px] no-underline ${
              isCurrent
                ? 'border-primary font-semibold text-blue-600 dark:text-blue-400'
                : 'text-base-content/70 border-transparent'
            }`}
          >
            {tab.label}
          </a>
        );
      })}
    </nav>
  );
}
