import { JSX, useEffect, useState } from 'react';
import type { ConnectionState } from '@/shared/hooks/useConnection';
import type { MessageKey } from '@/shared/i18n';
import openSidePanel from '@utils/openSidePanel';
import browser from 'webextension-polyfill';

import curfewLabel from '@/shared/curfewLabel';
import useConnection from '@/shared/hooks/useConnection';
import useLanguage from '@/shared/hooks/useLanguage';
import { usePacingConfig } from '@/shared/hooks/useSettings';
import useTheme from '@/shared/hooks/useTheme';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';
import Icon from '@/sidepanel/components/Icon';

const STATUS_VIEW: Record<
  ConnectionState['status'],
  { statusKey: MessageKey; dotClass: string }
> = {
  connected: { statusKey: 'header.attached', dotClass: 'bg-green-500' },
  unreachable: { statusKey: 'header.unreachable', dotClass: 'bg-red-500' },
  checking: { statusKey: 'header.checking', dotClass: 'bg-base-content/30' },
};

export default function Popup(): JSX.Element {
  const theme = useTheme();
  const { lang } = useLanguage();
  const { connection } = useConnection();
  const { used, limit } = useWriteBudget();
  const { value: pacing } = usePacingConfig();
  // Resolve windowId trước: open side panel đòi user gesture, không được await
  // trong onClick (docs/050-Research/21 §5.1).
  const [windowId, setWindowId] = useState<number>();
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    browser.windows.getCurrent().then((win) => setWindowId(win.id));
  }, []);

  const { statusKey, dotClass } = STATUS_VIEW[connection.status];

  // PostCSS prefix `#my-ext ` chỉ khớp phần tử con → layout nằm ở div con.
  return (
    <div id='my-ext' data-theme={theme}>
      <div className='flex h-[400px] w-80 flex-col gap-2 overflow-hidden bg-base-200 p-3 text-sm text-base-content'>
        <div className='flex h-9 items-center justify-between gap-2'>
          <span className='flex items-baseline gap-1.5'>
            <span className='text-[15px] font-semibold'>HPMA Copilot</span>
            <span className='text-base-content/70 text-[11px]'>
              v{browser.runtime.getManifest().version}
            </span>
          </span>
          <button
            type='button'
            aria-label={translate(lang, 'popup.options')}
            onClick={() => browser.runtime.openOptionsPage()}
            className='border-base-content/20 flex size-9 items-center justify-center rounded-md border bg-base-100'
          >
            <Icon name='settings' size={17} />
          </button>
        </div>

        <section className='border-base-content/12 flex items-center gap-2.5 rounded-md border bg-base-100 p-2.5'>
          <span className='text-base-content/70 flex size-8 shrink-0 items-center justify-center rounded-md bg-base-200'>
            <Icon name='building' size={18} />
          </span>
          <span className='flex min-w-0 flex-1 flex-col'>
            <span className='truncate text-[13px] font-semibold'>
              {translate(lang, 'header.bm')}
            </span>
            <span className='text-base-content/70 flex items-center gap-1.5 text-xs'>
              <span className={`size-1.5 rounded-full ${dotClass}`} />
              {translate(lang, statusKey)}
            </span>
          </span>
        </section>

        <div className='text-base-content/70 px-0.5 text-xs'>
          {translate(lang, 'footer.writes')}{' '}
          <b className='font-semibold text-base-content'>
            {used}/{limit}
          </b>{' '}
          · {curfewLabel(lang, pacing.curfew)}
        </div>

        <button
          type='button'
          disabled={windowId === undefined}
          onClick={() => {
            if (windowId === undefined) return;
            openSidePanel(windowId).then(
              () => setOpenFailed(false),
              () => setOpenFailed(true)
            );
          }}
          className='btn btn-primary h-10 min-h-10 text-sm font-semibold'
        >
          <Icon name='panel' />
          {translate(lang, 'popup.openPanel')}
        </button>
        {openFailed && (
          <div role='alert' className='alert alert-error text-xs'>
            {translate(lang, 'popup.openFailed')}
          </div>
        )}

        <div className='flex-1' />

        {/* Luôn hiển thị, không bao giờ disabled (DES-001). Handler nối ở M2. */}
        <button
          type='button'
          className='flex h-10 items-center justify-center gap-1.5 rounded-md bg-red-700 text-sm font-semibold text-white'
        >
          <Icon name='stop' />
          {translate(lang, 'popup.killAll')}
        </button>
      </div>
    </div>
  );
}
