import { JSX, useState } from 'react';
import type { Lang, MessageKey } from '@/shared/i18n';
import type { BmIdIssue } from '@/shared/partnerAssign';

import { translate } from '@/shared/i18n';
import { sanitizeBmId, validateBmId } from '@/shared/partnerAssign';

import Icon from '../Icon';

type StepBmProps = {
  lang: Lang;
  bmId: string;
  onChange: (bmId: string) => void;
};

const ISSUE_KEY: Record<BmIdIssue, MessageKey> = {
  empty: 'pa.bm.empty',
  digits: 'pa.bm.digits',
  length: 'pa.bm.length',
};

export default function StepBm({
  lang,
  bmId,
  onChange,
}: StepBmProps): JSX.Element {
  const [touched, setTouched] = useState(false);
  const issue = validateBmId(bmId);
  // Chỉ báo lỗi sau khi field đã được chạm hoặc đã có chữ (SPEC-UI-002 §5.1).
  const showIssue = issue !== undefined && (touched || bmId.length > 0);
  const valid = issue === undefined;

  return (
    <>
      <section className='border-base-content/12 flex flex-col gap-3 rounded-md border bg-base-100 p-3'>
        <div className='flex flex-col gap-0.5'>
          <h2
            tabIndex={-1}
            data-step-heading
            className='m-0 text-sm font-semibold outline-none'
          >
            {translate(lang, 'pa.bm.title')}
          </h2>
          <p className='text-base-content/70 m-0 text-[13px]'>
            {translate(lang, 'pa.bm.desc')}
          </p>
        </div>
        <div className='flex flex-col gap-1.5'>
          <label htmlFor='bm-id' className='text-[13px] font-medium'>
            {translate(lang, 'pa.bm.label')}
          </label>
          <input
            id='bm-id'
            type='text'
            inputMode='numeric'
            autoComplete='off'
            value={bmId}
            placeholder={translate(lang, 'pa.bm.placeholder')}
            aria-invalid={showIssue}
            aria-describedby='bm-msg bm-help'
            onChange={(event) => onChange(sanitizeBmId(event.target.value))}
            onBlur={() => setTouched(true)}
            className={`input h-10 w-full bg-base-100 text-sm ${
              showIssue ? 'border-2 border-red-600' : ''
            }`}
          />
          <div
            id='bm-msg'
            className={`flex min-h-4 items-center gap-1 text-xs ${
              valid
                ? 'text-green-700 dark:text-green-300'
                : 'text-red-700 dark:text-red-300'
            }`}
          >
            {valid && bmId.length > 0 && (
              <>
                <Icon name='check' size={13} />
                <span>{translate(lang, 'pa.bm.ok')}</span>
              </>
            )}
            {showIssue && (
              <>
                <Icon name='alert' size={13} />
                <span>
                  {translate(lang, ISSUE_KEY[issue], { n: bmId.length })}
                </span>
              </>
            )}
          </div>
          <p id='bm-help' className='text-base-content/70 m-0 text-xs'>
            {translate(lang, 'pa.bm.help')}
          </p>
        </div>
      </section>
      <div className='border-base-content/12 text-base-content/70 flex items-start gap-2 rounded-md border bg-base-100 p-3 text-xs'>
        <Icon name='shield' size={15} className='mt-px' />
        <span>{translate(lang, 'pa.bm.note')}</span>
      </div>
    </>
  );
}
