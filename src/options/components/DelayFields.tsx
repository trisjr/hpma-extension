import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';
import type { FormErrors, PacingForm } from '@/shared/pacingForm';

import { translate } from '@/shared/i18n';
import { previewPacing } from '@/shared/pacingForm';
import { DELAY_BASE_MIN, JITTER_MIN } from '@/shared/settings';

import fieldErrorText from './fieldError';
import NumberField from './NumberField';
import PacingPreview from './PacingPreview';

type DelayFieldsProps = {
  lang: Lang;
  form: PacingForm;
  errors: FormErrors;
  onChange: (patch: Partial<PacingForm>) => void;
};

export default function DelayFields({
  lang,
  form,
  errors,
  onChange,
}: DelayFieldsProps): JSX.Element {
  const sec = translate(lang, 'opt.unit.sec');
  return (
    <section className='flex flex-col gap-4'>
      <div className='flex flex-col gap-1'>
        <h2 className='m-0 text-lg font-medium'>
          {translate(lang, 'opt.pacing.delayTitle')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'opt.pacing.delaySub')}
        </p>
      </div>
      <div className='grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4'>
        <NumberField
          id='delay-base'
          label={translate(lang, 'opt.pacing.base')}
          ariaLabel=''
          value={form.delayBase}
          unit={sec}
          invalid={errors.delayBase !== undefined}
          integer={false}
          message={
            errors.delayBase
              ? fieldErrorText(lang, errors.delayBase, 'opt.err.minSec')
              : translate(lang, 'opt.pacing.baseHint', { min: DELAY_BASE_MIN })
          }
          onChange={(delayBase) => onChange({ delayBase })}
        />
        <NumberField
          id='delay-jitter'
          label={translate(lang, 'opt.pacing.jitter')}
          ariaLabel=''
          value={form.jitter}
          unit={translate(lang, 'opt.unit.pct')}
          invalid={errors.jitter !== undefined}
          integer={false}
          message={
            errors.jitter
              ? fieldErrorText(lang, errors.jitter, 'opt.err.minPct')
              : translate(lang, 'opt.pacing.jitterHint', { min: JITTER_MIN })
          }
          onChange={(jitter) => onChange({ jitter })}
        />
        <NumberField
          id='delay-write'
          label={translate(lang, 'opt.pacing.write')}
          ariaLabel=''
          value={form.writeExtra}
          unit={sec}
          invalid={errors.writeExtra !== undefined}
          integer={false}
          message={
            errors.writeExtra
              ? fieldErrorText(lang, errors.writeExtra, 'opt.err.minSec')
              : translate(lang, 'opt.pacing.writeHint')
          }
          onChange={(writeExtra) => onChange({ writeExtra })}
        />
      </div>
      <PacingPreview lang={lang} preview={previewPacing(form)} />
    </section>
  );
}
