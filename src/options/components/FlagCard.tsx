import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

import Switch from './Switch';

type FlagCardProps = {
  lang: Lang;
  id: string;
  label: string;
  keyName: string;
  desc: string;
  checked: boolean;
  onChange: (next: boolean) => void;
};

export default function FlagCard({
  lang,
  id,
  label,
  keyName,
  desc,
  checked,
  onChange,
}: FlagCardProps): JSX.Element {
  return (
    <div className='border-base-content/12 flex flex-wrap items-center gap-3 rounded-md border bg-base-100 px-4 py-3.5'>
      <div className='flex min-w-0 flex-[1_1_320px] flex-col gap-0.5'>
        <span className='flex flex-wrap items-center gap-2'>
          <span className='text-[15px] font-medium'>{label}</span>
          <code className='text-base-content/70 font-mono text-xs'>
            {keyName}
          </code>
        </span>
        <span className='text-base-content/70 text-[13px]'>{desc}</span>
      </div>
      <Switch
        id={id}
        name={label}
        stateText={translate(lang, checked ? 'opt.dev.on' : 'opt.dev.off')}
        checked={checked}
        disabled={false}
        onChange={onChange}
      />
    </div>
  );
}
