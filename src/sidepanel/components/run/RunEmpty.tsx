import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

type RunEmptyProps = { lang: Lang; onGoToFlows: () => void };

// Tab Run khi chưa có lần chạy nào (StateEmpty).
export default function RunEmpty({
  lang,
  onGoToFlows,
}: RunEmptyProps): JSX.Element {
  return (
    <>
      <h1 className='m-0 text-lg font-medium'>
        {translate(lang, 'run.empty.title')}
      </h1>
      <p className='text-base-content/70 m-0 text-[13px]'>
        {translate(lang, 'run.empty.body')}
      </p>
      <button
        type='button'
        onClick={onGoToFlows}
        className='inline-flex h-10 items-center justify-center rounded-md bg-blue-600 px-3 text-[13px] font-semibold text-white'
      >
        {translate(lang, 'run.empty.cta')}
      </button>
    </>
  );
}
