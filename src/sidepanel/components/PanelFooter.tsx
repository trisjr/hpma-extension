import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import curfewLabel from '@/shared/curfewLabel';
import useKillSwitch from '@/shared/hooks/useKillSwitch';
import { usePacingConfig } from '@/shared/hooks/useSettings';
import useWriteBudget from '@/shared/hooks/useWriteBudget';
import { translate } from '@/shared/i18n';

import Icon from './Icon';

type PanelFooterProps = { lang: Lang };

export default function PanelFooter({ lang }: PanelFooterProps): JSX.Element {
  const { used, limit } = useWriteBudget();
  const { value: pacing } = usePacingConfig();
  const { engaged, failed, engage } = useKillSwitch();
  const percent = Math.min(100, Math.round((used / limit) * 100));

  return (
    <footer className='border-base-content/12 flex h-[54px] shrink-0 items-center gap-3 border-t bg-base-100 pl-4 pr-3'>
      <div className='flex min-w-0 flex-1 flex-col gap-1'>
        <div className='text-base-content/70 truncate text-xs'>
          {translate(lang, 'footer.writes')}{' '}
          <span className='font-semibold text-base-content'>
            {used}/{limit}
          </span>{' '}
          · {curfewLabel(lang, pacing.curfew)}
        </div>
        <progress
          className='text-base-content/60 progress h-1 w-full'
          value={percent}
          max={100}
          aria-label={translate(lang, 'footer.writes')}
        />
      </div>
      {/* Luôn hiển thị, không bao giờ disabled (DES-001); một lần bấm là dừng, không hỏi lại. */}
      <button
        type='button'
        onClick={engage}
        title={
          engaged
            ? `${translate(lang, 'kill.engaged')}. ${translate(lang, 'kill.engagedHint')}`
            : undefined
        }
        className='inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-red-700 px-3 text-[13px] font-semibold text-white'
      >
        <Icon name='stop' size={15} />
        {translate(lang, engaged ? 'kill.engaged' : 'footer.kill')}
      </button>
      {failed && (
        <span role='alert' className='sr-only'>
          {translate(lang, 'kill.failed')}
        </span>
      )}
    </footer>
  );
}
