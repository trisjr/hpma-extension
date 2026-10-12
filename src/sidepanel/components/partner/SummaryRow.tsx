import { JSX, ReactNode } from 'react';
import type { Lang } from '@/shared/i18n';

import { translate } from '@/shared/i18n';

type SummaryRowProps = {
  lang: Lang;
  label: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
};

// Hàng tóm tắt một bước đã xong, kèm link "Sửa" về bước đó.
export default function SummaryRow({
  lang,
  label,
  editLabel,
  onEdit,
  children,
}: SummaryRowProps): JSX.Element {
  return (
    <div className='flex items-start gap-2 px-3 py-2'>
      <span className='flex min-w-0 flex-1 flex-col'>
        <span className='text-base-content/70 text-xs'>{label}</span>
        <span className='break-words text-[13px] font-medium'>{children}</span>
      </span>
      <button
        type='button'
        aria-label={editLabel}
        onClick={onEdit}
        className='h-9 shrink-0 text-[13px] font-medium text-blue-600 dark:text-blue-400'
      >
        {translate(lang, 'pa.edit')}
      </button>
    </div>
  );
}
