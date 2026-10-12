import { JSX } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { PartnerAssignConfig, WizardStep } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { PARTNER_TASKS } from '@/shared/partnerAssign';
import type { RunMode } from '../riskStyles';

import Icon from '../Icon';
import { MODE_STYLES } from '../riskStyles';
import SummaryRow from './SummaryRow';

type StepReviewProps = {
  lang: Lang;
  config: PartnerAssignConfig;
  accountNames: string;
  mode: RunMode;
  fullLocked: boolean;
  onGoTo: (step: WizardStep) => void;
  onOpenDiff: () => void;
};

export default function StepReview({
  lang,
  config,
  accountNames,
  mode,
  fullLocked,
  onGoTo,
  onOpenDiff,
}: StepReviewProps): JSX.Element {
  const hasHighTask = config.tasks.includes('MANAGE');
  const taskLabels = PARTNER_TASKS.filter((item) =>
    config.tasks.includes(item.task)
  )
    .map((item) => translate(lang, item.labelKey))
    .join(', ');
  const modeStyle = MODE_STYLES[mode];

  return (
    <>
      <section className='flex flex-col gap-2'>
        <h2
          tabIndex={-1}
          data-step-heading
          className='m-0 text-sm font-semibold outline-none'
        >
          {translate(lang, 'pa.review.title')}
        </h2>
        <div className='border-base-content/12 divide-base-content/8 flex flex-col divide-y rounded-md border bg-base-100'>
          <SummaryRow
            lang={lang}
            label={translate(lang, 'pa.bm.summary')}
            editLabel={translate(lang, 'pa.editBm')}
            onEdit={() => onGoTo(1)}
          >
            {config.partnerBmId}
          </SummaryRow>
          <SummaryRow
            lang={lang}
            label={translate(lang, 'pa.review.accounts', {
              n: config.accountIds.length,
            })}
            editLabel={translate(lang, 'pa.editAccounts')}
            onEdit={() => onGoTo(2)}
          >
            {accountNames}
          </SummaryRow>
          <SummaryRow
            lang={lang}
            label={translate(lang, 'pa.review.perms', {
              n: config.tasks.length,
            })}
            editLabel={translate(lang, 'pa.editPerms')}
            onEdit={() => onGoTo(3)}
          >
            {taskLabels}
            {hasHighTask && (
              <span className='ml-1.5 rounded-md border border-orange-200 bg-orange-50 px-1.5 text-xs font-medium text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300'>
                {translate(lang, 'pa.perm.high')}
              </span>
            )}
          </SummaryRow>
        </div>
      </section>

      <section className='flex flex-col gap-2'>
        <h2 className='m-0 text-sm font-semibold'>
          {translate(lang, 'pa.review.mode')}
        </h2>
        <div
          className={`flex flex-col gap-1 rounded-md border p-3 ${modeStyle.selected}`}
        >
          <span className='flex items-center gap-1.5 text-sm font-semibold'>
            <Icon name={modeStyle.icon} size={15} />
            {translate(lang, modeStyle.labelKey)}
            <span className='font-normal'>
              · {translate(lang, `pa.mode.${mode}.tag` as MessageKey)}
            </span>
          </span>
          <span className='text-[13px]'>
            {translate(lang, `pa.mode.${mode}.desc` as MessageKey)}
          </span>
          <span className='mt-1 flex items-center gap-1 text-xs opacity-80'>
            <Icon name='arrowUp' size={12} />
            {translate(lang, 'pa.review.changeMode')}
          </span>
        </div>
        {fullLocked && (
          <div className='border-base-content/12 text-base-content/70 flex items-start gap-2 rounded-md border bg-base-100 p-3 text-xs'>
            <Icon name='lock' size={14} className='mt-px' />
            <span>{translate(lang, 'pa.review.fullLocked')}</span>
          </div>
        )}
      </section>

      <button
        type='button'
        onClick={onOpenDiff}
        className='border-base-content/12 inline-flex h-10 items-center justify-center gap-1.5 rounded-md border bg-base-100 text-[13px] font-medium text-blue-600 dark:text-blue-400'
      >
        <Icon name='eye' size={15} />
        {translate(lang, 'pa.review.diff')}
      </button>
    </>
  );
}
