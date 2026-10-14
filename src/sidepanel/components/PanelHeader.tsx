import { JSX } from 'react';
import type { ConnectionState } from '@/shared/hooks/useConnection';
import type { Lang } from '@/shared/i18n';
import type { RunMode } from './riskStyles';
import type { PanelTab } from './TabNav';

import { translate } from '@/shared/i18n';

import Icon from './Icon';
import ModeSwitch from './ModeSwitch';
import TabNav from './TabNav';

type PanelHeaderProps = {
  lang: Lang;
  connection: ConnectionState;
  mode: RunMode;
  fullLocked: boolean;
  // Đang có run: các mode còn lại bị disabled (SPEC-UI-001 §4.2).
  modeLocked: boolean;
  tab: PanelTab;
  probeEnabled: boolean;
  onToggleLang: () => void;
  onModeChange: (mode: RunMode) => void;
  onTabChange: (tab: PanelTab) => void;
};

function ConnectionStatus({
  lang,
  connection,
}: Pick<PanelHeaderProps, 'lang' | 'connection'>): JSX.Element {
  if (connection.status === 'connected') {
    return (
      <span className='text-base-content/70 flex items-center gap-1.5 text-xs'>
        <span className='size-1.5 shrink-0 rounded-full bg-green-500' />
        {translate(lang, 'header.attached')}
        <span className='inline-flex items-center gap-0.5 font-medium text-green-700 dark:text-green-300'>
          <Icon name='check' size={12} />
          {translate(lang, 'header.supported')}
        </span>
      </span>
    );
  }
  const unreachable = connection.status === 'unreachable';
  return (
    <span className='text-base-content/70 flex items-center gap-1.5 text-xs'>
      <span
        className={`size-1.5 shrink-0 rounded-full ${unreachable ? 'bg-red-500' : 'bg-base-content/30'}`}
      />
      {translate(lang, unreachable ? 'header.unreachable' : 'header.checking')}
    </span>
  );
}

export default function PanelHeader({
  lang,
  connection,
  mode,
  fullLocked,
  modeLocked,
  tab,
  probeEnabled,
  onToggleLang,
  onModeChange,
  onTabChange,
}: PanelHeaderProps): JSX.Element {
  return (
    <header className='border-base-content/12 shrink-0 border-b bg-base-100'>
      <div className='flex items-center gap-2.5 pb-1.5 pl-4 pr-3 pt-2.5'>
        <span className='text-base-content/70 flex size-8 shrink-0 items-center justify-center rounded-md bg-base-200'>
          <Icon name='building' size={18} />
        </span>
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='truncate text-sm font-semibold'>
            {translate(lang, 'header.bm')}
          </span>
          <ConnectionStatus lang={lang} connection={connection} />
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
      <div className='px-4 pb-2.5 pt-1'>
        <ModeSwitch
          lang={lang}
          mode={mode}
          fullLocked={fullLocked}
          disabled={modeLocked}
          onChange={onModeChange}
        />
      </div>
      <TabNav
        lang={lang}
        probeEnabled={probeEnabled}
        current={tab}
        onChange={onTabChange}
      />
    </header>
  );
}
