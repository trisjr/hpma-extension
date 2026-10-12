import { JSX, KeyboardEvent, ReactNode } from 'react';
import type { Lang } from '@/shared/i18n';
import { translate } from '@/shared/i18n';
import type { OptionsTab } from './tabs';


import { OPTIONS_TABS } from './tabs';

type OptionsShellProps = {
  lang: Lang;
  version: string;
  tab: OptionsTab;
  onToggleLang: () => void;
  onTabChange: (tab: OptionsTab) => void;
  children: ReactNode;
};

export default function OptionsShell({
  lang,
  version,
  tab,
  onToggleLang,
  onTabChange,
  children,
}: OptionsShellProps): JSX.Element {
  // APG Tabs: mũi tên trái/phải đổi tab và đưa focus theo.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = OPTIONS_TABS.findIndex((item) => item.id === tab);
    const next =
      OPTIONS_TABS[(index + step + OPTIONS_TABS.length) % OPTIONS_TABS.length];
    onTabChange(next.id);
    document.getElementById(`options-tab-${next.id}`)?.focus();
  };

  return (
    <div className='min-h-screen bg-base-200 text-[15px] leading-[22px] text-base-content'>
      <header className='mx-auto flex max-w-[960px] flex-col gap-3 px-6 pt-4'>
        <div className='flex items-start justify-between gap-3'>
          <div className='flex flex-col'>
            <h1 className='m-0 text-xl font-semibold'>
              {translate(lang, 'opt.title')}
            </h1>
            <span className='text-base-content/70 text-[13px]'>
              {translate(lang, 'opt.sub', { version })}
            </span>
          </div>
          <button
            type='button'
            aria-label={translate(lang, 'lang.switch')}
            onClick={onToggleLang}
            className='border-base-content/20 h-9 min-w-10 shrink-0 rounded-md border bg-base-100 px-2 text-xs font-semibold'
          >
            {translate(lang, 'lang.badge')}
          </button>
        </div>
        <div
          role='tablist'
          aria-label={translate(lang, 'opt.tabs')}
          className='border-base-content/12 flex overflow-x-auto border-b'
        >
          {OPTIONS_TABS.map((item) => {
            const selected = item.id === tab;
            return (
              <button
                key={item.id}
                id={`options-tab-${item.id}`}
                type='button'
                role='tab'
                aria-selected={selected}
                aria-controls={`options-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => onTabChange(item.id)}
                onKeyDown={onKeyDown}
                className={`flex h-[42px] shrink-0 items-center whitespace-nowrap border-b-2 px-4 text-sm ${
                  selected
                    ? 'border-primary font-semibold text-blue-600 dark:text-blue-400'
                    : 'text-base-content/70 border-transparent font-medium'
                }`}
              >
                {translate(lang, item.labelKey)}
              </button>
            );
          })}
        </div>
      </header>
      <main className='mx-auto flex max-w-[960px] flex-col px-6 pb-0 pt-6'>
        {children}
      </main>
    </div>
  );
}
