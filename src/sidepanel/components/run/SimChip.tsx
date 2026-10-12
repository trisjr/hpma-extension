import { JSX } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

// Nhãn bắt buộc trên mọi màn Run/Result cho tới khi engine thật thay simulator.
export default function SimChip({ lang }: { lang: Lang }): JSX.Element {
  return (
    <span
      role='note'
      title={translate(lang, 'sim.hint')}
      className='border-base-content/20 text-base-content/70 inline-flex h-[22px] items-center rounded-md border border-dashed bg-base-200 px-[7px] text-xs font-medium'
    >
      {translate(lang, 'sim.chip')}
    </span>
  );
}
