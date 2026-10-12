import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';
import type { CurfewConfig } from '@/shared/settings';

import { translate } from '@/shared/i18n';
import { CURFEW_TZS, isTime, TZ_LABEL } from '@/shared/settings';
import Icon from '@/sidepanel/components/Icon';

import Switch from './Switch';

type CurfewSectionProps = {
  lang: Lang;
  curfew: CurfewConfig;
  onChange: (next: CurfewConfig) => void;
};

const FIELD =
  'border-base-content/20 h-10 rounded-md border bg-base-100 px-2.5 text-[15px] disabled:opacity-50';

export default function CurfewSection({
  lang,
  curfew,
  onChange,
}: CurfewSectionProps): JSX.Element {
  const off = !curfew.on;
  const setTime = (key: 'from' | 'to', value: string): void => {
    // Ô giờ rỗng (đang xoá) thì giữ giá trị cũ để form luôn hợp lệ.
    if (isTime(value)) onChange({ ...curfew, [key]: value });
  };

  return (
    <section className='flex flex-col gap-3'>
      <div className='flex flex-col gap-1'>
        <h2 className='m-0 text-lg font-medium'>
          {translate(lang, 'opt.curfew.title')}
        </h2>
        <p className='text-base-content/70 m-0 text-[13px]'>
          {translate(lang, 'opt.curfew.sub')}
        </p>
      </div>
      <Switch
        id='curfew-on'
        name={translate(lang, 'opt.curfew.switch')}
        stateText={translate(lang, off ? 'opt.curfew.off' : 'opt.curfew.on')}
        checked={curfew.on}
        disabled={false}
        onChange={(on) => onChange({ ...curfew, on })}
      />
      {off && (
        <div
          role='note'
          className='flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 p-3 text-[13px] text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200'
        >
          <Icon name='alert' size={16} className='mt-px' />
          {translate(lang, 'opt.curfew.offWarn')}
        </div>
      )}
      <div className='grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4'>
        <label htmlFor='curfew-from' className='flex flex-col gap-1'>
          <span className='text-sm font-medium'>
            {translate(lang, 'opt.curfew.from')}
          </span>
          <input
            id='curfew-from'
            type='time'
            value={curfew.from}
            disabled={off}
            onChange={(event) => setTime('from', event.target.value)}
            className={FIELD}
          />
        </label>
        <label htmlFor='curfew-to' className='flex flex-col gap-1'>
          <span className='text-sm font-medium'>
            {translate(lang, 'opt.curfew.to')}
          </span>
          <input
            id='curfew-to'
            type='time'
            value={curfew.to}
            disabled={off}
            onChange={(event) => setTime('to', event.target.value)}
            className={FIELD}
          />
        </label>
        <label htmlFor='curfew-tz' className='flex flex-col gap-1'>
          <span className='text-sm font-medium'>
            {translate(lang, 'opt.curfew.tz')}
          </span>
          <select
            id='curfew-tz'
            value={curfew.tz}
            disabled={off}
            onChange={(event) => {
              const tz = CURFEW_TZS.find((item) => item === event.target.value);
              if (tz) onChange({ ...curfew, tz });
            }}
            className={FIELD}
          >
            {CURFEW_TZS.map((tz) => (
              <option key={tz} value={tz}>
                {TZ_LABEL[tz]}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
