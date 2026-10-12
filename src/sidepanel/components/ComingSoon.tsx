import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

import Icon from './Icon';

type ComingSoonProps = {
  lang: Lang;
  title: string;
  onBack: () => void;
};

// Chỗ giữ cho các màn chưa dựng (tab Run/Log/Probe, cấu hình flow).
export default function ComingSoon({
  lang,
  title,
  onBack,
}: ComingSoonProps): JSX.Element {
  return (
    <>
      <button
        type='button'
        onClick={onBack}
        className='inline-flex h-9 items-center gap-0.5 self-start text-[13px] font-medium text-blue-600 dark:text-blue-400'
      >
        <Icon name='chevronLeft' />
        {translate(lang, 'soon.back')}
      </button>
      <h1 className='m-0 text-lg font-medium'>{title}</h1>
      <p className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'soon.title')}. {translate(lang, 'soon.body')}
      </p>
    </>
  );
}
