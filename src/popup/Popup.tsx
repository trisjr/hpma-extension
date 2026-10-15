import { JSX, useEffect, useState } from 'react';
import type { ConnectionState } from '@/shared/hooks/useConnection';
import type { MessageKey } from '@/shared/i18n';
import openSidePanel from '@utils/openSidePanel';
import browser from 'webextension-polyfill';

import curfewLabel from '@/shared/curfewLabel';
import useConnection from '@/shared/hooks/useConnection';
import useKillSwitch from '@/shared/hooks/useKillSwitch';
import useLanguage from '@/shared/hooks/useLanguage';
import { requestJobFocus } from '@/shared/hooks/useRemoteFocus';
import useRemoteJobs from '@/shared/hooks/useRemoteJobs';
import { usePacingConfig } from '@/shared/hooks/useSettings';
import useTheme from '@/shared/hooks/useTheme';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';
import Icon from '@/sidepanel/components/Icon';
import summarizeJob, {
  FLOW_KEYS,
} from '@/sidepanel/components/remoteJobSummary';

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
  const { engaged: killEngaged, failed: killFailed, engage } = useKillSwitch();
  const remoteJobs = useRemoteJobs();
  // Resolve windowId trước: open side panel đòi user gesture, không được await
  // trong onClick (docs/050-Research/21 §5.1).
  const [windowId, setWindowId] = useState<number>();
  const [openFailed, setOpenFailed] = useState(false);

  useEffect(() => {
    browser.windows.getCurrent().then((win) => setWindowId(win.id));
  }, []);

  const { statusKey, dotClass } = STATUS_VIEW[connection.status];

  // Đồng bộ trong click handler (user gesture): ghi yêu cầu rồi mở panel ngay, không await trước.
  const openPanel = (jobId?: string): void => {
    if (windowId === undefined) return;
    if (jobId !== undefined) requestJobFocus(jobId).catch(() => undefined);
    openSidePanel(windowId).then(
      () => setOpenFailed(false),
      () => setOpenFailed(true)
    );
  };

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
          onClick={() => openPanel()}
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

        {remoteJobs.length > 0 && (
          <section
            aria-label={translate(lang, 'remote.card.title')}
            className='border-base-content/12 flex min-h-0 flex-col gap-1.5 rounded-md border bg-base-100 p-2.5'
          >
            <h2 className='m-0 text-[13px] font-semibold'>
              {translate(lang, 'remote.card.title')} · {remoteJobs.length}
            </h2>
            <ul className='m-0 flex min-h-0 list-none flex-col gap-1.5 overflow-y-auto p-0'>
              {remoteJobs.map((job) => (
                <li key={job.id}>
                  <button
                    type='button'
                    disabled={windowId === undefined}
                    onClick={() => openPanel(job.id)}
                    className='flex w-full flex-col rounded-md p-1 text-left text-xs hover:bg-base-200'
                  >
                    <span className='font-medium'>
                      {translate(lang, FLOW_KEYS[job.flow])}
                    </span>
                    <span className='text-base-content/70 break-words'>
                      {summarizeJob(lang, job)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className='flex-1' />

        {killFailed && (
          <div role='alert' className='alert alert-error text-xs'>
            {translate(lang, 'kill.failed')}
          </div>
        )}
        {killEngaged && (
          <div role='status' className='text-base-content/70 text-xs'>
            {translate(lang, 'kill.engagedHint')}
          </div>
        )}

        {/* Luôn hiển thị, không bao giờ disabled (DES-001); một lần bấm là dừng, không hỏi lại. */}
        <button
          type='button'
          onClick={engage}
          className='flex h-10 items-center justify-center gap-1.5 rounded-md bg-red-700 text-sm font-semibold text-white'
        >
          <Icon name='stop' />
          {translate(lang, killEngaged ? 'kill.engaged' : 'popup.killAll')}
        </button>
      </div>
    </div>
  );
}
